import { useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { APP_NAME } from '../config'
import { Button } from '../shared/ui/Button'
import { springSmooth } from '../shared/motion/presets'
import { Logo } from '../shared/ui/Logo'

export default function Welcome() {
  const nav = useNavigate()
  return (
    <main className="flex min-h-[100dvh] flex-col px-5 pt-safe">
      <div className="flex flex-1 flex-col justify-center">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
          <Logo size={44} />
          <p className="mt-6 text-callout text-ink-3">{APP_NAME}</p>
          <h1 className="mt-2 text-display">
            Lost something?
            <br />
            Let’s get it back.
          </h1>
        </motion.div>
      </div>
      <motion.div className="pb-[max(1.25rem,env(safe-area-inset-bottom))]" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springSmooth, delay: 0.2 }}>
        <Button onClick={() => nav('/sign-in')}>Get started</Button>
      </motion.div>
    </main>
  )
}
