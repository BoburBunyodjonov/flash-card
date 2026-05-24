import 'dotenv/config'
import { buildApp } from './app'
import { config } from './config'
import { prisma } from './lib/prisma'
import { redis } from './lib/redis'
import { startWorkers, scheduleDailyReminders } from './jobs'

function scheduleAtMidnight(fn: () => void) {
  const now = new Date()
  const midnight = new Date()
  midnight.setHours(24, 0, 0, 0)
  const msUntilMidnight = midnight.getTime() - now.getTime()
  setTimeout(() => {
    fn()
    setInterval(fn, 24 * 60 * 60 * 1000)
  }, msUntilMidnight)
}

async function main() {
  const app = await buildApp()

  await redis.connect()
  await prisma.$connect()

  startWorkers()

  // Queue today's reminders on startup, then re-queue every midnight
  scheduleDailyReminders().catch(console.error)
  scheduleAtMidnight(() => scheduleDailyReminders().catch(console.error))

  await app.listen({ port: config.port, host: config.host })
  console.log(`🚀 API running at http://${config.host}:${config.port}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
