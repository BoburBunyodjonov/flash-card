/**
 * Batch-enriches words missing audioUrl via dictionary API (+ optional Google TTS).
 * Run: pnpm --filter api db:enrich
 */
import 'dotenv/config'
import { prisma } from '../src/lib/prisma'
import { enrichMissingAudio } from '../src/services/audio-enrichment.service'

async function main() {
  const limit = parseInt(process.env.ENRICH_LIMIT ?? '500', 10)
  console.log(`Enriching up to ${limit} words without audio...\n`)
  const result = await enrichMissingAudio({ limit, useTts: true })
  console.log(JSON.stringify(result, null, 2))
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
