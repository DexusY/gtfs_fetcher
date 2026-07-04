import { getToken } from './auth'

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export interface Region {
  id: number
  name: string
  city: string
  country: string
  static_url: string
  rt_url: string | null
}

export interface User {
  id: number
  email: string
  role: string
}

export interface Stop {
  id: string
  name: string
  lat: number
  lon: number
}

export type CacheState = 'ready' | 'warming' | 'idle'

export interface RegionStatus {
  status: CacheState
  has_shapes: boolean | null   // null until the static cache finishes warming
}

// Kept as an alias so existing callers that read the status string continue to compile.
export type CacheStatus = CacheState

function headers(): HeadersInit {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  const t = getToken()
  if (t) h['Authorization'] = `Bearer ${t}`
  return h
}

// Pull a human message out of a failed response so callers can show the real
// reason (FastAPI puts it in `detail`) instead of a generic fallback.
async function errMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json()
    if (typeof data?.detail === 'string') return data.detail
    if (Array.isArray(data?.detail) && typeof data.detail[0]?.msg === 'string') return data.detail[0].msg
  } catch {
    /* non-JSON body — fall through */
  }
  return fallback
}

export async function login(email: string, password: string) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw new Error(await errMessage(res, 'Invalid credentials'))
  return res.json()
}

export async function getMe() {
  const res = await fetch(`${BASE}/auth/me`, { headers: headers() })
  if (!res.ok) throw new Error('Unauthorized')
  return res.json()
}

export async function getRegions(): Promise<Region[]> {
  const res = await fetch(`${BASE}/regions`, { headers: headers() })
  if (!res.ok) throw new Error('Failed to fetch regions')
  return res.json()
}

export async function createRegion(data: Record<string, string | null>) {
  const res = await fetch(`${BASE}/regions`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(await errMessage(res, 'Failed to create region'))
  return res.json()
}

export async function deleteRegion(id: number) {
  const res = await fetch(`${BASE}/regions/${id}`, { method: 'DELETE', headers: headers() })
  if (!res.ok) throw new Error('Failed to delete region')
}

export async function getUsers(): Promise<User[]> {
  const res = await fetch(`${BASE}/users`, { headers: headers() })
  if (!res.ok) throw new Error('Failed to fetch users')
  return res.json()
}

export async function createUser(data: { email: string; password: string; role: string }) {
  const res = await fetch(`${BASE}/users`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(await errMessage(res, 'Failed to create user'))
  return res.json()
}

export async function deleteUser(id: number) {
  const res = await fetch(`${BASE}/users/${id}`, { method: 'DELETE', headers: headers() })
  if (!res.ok) throw new Error('Failed to delete user')
}

export async function getRegionsStatus(): Promise<Record<string, RegionStatus>> {
  const res = await fetch(`${BASE}/regions/status`, { headers: headers() })
  if (!res.ok) return {}
  return res.json()
}

export async function getStops(regionId: number | string): Promise<Stop[]> {
  const res = await fetch(`${BASE}/stops?region_id=${regionId}`, { headers: headers() })
  if (res.status === 202) return []   // still warming — caller should retry
  if (!res.ok) throw new Error('Failed to fetch stops')
  return res.json()
}

export async function renderDefault(params: Record<string, string | number>): Promise<Blob> {
  const q = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => q.set(k, String(v)))
  const token = getToken()
  const res = await fetch(`${BASE}/render?${q}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) throw new Error(`Render failed: ${res.status}`)
  return res.blob()
}

export async function renderCustom(
  params: { region_id: string | number; stop_id: string; limit: number; format: string },
  background: File,
  layout: object,
): Promise<Blob> {
  const q = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => q.set(k, String(v)))

  const form = new FormData()
  form.append('background', background)
  form.append('layout', new Blob([JSON.stringify(layout)], { type: 'application/json' }), 'layout.json')

  const controller = new AbortController()
  const tid = setTimeout(() => controller.abort(), 60_000)

  const token = getToken()
  try {
    const res = await fetch(`${BASE}/render/custom?${q}`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`Custom render failed: ${res.status}`)
    return res.blob()
  } finally {
    clearTimeout(tid)
  }
}
