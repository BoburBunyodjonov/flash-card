import { PrismaClient } from '@prisma/client'
import { DEFAULT_PLAN_SETTINGS } from '@wordswipe/shared'
import { SEED_WORDS } from './seed-words'

const prisma = new PrismaClient()

async function main() {
  // Seed plan settings
  for (const [key, value] of Object.entries(DEFAULT_PLAN_SETTINGS)) {
    await prisma.planSetting.upsert({
      where: { key },
      update: {},
      create: { key, value },
    })
  }

  // Seed categories
  const categories = [
    { nameUz: 'Kundalik so\'zlar', nameEn: 'Daily Words', nameRu: 'Ежедневные слова', icon: '🌟', color: '#6366f1', isPremium: false, order: 1 },
    { nameUz: 'IELTS', nameEn: 'IELTS', nameRu: 'IELTS', icon: '🎓', color: '#f59e0b', isPremium: true, order: 2 },
    { nameUz: 'Biznes inglizcha', nameEn: 'Business English', nameRu: 'Деловой английский', icon: '💼', color: '#10b981', isPremium: true, order: 3 },
    { nameUz: 'Akademik so\'zlar', nameEn: 'Academic', nameRu: 'Академический', icon: '📚', color: '#3b82f6', isPremium: true, order: 4 },
    { nameUz: 'Sayohat', nameEn: 'Travel', nameRu: 'Путешествия', icon: '✈️', color: '#ec4899', isPremium: false, order: 5 },
    { nameUz: 'Texnologiya', nameEn: 'Technology', nameRu: 'Технологии', icon: '💻', color: '#8b5cf6', isPremium: false, order: 6 },
  ]

  const categoryByName: Record<string, string> = {}
  for (const cat of categories) {
    const existing = await prisma.category.findFirst({ where: { nameEn: cat.nameEn } })
    const saved = existing
      ? await prisma.category.update({ where: { id: existing.id }, data: cat })
      : await prisma.category.create({ data: cat })
    categoryByName[saved.nameEn] = saved.id
  }

  // Seed words + Uzbek translations (idempotent: upsert by unique word / [wordId, language])
  let seededWords = 0
  for (const w of SEED_WORDS) {
    const categoryId = categoryByName[w.category]
    if (!categoryId) {
      console.warn(`⚠️  Skipping "${w.word}": unknown category "${w.category}"`)
      continue
    }

    const word = await prisma.word.upsert({
      where: { word: w.word },
      update: {
        pronunciation: w.pronunciation ?? null,
        partOfSpeech: w.partOfSpeech ?? null,
        difficulty: w.difficulty,
        categoryId,
      },
      create: {
        word: w.word,
        pronunciation: w.pronunciation ?? null,
        partOfSpeech: w.partOfSpeech ?? null,
        difficulty: w.difficulty,
        categoryId,
      },
    })

    await prisma.wordTranslation.upsert({
      where: { wordId_language: { wordId: word.id, language: 'uz' } },
      update: {
        translation: w.uz.translation,
        definitionEn: w.uz.definitionEn ?? null,
        exampleEn: w.uz.exampleEn ?? null,
        exampleTranslated: w.uz.exampleTranslated ?? null,
      },
      create: {
        wordId: word.id,
        language: 'uz',
        translation: w.uz.translation,
        definitionEn: w.uz.definitionEn ?? null,
        exampleEn: w.uz.exampleEn ?? null,
        exampleTranslated: w.uz.exampleTranslated ?? null,
      },
    })
    seededWords++
  }

  console.log(`✅ Seed completed (${seededWords} words)`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
