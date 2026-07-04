import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login } from '../api'
import { setToken, setRole } from '../auth'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Logo from '../components/shell/Logo'
import ThemeToggle from '../theme/ThemeToggle'

const FEATURED = [
  { city: 'Warsaw',     route: 'Tram 17',   eta: '02:14' },
  { city: 'Berlin',     route: 'U-Bahn M10',eta: '04:38' },
  { city: 'Gdańsk',     route: 'Bus 110',   eta: '01:02' },
  { city: 'Kraków',     route: 'Tram 50',   eta: '06:11' },
  { city: 'Prague',     route: 'Tram 22',   eta: '03:47' },
  { city: 'Vienna',     route: 'U-Bahn D',  eta: '05:25' },
  { city: 'Amsterdam',  route: 'Tram 14',   eta: '02:55' },
  { city: 'Paris',      route: 'RER A',     eta: '08:09' },
]

export default function Login() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [tick, setTick]         = useState(0)
  const nav = useNavigate()

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 2200)
    return () => clearInterval(id)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = await login(email, password)
      setToken(data.token)
      setRole(data.role)
      nav(data.role === 'admin' ? '/admin' : '/dashboard', { replace: true })
    } catch {
      setError('Invalid email or password. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen flex bg-canvas text-fg overflow-hidden relative">
      {/* Faint backdrop dots — only on right side */}
      <div className="pointer-events-none absolute inset-y-0 right-0 w-[55%] bg-dotgrid opacity-60" aria-hidden="true" />

      {/* LEFT — Sign-in panel */}
      <section className="relative flex-1 lg:flex-none lg:w-[460px] xl:w-[520px] flex flex-col bg-surface border-r border-line">
        <header className="flex items-center justify-between h-14 px-6 border-b border-line">
          <div className="flex items-center gap-2.5">
            <Logo />
            <div className="leading-tight">
              <div className="font-display text-[14px] font-semibold tracking-tight3">GTFS Board</div>
              <div className="font-mono text-[9.5px] uppercase tracking-eyebrow text-fgSubtle">Transit Dispatch</div>
            </div>
          </div>
          <ThemeToggle />
        </header>

        <div className="flex-1 flex flex-col justify-center px-6 sm:px-12 py-10">
          <div className="max-w-sm w-full mx-auto">
            <span className="inline-flex items-center gap-2 px-2.5 h-6 rounded-full border border-line bg-elevated text-fgMuted font-sans text-[11px] font-medium tracking-tightish mb-6">
              <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
              v1.0 · GTFS-RT operational
            </span>

            <h1 className="font-display text-[32px] sm:text-[36px] font-semibold tracking-tight3 leading-[1.05] text-fg">
              Welcome back.
            </h1>
            <p className="mt-3 font-sans text-[14px] text-fgMuted leading-relaxed">
              Sign in to compose, preview, and dispatch live departure boards to your e-paper fleet.
            </p>

            <form onSubmit={handleSubmit} className="mt-8 space-y-4" aria-label="Sign in" noValidate>
              {error && (
                <div role="alert" aria-live="assertive" className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg border border-danger/30 bg-dangerSoft text-dangerText">
                  <svg className="w-4 h-4 mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 8v4M12 16h0" strokeLinecap="round" />
                  </svg>
                  <p className="font-sans text-[12.5px] leading-snug">{error}</p>
                </div>
              )}

              <Input
                label="Email"
                type="email"
                name="email"
                autoComplete="email"
                required
                placeholder="operator@authority.transit"
                value={email}
                onChange={e => setEmail(e.target.value)}
                leading={
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <rect x="3" y="5" width="18" height="14" rx="2.5" />
                    <path d="M3.5 7l8 6 8.5-6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                }
              />

              <Input
                label="Password"
                type="password"
                name="password"
                autoComplete="current-password"
                required
                placeholder="••••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                leading={
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <rect x="4" y="11" width="16" height="10" rx="2" />
                    <path d="M8 11V7a4 4 0 0 1 8 0v4" strokeLinecap="round" />
                  </svg>
                }
              />

              <Button type="submit" loading={loading} className="w-full mt-2" size="lg">
                {loading ? 'Signing in…' : 'Sign in'}
                {!loading && <span aria-hidden="true">→</span>}
              </Button>
            </form>

            <div className="mt-8 pt-6 border-t border-line">
              <p className="font-sans text-[11.5px] text-fgSubtle leading-relaxed">
                Restricted to authorized operators. Need access?
                <span className="text-fgMuted"> Contact your workspace administrator.</span>
              </p>
            </div>
          </div>
        </div>

        <footer className="px-6 py-4 border-t border-line flex items-center justify-between font-mono text-[10.5px] text-fgSubtle uppercase tracking-eyebrow">
          <span>© 2026 Open Transit</span>
          <span>Protocol GTFS-RT v2.0</span>
        </footer>
      </section>

      {/* RIGHT — feature panel */}
      <section className="hidden lg:flex relative flex-1 flex-col justify-between p-12 xl:p-16">
        <div className="relative z-10">
          <span className="font-mono text-[10.5px] uppercase tracking-eyebrow text-fgSubtle">
            Live preview · Open Transit
          </span>
          <h2 className="mt-3 font-display text-[44px] xl:text-[52px] font-semibold leading-[0.98] tracking-tight3 text-fg max-w-2xl">
            One control room for every <span className="text-brandHover">departure board</span> in your fleet.
          </h2>
          <p className="mt-4 font-sans text-[15px] text-fgMuted max-w-md leading-relaxed">
            Real-time GTFS feeds. Six render templates. PNG, EPD, LZ4 output. Hot-swappable layouts you can drop in as PNG+JSON.
          </p>
        </div>

        {/* Mock departure board card */}
        <div className="relative z-10 mt-10 max-w-md w-full">
          <div className="rounded-2xl border border-line bg-surface shadow-pop p-5">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <div className="flex items-center gap-2.5">
                <span className="h-2 w-2 rounded-full bg-success animate-pulse-soft" aria-hidden="true" />
                <span className="font-mono text-[10.5px] uppercase tracking-eyebrow text-fgMuted">Live · GTFS-RT</span>
              </div>
              <span className="font-mono text-[10.5px] text-fgSubtle nums-tabular">
                {new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <div className="mt-3 space-y-1.5">
              {Array.from({ length: 4 }, (_, i) => FEATURED[(tick + i) % FEATURED.length]).map((row, i) => (
                <div
                  key={`${row.city}-${i}-${tick}`}
                  className="flex items-center justify-between px-2.5 py-2 rounded-lg hover:bg-elevated transition-colors animate-fade-in"
                  style={{ animationDelay: `${i * 30}ms` }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="inline-flex items-center justify-center h-6 px-2 rounded-md bg-brand/10 text-brandText font-mono text-[11px] font-semibold tracking-tight">
                      {row.route.split(' ')[1] ?? row.route}
                    </span>
                    <span className="font-sans text-[13px] text-fg truncate">{row.city}</span>
                  </div>
                  <span className="font-mono text-[12px] text-fgMuted nums-tabular">{row.eta}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-line flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-eyebrow text-fgSubtle">Sample feed</span>
              <span className="font-mono text-[10px] uppercase tracking-eyebrow text-fgSubtle">8 routes</span>
            </div>
          </div>

          {/* Floating accent badge */}
          <div className="absolute -top-3 -left-3 px-3 h-7 rounded-full border border-line bg-surface shadow-card flex items-center gap-2 font-sans text-[11px] font-medium">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden="true" />
            <span className="text-fg">rti_display</span>
            <span className="text-fgSubtle">· 1600×1200</span>
          </div>
        </div>

        {/* Stats row */}
        <div className="relative z-10 grid grid-cols-3 gap-4 max-w-md w-full">
          {[
            { k: '6', l: 'Templates' },
            { k: '15s', l: 'RT cache' },
            { k: '3', l: 'Languages' },
          ].map(s => (
            <div key={s.l} className="rounded-xl border border-line bg-surface p-3.5">
              <div className="font-display text-[22px] font-semibold tracking-tight3 nums-tabular">{s.k}</div>
              <div className="font-mono text-[10px] uppercase tracking-eyebrow text-fgSubtle mt-1">{s.l}</div>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
