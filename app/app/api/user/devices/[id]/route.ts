import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { NextRequest, NextResponse } from 'next/server'
import Database from 'better-sqlite3'
import { disableMarzbanUser } from '@/lib/marzban'
import { getUserIdFromInitData, validateInitData } from '@/lib/telegram'

export const runtime = 'nodejs'

function getDbPath() {
  return resolve(process.cwd(), '../database/data.db')
}

function openDb() {
  const dbPath = getDbPath()
  if (!existsSync(dbPath)) throw new Error('Database file not found')
  return new Database(dbPath)
}

function getAuthorizedUserId(request: NextRequest): number | null {
  const initData = request.headers.get('x-telegram-init-data') || ''
  const botToken = process.env.TOKEN || process.env.BOT_TOKEN || ''
  if (initData && botToken && validateInitData(initData, botToken)) {
    return getUserIdFromInitData(initData)
  }
  const rawUserId = request.nextUrl.searchParams.get('user_id')
  if (rawUserId) {
    const parsed = Number(rawUserId)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  return null
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = getAuthorizedUserId(request)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const deviceId = Number(id)
  if (!Number.isFinite(deviceId) || deviceId <= 0) {
    return NextResponse.json({ error: 'Invalid device id' }, { status: 400 })
  }

  const db = openDb()
  try {
    const device = db.prepare(
      `SELECT id, user_id, marzban_username
       FROM user_devices
       WHERE id = ? AND user_id = ? AND status = 'active'`,
    ).get(deviceId, userId) as {
      id: number
      user_id: number
      marzban_username: string | null
    } | undefined

    if (!device) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 })
    }

    // Disable in Marzban (don't delete — preserve traffic stats)
    if (device.marzban_username) {
      try {
        await disableMarzbanUser(device.marzban_username)
      } catch (err) {
        console.error('Marzban disable failed:', err)
      }
    }

    // Soft-delete in our DB
    db.prepare(
      `UPDATE user_devices SET status = 'inactive' WHERE id = ?`,
    ).run(deviceId)

    const activeDevicesRows = db.prepare(
      `SELECT id, device_name, marzban_username, subscription_url
       FROM user_devices
       WHERE user_id = ? AND status = 'active'
       ORDER BY id ASC`,
    ).all(userId) as Array<{
      id: number
      device_name: string | null
      marzban_username: string | null
      subscription_url: string | null
    }>

    const activeDevices = activeDevicesRows.map((row) => ({
      id: row.id,
      name: (row.device_name || '').trim(),
      marzbanUsername: row.marzban_username || null,
      subscriptionUrl: row.subscription_url || null,
    }))

    return NextResponse.json({ ok: true, activeDevices, devicesCount: activeDevices.length })
  } finally {
    db.close()
  }
}
