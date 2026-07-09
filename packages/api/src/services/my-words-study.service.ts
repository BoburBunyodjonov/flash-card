import { XP_PER_QUIZ_CORRECT } from '@wordswipe/shared'
import { awardPersonalXp, invalidateFeedCache, applyUserWordSm2 } from './my-words.service'

/**
 * "Memorize" environment for a user's personal words (My Words). Reuses the
 * quiz idea but over the `user_words` table, with several study methods so the
 * learner can drill the same word in multiple ways. XP is daily-capped and does
 * NOT feed leagues (personal content — same policy as the rest of My Words).
 */

export type StudyMode =
  | 'flashcard'
  | 'mcq'
  | 'reverse'
  | 'typing'
  | 'listening'
  | 'scramble'
  | 'cloze'
  | 'matching'
  | 'mixed'

export type SingleStudyMode = Exclude<StudyMode, 'mixed'>

export interface StudyQuestion {
  id: string // userWord id
  mode: SingleStudyMode
  word: string
  translation: string
  pronunciation: string | null
  audioUrl: string | null
  /** What to display (word / translation / cloze sentence / '' for pure-audio) */
  prompt: string
  /** For listening/flashcard: the word to speak via TTS when audioUrl is absent */
  ttsWord?: string
  choices?: string[]
  correctIndex?: number
  /** For typing/scramble: expected answer, checked case-insensitively client-side */
  answer?: string
  /** For scramble: the word's letters, shuffled */
  scrambled?: string
}

const CHOICES_COUNT = 4
// Modes the smart-mixed session cycles through (matching is a standalone board).
const RECOGNITION_MODES: SingleStudyMode[] = ['flashcard', 'mcq']
const RECALL_EASY_MODES: SingleStudyMode[] = ['reverse', 'listening']
const RECALL_HARD_MODES: SingleStudyMode[] = ['scramble', 'cloze']

