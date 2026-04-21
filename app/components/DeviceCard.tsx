'use client'

import type { ReactNode } from 'react'
import styles from './DeviceCard.module.css'

interface Props {
  name: string
  icon: ReactNode
  active?: boolean
  onAction?: () => void
}

export function DeviceCard({ name, icon, active, onAction }: Props) {
  return (
    <div className={`${styles.card} ${active ? styles.active : ''}`}>
      <div className={`${styles.iconWrap} ${active ? styles.iconActive : ''}`}>
        {icon}
      </div>
      <div className={styles.info}>
        <span className={styles.name}>{name}</span>
        <button
          className={`${styles.action} ${active ? styles.actionActive : ''}`}
          onClick={onAction}
        >
          {active ? 'Активний' : 'Встановити'}
        </button>
      </div>
    </div>
  )
}
