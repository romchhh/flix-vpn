/**
 * Відправка повідомлень у Telegram (Mini App API routes, без aiogram).
 */

export function getBotToken(): string {
  return (process.env.TOKEN || process.env.BOT_TOKEN || '').trim()
}

export function parseTelegramGroupId(): number | null {
  const raw = (process.env.TELEGRAM_GROUP_ID || '').trim()
  if (!raw) return null
  const value = Number(raw)
  if (!Number.isFinite(value) || value === 0) return null
  return value
}

export type TelegramReplyMarkup = {
  inline_keyboard: Array<Array<{ text: string; url?: string; web_app?: { url: string } }>>
}

export async function sendTelegramHtml(
  chatId: number,
  text: string,
  replyMarkup?: TelegramReplyMarkup,
): Promise<boolean> {
  const token = getBotToken()
  if (!token) {
    console.warn('[telegram-notify] BOT token missing, skip sendMessage', { chatId })
    return false
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      }),
    })
    if (!res.ok) {
      const body = await res.text()
      console.warn('[telegram-notify] sendMessage failed', chatId, res.status, body.slice(0, 400))
      return false
    }
    return true
  } catch (e) {
    console.error('[telegram-notify] sendMessage error', chatId, String(e))
    return false
  }
}

export function buildAdminUserMarkup(userId: number): TelegramReplyMarkup {
  return {
    inline_keyboard: [[{ text: '👤 Переглянути профіль', url: `tg://user?id=${userId}` }]],
  }
}
