import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { clearToken, getRole } from '../../auth'
import { useTheme } from '../../theme/ThemeProvider'

interface Command {
  id: string
  label: string
  hint?: string
  keywords?: string
  icon: React.ReactNode
  run: () => void
}

const ic = 'w-4 h-4 shrink-0'

// Fired by the Admin "⌘K" chip (and anywhere else) to open the palette without a keypress.
export const OPEN_EVENT = 'open-command-palette'

export default function CommandPalette() {
  const [open, setOpen]   = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const nav   = useNavigate()
  const role  = getRole()
  const { theme, toggle } = useTheme()
  const inputRef  = useRef<HTMLInputElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)
  const listId    = useId()

  const close = useCallback(() => { setOpen(false); setQuery(''); setActive(0) }, [])

  const commands = useMemo<Command[]>(() => {
    const list: Command[] = [
      {
        id: 'go-dashboard', label: 'Go to Dashboard', hint: 'Compose & preview boards',
        keywords: 'home dispatch board render',
        icon: <svg className={ic} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></svg>,
        run: () => { nav('/dashboard'); close() },
      },
    ]
    if (role === 'admin') {
      list.push({
        id: 'go-admin', label: 'Go to Administration', hint: 'Users & regions',
        keywords: 'operators users regions commission settings',
        icon: <svg className={ic} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7l8-4z" /><path d="M9 12.5l2 2 4-4.5" /></svg>,
        run: () => { nav('/admin'); close() },
      })
    }
    list.push(
      {
        id: 'toggle-theme', label: `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`,
        hint: 'Appearance', keywords: 'dark light mode color appearance',
        icon: <svg className={ic} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>,
        run: () => { toggle(); close() },
      },
      {
        id: 'gtfs-spec', label: 'Open GTFS specification', hint: 'Reference · opens in new tab',
        keywords: 'docs documentation help reference schedule',
        icon: <svg className={ic} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 3h7v7" /><path d="M10 14L21 3" /><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" /></svg>,
        run: () => { window.open('https://gtfs.org/schedule/reference/', '_blank', 'noopener'); close() },
      },
      {
        id: 'sign-out', label: 'Sign out', hint: 'End session',
        keywords: 'logout leave exit',
        icon: <svg className={ic} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></svg>,
        run: () => { clearToken(); nav('/login'); close() },
      },
    )
    return list
  }, [role, theme, toggle, nav, close])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return commands
    return commands.filter(c => (c.label + ' ' + (c.keywords ?? '')).toLowerCase().includes(q))
  }, [query, commands])

  // Open via ⌘K / Ctrl+K, or the custom event from the Admin chip.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(o => !o)
      }
    }
    const onOpen = () => setOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener(OPEN_EVENT, onOpen)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener(OPEN_EVENT, onOpen)
    }
  }, [])

  // Capture the opener on open, focus the input, and restore focus on close.
  useEffect(() => {
    if (open) {
      openerRef.current = document.activeElement as HTMLElement | null
      requestAnimationFrame(() => inputRef.current?.focus())
    } else if (openerRef.current) {
      openerRef.current.focus?.()
      openerRef.current = null
    }
  }, [open])

  useEffect(() => { setActive(0) }, [query])

  if (!open) return null

  const clampedActive = Math.min(active, Math.max(0, results.length - 1))

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, results.length - 1)); return }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); return }
    if (e.key === 'Enter')     { e.preventDefault(); results[clampedActive]?.run(); return }
    // The input is the only focusable element; keep Tab inside the dialog.
    if (e.key === 'Tab')       { e.preventDefault(); inputRef.current?.focus() }
  }

  return (
    <div
      className="fixed inset-0 z-modal flex items-start justify-center px-4 pt-[12vh]"
      role="presentation"
      onMouseDown={close}
    >
      <div className="absolute inset-0 bg-canvas/60 backdrop-blur-sm motion-safe:animate-fade-in" aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="relative w-full max-w-lg rounded-xl border border-line bg-surface shadow-pop overflow-hidden motion-safe:animate-slide-up"
        onMouseDown={e => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-2.5 px-4 h-12 border-b border-line">
          <svg className="w-4 h-4 text-fgSubtle shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <circle cx="11" cy="11" r="7" /><path d="M16.5 16.5L21 21" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Type a command…"
            aria-label="Search commands"
            aria-controls={listId}
            aria-activedescendant={results[clampedActive] ? `${listId}-${results[clampedActive].id}` : undefined}
            role="combobox"
            aria-expanded="true"
            className="flex-1 h-full bg-transparent text-fg font-sans text-[14px] tracking-tightish placeholder:text-fgSubtle focus:outline-none"
          />
          <span className="kbd shrink-0">ESC</span>
        </div>

        {results.length > 0 ? (
          <ul id={listId} role="listbox" aria-label="Commands" className="max-h-[320px] overflow-y-auto scrollbar-thin py-1.5">
            {results.map((c, i) => {
              const isActive = i === clampedActive
              return (
                <li
                  key={c.id}
                  id={`${listId}-${c.id}`}
                  role="option"
                  aria-selected={isActive}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={e => { e.preventDefault(); c.run() }}
                  className={[
                    'mx-1.5 px-2.5 h-10 rounded-lg flex items-center gap-3 cursor-pointer',
                    isActive ? 'bg-hover text-fg' : 'text-fgMuted',
                  ].join(' ')}
                >
                  <span className={isActive ? 'text-brand' : 'text-fgSubtle'}>{c.icon}</span>
                  <span className="flex-1 min-w-0 font-sans text-[13.5px] tracking-tightish text-fg truncate">{c.label}</span>
                  {c.hint && <span className="font-sans text-[11.5px] text-fgSubtle shrink-0 truncate">{c.hint}</span>}
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="px-4 py-6 text-center font-sans text-[12.5px] text-fgSubtle">
            No command matches “{query.trim()}”.
          </p>
        )}
      </div>
    </div>
  )
}
