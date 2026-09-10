import { prisma } from '../lib/prisma'
import type { Difficulty } from '@wordswipe/shared'
import {
  classifyWordsCefr,
  classifyWordsCefrInContext,
  isTranscribeConfigured,
  type WordInContext,
} from './transcription.service'
import { createUserWord, DuplicateUserWordError } from './my-words.service'

export interface VideoVocabWord {
  word: string
  level: Difficulty
  translationUz: string
  count: number
  /** Example line from the video (context used for the gloss). */
  example?: string
}

export interface TextSegment {
  text: string
}

/** Bump to force lazy rebuild of cached clip vocabularies. */
export const VOCAB_BUILD_VERSION = 3

type StoredVocabulary = { v: number; words: VideoVocabWord[] }

const DIFF_RANK: Record<Difficulty, number> = {
  A1: 0, A2: 1, B1: 2, B2: 3, C1: 4, C2: 5,
}

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'so', 'as', 'at', 'by', 'for',
  'from', 'in', 'into', 'of', 'on', 'to', 'up', 'with', 'is', 'am', 'are', 'was',
  'were', 'be', 'been', 'being', 'do', 'does', 'did', 'doing', 'have', 'has', 'had',
  'having', 'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'him', 'his', 'she',
  'her', 'it', 'its', 'they', 'them', 'their', 'this', 'that', 'these', 'those',
  'what', 'which', 'who', 'whom', 'when', 'where', 'why', 'how', 'all', 'each',
  'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor',
  'not', 'only', 'own', 'same', 'than', 'too', 'very', 'can', 'will', 'just',
  'don', 'should', 'now', 'll', 're', 've', 'd', 's', 't', 'm', 'o', 'y', 'yeah',
  'yes', 'oh', 'uh', 'um', 'like', 'gonna', 'wanna', 'gotta', 'one', 'two',
])

/** Common non-English tokens that Whisper/AI often mis-label as English. */
const NON_ENGLISH = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'y', 'o', 'pero', 'porque',
  'que', 'qué', 'como', 'cómo', 'para', 'por', 'con', 'sin', 'sobre', 'entre',
  'este', 'esta', 'estos', 'estas', 'ese', 'esa', 'eso', 'aqui', 'aquí', 'alli',
  'allí', 'muy', 'mas', 'más', 'también', 'tambien', 'hay', 'ser', 'estar', 'tiene',
  'hacer', 'dice', 'dijo', 'hola', 'gracias', 'señor', 'senor', 'señora', 'senora',
  'bueno', 'buena', 'bien', 'mal', 'nada', 'todo', 'todos', 'todas', 'algo',
  'alguien', 'nadie', 'donde', 'dónde', 'cuando', 'cuándo', 'cinco', 'seis', 'siete',
  'ocho', 'nueve', 'diez', 'meses', 'mes', 'años', 'ano', 'año', 'dias', 'días',
  'hoy', 'mañana', 'manana', 'noche', 'si', 'sí', 'no', 'yo', 'tu', 'tú', 'usted',
  'nosotros', 'ellos', 'ellas', 'mi', 'mis', 'su', 'sus', 'le', 'les', 'lo',
  'del', 'al', 'de', 'en', 'se', 'te', 'me', 'nos', 'vos', 'ya', 'hasta', 'desde',
  'durante', 'después', 'despues', 'antes', 'ahora', 'siempre', 'nunca', 'tambien',
  'porque', 'aunque', 'mientras', 'entonces', 'así', 'asi', 'también',
  'nao', 'não', 'sim', 'voce', 'você', 'pra', 'pro', 'uma', 'isso', 'aqui',
  'ciao', 'perché', 'perche', 'anche', 'sono', 'cosa', 'questo', 'questa',
  'oui', 'non', 'avec', 'dans', 'pour', 'une', 'des', 'les', 'mon', 'ton', 'son',
  'je', 'tu', 'il', 'elle', 'nous', 'vous', 'ils', 'elles', 'cest', "c'est",
])

