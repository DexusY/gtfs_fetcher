import { NavLink, useNavigate } from 'react-router-dom'
import { clearToken, getRole } from '../../auth'
import Logo from './Logo'

interface NavItem {
  to: string
  label: string
  icon: React.ReactNode
  adminOnly?: boolean
}

const iconClass = 'w-[18px] h-[18px] shrink-0'

const NAV: NavItem[] = [
  {
    to: '/dashboard',
    label: 'Dashboard',
    icon: (
      <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="3" width="7" height="9" rx="1.5" />
        <rect x="14" y="3" width="7" height="5" rx="1.5" />
        <rect x="14" y="12" width="7" height="9" rx="1.5" />
        <rect x="3" y="16" width="7" height="5" rx="1.5" />
      </svg>
    ),
  },
  {
    to: '/admin',
    label: 'Administration',
    adminOnly: true,
    icon: (
      <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7l8-4z" />
        <path d="M9 12.5l2 2 4-4.5" />
      </svg>
    ),
  },
]

export default function Sidebar() {
  const nav = useNavigate()
  const role = getRole()

  return (
    <aside className="hidden lg:flex flex-col w-[244px] shrink-0 border-r border-line bg-surface/60 backdrop-blur-sm sticky top-0 h-screen">
      {/* Brand */}
      <div className="flex items-center gap-2.5 h-14 px-4 border-b border-line">
        <Logo />
        <div className="flex flex-col leading-tight">
          <span className="font-display text-[14px] font-semibold tracking-tight3 text-fg">
            GTFS Board
          </span>
          <span className="font-mono text-[9.5px] uppercase tracking-eyebrow text-fgSubtle">
            Transit Dispatch
          </span>
        </div>
      </div>

      {/* Workspace switcher (decorative — single workspace) */}
      <button
        className="mx-3 mt-3 flex items-center gap-2.5 px-2.5 py-2 rounded-lg border border-line bg-surface hover:bg-hover transition-colors group"
        type="button"
        aria-label="Active workspace"
      >
        <div className="h-7 w-7 rounded-md bg-brand/15 text-brandText flex items-center justify-center font-mono text-[11px] font-semibold tracking-tight">
          OT
        </div>
        <div className="flex-1 min-w-0 text-left">
          <div className="text-[12.5px] font-medium text-fg leading-none truncate">Open Transit</div>
          <div className="text-[10.5px] text-fgSubtle leading-none mt-1">Workspace · Production</div>
        </div>
        <svg className="w-3.5 h-3.5 text-fgSubtle group-hover:text-fgMuted shrink-0" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 4.5 L6 1.5 L9 4.5 M3 7.5 L6 10.5 L9 7.5" />
        </svg>
      </button>

      {/* Nav */}
      <nav className="flex-1 px-3 mt-5 space-y-0.5" aria-label="Main navigation">
        <div className="px-2.5 mb-1.5">
          <span className="eyebrow">Navigation</span>
        </div>
        {NAV.filter(n => !n.adminOnly || role === 'admin').map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => [
              'group relative flex items-center gap-2.5 px-2.5 h-9 rounded-lg',
              'font-sans text-[13px] tracking-tightish font-medium',
              'transition-colors duration-150',
              isActive
                ? 'bg-brand/10 text-fg'
                : 'text-fgMuted hover:text-fg hover:bg-hover',
            ].join(' ')}
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="absolute -left-3 top-1.5 bottom-1.5 w-[2px] rounded-full bg-brand" aria-hidden="true" />
                )}
                <span className={isActive ? 'text-brand' : ''}>{item.icon}</span>
                <span>{item.label}</span>
                {isActive && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-brand" aria-hidden="true" />
                )}
              </>
            )}
          </NavLink>
        ))}

        <div className="px-2.5 mt-6 mb-1.5">
          <span className="eyebrow">Resources</span>
        </div>
        <a
          href="https://gtfs.org/schedule/reference/"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2.5 px-2.5 h-9 rounded-lg text-fgMuted hover:text-fg hover:bg-hover transition-colors font-sans text-[13px] font-medium"
        >
          <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14 3h7v7" />
            <path d="M10 14L21 3" />
            <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
          </svg>
          <span>GTFS Spec</span>
          <span className="ml-auto text-fgSubtle">↗</span>
        </a>
      </nav>

      {/* User card */}
      <div className="border-t border-line p-3">
        <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg">
          <div className="h-8 w-8 rounded-full bg-elevated border border-line flex items-center justify-center text-fgMuted font-mono text-[12px] font-semibold">
            {(role ?? 'U').slice(0, 1).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[12.5px] font-medium text-fg leading-tight truncate">
              {role === 'admin' ? 'Administrator' : 'Operator'}
            </div>
            <div className="text-[10.5px] text-fgSubtle leading-tight truncate">
              {role ?? 'Signed in'} · authority
            </div>
          </div>
          <button
            type="button"
            onClick={() => { clearToken(); nav('/login') }}
            aria-label="Sign out"
            title="Sign out"
            className="h-8 w-8 rounded-md text-fgSubtle hover:text-danger hover:bg-dangerSoft transition-colors flex items-center justify-center cursor-pointer"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="M16 17l5-5-5-5" />
              <path d="M21 12H9" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  )
}
