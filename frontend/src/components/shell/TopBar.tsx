import { useEffect, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { clearToken, getRole } from '../../auth'
import ThemeToggle from '../../theme/ThemeToggle'
import Logo from './Logo'

function useClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}

interface Props {
  title: string
  subtitle?: string
  /** Optional crumbs above the title — e.g. "Workspace / Dashboard" */
  crumbs?: string[]
  /** Optional content rendered far right (after theme toggle) */
  right?: React.ReactNode
}

export default function TopBar({ title, subtitle, crumbs = [], right }: Props) {
  const now = useClock()
  const hh = String(now.getUTCHours()).padStart(2, '0')
  const mm = String(now.getUTCMinutes()).padStart(2, '0')
  const ss = String(now.getUTCSeconds()).padStart(2, '0')
  const nav = useNavigate()
  const role = getRole()
  const { pathname } = useLocation()

  return (
    <header className="sticky top-0 z-sticky bg-canvas/85 backdrop-blur-md border-b border-line">
      {/* Mobile brand + nav row (sidebar is hidden < lg) */}
      <div className="lg:hidden flex items-center justify-between px-4 h-12 border-b border-line">
        <div className="flex items-center gap-2">
          <Logo size={22} />
          <span className="font-display text-[14px] font-semibold tracking-tight3">GTFS Board</span>
        </div>
        <nav className="flex items-center gap-1" aria-label="Main navigation">
          <NavLink
            to="/dashboard"
            className={({ isActive }) =>
              `px-2.5 h-7 inline-flex items-center rounded-md text-[12px] font-medium transition-colors ${
                isActive ? 'bg-brand/10 text-fg' : 'text-fgMuted hover:bg-hover'
              }`
            }
          >
            Dashboard
          </NavLink>
          {role === 'admin' && (
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                `px-2.5 h-7 inline-flex items-center rounded-md text-[12px] font-medium transition-colors ${
                  isActive ? 'bg-brand/10 text-fg' : 'text-fgMuted hover:bg-hover'
                }`
              }
            >
              Admin
            </NavLink>
          )}
        </nav>
      </div>

      {/* Title row */}
      <div className="flex items-center gap-4 px-5 lg:px-8 h-16">
        <div className="min-w-0 flex-1">
          {crumbs.length > 0 && (
            <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 mb-1">
              {crumbs.map((c, i) => (
                <span key={i} className="flex items-center gap-1.5 font-mono text-[10.5px] text-fgSubtle uppercase tracking-eyebrow">
                  {i > 0 && <span aria-hidden="true" className="text-fgSubtle/60">/</span>}
                  <span>{c}</span>
                </span>
              ))}
            </nav>
          )}
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="font-display text-[20px] sm:text-[22px] font-semibold tracking-tight3 text-fg leading-none truncate">
              {title}
            </h1>
            {subtitle && (
              <span className="hidden sm:inline-flex items-center px-2 h-5 rounded-full bg-elevated text-fgMuted font-sans text-[11px] tracking-tightish border border-line whitespace-nowrap">
                {subtitle}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Status pill */}
          <div className="hidden md:inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-line bg-surface">
            <span className="relative inline-flex items-center justify-center" aria-hidden="true">
              <span className="absolute h-2 w-2 rounded-full bg-success opacity-50 animate-ping" />
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
            </span>
            <span className="font-sans text-[12px] text-fgMuted">All systems operational</span>
          </div>

          {/* UTC clock */}
          <div className="hidden md:flex items-center gap-2 h-9 px-3 rounded-lg border border-line bg-surface nums-tabular font-mono text-[12px]">
            <span className="text-fgSubtle">UTC</span>
            <span className="text-fg">{hh}:{mm}<span className="text-brand animate-tick">:</span>{ss}</span>
          </div>

          <ThemeToggle />

          {right}

          <button
            type="button"
            onClick={() => { clearToken(); nav('/login') }}
            className="lg:hidden h-9 px-3 rounded-lg border border-line bg-surface text-fgMuted hover:text-fg hover:bg-hover transition-colors font-sans text-[12px]"
          >
            Sign out
          </button>

          {/* Hidden invariant — used by tests / screen readers */}
          <span className="sr-only">Current page: {pathname}</span>
        </div>
      </div>
    </header>
  )
}
