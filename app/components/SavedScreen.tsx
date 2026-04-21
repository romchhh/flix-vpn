'use client'

import { useState } from 'react'
import { PlanCard } from './PlanCard'
import { PLANS, type Plan } from '../types'
import styles from './SavedScreen.module.css'

interface SavedScreenProps {
  saved: Plan['id'][]
  onSavedChange: (next: Plan['id'][]) => void
}

export function SavedScreen({ saved, onSavedChange }: SavedScreenProps) {
  const [selected, setSelected] = useState<Plan['id']>('6m')

  const savedPlans = PLANS.filter((p) => saved.includes(p.id))

  const remove = (id: Plan['id']) =>
    onSavedChange(saved.filter((s) => s !== id))

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        <h1 className={styles.title}>Обране</h1>
        <p className={styles.sub}>Збережені тарифи для порівняння</p>
      </div>

      {savedPlans.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
              <path
                d="M5 6a2 2 0 012-2h10a2 2 0 012 2v14l-7-3.5L5 20V6z"
                stroke="#d1d5db"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <p className={styles.emptyTitle}>Нічого не збережено</p>
          <p className={styles.emptyHint}>
            Натисніть ♡ на тарифі, щоб додати в обране
          </p>
        </div>
      ) : (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Збережені тарифи</h2>
          <div className={styles.plans}>
            {savedPlans.map((plan) => (
              <div key={plan.id} className={styles.planRow}>
                <div className={styles.planCardWrap}>
                  <PlanCard
                    plan={plan}
                    selected={selected === plan.id}
                    onSelect={setSelected}
                  />
                </div>
                <button
                  className={styles.removeBtn}
                  onClick={() => remove(plan.id)}
                  aria-label="Видалити з обраного"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M4 4l8 8M12 4l-8 8"
                      stroke="#9ca3af"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>
            ))}
          </div>

          {selected && (
            <button className={styles.cta}>
              Придбати обраний тариф
            </button>
          )}
        </div>
      )}

      <div className={styles.allPlansSection}>
        <h2 className={styles.sectionTitle}>Всі тарифи</h2>
        <div className={styles.plans}>
          {PLANS.map((plan) => (
            <div key={plan.id} className={styles.planRow}>
              <div className={styles.planCardWrap}>
                <PlanCard
                  plan={plan}
                  selected={selected === plan.id}
                  onSelect={setSelected}
                />
              </div>
              <button
                className={`${styles.saveBtn} ${saved.includes(plan.id) ? styles.saveBtnActive : ''}`}
                onClick={() =>
                  onSavedChange(
                    saved.includes(plan.id)
                      ? saved.filter((s) => s !== plan.id)
                      : [...saved, plan.id],
                  )
                }
                aria-label="Зберегти в обране"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M3 3a1.5 1.5 0 011.5-1.5h7A1.5 1.5 0 0113 3v11l-5-2.5L3 14V3z"
                    stroke={saved.includes(plan.id) ? '#1e40af' : '#9ca3af'}
                    strokeWidth="1.3"
                    fill={saved.includes(plan.id) ? '#eff6ff' : 'none'}
                  />
                </svg>
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.spacer} />
    </div>
  )
}
