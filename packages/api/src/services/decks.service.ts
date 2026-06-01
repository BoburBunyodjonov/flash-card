import { prisma } from '../lib/prisma'
import { getFreeLimits } from './plan-settings.service'

export async function getUserDecks(userId: string) {
  return prisma.userDeck.findMany({
    where: { userId },
    include: { _count: { select: { words: true } } },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  })
}

export async function createDeck(
  userId: string,
  name: string,
  description: string | undefined,
  isPremium: boolean,
) {
  const limits = await getFreeLimits()
  if (!isPremium) {
    const count = await prisma.userDeck.count({ where: { userId, isDefault: false } })
    if (count >= limits.maxDecks) {
      throw new Error(`Free plan allows only ${limits.maxDecks} custom deck(s)`)
    }
  }

  return prisma.userDeck.create({
    data: { userId, name, description },
    include: { _count: { select: { words: true } } },
  })
}

export async function updateDeck(
  deckId: string,
  userId: string,
  data: { name?: string; description?: string },
) {
  const deck = await prisma.userDeck.findFirst({ where: { id: deckId, userId } })
  if (!deck) throw new Error('Deck not found')
  if (deck.isDefault) throw new Error('Cannot edit default deck')

  return prisma.userDeck.update({ where: { id: deckId }, data })
}

export async function deleteDeck(deckId: string, userId: string) {
  const deck = await prisma.userDeck.findFirst({ where: { id: deckId, userId } })
  if (!deck) throw new Error('Deck not found')
  if (deck.isDefault) throw new Error('Cannot delete default deck')

  await prisma.userDeck.delete({ where: { id: deckId } })
}

export async function addWordToDeck(
  deckId: string,
  userId: string,
  wordId: string,
  isPremium: boolean,
) {
  const deck = await prisma.userDeck.findFirst({ where: { id: deckId, userId } })
  if (!deck) throw new Error('Deck not found')

  const limits = await getFreeLimits()
  if (!isPremium) {
    const count = await prisma.deckWord.count({ where: { deckId } })
    if (count >= limits.maxWordsPerDeck) {
      throw new Error(`Free plan allows only ${limits.maxWordsPerDeck} words per deck`)
    }
  }

  return prisma.deckWord.upsert({
    where: { deckId_wordId: { deckId, wordId } },
    update: {},
    create: { deckId, wordId },
  })
}

export async function removeWordFromDeck(deckId: string, userId: string, wordId: string) {
  const deck = await prisma.userDeck.findFirst({ where: { id: deckId, userId } })
  if (!deck) throw new Error('Deck not found')

  await prisma.deckWord.deleteMany({ where: { deckId, wordId } })
}

export async function getDeckWords(userId: string, deckId: string) {
  const deck = await prisma.userDeck.findFirst({ where: { id: deckId, userId } })
  if (!deck) throw new Error('Deck not found')

  const rows = await prisma.deckWord.findMany({
    where: { deckId },
    include: {
      word: {
        include: {
          translations: { take: 1 },
          category: { select: { name: true, isPremium: true } },
        },
      },
    },
    orderBy: { addedAt: 'desc' },
  })

  return {
    deck,
    words: (rows as any[]).map((r: any) => ({
      id: r.word.id,
      word: r.word.word,
      pronunciation: r.word.pronunciation,
      partOfSpeech: r.word.partOfSpeech,
      difficulty: r.word.difficulty,
      addedAt: r.addedAt,
      category: r.word.category,
      translation: r.word.translations[0] ?? null,
    })),
  }
}
