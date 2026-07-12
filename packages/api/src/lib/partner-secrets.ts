import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'
import { config } from '../config'
import type { PartnerConnectorConfig } from '../integrations/connectors/types'

const PREFIX = 'enc:v1:'

function deriveKey(): Buffer | null {
  const raw = config.partnerSecretsKey
  if (!raw?.trim()) return null
  return createHash('sha256').update(raw.trim()).digest()
}

/** Encrypt a secret string. Returns plaintext unchanged if PARTNER_SECRETS_KEY is unset. */
export function encryptSecret(plaintext: string): string {
  const key = deriveKey()
  if (!key || !plaintext) return plaintext
  if (plaintext.startsWith(PREFIX)) return plaintext

  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${PREFIX}${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`
}

/** Decrypt if encrypted; otherwise return as-is (legacy plaintext). */
export function decryptSecret(value: string): string {
  if (!value?.startsWith(PREFIX)) return value
  const key = deriveKey()
  if (!key) {
    throw new Error('PARTNER_SECRETS_KEY required to decrypt partner credentials')
  }

  const payload = value.slice(PREFIX.length)
  const [ivB64, tagB64, dataB64] = payload.split('.')
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Invalid encrypted secret format')

  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'))
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}

export function isEncryptedSecret(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX)
}

/** Encrypt sensitive fields before writing partner.metadata */
export function encryptConnectorMetadata(
  metadata: Record<string, unknown> | null | undefined,
): Record<string, unknown> | undefined {
  if (!metadata) return undefined
  const out = structuredClone(metadata) as PartnerConnectorConfig & Record<string, unknown>

  if (out.edupage && typeof out.edupage === 'object') {
    const ed = out.edupage as unknown as Record<string, unknown>
    if (typeof ed.password === 'string' && ed.password.length > 0) {
      ed.password = encryptSecret(ed.password)
    }
  }

  if (out.generic_rest && typeof out.generic_rest === 'object') {
    const gr = out.generic_rest as unknown as Record<string, unknown>
    if (typeof gr.auth_header === 'string' && gr.auth_header.length > 0) {
      gr.auth_header = encryptSecret(gr.auth_header)
    }
  }

  return out as Record<string, unknown>
}

/** Decrypt sensitive fields for connector pull / internal use */
export function decryptConnectorMetadata(metadata: unknown): PartnerConnectorConfig {
  if (!metadata || typeof metadata !== 'object') return { connector: 'manual' }
  const out = structuredClone(metadata) as PartnerConnectorConfig

  if (out.edupage?.password) {
    out.edupage = { ...out.edupage, password: decryptSecret(out.edupage.password) }
  }
  if (out.generic_rest?.auth_header) {
    out.generic_rest = {
      ...out.generic_rest,
      auth_header: decryptSecret(out.generic_rest.auth_header),
    }
  }
  return out
}

/**
 * Admin UI uchun: parollarni yubormaymiz.
 * Bo'sh string + *_set flag — tahrirda bo'sh qoldirilsa eski qiymat saqlanadi.
 */
export function redactConnectorMetadataForAdmin(metadata: unknown): Record<string, unknown> {
  if (!metadata || typeof metadata !== 'object') return { connector: 'manual' }
  const out = structuredClone(metadata) as Record<string, unknown>

  const ed = out.edupage as Record<string, unknown> | undefined
  if (ed && typeof ed === 'object') {
    const hasPassword = typeof ed.password === 'string' && ed.password.length > 0
    ed.password = ''
    ed.password_set = hasPassword
  }

  const gr = out.generic_rest as Record<string, unknown> | undefined
  if (gr && typeof gr === 'object') {
    const hasAuth = typeof gr.auth_header === 'string' && gr.auth_header.length > 0
    gr.auth_header = ''
    gr.auth_header_set = hasAuth
  }

  return out
}

/**
 * Update paytida bo'sh secret maydonlarni eski encrypted qiymat bilan to'ldirish.
 */
export function mergeConnectorSecrets(
  incoming: Record<string, unknown> | undefined,
  existing: unknown,
): Record<string, unknown> | undefined {
  if (!incoming) return undefined
  const prev = (existing && typeof existing === 'object' ? existing : {}) as Record<string, unknown>
  const next = structuredClone(incoming) as Record<string, unknown>

  const nextEd = next.edupage as Record<string, unknown> | undefined
  const prevEd = prev.edupage as Record<string, unknown> | undefined
  if (nextEd && typeof nextEd === 'object') {
    delete nextEd.password_set
    if (!nextEd.password && prevEd?.password) {
      nextEd.password = prevEd.password
    }
  }

  const nextGr = next.generic_rest as Record<string, unknown> | undefined
  const prevGr = prev.generic_rest as Record<string, unknown> | undefined
  if (nextGr && typeof nextGr === 'object') {
    delete nextGr.auth_header_set
    if (!nextGr.auth_header && prevGr?.auth_header) {
      nextGr.auth_header = prevGr.auth_header
    }
  }

  return encryptConnectorMetadata(next)
}
