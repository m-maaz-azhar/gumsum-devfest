// Make Supabase Auth send a 6-digit code instead of a link (USR-ONB-02).
// Uploads supabase/templates/*.html as the "Confirm signup" and "Magic Link" emails and sets
// OTP length 6 and a 10-minute expiry, through the Supabase Management API.
//
//   node --env-file=.env supabase/scripts/apply-auth-config.ts
//
// Needs SUPABASE_URL and SUPABASE_ACCESS_TOKEN (a personal access token, sbp_…, from
// https://supabase.com/dashboard/account/tokens). The token is only used for this request.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const token = process.env.SUPABASE_ACCESS_TOKEN
const ref = process.env.SUPABASE_URL?.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1]
if (!token || !ref) {
  console.error('✖ SUPABASE_ACCESS_TOKEN and SUPABASE_URL must be set.')
  process.exit(1)
}

const template = (name: string) => readFileSync(join(here, '../templates', `${name}.html`), 'utf8')

const config = {
  mailer_otp_length: 6,
  mailer_otp_exp: 600,
  mailer_subjects_confirmation: 'Your Gumsum code',
  mailer_templates_confirmation_content: template('confirmation'),
  mailer_subjects_magic_link: 'Your Gumsum code',
  mailer_templates_magic_link_content: template('magic_link'),
}

const api = (init?: RequestInit) =>
  fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  })

const res = await api({ method: 'PATCH', body: JSON.stringify(config) })
if (!res.ok) {
  console.error(`✖ ${res.status}: ${await res.text()}`)
  process.exit(1)
}
const after = await (await api()).json()
const ok =
  after.mailer_otp_length === 6 &&
  after.mailer_templates_confirmation_content?.includes('{{ .Token }}') &&
  after.mailer_templates_magic_link_content?.includes('{{ .Token }}')
console.log(ok ? '✓ Emails now send a 6-digit code (expires in 10 minutes).' : '✖ Config saved but verification failed.')
console.log(`  OTP length: ${after.mailer_otp_length}, expiry: ${after.mailer_otp_exp}s, SMTP: ${after.smtp_host ? after.smtp_host : 'Supabase built-in (team emails only, low rate limit)'}`)
process.exit(ok ? 0 : 1)
