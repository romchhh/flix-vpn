const MARZBAN_URL = (process.env.MARZBAN_URL || '').replace(/\/$/, '')
const MARZBAN_USER = process.env.MARZBAN_USER || ''
const MARZBAN_PASS = process.env.MARZBAN_PASS || ''

let _cachedToken: string | null = null

function isMarzbanAlreadyExistsError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const msg = error.message || ''
  return msg.includes('→ 409') || msg.toLowerCase().includes('user already exists')
}

async function fetchToken(): Promise<string> {
  const res = await fetch(`${MARZBAN_URL}/api/admin/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `username=${encodeURIComponent(MARZBAN_USER)}&password=${encodeURIComponent(MARZBAN_PASS)}`,
  })
  if (!res.ok) throw new Error(`Marzban auth failed: ${res.status} ${await res.text()}`)
  const data = (await res.json()) as { access_token: string }
  return data.access_token
}

async function marzbanRequest<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
  retry = true,
): Promise<T | null> {
  if (!MARZBAN_URL || !MARZBAN_USER || !MARZBAN_PASS) return null

  if (!_cachedToken) _cachedToken = await fetchToken()

  const res = await fetch(`${MARZBAN_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${_cachedToken}`,
      'Content-Type': 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (res.status === 401 && retry) {
    _cachedToken = await fetchToken()
    return marzbanRequest<T>(method, path, body, false)
  }
  if (res.status === 404) return null
  if (!res.ok) {
    throw new Error(`Marzban ${method} ${path} → ${res.status}: ${await res.text()}`)
  }
  const text = await res.text()
  return text ? (JSON.parse(text) as T) : ({} as T)
}

// ─── Naming ────────────────────────────────────────────────────────────────

export function deviceMarzbanUsername(userId: number, deviceDbId: number): string {
  return `flix${userId}d${deviceDbId}`
}

export function getDeviceSubLink(userId: number, deviceDbId: number): string {
  if (!MARZBAN_URL) return ''
  return `happ://add/${MARZBAN_URL}/sub/${deviceMarzbanUsername(userId, deviceDbId)}`
}

// ─── Per-device operations ─────────────────────────────────────────────────

export interface MarzbanUserInfo {
  username: string
  status: string
  expire: number | null
  used_traffic: number
  data_limit: number
  subscription_url: string
}

export async function createDeviceMarzbanUser(
  userId: number,
  deviceDbId: number,
  expireTimestamp: number,
  note?: string,
): Promise<{ username: string; subLink: string } | null> {
  if (!MARZBAN_URL) return null
  const username = deviceMarzbanUsername(userId, deviceDbId)
  let result: MarzbanUserInfo | null = null
  try {
    result = await marzbanRequest<MarzbanUserInfo>('POST', '/api/user', {
      username,
      proxies: { vless: {} },
      expire: expireTimestamp,
      data_limit: 0,
      data_limit_reset_strategy: 'no_reset',
      ...(note ? { note } : {}),
    })
  } catch (error) {
    if (!isMarzbanAlreadyExistsError(error)) {
      throw error
    }
    // If already exists, reuse the account and ensure it is active/extended.
    await marzbanRequest('PUT', `/api/user/${username}`, {
      expire: expireTimestamp,
      status: 'active',
      ...(note ? { note } : {}),
    })
    result = await marzbanRequest<MarzbanUserInfo>('GET', `/api/user/${username}`)
  }
  if (!result) return null
  return { username, subLink: getDeviceSubLink(userId, deviceDbId) }
}

export async function disableMarzbanUser(marzbanUsername: string): Promise<void> {
  await marzbanRequest('PUT', `/api/user/${marzbanUsername}`, { status: 'disabled' })
}

export async function extendMarzbanUser(
  marzbanUsername: string,
  newExpireTimestamp: number,
): Promise<void> {
  await marzbanRequest('PUT', `/api/user/${marzbanUsername}`, {
    expire: newExpireTimestamp,
    status: 'active',
  })
}

export async function getMarzbanUserInfo(
  marzbanUsername: string,
): Promise<MarzbanUserInfo | null> {
  return marzbanRequest<MarzbanUserInfo>('GET', `/api/user/${marzbanUsername}`)
}

export function bytesToMb(bytes: number | null | undefined): number {
  if (!bytes) return 0
  return Math.round((bytes / 1_048_576) * 10) / 10
}
