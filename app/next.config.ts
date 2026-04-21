import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { NextConfig } from 'next'

function loadParentEnv() {
  try {
    const envPath = resolve(__dirname, '../.env')
    const content = readFileSync(envPath, 'utf-8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) {
        continue
      }
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx === -1) {
        continue
      }
      const key = trimmed.slice(0, eqIdx).trim()
      const value = trimmed.slice(eqIdx + 1).trim()
      if (key && !(key in process.env)) {
        process.env[key] = value
      }
    }
  } catch {
    // root .env not found — skip
  }
}

loadParentEnv()

const nextConfig: NextConfig = {
  allowedDevOrigins: ['gramophonic-melany-mettlesome.ngrok-free.dev'],
  serverExternalPackages: ['better-sqlite3'],
}

export default nextConfig
