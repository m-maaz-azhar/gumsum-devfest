import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

/** Real-API runs start from the seeded demo state (seed is idempotent and keeps search embeddings). */
export default function setup() {
  const root = fileURLToPath(new URL('../..', import.meta.url))
  execFileSync('node', ['--env-file=.env', 'supabase/scripts/seed.ts'], { cwd: root, stdio: 'inherit' })
}
