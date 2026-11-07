import { NavLink, useLocation } from 'react-router-dom'
import { motion } from 'motion/react'
import clsx from 'clsx'
import type { LucideIcon } from 'lucide-react'
import { springSnappy } from '../motion/presets'

export interface Tab {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
  raised?: boolean
  badge?: boolean
}

/** 56px + safe area, translucent with blur, 1px top line. Active: ink + heavier stroke; tap: 0.92 spring. */
export function BottomNav({ tabs, label }: { tabs: Tab[]; label: string }) {
  const { pathname } = useLocation()
  return (
    <nav
      aria-label={label}
      className="fixed bottom-0 left-1/2 z-40 w-full max-w-[480px] -translate-x-1/2 border-t border-line bg-paper/80 pb-safe backdrop-blur-[20px]"
    >
      <ul className="flex h-14 items-stretch">
        {tabs.map((t) => {
          const active = t.end ? pathname === t.to : pathname === t.to || pathname.startsWith(t.to + '/')
          const Icon = t.icon
          if (t.raised)
            return (
              <li key={t.to} className="flex flex-1 items-center justify-center">
                <NavLink to={t.to} aria-label={t.label} className="-mt-5">
                  <motion.span
                    whileTap={{ scale: 0.92 }}
                    transition={springSnappy}
                    className="flex h-14 w-14 items-center justify-center rounded-full bg-ink text-on-ink shadow-float"
                  >
                    <Icon size={26} strokeWidth={2.25} aria-hidden />
                  </motion.span>
                </NavLink>
              </li>
            )
          return (
            <li key={t.to} className="flex flex-1">
              <NavLink
                to={t.to}
                end={t.end}
                aria-current={active ? 'page' : undefined}
                className={clsx('flex flex-1 flex-col items-center justify-center gap-0.5 text-caption', active ? 'text-ink' : 'text-ink-3')}
              >
                <motion.span key={String(active)} initial={{ scale: active ? 0.92 : 1 }} animate={{ scale: 1 }} transition={springSnappy} className="relative">
                  <Icon size={24} strokeWidth={active ? 2.25 : 1.75} aria-hidden />
                  {t.badge && (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: [0, 1.15, 1] }}
                      transition={{ duration: 0.35 }}
                      className="absolute -top-0.5 -right-1 h-2.5 w-2.5 rounded-full border-2 border-paper bg-ink"
                      aria-label="New update"
                    />
                  )}
                </motion.span>
                <span className={active ? 'font-medium' : undefined}>{t.label}</span>
              </NavLink>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
