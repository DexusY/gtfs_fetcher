import { useCallback, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import Shell from '../components/shell/Shell'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'
import Segmented from '../components/ui/Segmented'
import { Card, CardHeader, StatCard } from '../components/ui/Card'
import { SkeletonRow } from '../components/ui/Skeleton'
import { OPEN_EVENT } from '../components/shell/CommandPalette'
import { getUsers, createUser, deleteUser, getRegions, createRegion, deleteRegion } from '../api'
import type { User, Region } from '../api'

type Toast = { type: 'success' | 'error'; message: string } | null
type Tab = 'users' | 'regions'
type Pending = { type: 'user' | 'region'; id: number } | null

const errText = (e: unknown, fallback: string) =>
  e instanceof Error && e.message ? e.message : fallback

function useToast() {
  const [toast, setToast] = useState<Toast>(null)
  const show = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message })
    const id = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(id)
  }, [])
  return { toast, show, dismiss: () => setToast(null) }
}

export default function AdminPanel() {
  const [users, setUsers]     = useState<User[]>([])
  const [regions, setRegions] = useState<Region[]>([])
  const [loading, setLoading] = useState(true)
  const location = useLocation()
  const [tab, setTab]         = useState<Tab>(
    (location.state as { tab?: Tab } | null)?.tab === 'regions' ? 'regions' : 'users',
  )

  const [userSubmitting, setUserSubmitting]     = useState(false)
  const [regionSubmitting, setRegionSubmitting] = useState(false)

  const [userForm, setUserForm]     = useState({ email: '', password: '', role: 'user' })
  const [regionForm, setRegionForm] = useState({ name: '', country: '', city: '', static_url: '', rt_url: '' })
  const [pending, setPending]       = useState<Pending>(null)

  const { toast, show: showToast, dismiss } = useToast()

  const loadData = useCallback(async () => {
    try {
      const [u, r] = await Promise.all([getUsers(), getRegions()])
      setUsers(u)
      setRegions(r)
    } catch {
      showToast('error', 'Failed to reload data')
    }
  }, [showToast])

  useEffect(() => {
    loadData().finally(() => setLoading(false))
  }, [loadData])

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setUserSubmitting(true)
    try {
      await createUser(userForm)
      setUserForm({ email: '', password: '', role: 'user' })
      await loadData()
      showToast('success', 'Operator added.')
    } catch (e) {
      showToast('error', errText(e, 'Failed to create user.'))
    } finally {
      setUserSubmitting(false)
    }
  }

  const handleDeleteUser = async (user: User) => {
    setPending(null)
    try {
      await deleteUser(user.id)
      await loadData()
      showToast('success', `Removed ${user.email}.`)
    } catch (e) {
      showToast('error', errText(e, 'Failed to remove user.'))
    }
  }

  const handleCreateRegion = async (e: React.FormEvent) => {
    e.preventDefault()
    setRegionSubmitting(true)
    try {
      await createRegion({ ...regionForm, rt_url: regionForm.rt_url.trim() || null })
      setRegionForm({ name: '', country: '', city: '', static_url: '', rt_url: '' })
      await loadData()
      showToast('success', 'Region commissioned — feed download started.')
    } catch (e) {
      showToast('error', errText(e, 'Failed to create region.'))
    } finally {
      setRegionSubmitting(false)
    }
  }

  const handleDeleteRegion = async (region: Region) => {
    setPending(null)
    try {
      await deleteRegion(region.id)
      await loadData()
      showToast('success', `Decommissioned ${region.name}.`)
    } catch (e) {
      showToast('error', errText(e, 'Failed to remove region.'))
    }
  }

  const adminCount = users.filter(u => u.role === 'admin').length

  return (
    <Shell title="Administration" subtitle="Restricted" crumbs={['Workspace', 'Administration']}>
      {/* Toast */}
      {toast && (
        <div
          role="alert"
          aria-live="assertive"
          className={[
            'fixed bottom-6 right-6 z-toast max-w-sm flex items-start gap-2.5 px-4 py-3 rounded-xl border shadow-pop animate-slide-up',
            toast.type === 'success'
              ? 'border-success/30 bg-successSoft text-successText'
              : 'border-danger/30 bg-dangerSoft text-dangerText',
          ].join(' ')}
        >
          {toast.type === 'success' ? (
            <svg className="w-4 h-4 mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12l4 4L19 6" />
            </svg>
          ) : (
            <svg className="w-4 h-4 mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4M12 16h0" strokeLinecap="round" />
            </svg>
          )}
          <p className="font-sans text-[12.5px] leading-snug">{toast.message}</p>
          <button
            onClick={dismiss}
            className="ml-2 text-current opacity-60 hover:opacity-100 transition-opacity"
            aria-label="Dismiss"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="M3 3l6 6M9 3l-6 6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      )}

      {/* Stats */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard
          label="Operators"
          value={loading ? '—' : users.length}
          delta={`${adminCount} admin · ${users.length - adminCount} user`}
          icon={
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          }
        />
        <StatCard
          label="Regions"
          value={loading ? '—' : regions.length}
          delta={regions.length ? `${new Set(regions.map(r => r.country)).size} countries` : 'none'}
          icon={
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
            </svg>
          }
        />
        <StatCard
          label="RT feeds"
          value={loading ? '—' : regions.filter(r => r.rt_url).length}
          delta="GTFS-RT"
          icon={
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="M5 12.55a11 11 0 0 1 14 0" />
              <path d="M2 8.82a16 16 0 0 1 20 0" />
              <path d="M8 16.43a6 6 0 0 1 8 0" />
              <circle cx="12" cy="20" r="1" fill="currentColor" />
            </svg>
          }
        />
        <StatCard
          label="Workspace"
          value="Production"
          delta="single tenant"
          icon={
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="3" />
              <path d="M3 9h18M9 21V9" />
            </svg>
          }
        />
      </section>

      {/* Tabs */}
      <div className="flex items-center justify-between mb-5">
        <Segmented
          value={tab}
          onChange={setTab}
          ariaLabel="Section"
          options={[
            { value: 'users',   label: `Operators (${users.length})` },
            { value: 'regions', label: `Regions (${regions.length})` },
          ]}
        />
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}
          className="hidden sm:flex items-center gap-2 text-fgMuted hover:text-fg text-[11.5px] transition-colors cursor-pointer"
        >
          <span>Quick command</span>
          <span className="kbd">⌘K</span>
        </button>
      </div>

      {tab === 'users' && (
        <div className="grid grid-cols-12 gap-5">
          {/* Roster table */}
          <Card padded={false} className="col-span-12 xl:col-span-8 overflow-hidden">
            <div className="px-5 py-4 border-b border-line flex items-center justify-between">
              <CardHeader
                icon={
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <circle cx="12" cy="7" r="4" />
                    <path d="M4 21v-2a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v2" />
                  </svg>
                }
                title="Operator roster"
                description="All accounts with access to the dispatch terminal."
              />
            </div>

            {loading ? (
              <div className="divide-y divide-line">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="px-5 py-4"><SkeletonRow /></div>
                ))}
              </div>
            ) : users.length === 0 ? (
              <EmptyState
                title="No operators yet"
                description="Add your first operator using the form on the right."
              />
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-line bg-elevated/40">
                    <th className="text-left px-5 py-2.5 font-mono text-[10.5px] uppercase tracking-eyebrow text-fgSubtle">Operator</th>
                    <th className="text-left px-5 py-2.5 font-mono text-[10.5px] uppercase tracking-eyebrow text-fgSubtle">Role</th>
                    <th className="text-right px-5 py-2.5 font-mono text-[10.5px] uppercase tracking-eyebrow text-fgSubtle">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b border-line last:border-b-0 hover:bg-hover/60 transition-colors group">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-8 w-8 rounded-full bg-brand/10 text-brandText flex items-center justify-center font-mono text-[12px] font-semibold shrink-0">
                            {u.email.slice(0, 1).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="font-sans text-[13.5px] text-fg truncate">{u.email}</div>
                            <div className="font-mono text-[10.5px] text-fgSubtle">ID · {u.id}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <span className={[
                          'inline-flex items-center gap-1.5 px-2 h-6 rounded-full border font-sans text-[11px] font-medium tracking-tightish',
                          u.role === 'admin'
                            ? 'border-brand/30 bg-brand/10 text-brandText'
                            : 'border-line bg-elevated text-fgMuted',
                        ].join(' ')}>
                          <span className={`h-1.5 w-1.5 rounded-full ${u.role === 'admin' ? 'bg-brand' : 'bg-fgSubtle'}`} aria-hidden="true" />
                          {u.role}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <RowDelete
                          confirming={pending?.type === 'user' && pending.id === u.id}
                          ariaLabel={`Remove ${u.email}`}
                          onAsk={() => setPending({ type: 'user', id: u.id })}
                          onCancel={() => setPending(null)}
                          onConfirm={() => handleDeleteUser(u)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          {/* Add user form */}
          <Card className="col-span-12 xl:col-span-4 h-fit">
            <CardHeader
              icon={
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <circle cx="9" cy="7" r="4" />
                  <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2M19 8v6M16 11h6" strokeLinecap="round" />
                </svg>
              }
              title="Invite operator"
              description="Email + access key. Role determines panel access."
            />
            <form onSubmit={handleCreateUser} noValidate className="mt-5 space-y-4">
              <Input
                label="Email"
                type="email" name="email" autoComplete="off" required
                placeholder="user@example.com"
                value={userForm.email}
                onChange={e => setUserForm(f => ({ ...f, email: e.target.value }))}
              />
              <Input
                label="Password"
                type="password" name="new-password" autoComplete="new-password" required
                placeholder="••••••••"
                value={userForm.password}
                onChange={e => setUserForm(f => ({ ...f, password: e.target.value }))}
              />
              <Select
                label="Role"
                value={userForm.role}
                onChange={e => setUserForm(f => ({ ...f, role: e.target.value }))}
                name="role"
              >
                <option value="user">User — Dashboard only</option>
                <option value="admin">Admin — Full access</option>
              </Select>
              <Button type="submit" loading={userSubmitting} className="w-full" size="md">
                {userSubmitting ? 'Adding…' : 'Add operator'}
                {!userSubmitting && <span aria-hidden="true">→</span>}
              </Button>
            </form>
          </Card>
        </div>
      )}

      {tab === 'regions' && (
        <div className="grid grid-cols-12 gap-5">
          {/* Regions table */}
          <Card padded={false} className="col-span-12 xl:col-span-8 overflow-hidden">
            <div className="px-5 py-4 border-b border-line">
              <CardHeader
                icon={
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
                  </svg>
                }
                title="Active GTFS regions"
                description="Each region maintains its own cached schedule + realtime feed."
              />
            </div>

            {loading ? (
              <div className="divide-y divide-line">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="px-5 py-4"><SkeletonRow /></div>
                ))}
              </div>
            ) : regions.length === 0 ? (
              <EmptyState
                title="No regions commissioned"
                description="Add a GTFS feed using the form on the right."
              />
            ) : (
              <ul className="divide-y divide-line">
                {regions.map(r => (
                  <li key={r.id} className="px-5 py-4 flex items-center gap-4 hover:bg-hover/60 transition-colors group">
                    <div className="h-10 w-10 rounded-lg bg-elevated border border-line flex items-center justify-center font-mono text-[11px] font-semibold text-fgMuted shrink-0">
                      {r.country}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-sans text-[14px] font-semibold tracking-tightish text-fg truncate">{r.name}</div>
                      <div className="flex items-center gap-2 mt-0.5 font-sans text-[12px] text-fgMuted">
                        <span>{r.city}</span>
                        <span className="text-fgSubtle">·</span>
                        <span className="font-mono text-[10.5px] uppercase tracking-eyebrow text-fgSubtle">
                          {r.rt_url ? 'GTFS + RT' : 'GTFS static'}
                        </span>
                      </div>
                    </div>
                    <RowDelete
                      confirming={pending?.type === 'region' && pending.id === r.id}
                      ariaLabel={`Remove ${r.name}`}
                      onAsk={() => setPending({ type: 'region', id: r.id })}
                      onCancel={() => setPending(null)}
                      onConfirm={() => handleDeleteRegion(r)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Add region form */}
          <Card className="col-span-12 xl:col-span-4 h-fit">
            <CardHeader
              icon={
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <circle cx="12" cy="10" r="3" />
                  <path d="M12 21s7-6 7-11a7 7 0 0 0-14 0c0 5 7 11 7 11z" />
                </svg>
              }
              title="Commission region"
              description="Add a new GTFS feed. Cache pre-warm starts immediately."
            />
            <form onSubmit={handleCreateRegion} noValidate className="mt-5 space-y-4">
              <Input
                label="Region name" type="text" name="name" required
                placeholder="Warsaw Metro"
                value={regionForm.name}
                onChange={e => setRegionForm(f => ({ ...f, name: e.target.value }))}
              />
              <div className="grid grid-cols-3 gap-3">
                <Input
                  label="Country" type="text" name="country" required
                  placeholder="PL" maxLength={2}
                  value={regionForm.country}
                  onChange={e => setRegionForm(f => ({ ...f, country: e.target.value.toUpperCase() }))}
                />
                <div className="col-span-2">
                  <Input
                    label="City" type="text" name="city" required
                    placeholder="Warsaw"
                    value={regionForm.city}
                    onChange={e => setRegionForm(f => ({ ...f, city: e.target.value }))}
                  />
                </div>
              </div>
              <Input
                label="Static GTFS URL" type="url" name="static_url" required
                placeholder="https://…/gtfs.zip"
                value={regionForm.static_url}
                onChange={e => setRegionForm(f => ({ ...f, static_url: e.target.value }))}
              />
              <Input
                label="Realtime URL" type="url" name="rt_url"
                placeholder="https://…/gtfs-rt"
                value={regionForm.rt_url}
                onChange={e => setRegionForm(f => ({ ...f, rt_url: e.target.value }))}
                hint="Optional — leave empty if no realtime feed is available"
              />
              <Button type="submit" loading={regionSubmitting} className="w-full" size="md">
                {regionSubmitting ? 'Commissioning…' : 'Commission region'}
                {!regionSubmitting && <span aria-hidden="true">→</span>}
              </Button>
            </form>
          </Card>
        </div>
      )}
    </Shell>
  )
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6">
      <div className="h-12 w-12 rounded-xl border border-dashed border-line bg-elevated/40 flex items-center justify-center text-fgSubtle mb-3">
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </div>
      <h3 className="font-display text-[15px] font-semibold tracking-tight2 text-fg">{title}</h3>
      <p className="mt-1 font-sans text-[12.5px] text-fgMuted max-w-[320px]">{description}</p>
    </div>
  )
}

function RowDelete({ confirming, ariaLabel, onAsk, onCancel, onConfirm }: {
  confirming: boolean
  ariaLabel: string
  onAsk: () => void
  onCancel: () => void
  onConfirm: () => void
}) {
  if (confirming) {
    return (
      <div className="inline-flex items-center gap-1.5" role="group" aria-label={ariaLabel}>
        <span className="font-sans text-[11.5px] text-fgMuted">Remove?</span>
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button variant="danger" size="sm" onClick={onConfirm} autoFocus>Remove</Button>
      </div>
    )
  }
  return (
    <Button variant="ghost" size="sm" onClick={onAsk} aria-label={ariaLabel}>
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      </svg>
      Remove
    </Button>
  )
}
