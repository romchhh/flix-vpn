// Client-safe helper — only URL construction, no secrets
export function getMarzbanSubLink(userId: number): string {
  const base = (process.env.NEXT_PUBLIC_MARZBAN_URL || '').replace(/\/$/, '')
  if (!base) return ''
  return `happ://add/${base}/sub/flix${userId}`
}
