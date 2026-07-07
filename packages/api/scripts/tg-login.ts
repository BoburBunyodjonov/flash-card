/**
 * One-time interactive login to generate a GramJS (MTProto) session string for
 * the Shadowing feature.
 *
 *   1. Get api id + hash from https://my.telegram.org (API development tools)
 *   2. Put them in .env:  TELEGRAM_API_ID=...   TELEGRAM_API_HASH=...
 *   3. Run:  pnpm --filter api tg:login
 *   4. Enter your phone, the code Telegram sends, and 2FA password (if any)
 *   5. Copy the printed session string into .env as TELEGRAM_SESSION=...
 *
 * The logged-in account must be a member/admin of the shadowing channel.
 */
import 'dotenv/config'
import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { TelegramClient } from 'telegram'
import { StringSession } from 'telegram/sessions'

const apiId = parseInt(process.env.TELEGRAM_API_ID ?? '0')
const apiHash = (process.env.TELEGRAM_API_HASH ?? '').trim()

async function main() {
  if (!apiId || !apiHash) {
    console.error('❌ TELEGRAM_API_ID / TELEGRAM_API_HASH .env da yo‘q. my.telegram.org dan oling.')
    process.exit(1)
  }

  const rl = readline.createInterface({ input, output })
  const ask = (q: string) => rl.question(q)

  const client = new TelegramClient(new StringSession(''), apiId, apiHash, {
    connectionRetries: 5,
  })

  await client.start({
    phoneNumber: async () => (await ask('📱 Telefon raqam (+998...): ')).trim(),
    password: async () => (await ask('🔒 2FA parol (bo‘lmasa Enter): ')).trim(),
    phoneCode: async () => (await ask('💬 Telegram yuborgan kod: ')).trim(),
    onError: (err) => console.error('Xato:', err?.message ?? err),
  })

  const session = client.session.save() as unknown as string
  console.log('\n✅ Muvaffaqiyatli kirdingiz!\n')
  console.log('Quyidagini .env ga qo‘shing:\n')
  console.log(`TELEGRAM_SESSION=${session}\n`)

  await rl.close()
  await client.disconnect()
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
