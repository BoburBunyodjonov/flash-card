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
