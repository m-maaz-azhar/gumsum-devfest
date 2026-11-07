import { useState } from 'react'
import { Share, SquarePlus, X } from 'lucide-react'
import { APP_NAME } from '../config'
import { useInstallPrompt } from '../shared/pwa'
import { Button, IconButton } from '../shared/ui/Button'
import { Sheet } from '../shared/ui/Sheet'

/** USR-PWA-02: custom install banner after the first claim, dismissible for 7 days; iPhone gets 2-step help. */
export function InstallBanner() {
  const { canPrompt, showIOSHint, prompt, dismiss } = useInstallPrompt()
  const [iosOpen, setIosOpen] = useState(false)
  if (!canPrompt && !showIOSHint) return null
  return (
    <>
      <div className="mt-4 flex items-center gap-3 rounded-card bg-fill p-4">
        <p className="flex-1 text-callout font-normal">Add {APP_NAME} to your home screen to get notified when your item is ready.</p>
        <div className="flex shrink-0 items-center gap-1">
          <Button full={false} className="!h-10 !px-4" onClick={() => (canPrompt ? prompt() : setIosOpen(true))}>
            Install
          </Button>
          <IconButton label="Dismiss" onClick={dismiss}>
            <X size={18} />
          </IconButton>
        </div>
      </div>
      <Sheet open={iosOpen} onClose={() => setIosOpen(false)} label="Add to Home Screen">
        <div className="px-5 pt-2 pb-6">
          <h2 className="text-title">Add to Home Screen</h2>
          <ol className="mt-5 space-y-4 text-body">
            <li className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-fill"><Share size={20} aria-hidden /></span>
              1. Tap Share in Safari’s toolbar.
            </li>
            <li className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-fill"><SquarePlus size={20} aria-hidden /></span>
              2. Choose Add to Home Screen.
            </li>
          </ol>
          <div className="mt-6">
            <Button onClick={() => setIosOpen(false)}>Got it</Button>
          </div>
        </div>
      </Sheet>
    </>
  )
}
