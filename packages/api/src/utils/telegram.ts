import crypto from 'crypto'
import { isValid, isValid3rd, parse } from '@telegram-apps/init-data-node'

const TG_ED25519_PUBLIC_KEY = Buffer.from(
  'e7bf03a2fa4602af4580703d88dda5bb59f32ed8b02a56c187fe7d34caed242d',
  'hex',
)

function base64urlToBuffer(value: string): Buffer {
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4))
  return Buffer.from(b64 + pad, 'base64')
}

function isAuthFresh(authDate: number, expiresIn = 86400): boolean {
  if (!authDate || Number.isNaN(authDate)) return false
  return Date.now() / 1000 - authDate <= expiresIn
}

/** Telegram docs: hash hisobida signature maydoni bo'lmasin */
function validateWebAppHash(initData: string, botToken: string): boolean {
  const params = new URLSearchParams(initData)
  const hash = params.get('hash')
  const authDate = parseInt(params.get('auth_date') ?? '', 10)
  if (!hash || !isAuthFresh(authDate)) return false

  params.delete('hash')
  params.delete('signature')

  const pairs: string[] = []
  params.forEach((value, key) => pairs.push(`${key}=${value}`))
  pairs.sort()

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest()
  const computed = crypto
    .createHmac('sha256', secretKey)
    .update(pairs.join('\n'))
    .digest('hex')

  return computed === hash
}

/** Telegram 8+ Ed25519 signature (base64url) */
async function validateWebAppEd25519(initData: string, botId: number): Promise<boolean> {
  const params = new URLSearchParams(initData)
  const signature = params.get('signature')
  const authDate = parseInt(params.get('auth_date') ?? '', 10)
  if (!signature || !isAuthFresh(authDate)) return false

  const pairs: string[] = []
  params.forEach((value, key) => {
    if (key === 'hash' || key === 'signature') return
    pairs.push(`${key}=${value}`)
  })
  pairs.sort()

  const dataCheckString = `${botId}:WebAppData\n${pairs.join('\n')}`
  const sigBuffer = base64urlToBuffer(signature)

  return crypto.verify(null, Buffer.from(dataCheckString), TG_ED25519_PUBLIC_KEY, sigBuffer)
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

export async function validateWebAppInitData(
  initData: string,
  botToken: string,
): Promise<boolean> {
  const token = botToken.trim()
  if (!initData?.trim() || !token) return false

  const botId = parseInt(token.split(':')[0] ?? '', 10)

  // 1) Yangi Telegram (hash, signature alohida)
  if (validateWebAppHash(initData, token)) return true

  // 2) Ed25519 signature
  if (botId && (await validateWebAppEd25519(initData, botId))) return true

  // 3) Kutubxona fallback
  if (isValid(initData, token, { expiresIn: 86400 })) return true
  if (botId) {
    try {
      if (await isValid3rd(initData, botId, { expiresIn: 86400 })) return true
    } catch {
      /* ignore */
    }
  }

  return false
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
    return null
  }
}
