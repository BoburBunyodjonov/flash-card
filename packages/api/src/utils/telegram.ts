import crypto from 'crypto'
import { isValid, isValid3rd, parse } from '@telegram-apps/init-data-node'

function isAuthFresh(authDate: number, expiresIn = 86400): boolean {
  if (!authDate || Number.isNaN(authDate)) return false
  return Date.now() / 1000 - authDate <= expiresIn
}

/** Telegram docs: hash hisobida signature maydoni bo'lmasin */
function validateWebAppHash(initData: string, botToken: string): boolean {
  const params = new URLSearchParams(initData)
  const hash = params.get('hash')
  if (!hash) return false

  const authDate = parseInt(params.get('auth_date') ?? '', 10)
  if (!isAuthFresh(authDate)) return false

  const pairs: string[] = []
  params.forEach((value, key) => {
    if (key === 'hash' || key === 'signature') return
    pairs.push(`${key}=${value}`)
  })
  pairs.sort()

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest()
  const computed = crypto
    .createHmac('sha256', secretKey)
    .update(pairs.join('\n'))
    .digest('hex')

  return computed === hash
}

export function getInitDataDebug(initData: string) {
  const keys: string[] = []
  for (const chunk of initData.split('&')) {
    const eq = chunk.indexOf('=')
    if (eq > 0) keys.push(chunk.slice(0, eq))
  }
  return {
    keys,
    length: initData.length,
    hasHash: keys.includes('hash'),
    hasSignature: keys.includes('signature'),
  }
}

function isRealBotToken(token: string): boolean {
  // Haqiqiy token: "1234567890:ABCdef..." ko'rinishida, 40+ belgi
  return /^\d{8,12}:[A-Za-z0-9_-]{30,}$/.test(token)
}

export async function validateWebAppInitData(
  initData: string,
  botToken: string,
): Promise<boolean> {
  try {
    const token = botToken.trim()
    if (!initData?.trim()) return false

    // Development: haqiqiy token yo'q bo'lsa, initData strukturasini tekshirib o'tkazamiz
    if (!isRealBotToken(token)) {
      if (process.env.NODE_ENV !== 'production') {
        const params = new URLSearchParams(initData)
        const hasUser = params.has('user') || params.has('auth_date')
        console.warn('[auth] Dev mode: skipping Telegram validation (no real bot token)')
        return hasUser
      }
      return false
    }

    const botId = parseInt(token.split(':')[0] ?? '', 10)
    const options = { expiresIn: 86400 as const }

    // 1) HMAC hash (klassik WebApp)
    if (validateWebAppHash(initData, token)) return true

    // 2) @telegram-apps/init-data-node (HMAC + Ed25519 — crypto.subtle, xavfsiz)
    if (isValid(initData, token, options)) return true
    if (botId && (await isValid3rd(initData, botId, options))) return true

    return false
  } catch (err) {
    console.warn('[auth] validateWebAppInitData error:', (err as Error).message)
    return false
  }
}

export function validateTelegramAuth(
  data: Record<string, string>,
  botToken: string,
): boolean {
  const { hash, ...rest } = data
  if (!hash) return false

  const checkString = Object.keys(rest)
    .sort()
    .map((key) => `${key}=${rest[key]}`)
    .join('\n')

  const secretKey = crypto.createHash('sha256').update(botToken).digest()
  const hmac = crypto.createHmac('sha256', secretKey).update(checkString).digest('hex')

  return hmac === hash
}

/** Extracts the `start_param` from Web App initData (set via `?startapp=...` deep links). */
export function parseStartParam(initData: string): string | null {
  try {
    const sp = (parse(initData) as { startParam?: unknown }).startParam
    return typeof sp === 'string' ? sp : null
  } catch {
    try {
      return new URLSearchParams(initData).get('start_param')
    } catch {
      return null
    }
  }
}

export function parseWebAppUser(initData: string): {
  id: number
  first_name: string
  last_name?: string
  username?: string
  photo_url?: string
} | null {
  try {
    const data = parse(initData)
    const user = data.user
    if (!user) return null
    return {
      id: user.id,
      first_name: user.first_name,
      last_name: user.last_name,
      username: user.username,
      photo_url: user.photo_url,
    }
  } catch {
    // Fallback: kutubxonasiz JSON parse
    try {
      const params = new URLSearchParams(initData)
      const raw = params.get('user')
      if (!raw) return null
      const user = JSON.parse(raw) as {
        id: number
        first_name: string
        last_name?: string
        username?: string
        photo_url?: string
      }
      if (!user?.id || !user.first_name) return null
      return user
    } catch {
      return null
    }
  }
}
