import { readFileSync } from 'fs'
import type { messaging, ServiceAccount } from 'firebase-admin'
import { config } from '../config'
import { prisma } from './prisma'

// Lazily-created Firebase Admin messaging instance. Mirrors the Telegram bot's
// pattern: never initialized when credentials are missing, and a missing/invalid
// config disables push silently instead of crashing the API.
let messagingInstance: messaging.Messaging | null = null
let initTried = false

// FCM error codes that mean the token is permanently dead and should be pruned.
const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
])

function loadServiceAccount(): Record<string, unknown> | null {
  const { credentialsJson, credentialsPath } = config.firebase
  try {
    if (credentialsJson) {
      // Accept raw JSON or (preferred for .env) base64-encoded JSON.
      const raw = credentialsJson.trim().startsWith('{')
        ? credentialsJson
        : Buffer.from(credentialsJson, 'base64').toString('utf8')
      return JSON.parse(raw)
    }
    if (credentialsPath) {
      return JSON.parse(readFileSync(credentialsPath, 'utf8'))
    }
  } catch (err) {
    console.error('[FCM] Failed to parse service account credentials:', err instanceof Error ? err.message : err)
  }
  return null
}

async function getMessaging(): Promise<messaging.Messaging | null> {
  if (messagingInstance) return messagingInstance
  if (initTried) return null // only attempt init once per process
  initTried = true

  const serviceAccount = loadServiceAccount()
  if (!serviceAccount) {
    console.log('[FCM] No credentials configured — push notifications disabled')
    return null
  }

  try {
    const admin = (await import('firebase-admin')).default
    const app = admin.apps.length
      ? admin.app()
      : admin.initializeApp({
          credential: admin.credential.cert(serviceAccount as ServiceAccount),
          projectId: config.firebase.projectId || undefined,
        })
    messagingInstance = admin.messaging(app)
    console.log('[FCM] Firebase Admin initialized')
    return messagingInstance
  } catch (err) {
    console.error('[FCM] Firebase Admin init failed:', err instanceof Error ? err.message : err)
    return null
  }
}

export interface PushPayload {
  title: string
  body: string
  data?: Record<string, string>
}

/**
 * Sends a push notification to every device registered for a user. No-op when
 * FCM isn't configured or the user has no tokens. Tokens FCM reports as
 * permanently invalid are pruned from the DB so they aren't retried forever.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  const fcm = await getMessaging()
  if (!fcm) return

  const rows = await prisma.pushToken.findMany({ where: { userId }, select: { token: true } })
  if (rows.length === 0) return
  const tokens = rows.map((r) => r.token)

  try {
    const res = await fcm.sendEachForMulticast({
      tokens,
      notification: { title: payload.title, body: payload.body },
      data: payload.data ?? {},
      android: { priority: 'high', notification: { sound: 'default' } },
      apns: { payload: { aps: { sound: 'default' } } },
    })

    const dead: string[] = []
    res.responses.forEach((r, i) => {
      if (!r.success && r.error && DEAD_TOKEN_CODES.has(r.error.code)) dead.push(tokens[i])
    })
    if (dead.length) {
      await prisma.pushToken.deleteMany({ where: { token: { in: dead } } })
    }
  } catch (err) {
    // Network/credential failures must never crash a job — log and move on.
    console.error('[FCM] send failed:', err instanceof Error ? err.message : err)
  }
}
