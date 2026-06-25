import 'dotenv/config'
import { buildApp } from './app'
import { config } from './config'
import { prisma } from './lib/prisma'
import { redis } from './lib/redis'
import { startWorkers, setupRecurringJobs } from './jobs'
import { startBotUpdates } from './lib/bot'

async function main() {
  const app = await buildApp()

  await redis.connect()
  await prisma.$connect()

  startWorkers()

  // Single repeatable dispatcher handles daily reminders every 15 minutes.
  await setupRecurringJobs().catch(console.error)

  // Telegram update polling (Stars payments) — never blocks or crashes startup.
  await startBotUpdates().catch(console.error)

  await app.listen({ port: config.port, host: config.host })
  console.log(`🚀 API running at http://${config.host}:${config.port}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
