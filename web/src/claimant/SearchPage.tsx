import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'motion/react'
import { ChevronLeft, Clock, Search, X } from 'lucide-react'
import { searchSchema } from '../shared/schemas'
import { useUserLocation } from '../shared/location'
import { IconButton } from '../shared/ui/Button'
import { Page } from '../shared/ui/Page'
import { SearchResults } from './SearchResults'
import { useRotatingPlaceholder } from './Home'

const RECENT_KEY = 'gumsum:recent-searches'
const readRecent = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
  } catch {
    return []
  }
}
const pushRecent = (q: string) => {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([q, ...readRecent().filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 6)))
  } catch {
    /* ignore */
  }
}

export function SearchBox({
  value,
  onChange,
  onSubmit,
  autoFocus,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  autoFocus?: boolean
  placeholder?: string
}) {
  const rotating = useRotatingPlaceholder()
  const ref = useRef<HTMLInputElement>(null)
  const valid = searchSchema.safeParse(value).success
  return (
    <form
      role="search"
      className="flex-1"
      onSubmit={(e) => {
        e.preventDefault()
        if (valid) {
          ref.current?.blur()
          onSubmit()
        }
      }}
    >
      <motion.div layoutId="search-bar" className="flex h-12 items-center gap-2 rounded-full bg-fill pr-1 pl-4">
        <Search size={20} strokeWidth={1.75} className="shrink-0 text-ink-2" aria-hidden />
        <input
          ref={ref}
          type="search"
          enterKeyHint="search"
          aria-label="Search for your item"
          autoFocus={autoFocus}
          maxLength={100}
          value={value}
          placeholder={placeholder ?? rotating}
          onChange={(e) => onChange(e.target.value)}
          className="h-full min-w-0 flex-1 bg-transparent text-body text-ink outline-none placeholder:text-ink-3 [&::-webkit-search-cancel-button]:hidden"
        />
        {value && (
          <IconButton label="Clear search" onClick={() => (onChange(''), ref.current?.focus())} className="!h-10 !w-10">
            <X size={18} />
          </IconButton>
        )}
        <button type="submit" disabled={!valid} className="sr-only">
          Search
        </button>
      </motion.div>
    </form>
  )
}

export default function SearchPage() {
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const [draft, setDraft] = useState(q)
  const { loc } = useUserLocation()
  const recent = readRecent()

  useEffect(() => setDraft(q), [q])

  const run = (next: string) => {
    const clean = next.trim()
    if (!searchSchema.safeParse(clean).success) return
    pushRecent(clean)
    setParams({ q: clean }, { replace: !!q })
  }

  return (
    <Page kind="tab" withNav>
      <div className="sticky top-0 z-20 flex items-center gap-1 bg-paper px-2 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
        <IconButton label="Back" onClick={() => nav('/')}>
          <ChevronLeft size={24} strokeWidth={1.75} />
        </IconButton>
        <SearchBox value={draft} onChange={setDraft} onSubmit={() => run(draft)} autoFocus={!q} />
      </div>
      <div className="px-5">
        {q ? (
          <SearchResults q={q} loc={loc} onChangeQuery={run} />
        ) : (
          <>
            <p className="text-caption text-ink-3">Try: what you lost + where, e.g. ‘red umbrella in Hall B’</p>
            {recent.length > 0 && (
              <section className="mt-6" aria-labelledby="recent-searches">
                <h2 id="recent-searches" className="text-callout font-semibold">Recent searches</h2>
                <ul className="mt-2">
                  {recent.map((r) => (
                    <li key={r}>
                      <button type="button" onClick={() => run(r)} className="flex min-h-[48px] w-full items-center gap-3 border-b border-line text-left text-body">
                        <Clock size={18} strokeWidth={1.75} className="text-ink-3" aria-hidden />
                        {r}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </Page>
  )
}
