import { readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { config } from '../config'

/**
 * Speech-to-text for shadowing transcripts, via an OpenAI-compatible endpoint
 * (Groq by default). Turns a downloaded clip into an English transcript with
 * per-segment timestamps, and can translate it to Uzbek with a chat model.
 */

export interface TranscriptSegment {
  start: number
  end: number
  text: string
}

export interface TranscriptionResult {
  transcript: string
  segments: TranscriptSegment[]
  translationUz: string | null
}

export class TranscribeUnavailableError extends Error {
  constructor() {
    super('Speech-to-text is not configured')
    this.name = 'TranscribeUnavailableError'
  }
}

export class TranscribeFileTooLargeError extends Error {
  constructor() {
    super('Video is too large for auto-transcription')
    this.name = 'TranscribeFileTooLargeError'
  }
}

export function isTranscribeConfigured(): boolean {
  return !!config.transcribe.apiKey
}

// OpenAI/Groq /audio/transcriptions cap uploads at 25 MB. We send the video as
// is (no ffmpeg), so guard a hair under that.
const MAX_UPLOAD_BYTES = 24 * 1024 * 1024

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Extracts a small mono 16 kHz mp3 audio track from a video via ffmpeg, so we
 * can transcribe clips far larger than the 25 MB upload cap (a video's audio is
 * tiny). Returns the audio path, or null if ffmpeg is missing/fails (caller
 * falls back to sending the video directly).
 */
export async function extractAudio(videoPath: string): Promise<string | null> {
  const audioPath = `${videoPath}.mp3`
  return new Promise((resolve) => {
    const ff = spawn(
      'ffmpeg',
      ['-y', '-i', videoPath, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '64k', audioPath],
      { stdio: 'ignore' },
    )
    ff.on('error', () => resolve(null)) // ffmpeg binary not found
    ff.on('close', (code) => resolve(code === 0 ? audioPath : null))
  })
}

/** Runs Whisper on a local audio/video file → transcript + segment timestamps. */
export async function transcribeFile(
  filePath: string,
  uploadName = 'clip.mp4',
): Promise<{ transcript: string; segments: TranscriptSegment[] }> {
  if (!isTranscribeConfigured()) throw new TranscribeUnavailableError()

  const buf = await readFile(filePath)
  if (buf.length > MAX_UPLOAD_BYTES) throw new TranscribeFileTooLargeError()

  const form = new FormData()
  // Groq/OpenAI validate the format by the FILENAME EXTENSION — send audio as
  // clip.mp3 or video as clip.mp4 (a bare temp name like *.tmp is rejected).
  const mime = uploadName.endsWith('.mp3') ? 'audio/mpeg' : 'video/mp4'
  form.append('file', new Blob([buf], { type: mime }), uploadName)
  form.append('model', config.transcribe.model)
  form.append('response_format', 'verbose_json')
  form.append('language', 'en')
  form.append('timestamp_granularities[]', 'segment')

  const res = await fetch(`${config.transcribe.apiBase}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.transcribe.apiKey}` },
    body: form,
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Transcription failed (${res.status}): ${detail.slice(0, 300)}`)
  }

  const data: any = await res.json()
  const rawSegments: any[] = Array.isArray(data.segments) ? data.segments : []
  const segments: TranscriptSegment[] = rawSegments
    .map((s) => ({ start: round2(s.start ?? 0), end: round2(s.end ?? 0), text: String(s.text ?? '').trim() }))
    .filter((s) => s.text.length > 0)

  // Prefer a line-per-segment transcript (better for shadowing); fall back to
  // the flat `text` field if the model returned no segments.
  const transcript = segments.length
    ? segments.map((s) => s.text).join('\n')
    : String(data.text ?? '').trim()

  return { transcript, segments }
}

/** Translates English text to natural Uzbek (Latin) via the same provider. */
export async function translateToUzbek(text: string): Promise<string> {
  if (!isTranscribeConfigured()) throw new TranscribeUnavailableError()
  if (!text.trim()) return ''

  const res = await fetch(`${config.transcribe.apiBase}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.transcribe.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.transcribe.translateModel,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content:
            "You are a professional translator. Translate the user's English text into natural, fluent Uzbek (Latin script). Keep the line breaks. Output ONLY the Uzbek translation — no notes, no quotes.",
        },
        { role: 'user', content: text },
      ],
    }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Translation failed (${res.status}): ${detail.slice(0, 300)}`)
  }
  const data: any = await res.json()
  return String(data?.choices?.[0]?.message?.content ?? '').trim()
}

export interface WordLevelHint {
  word: string
  level: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'
  translationUz: string
}

export interface WordInContext {
  word: string
  /** One or two short lines from the video where the word appears. */
  contexts: string[]
}

function parseWordLevelHints(content: string): WordLevelHint[] {
  const jsonMatch = content.match(/\[[\s\S]*\]/)
  if (!jsonMatch) return []
  try {
    const arr = JSON.parse(jsonMatch[0]) as any[]
    const levels = new Set(['A1', 'A2', 'B1', 'B2', 'C1', 'C2'])
    return arr
      .filter((x) => x && typeof x.word === 'string' && levels.has(String(x.level)))
      .map((x) => ({
        word: String(x.word).toLowerCase(),
        level: x.level as WordLevelHint['level'],
        translationUz: String(x.translationUz ?? '').trim(),
      }))
      .filter((x) => !!x.translationUz)
  } catch {
    return []
  }
}

/**
 * Batch-classify English words with CEFR + short Uzbek gloss (no context).
 */
export async function classifyWordsCefr(words: string[]): Promise<WordLevelHint[]> {
  if (!isTranscribeConfigured() || words.length === 0) return []
  const list = words.slice(0, 80).join(', ')
  const res = await fetch(`${config.transcribe.apiBase}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.transcribe.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.transcribe.translateModel,
      temperature: 0.1,
      messages: [
        {
          role: 'system',
          content:
            'You are an English CEFR lexicographer for Uzbek learners. ' +
            'From the candidate tokens, KEEP ONLY real English dictionary words ' +
            '(common lemmas learners should study). ' +
            'OMIT entirely: proper names/people/places, Spanish/French/other languages, ' +
            'interjections, abbreviations, slang fragments, and non-words. ' +
            'Return JSON array only for kept words: ' +
            '[{"word":"...","level":"A1|A2|B1|B2|C1|C2","translationUz":"..."}]. ' +
            'Use Latin Uzbek. No markdown.',
        },
        { role: 'user', content: list },
      ],
    }),
  })
  if (!res.ok) return []
  const data: any = await res.json()
  return parseWordLevelHints(String(data?.choices?.[0]?.message?.content ?? '').trim())
}