function tokenize(text: string): string[] {
  return text.match(/[A-Za-z']+/g) ?? []
}

function isPlausibleEnglishLemma(w: string): boolean {
  if (w.length < 3 || w.length > 32) return false
  if (STOPWORDS.has(w) || NON_ENGLISH.has(w)) return false
  if (!/^[a-z]+(?:'[a-z]+)?$/.test(w)) return false
  return true
}

function clipContext(line: string): string {
  const t = line.replace(/\s+/g, ' ').trim()
  if (t.length <= 220) return t
  return `${t.slice(0, 217)}…`
}

/** Prefer timed segments; fall back to transcript lines. */
export function textUnitsFromClip(
  segments: TextSegment[] | null | undefined,
  transcript?: string | null,
): TextSegment[] {
  if (segments?.length) return segments.filter((s) => s.text?.trim())
  if (!transcript?.trim()) return []
  return transcript
    .split(/\n+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((text) => ({ text }))
}

/** Read stored vocab (v2+ object or legacy bare array). */
export function parseStoredVocabulary(raw: unknown): VideoVocabWord[] | null {
  if (!raw) return null
  if (Array.isArray(raw)) return raw as VideoVocabWord[]
  if (typeof raw === 'object' && Array.isArray((raw as StoredVocabulary).words)) {
    return (raw as StoredVocabulary).words
  }
  return null
}

/** True when missing or built with an older filter (must rebuild). */
export function needsVocabRebuild(raw: unknown): boolean {
  if (!raw) return true
  if (Array.isArray(raw)) return true
  const stored = raw as StoredVocabulary
  if (stored.v !== VOCAB_BUILD_VERSION || !Array.isArray(stored.words)) return true
  return false
}

export function packVocabulary(words: VideoVocabWord[]): StoredVocabulary {
  return { v: VOCAB_BUILD_VERSION, words }
}

async function lookupDbWords(
  tokens: string[],
): Promise<Map<string, { level: Difficulty; translationUz: string }>> {
  const fromDb = new Map<string, { level: Difficulty; translationUz: string }>()
  for (let i = 0; i < tokens.length; i += 80) {
    const chunk = tokens.slice(i, i + 80)
    const dbWords = await prisma.word.findMany({
      where: {
        OR: chunk.map((t) => ({ word: { equals: t, mode: 'insensitive' as const } })),
      },
      select: {
        word: true,
        difficulty: true,
        translations: { where: { language: 'uz' }, select: { translation: true }, take: 1 },
      },
    })
    for (const w of dbWords) {
      fromDb.set(w.word.toLowerCase(), {
        level: w.difficulty as Difficulty,
        translationUz: w.translations[0]?.translation ?? '',
      })
    }
  }
  return fromDb
}

async function glossInContextBatches(
  items: WordInContext[],
): Promise<Map<string, { level: Difficulty; translationUz: string }>> {
  const out = new Map<string, { level: Difficulty; translationUz: string }>()
  if (!items.length || !isTranscribeConfigured()) return out

  for (let i = 0; i < items.length; i += 30) {
    const chunk = items.slice(i, i + 30)
    try {
      const hints = await classifyWordsCefrInContext(chunk)
      for (const h of hints) {
        const key = h.word.toLowerCase()
        if (!isPlausibleEnglishLemma(key) || !h.translationUz) continue
        out.set(key, { level: h.level, translationUz: h.translationUz })
      }
    } catch (err) {
      console.warn('[vocab] classifyWordsCefrInContext failed:', (err as Error)?.message ?? err)
    }
  }
  return out
}

/**
 * Build unique English content-word vocabulary with CEFR + context-aware Uzbek.
 * Translation prefers the sense used in the video line, not a generic dictionary gloss.
 */
export async function buildVocabularyFromText(
  segments: TextSegment[] | null,
  transcript?: string | null,
): Promise<VideoVocabWord[]> {
  const units = textUnitsFromClip(segments, transcript)
  if (!units.length) return []

  const counts = new Map<string, number>()
  const contexts = new Map<string, string[]>()

  for (const seg of units) {
    const line = clipContext(seg.text)
    if (!line) continue
    const seenInLine = new Set<string>()
    for (const t of tokenize(seg.text)) {
      const w = t.toLowerCase()
      if (!isPlausibleEnglishLemma(w)) continue
      counts.set(w, (counts.get(w) ?? 0) + 1)
      if (seenInLine.has(w)) continue
      seenInLine.add(w)
      const list = contexts.get(w) ?? []
      if (list.length < 2) {
        list.push(line)
        contexts.set(w, list)
      }
    }
  }
  if (counts.size === 0) return []

  const tokens = [...counts.keys()]
  const fromDb = await lookupDbWords(tokens)

  // Context-aware gloss for every candidate (DB + unknowns). AI may omit non-English.
  const contextItems: WordInContext[] = tokens.map((word) => ({
    word,
    contexts: contexts.get(word) ?? [],
  }))
  const fromAi = await glossInContextBatches(contextItems)

  // Fallback for words AI skipped but DB knows — still try no-context classify for unknowns
  const stillUnknown = tokens.filter((t) => !fromAi.has(t) && !fromDb.has(t))
  if (stillUnknown.length && isTranscribeConfigured()) {
    for (let i = 0; i < stillUnknown.length; i += 50) {
      const chunk = stillUnknown.slice(i, i + 50)
      try {
        const hints = await classifyWordsCefr(chunk)
        for (const h of hints) {
          const key = h.word.toLowerCase()
          if (!counts.has(key) || !isPlausibleEnglishLemma(key) || !h.translationUz) continue
          if (!fromAi.has(key)) {
            fromAi.set(key, { level: h.level, translationUz: h.translationUz.trim() })
          }
        }
      } catch (err) {
        console.warn('[vocab] classifyWordsCefr fallback failed:', (err as Error)?.message ?? err)
      }
    }
  }

  const out: VideoVocabWord[] = []
  for (const [word, count] of counts) {
    const ai = fromAi.get(word)
    const db = fromDb.get(word)
    if (!ai && !db) continue

    // Prefer context-aware AI gloss; keep DB CEFR when available (more stable).
    out.push({
      word,
      level: db?.level ?? ai?.level ?? 'B1',
      translationUz: ai?.translationUz || db?.translationUz || word,
      count,
      example: contexts.get(word)?.[0],
    })
  }

  out.sort(
    (a, b) =>
      DIFF_RANK[a.level] - DIFF_RANK[b.level] ||
      b.count - a.count ||
      a.word.localeCompare(b.word),
  )
  return out
}

/**
 * Save a vocab word to My Words. If the user already has it, returns the
 * existing row instead of failing.
 */
export async function saveVocabWordToMyWords(
  userId: string,
  entry: { word: string; translationUz: string },
): Promise<{ saved: boolean; alreadyHad: boolean; word: string; translation: string }> {
  try {
    const row = await createUserWord(userId, {
      word: entry.word,
      translation: entry.translationUz || entry.word,
    })
    return {
      saved: true,
      alreadyHad: false,
      word: row.word,
      translation: row.translation,
    }
  } catch (err) {
    if (err instanceof DuplicateUserWordError) {
      const existing = await prisma.userWord.findFirst({
        where: { userId, word: { equals: entry.word, mode: 'insensitive' } },
      })
      return {
        saved: false,
        alreadyHad: true,
        word: existing?.word ?? entry.word,
        translation: existing?.translation ?? entry.translationUz,
      }
    }
    throw err
  }
}

export interface WordAnno {
  text: string
  translation?: string
  difficulty?: Difficulty
  hard?: boolean
}

export interface EnrichableSegment {
  text: string
  words?: WordAnno[]
}

/**
 * Annotate each segment's tokens, flagging ONLY words above the viewer's CEFR
 * with an inline Uzbek gloss (for "smart" subtitle mode). Shared by Cinema and
 * Shadowing so both render identical smart subtitles.
 */
export async function enrichSegmentsForUser<T extends EnrichableSegment>(
  segments: T[] | null | undefined,
  userLevel: Difficulty | null,
  vocabulary: VideoVocabWord[] | null,
): Promise<T[] | null> {
  if (!segments?.length) return segments ?? null
  const userRank = userLevel && DIFF_RANK[userLevel] != null ? DIFF_RANK[userLevel] : -1

  const byWord = new Map<string, { difficulty: Difficulty; translation: string | null }>()
  for (const v of vocabulary ?? []) {
    byWord.set(v.word.toLowerCase(), {
      difficulty: v.level,
      translation: v.translationUz || null,
    })
  }

  const missing = new Set<string>()
  for (const seg of segments) {
    for (const t of tokenize(seg.text)) {
      const w = t.toLowerCase()
      if (!byWord.has(w) && !STOPWORDS.has(w) && w.length > 1) missing.add(w)
    }
  }
  if (missing.size) {
    const dbWords = await lookupDbWords([...missing])
    for (const [w, info] of dbWords) {
      byWord.set(w, { difficulty: info.level, translation: info.translationUz || null })
    }
  }

  return segments.map((seg) => {
    const parts = seg.text.split(/([A-Za-z']+)/)
    const words: WordAnno[] = []
    for (const part of parts) {
      if (!part) continue
      if (!/^[A-Za-z']+$/.test(part)) {
        words.push({ text: part })
        continue
      }
      const info = byWord.get(part.toLowerCase())
      if (!info) {
        words.push({ text: part })
        continue
      }
      const hard = DIFF_RANK[info.difficulty] > userRank
      words.push({
        text: part,
        difficulty: info.difficulty,
        hard,
        translation: hard && info.translation ? info.translation : undefined,
      })
    }
    return { ...seg, words }
  })
}

export function isStopword(w: string): boolean {
  return STOPWORDS.has(w.toLowerCase())
}

export function tokenizeText(text: string): string[] {
  return tokenize(text)
}

export { DIFF_RANK }
