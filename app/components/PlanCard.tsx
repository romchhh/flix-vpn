'use client'

import type { Plan } from '../types'
import styles from './PlanCard.module.css'

interface Props {
  plan: Plan
  selected: boolean
  onSelect: (id: Plan['id']) => void
}

export function PlanCard({ plan, selected, onSelect }: Props) {
  const cls = [
    styles.card,
    plan.best ? styles.best : '',
    selected ? styles.selected : '',
  ].join(' ')

  return (
    <button className={cls} onClick={() => onSelect(plan.id)}>
      <div className={styles.left}>
        <span className={styles.name}>
          {plan.label}
          {plan.best && <span className={styles.badge}>BEST</span>}
        </span>
        {plan.savePct && (
          <span className={styles.save}>–{plan.savePct}%</span>
        )}
        {plan.months === 1 && (
          <span className={styles.autopay}>Автоплатіж · автопідписка</span>
        )}
      </div>
      <div className={styles.right}>
        {plan.originalPrice && plan.originalPrice > plan.price && (
          <span className={styles.per} style={{ textDecoration: 'line-through', opacity: 0.75 }}>
            {plan.originalPrice.toFixed(2)} грн
          </span>
        )}
        <span className={styles.price}>{plan.price.toFixed(2)} грн</span>
        <span className={styles.per}>{plan.perMonth} / міс</span>
      </div>
    </button>
  )
}
