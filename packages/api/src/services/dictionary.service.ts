import { redis } from '../lib/redis'

export interface DictionaryResult {
  found: boolean
  word: string
  pronunciation: string | null
  audioUrl: string | null
  partOfSpeech: string | null
  definitionEn: string | null
  exampleEn: string | null
  synonyms: string[]
}

const DICT_API = 'https://api.dictionaryapi.dev/api/v2/entries/en/'
const CACHE_KEY = (word: string) => `dict:${word}`
const HIT_TTL = 60 * 60 * 24 * 30 // 30 days
const MISS_TTL = 60 * 60 * 24 // 1 day
const FETCH_TIMEOUT_MS = 5000

function notFound(word: string): DictionaryResult {
  return {
    found: false,
    word,
    pronunciation: null,
    audioUrl: null,
    partOfSpeech: null,
    definitionEn: null,
    exampleEn: null,
    synonyms: [],
  }
}

/**
 * Looks up an English word via the free Dictionary API, with Redis caching of
 * both hits (30d) and misses (1d). Never throws — any failure resolves to
 * { found: false }.
 */
export async function lookupWord(word: string): Promise<DictionaryResult> {
  const normalized = word.trim().toLowerCase()
  if (!normalized) return notFound(word)

  // Try cache first (cache failures must not break the lookup).
  try {
    const cached = await redis.get(CACHE_KEY(normalized))
    if (cached) {
      try {
        return JSON.parse(cached) as DictionaryResult
      } catch {
        // Corrupt cache entry — fall through to a fresh fetch.
      }
    }
  } catch {
    // Redis unavailable — proceed without cache.
  }

  const result = await fetchFromApi(normalized)

  try {
    await redis.setex(
      CACHE_KEY(normalized),
      result.found ? HIT_TTL : MISS_TTL,
      JSON.stringify(result),
    )
  } catch {
    // Caching failure is non-fatal.
  }

  return result
}

async function fetchFromApi(word: string): Promise<DictionaryResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const res = await fetch(`${DICT_API}${encodeURIComponent(word)}`, {
      signal: controller.signal,
    })

    if (!res.ok) {
      // 404 + anything else (5xx, 429, etc.) → treat as not found.
      return notFound(word)
    }

    let json: unknown
    try {
      json = await res.json()
    } catch {
      return notFound(word)
    }

    // API returns { title: "No Definitions Found", ... } as an object on misses.
    if (!Array.isArray(json) || json.length === 0) {
      return notFound(word)
    }

    return parseEntry(word, json[0] as Record<string, unknown>)
  } catch {
    // Network error, abort/timeout, etc.
    return notFound(word)
  } finally {
    clearTimeout(timer)
  }
}

function parseEntry(word: string, entry: Record<string, unknown>): DictionaryResult {
  const phonetics = Array.isArray(entry.phonetics) ? (entry.phonetics as any[]) : []
  const meanings = Array.isArray(entry.meanings) ? (entry.meanings as any[]) : []

  // Pronunciation and audio may live on different phonetic entries.
  let pronunciation: string | null = null
  let audioUrl: string | null = null
  for (const p of phonetics) {
    if (!pronunciation && typeof p?.text === 'string' && p.text.trim()) {
      pronunciation = p.text.trim()
    }
    if (!audioUrl && typeof p?.audio === 'string' && p.audio.trim()) {
      audioUrl = p.audio.trim()
    }
    if (pronunciation && audioUrl) break
  }

  let partOfSpeech: string | null = null
  let definitionEn: string | null = null
  let exampleEn: string | null = null
  let synonyms: string[] = []

  const firstMeaning = meanings[0]
  if (firstMeaning && typeof firstMeaning === 'object') {
    if (typeof firstMeaning.partOfSpeech === 'string' && firstMeaning.partOfSpeech.trim()) {
      partOfSpeech = firstMeaning.partOfSpeech.trim()
    }

    const defs = Array.isArray(firstMeaning.definitions) ? firstMeaning.definitions : []
    const firstDef = defs[0]
    if (firstDef && typeof firstDef === 'object') {
      if (typeof firstDef.definition === 'string' && firstDef.definition.trim()) {
        definitionEn = firstDef.definition.trim()
      }
      if (typeof firstDef.example === 'string' && firstDef.example.trim()) {
        exampleEn = firstDef.example.trim()
      }
    }

    // Collect up to 5 synonyms across the first meaning's definitions.
    const collected = new Set<string>()
    for (const d of defs) {
      const syns = Array.isArray(d?.synonyms) ? d.synonyms : []
      for (const s of syns) {
        if (typeof s === 'string' && s.trim()) collected.add(s.trim())
        if (collected.size >= 5) break
      }
      if (collected.size >= 5) break
    }
    synonyms = Array.from(collected).slice(0, 5)
  }

  return {
    found: true,
    word,
    pronunciation,
    audioUrl,
    partOfSpeech,
    definitionEn,
    exampleEn,
    synonyms,
  }
}
