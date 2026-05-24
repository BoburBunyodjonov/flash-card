import { prisma } from '../lib/prisma'
import axios from 'axios'
import type { Language } from '@wordswipe/shared'

export async function searchWords(query: string, language: Language, page = 1, limit = 20) {
  const skip = (page - 1) * limit
  const [words, total] = await Promise.all([
    prisma.word.findMany({
      where: { word: { contains: query, mode: 'insensitive' } },
      skip,
      take: limit,
      include: {
        translations: { where: { language } },
        category: true,
      },
    }),
    prisma.word.count({ where: { word: { contains: query, mode: 'insensitive' } } }),
  ])

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