/**
 * CEFR + Uzbek gloss using the word's meaning IN THE GIVEN VIDEO CONTEXT.
 * Critical for polysemy (e.g. "bank", "run", "set") — pick the sense that fits
 * the example sentence, not the most common dictionary sense.
 */
export async function classifyWordsCefrInContext(
  items: WordInContext[],
): Promise<WordLevelHint[]> {
  if (!isTranscribeConfigured() || items.length === 0) return []

  const payload = items.slice(0, 40).map((it) => ({
    word: it.word,
    context: (it.contexts[0] ?? '').slice(0, 220),
  }))

  const res = await fetch(`${config.transcribe.apiBase}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.transcribe.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.transcribe.translateModel,
      temperature: 0.15,
      messages: [
        {
          role: 'system',
          content:
            'You help Uzbek learners study English words FROM A VIDEO. ' +
            'Each item has a word and a context sentence from that video. ' +
            'KEEP ONLY real English dictionary words suitable for study. ' +
            'OMIT: proper names, other languages, interjections, non-words. ' +
            'For translationUz: choose the sense that fits THIS context ' +
            '(not a random/default dictionary sense). Keep gloss short (1–4 Uzbek words). ' +
            'Latin Uzbek only. Return JSON array only: ' +
            '[{"word":"...","level":"A1|A2|B1|B2|C1|C2","translationUz":"..."}]. ' +
            'No markdown.',
        },
        {
          role: 'user',
          content: JSON.stringify(payload),
        },
      ],
    }),
  })
  if (!res.ok) return []
  const data: any = await res.json()
  return parseWordLevelHints(String(data?.choices?.[0]?.message?.content ?? '').trim())
}

/**
 * Translates N English lines → N Uzbek lines (same order). Used for Cinema
 * per-segment subtitles. Falls back to empty strings on parse failure.
 */
export async function translateLinesToUzbek(lines: string[]): Promise<string[]> {
  if (!isTranscribeConfigured()) throw new TranscribeUnavailableError()
  if (lines.length === 0) return []

  const numbered = lines.map((l, i) => `${i + 1}. ${l}`).join('\n')
  const res = await fetch(`${config.transcribe.apiBase}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.transcribe.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.transcribe.translateModel,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content:
            `You translate English subtitle lines to natural Uzbek (Latin script). ` +
            `The user sends numbered lines (1. … ${lines.length}. …). ` +
            `Reply with EXACTLY ${lines.length} numbered Uzbek lines in the same order. ` +
            `No commentary, no extra lines.`,
        },
        { role: 'user', content: numbered },
      ],
    }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Translation failed (${res.status}): ${detail.slice(0, 300)}`)
  }
  const data: any = await res.json()
  const content = String(data?.choices?.[0]?.message?.content ?? '').trim()
  const out = new Array(lines.length).fill('')
  for (const raw of content.split('\n')) {
    const m = raw.match(/^\s*(\d+)\.\s*(.*)$/)
    if (!m) continue
    const idx = parseInt(m[1], 10) - 1
    if (idx >= 0 && idx < lines.length) out[idx] = m[2].trim()
  }
  // If model ignored numbering, fall back to line order
  if (out.every((x) => !x)) {
    const plain = content.split('\n').map((l) => l.replace(/^\s*\d+\.\s*/, '').trim()).filter(Boolean)
    for (let i = 0; i < Math.min(plain.length, lines.length); i++) out[i] = plain[i]
  }
  return out
}