interface PoolWord {
  id: string
  word: string
  translation: string
  pronunciation: string | null
  audioUrl: string | null
  exampleEn: string | null
  strength: number
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function buildChoices(correct: string, distractors: string[]): { choices: string[]; correctIndex: number } {
  const unique = Array.from(new Set(distractors.filter((d) => d && d !== correct)))
  const choices = shuffle([correct, ...shuffle(unique).slice(0, CHOICES_COUNT - 1)])
  return { choices, correctIndex: choices.indexOf(correct) }
}

/** Blanks the target word (and simple inflections) out of an example sentence. */
function makeCloze(sentence: string, word: string): string | null {
  const re = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\w{0,3}\\b`, 'i')
  if (!re.test(sentence)) return null
  return sentence.replace(re, '_____')
}

/** Shuffles a word's letters; retries a few times so the result differs. */
function scrambleWord(word: string): string {
  const letters = word.split('')
  if (letters.length < 2) return word
  for (let attempt = 0; attempt < 6; attempt++) {
    const s = shuffle(letters).join('')
    if (s.toLowerCase() !== word.toLowerCase()) return s
  }
  return shuffle(letters).join('')
}

/** Picks a method by word strength: recognition → recall → production. */
function smartModeFor(strength: number, hasExample: boolean): SingleStudyMode {
  if (strength < 25) return pick(RECOGNITION_MODES)
  if (strength < 50) return pick(RECALL_EASY_MODES)
  if (strength < 75) {
    const m = pick(RECALL_HARD_MODES)
    return m === 'cloze' && !hasExample ? 'scramble' : m
  }
  return 'typing'
}

async function getStudyPool(userId: string, count: number): Promise<PoolWord[]> {
  const rows = await prisma.userWord.findMany({
    where: { userId, status: { not: 'mastered' } },
    orderBy: [{ nextReview: 'asc' }, { strength: 'asc' }],
    take: count * 2,
  })
  const mapped: PoolWord[] = (rows as any[]).map((r) => ({
    id: r.id,
    word: r.word,
    translation: r.translation,
    pronunciation: r.pronunciation ?? null,
    audioUrl: r.audioUrl ?? null,
    exampleEn: r.exampleEn ?? null,
    strength: r.strength ?? 0,
  }))
  return shuffle(mapped).slice(0, count)
}

/** Distractor pools (Uzbek translations + English words), padded from the catalog. */
async function getDistractors(
  userId: string,
  excludeIds: string[],
): Promise<{ words: string[]; translations: string[] }> {
  const others = await prisma.userWord.findMany({
    where: { userId, id: { notIn: excludeIds } },
    select: { word: true, translation: true },
    take: 60,
  })
  let words = (others as any[]).map((o) => o.word)
  let translations = (others as any[]).map((o) => o.translation)

  if (words.length < 8 || translations.length < 8) {
    const cat = await prisma.wordTranslation.findMany({
      where: { language: 'uz', translation: { not: null } },
      select: { translation: true, word: { select: { word: true } } },
      take: 80,
    })
    words = words.concat((cat as any[]).map((c) => c.word?.word).filter(Boolean))
    translations = translations.concat((cat as any[]).map((c) => c.translation).filter(Boolean))
  }
  return { words, translations }
}

function buildQuestion(
  w: PoolWord,
  mode: SingleStudyMode,
  dist: { words: string[]; translations: string[] },
): StudyQuestion {
  const base = {
    id: w.id,
    word: w.word,
    translation: w.translation,
    pronunciation: w.pronunciation,
    audioUrl: w.audioUrl,
  }

  switch (mode) {
    case 'flashcard':
      return { ...base, mode: 'flashcard', prompt: w.word, ttsWord: w.word }
    case 'mcq': {
      const { choices, correctIndex } = buildChoices(w.translation, dist.translations)
      return { ...base, mode: 'mcq', prompt: w.word, choices, correctIndex }
    }
    case 'reverse': {
      const { choices, correctIndex } = buildChoices(w.word, dist.words)
      return { ...base, mode: 'reverse', prompt: w.translation, choices, correctIndex }
    }
    case 'typing':
      return { ...base, mode: 'typing', prompt: w.translation, answer: w.word }
    case 'listening': {
      const { choices, correctIndex } = buildChoices(w.word, dist.words)
      return { ...base, mode: 'listening', prompt: '', ttsWord: w.word, choices, correctIndex }
    }
    case 'scramble':
      return { ...base, mode: 'scramble', prompt: w.translation, answer: w.word, scrambled: scrambleWord(w.word) }
    case 'cloze': {
      const sentence = w.exampleEn ? makeCloze(w.exampleEn, w.word) : null
      if (sentence) {
        const { choices, correctIndex } = buildChoices(w.word, dist.words)
        return { ...base, mode: 'cloze', prompt: sentence, choices, correctIndex }
      }
      // No usable example — fall back to MCQ so the word still gets practiced.
      const { choices, correctIndex } = buildChoices(w.translation, dist.translations)
      return { ...base, mode: 'mcq', prompt: w.word, choices, correctIndex }
    }
    case 'matching':
      return { ...base, mode: 'matching', prompt: w.word }
  }
}

export async function getStudyQuestions(
  userId: string,
  mode: StudyMode,
  count: number,
): Promise<StudyQuestion[]> {
  // Matching boards work best small; other modes default to ~10.
  const cap = mode === 'matching' ? Math.min(count, 6) : Math.min(count, 20)
  const pool = await getStudyPool(userId, cap)
  if (pool.length === 0) return []

  const dist = await getDistractors(
    userId,
    pool.map((w) => w.id),
  )

  return pool.map((w) => {
    const qMode: SingleStudyMode =
      mode === 'mixed' ? smartModeFor(w.strength, !!w.exampleEn) : (mode as SingleStudyMode)
    return buildQuestion(w, qMode, dist)
  })
}

export interface StudyAnswer {
  id: string // userWord id
  correct: boolean
}

/** Applies graded SM-2 to each answered personal word and awards capped XP. */
export async function submitStudy(userId: string, answers: StudyAnswer[]) {
  let correctCount = 0

  for (const a of answers) {
    const updated = await applyUserWordSm2(userId, a.id, a.correct)
    if (updated && a.correct) correctCount++
  }

  const xpEarned = correctCount > 0 ? await awardPersonalXp(userId, correctCount * XP_PER_QUIZ_CORRECT) : 0
  await invalidateFeedCache(userId)
  return { xpEarned, correct: correctCount, total: answers.length }
}
