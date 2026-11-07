import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { Page } from '../shared/ui/Page'
import { ConfirmSheet, Group, Row } from '../claimant/Profile'

export default function StaffProfile() {
  const nav = useNavigate()
  const { me, session, signOut } = useAuth()
  const [confirm, setConfirm] = useState(false)
  const staff = me?.role === 'staff' ? me : null
  return (
    <Page kind="tab" withNav>
      <header className="px-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <h1 className="text-title">Profile</h1>
      </header>
      <Group>
        <Row label="Name" value={staff?.staff.display_name} />
        <Row label="Email" value={session?.user.email} />
        <Row label="Organization" value={staff?.org.name} />
      </Group>
      <Group>
        <Row label="Sign out" onClick={() => setConfirm(true)} />
      </Group>
      <ConfirmSheet
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Sign out?"
        confirm="Sign out"
        onConfirm={async () => {
          await signOut()
          nav('/welcome', { replace: true })
        }}
      />
    </Page>
  )
}
