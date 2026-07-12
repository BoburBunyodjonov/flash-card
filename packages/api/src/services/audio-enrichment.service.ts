import { mkdir, writeFile, access } from 'fs/promises'
import path from 'path'
import axios from 'axios'
import { config } from '../config'
import { prisma } from '../lib/prisma'
import { fetchDictionaryData } from './words.service'

const DELAY_MS = 350
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function audioDir(): string {
  return process.env.WORD_AUDIO_DIR?.trim() || path.join('/tmp', 'wordswipe-audio')
}

function publicAudioUrl(wordId: string): string {
  const base = config.telegram.appUrl.replace(/\/$/, '')
  return `${base}/api/media/word-audio/${wordId}.mp3`
}

export async function ensureWordAudioDir() {
  await mkdir(audioDir(), { recursive: true })
}

export function wordAudioFilePath(wordId: string) {
  return path.join(audioDir(), `${wordId}.mp3`)
}

async function synthesizeGoogleTts(text: string): Promise<Buffer | null> {
  const key = process.env.GOOGLE_TTS_KEY?.trim()
  if (!key) return null

  try {
    const res = await axios.post(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(key)}`,
      {
        input: { text },
        voice: { languageCode: 'en-US', name: 'en-US-Neural2-D' },
        audioConfig: { audioEncoding: 'MP3', speakingRate: 0.95 },
      },
      { timeout: 20_000 },
    )
    const b64 = res.data?.audioContent as string | undefined
    if (!b64) return null
    return Buffer.from(b64, 'base64')
  } catch (err) {
    console.error('[TTS] Google synthesize failed:', (err as Error).message)
    return null
  }
}

async function attachTtsAudio(wordId: string, word: string): Promise<string | null> {
  const buf = await synthesizeGoogleTts(word)
  if (!buf) return null
  await ensureWordAudioDir()
  const filePath = wordAudioFilePath(wordId)
  await writeFile(filePath, buf)
  const url = publicAudioUrl(wordId)
  await prisma.word.update({ where: { id: wordId }, data: { audioUrl: url } })
  return url
}

export async function enrichMissingAudio(opts?: {
  limit?: number
  useTts?: boolean
}): Promise<{
  scanned: number
  dictionaryAudio: number
  ttsAudio: number
  definitionsUpdated: number
  notFound: number
  remaining: number
}> {
  const limit = Math.min(opts?.limit ?? 100, 500)
  const useTts = opts?.useTts !== false && Boolean(process.env.GOOGLE_TTS_KEY?.trim())

  const words = await prisma.word.findMany({
    where: { audioUrl: null },
    include: { translations: true },
    orderBy: { word: 'asc' },
    take: limit,
  })

  let dictionaryAudio = 0
  let ttsAudio = 0
  let definitionsUpdated = 0
  let notFound = 0

  for (const w of words) {
    const data = await fetchDictionaryData(w.word)

    if (data) {
      const wordPatch: Record<string, string> = {}
      if (data.audioUrl) wordPatch.audioUrl = data.audioUrl
      if (data.phonetic && !w.pronunciation) wordPatch.pronunciation = data.phonetic
      if (data.partOfSpeech && !w.partOfSpeech) wordPatch.partOfSpeech = data.partOfSpeech

      if (Object.keys(wordPatch).length > 0) {
        await prisma.word.update({ where: { id: w.id }, data: wordPatch })
        if (wordPatch.audioUrl) dictionaryAudio++
      }

      for (const t of w.translations) {
        const tPatch: Record<string, string> = {}
        if (data.definition && !t.definitionEn) tPatch.definitionEn = data.definition
        if (data.example && !t.exampleEn) tPatch.exampleEn = data.example
        if (Object.keys(tPatch).length > 0) {
          await prisma.wordTranslation.update({ where: { id: t.id }, data: tPatch })
          definitionsUpdated++
        }
      }

      if (data.audioUrl) {
        await sleep(DELAY_MS)
        continue
      }
    } else {
      notFound++
    }

    if (useTts) {
      const url = await attachTtsAudio(w.id, w.word)
      if (url) ttsAudio++
    }

    await sleep(DELAY_MS)
  }

  const remaining = await prisma.word.count({ where: { audioUrl: null } })
  return {
    scanned: words.length,
    dictionaryAudio,
    ttsAudio,
    definitionsUpdated,
    notFound,
    remaining,
  }
}

export async function getWordAudioStats() {
  const [total, withAudio, missing] = await Promise.all([
    prisma.word.count(),
    prisma.word.count({ where: { audioUrl: { not: null } } }),
    prisma.word.count({ where: { audioUrl: null } }),
  ])
  return {
    total,
    with_audio: withAudio,
    missing_audio: missing,
    tts_configured: Boolean(process.env.GOOGLE_TTS_KEY?.trim()),
  }
}

export async function resolveLocalWordAudio(wordId: string): Promise<string | null> {
  const filePath = wordAudioFilePath(wordId)
  try {
    await access(filePath)
    return filePath
  } catch {
    return null
  }
}
