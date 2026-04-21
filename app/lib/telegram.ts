import { createHmac } from 'node:crypto'

interface TelegramUserPayload {
  id?: number
  username?: string
  first_name?: string
  last_name?: string
  language_code?: string
}

export function validateInitData(initData: string, botToken: string): boolean {
  if (!initData || !botToken) {
    return false
  }

  const params = new URLSearchParams(initData)
  const hash = params.get('hash')
  if (!hash) {
    return false
  }

  const dataCheckString = [...params.entries()]
    .filter(([key]) => key !== 'hash')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')

  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest()
  const calculatedHash = createHmac('sha256', secret)
    .update(dataCheckString)
    .digest('hex')

  return calculatedHash === hash
}

export function getUserIdFromInitData(initData: string): number | null {
  const params = new URLSearchParams(initData)
  const userRaw = params.get('user')
  if (!userRaw) {
    return null
  }

  try {
    const user = JSON.parse(userRaw) as TelegramUserPayload
    if (!user.id) {
      return null
    }
    return Number(user.id)
  } catch {
    return null
  }
}

export function getTelegramUserFromInitData(initData: string): TelegramUserPayload | null {
  const params = new URLSearchParams(initData)
  const userRaw = params.get('user')
  if (!userRaw) {
    return null
  }

  try {
    return JSON.parse(userRaw) as TelegramUserPayload
  } catch {
    return null
  }
}
