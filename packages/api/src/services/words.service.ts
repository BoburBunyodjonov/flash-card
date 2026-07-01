import { prisma } from '../lib/prisma'
import axios from 'axios'
import type { Language } from '@wordswipe/shared'

/**
 * Word search with relevance ranking. Matches both the English headword and the
 * translation in the user's language (so e.g. typing "kitob" finds "book"), and
 * ranks results: exact word > word prefix > translation match > word substring.
 * The ranking is done in SQL so it holds across pages, not just within one page.
 */
export async function searchWords(query: string, language: Language, page = 1, limit = 20) {
  const skip = (page - 1) * limit
  const q = query.trim()
  const contains = `%${q}%`
  const prefix = `${q}%`

  // Rank + paginate at the DB level, then hydrate the full records in order.
  const [ranked, countRows] = await Promise.all([
    prisma.$queryRaw<{ id: string }[]>`
      SELECT w.id
      FROM words w
      LEFT JOIN word_translations t ON t.word_id = w.id AND t.language = ${language}::"Language"
      WHERE w.word ILIKE ${contains} OR t.translation ILIKE ${contains}
      ORDER BY
        (CASE
          WHEN lower(w.word) = lower(${q}) THEN 0
          WHEN w.word ILIKE ${prefix} THEN 1
          WHEN t.translation ILIKE ${contains} THEN 2
          ELSE 3 END) ASC,
        w.word ASC
      LIMIT ${limit} OFFSET ${skip}
    `,
    prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(*)::int AS count
      FROM words w
      LEFT JOIN word_translations t ON t.word_id = w.id AND t.language = ${language}::"Language"
      WHERE w.word ILIKE ${contains} OR t.translation ILIKE ${contains}
    `,
  ])

  const ids = ranked.map((r) => r.id)
  const total = countRows[0]?.count ?? 0

  // findMany doesn't preserve `in` order — re-sort to match the ranked ids.
  const rows = ids.length
    ? await prisma.word.findMany({
        where: { id: { in: ids } },
        include: { translations: { where: { language } }, category: true },
      })
    : []
  const byId = new Map(rows.map((w) => [w.id, w]))
  const words = ids.map((id) => byId.get(id)).filter((w): w is NonNullable<typeof w> => Boolean(w))

  return { words, total, page, limit, totalPages: Math.ceil(total / limit) }
}

export async function getWordById(id: string, language: Language) {
  return prisma.word.findUnique({
    where: { id },
    include: {
      translations: { where: { language } },
      category: true,
    },
  })
}

export async function fetchDictionaryData(word: string) {
  try {
    const response = await axios.get(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
      { timeout: 5000 },
    )
    const entry = response.data[0]
    if (!entry) return null

    const meaning = entry.meanings?.[0]
    const definition = meaning?.definitions?.[0]

    return {
      phonetic: entry.phonetic ?? entry.phonetics?.[0]?.text ?? null,
      audioUrl: entry.phonetics?.find((p: any) => p.audio)?.audio ?? null,
      partOfSpeech: meaning?.partOfSpeech ?? null,
      definition: definition?.definition ?? null,
      example: definition?.example ?? null,
      synonyms: meaning?.synonyms?.slice(0, 5) ?? [],
    }
  } catch {
    return null
  }
}

export async function toggleBookmark(userId: string, wordId: string): Promise<boolean> {
  const savedDeck = await prisma.userDeck.findFirst({
    where: { userId, isDefault: true },
  })

  if (!savedDeck) {
    const deck = await prisma.userDeck.create({
      data: { userId, name: 'Saved Words', isDefault: true },
    })
    await prisma.deckWord.create({ data: { deckId: deck.id, wordId } })
    return true
  }

  const existing = await prisma.deckWord.findUnique({
    where: { deckId_wordId: { deckId: savedDeck.id, wordId } },
  })

  if (existing) {
    await prisma.deckWord.delete({ where: { id: existing.id } })
    return false
  } else {
    await prisma.deckWord.create({ data: { deckId: savedDeck.id, wordId } })
    return true
  }
}
