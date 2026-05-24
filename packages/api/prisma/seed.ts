import { PrismaClient } from '@prisma/client'
import { DEFAULT_PLAN_SETTINGS } from '@wordswipe/shared'

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

  // Seed language pairs
  await prisma.languagePair.upsert({
    where: { fromLang_toLang: { fromLang: 'en', toLang: 'uz' } },
    update: { isActive: true },
    create: { fromLang: 'en', toLang: 'uz', isActive: true },
  })
  await prisma.languagePair.upsert({
    where: { fromLang_toLang: { fromLang: 'en', toLang: 'ru' } },
    update: {},
    create: { fromLang: 'en', toLang: 'ru', isActive: false },
  })
  await prisma.languagePair.upsert({
    where: { fromLang_toLang: { fromLang: 'ru', toLang: 'uz' } },
    update: {},
    create: { fromLang: 'ru', toLang: 'uz', isActive: false },
  })

  // Seed categories
  const categories = [
    { nameUz: 'Kundalik so\'zlar', nameEn: 'Daily Words', nameRu: 'Ежедневные слова', icon: '🌟', color: '#6366f1', isPremium: false, order: 1 },
    { nameUz: 'IELTS', nameEn: 'IELTS', nameRu: 'IELTS', icon: '🎓', color: '#f59e0b', isPremium: true, order: 2 },
    { nameUz: 'Biznes inglizcha', nameEn: 'Business English', nameRu: 'Деловой английский', icon: '💼', color: '#10b981', isPremium: true, order: 3 },
    { nameUz: 'Akademik so\'zlar', nameEn: 'Academic', nameRu: 'Академический', icon: '📚', color: '#3b82f6', isPremium: true, order: 4 },
    { nameUz: 'Sayohat', nameEn: 'Travel', nameRu: 'Путешествия', icon: '✈️', color: '#ec4899', isPremium: false, order: 5 },
    { nameUz: 'Texnologiya', nameEn: 'Technology', nameRu: 'Технологии', icon: '💻', color: '#8b5cf6', isPremium: false, order: 6 },
  ]

  for (const cat of categories) {
    const existing = await prisma.category.findFirst({ where: { nameEn: cat.nameEn } })
    if (existing) {
      await prisma.category.update({ where: { id: existing.id }, data: cat })
    } else {
      await prisma.category.create({ data: cat })
    }
  }

  console.log('✅ Seed completed')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
