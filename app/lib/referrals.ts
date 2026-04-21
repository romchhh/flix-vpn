export function generateReferralLink(botName: string, userId: number): string {
  return `https://t.me/${botName}?start=${userId}`
}

export function buildReferralShareText(botName: string, userId: number): string {
  return (
    '🛡️ Flix VPN — безпечний та швидкий VPN сервіс.\nПідключайся за моїм посиланням:\n\n' +
    generateReferralLink(botName, userId)
  )
}
