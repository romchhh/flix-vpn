/**
 * Ukraine uses UTC+3 permanently since March 2022 (no DST).
 * All server-side timestamps should be recorded in Kyiv local time.
 */
const KYIV_OFFSET_MS = 3 * 60 * 60 * 1000

/**
 * Returns the current time as a naive ISO string in Kyiv timezone
 * (format: "YYYY-MM-DDTHH:mm:ss.sss" — no Z suffix, no offset).
 */
export function nowKyivIso(): string {
  const kyivDate = new Date(Date.now() + KYIV_OFFSET_MS)
  return kyivDate.toISOString().replace('Z', '')
}

/**
 * Returns a new Date object shifted forward by the given months,
 * calculated relative to Kyiv "now" if no base date is provided.
 */
export function addMonthsFromKyiv(baseDateIso: string | null, months: number): string {
  const now = new Date(Date.now() + KYIV_OFFSET_MS)
  const baseDate = baseDateIso ? new Date(baseDateIso) : now
  const source = baseDate > now ? baseDate : now
  const next = new Date(source)
  next.setMonth(next.getMonth() + months)
  // Return as Kyiv-naive ISO (strip Z)
  const kyivNext = new Date(next.getTime() + KYIV_OFFSET_MS)
  return kyivNext.toISOString().replace('Z', '')
}
