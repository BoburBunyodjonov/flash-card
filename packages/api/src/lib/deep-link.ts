import { config } from '../config'

/**
 * Builds a Telegram deep link for a `start_param` payload, trying the bot
 * `/start` link first (best UX), then the Web App `?startapp=`, then the raw
 * app URL `?sp=` fallback used by the bot's web_app button.
 */
export function buildDeepLink(param: string): string | null {
  if (config.telegram.botUsername) {
    return `https://t.me/${config.telegram.botUsername}?start=${param}`
  }
  if (config.telegram.webAppUrl) {
    return `${config.telegram.webAppUrl}?startapp=${param}`
  }
  if (config.telegram.appUrl) {
    return `${config.telegram.appUrl}/?sp=${encodeURIComponent(param)}`
  }
  return null
}
