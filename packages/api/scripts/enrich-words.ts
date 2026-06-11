/**
 * Batch-enriches words from the free dictionary API (dictionaryapi.dev):
 * fills missing audioUrl, pronunciation, partOfSpeech on words, and missing
 * definitionEn / exampleEn on their translation rows.
 *
 * Run: pnpm --filter api db:enrich
 * Re-runnable: only words missing audio are fetched, existing values are never overwritten.
 */
import 'dotenv/config'
import { prisma } from '../src/lib/prisma'
import { fetchDictionaryData } from '../src/services/words.service'

const DELAY_MS = 400 // be polite to the free API

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const words = await prisma.word.findMany({
    where: { audioUrl: null },
    include: { translations: true },
    orderBy: { word: 'asc' },
  })
  console.log(`Enriching ${words.length} words without audio...\n`)

  let audio = 0
  let updated = 0
  let notFound = 0

  for (const [i, w] of words.entries()) {
    const data = await fetchDictionaryData(w.word)
    if (!data) {
      notFound++
      console.log(`  [${i + 1}/${words.length}] ${w.word} — not found`)
      await sleep(DELAY_MS)
      continue
    }

    const wordPatch: Record<string, string> = {}
    if (data.audioUrl) wordPatch.audioUrl = data.audioUrl
    if (data.phonetic && !w.pronunciation) wordPatch.pronunciation = data.phonetic
    if (data.partOfSpeech && !w.partOfSpeech) wordPatch.partOfSpeech = data.partOfSpeech

    if (Object.keys(wordPatch).length > 0) {
      await prisma.word.update({ where: { id: w.id }, data: wordPatch })
      updated++
      if (wordPatch.audioUrl) audio++
    }

    // Definitions/examples are English, so they apply to every translation row
    for (const t of w.translations) {
      const tPatch: Record<string, string> = {}
      if (data.definition && !t.definitionEn) tPatch.definitionEn = data.definition
      if (data.example && !t.exampleEn) tPatch.exampleEn = data.example
      if (Object.keys(tPatch).length > 0) {
        await prisma.wordTranslation.update({ where: { id: t.id }, data: tPatch })
      }
    }

    console.log(`  [${i + 1}/${words.length}] ${w.word} ${data.audioUrl ? '🔊' : '—'}`)
    await sleep(DELAY_MS)
  }

  console.log(`\nDone: ${updated} words updated (${audio} with audio), ${notFound} not found in dictionary.`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
