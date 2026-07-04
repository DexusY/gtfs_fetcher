import type { Page, Route } from '@playwright/test'

export interface MockUser { id: number; email: string; role: 'admin' | 'user' }
export interface MockRegion {
  id: number; name: string; country: string; city: string
  static_url: string; rt_url: string | null
}
export interface MockStop { id: string; name: string; lat: number; lon: number }
export type MockStatus = { status: 'ready' | 'warming' | 'failed' | 'idle'; has_shapes: boolean }

export interface RecordedRequest {
  method: string
  path: string
  query: Record<string, string>
  body: unknown
}

const API_ORIGIN = 'http://localhost:8000'

// 1×1 transparent PNG — enough for <img> onLoad to fire on preview blobs.
export const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

export const CREDENTIALS = {
  admin: { email: 'admin@e2e.test', password: 'admin-pass-123', role: 'admin' as const },
  user:  { email: 'user@e2e.test',  password: 'user-pass-1234', role: 'user' as const },
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'access-control-allow-headers': 'authorization,content-type',
}

/**
 * In-browser fake of the FastAPI backend, installed via page.route.
 *
 * Tests are hermetic: every request to the API origin is answered from the
 * mutable state below, every other non-localhost request (OSM tiles,
 * Nominatim, CDNs) is aborted. Mutate state mid-test to simulate backend
 * transitions (e.g. a region flipping from warming to ready between polls).
 */
export class MockApi {
  regions: MockRegion[] = [
    { id: 1, name: 'ZTM Gdańsk', country: 'PL', city: 'Gdańsk', static_url: 'http://feeds.test/gdansk.zip', rt_url: 'http://feeds.test/gdansk-rt' },
    { id: 2, name: 'MVV München', country: 'DE', city: 'München', static_url: 'http://feeds.test/mvv.zip', rt_url: null },
  ]
  statuses: Record<number, MockStatus> = {
    1: { status: 'ready', has_shapes: true },
    2: { status: 'ready', has_shapes: false },
  }
  stops: MockStop[] = [
    { id: 'S001', name: 'Central Station',  lat: 54.40, lon: 18.50 },
    { id: 'S002', name: 'Harbour Gate',     lat: 54.41, lon: 18.52 },
    { id: 'S003', name: 'University Loop',  lat: 54.42, lon: 18.54 },
  ]
  users: MockUser[] = [
    { id: 1, email: CREDENTIALS.admin.email, role: 'admin' },
    { id: 2, email: CREDENTIALS.user.email,  role: 'user' },
  ]

  /** Force the next login to fail with this response (cleared after use). */
  loginFailure: { status: number; detail: string } | null = null
  /** Force /render responses (null = serve the 1×1 PNG). */
  renderFailure: { status: number; detail: string } | null = null

  readonly requests: RecordedRequest[] = []
  private nextId = 100

  constructor(private readonly page: Page) {}

  async install(): Promise<void> {
    await this.page.route('**/*', route => {
      const url = new URL(route.request().url())
      if (url.origin === API_ORIGIN) return this.dispatch(route, url)
      if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return route.fallback()
      return route.abort()   // hermetic: no external network, ever
    })
  }

  /** Requests recorded for a path, e.g. sent('POST', '/users'). */
  sent(method: string, path: string): RecordedRequest[] {
    return this.requests.filter(r => r.method === method && r.path === path)
  }

  private json(route: Route, status: number, body: unknown): Promise<void> {
    return route.fulfill({
      status,
      headers: CORS,
      contentType: 'application/json',
      body: JSON.stringify(body),
    })
  }

  private async dispatch(route: Route, url: URL): Promise<void> {
    const req = route.request()
    const method = req.method()
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })

    let body: unknown = null
    const post = req.postData()
    if (post && (req.headers()['content-type'] ?? '').includes('json')) {
      try { body = JSON.parse(post) } catch { body = post }
    }
    this.requests.push({
      method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      body,
    })

    const path = url.pathname

    if (method === 'POST' && path === '/auth/login') {
      if (this.loginFailure) {
        const failure = this.loginFailure
        this.loginFailure = null
        return this.json(route, failure.status, { detail: failure.detail })
      }
      const creds = body as { email: string; password: string }
      const match = Object.values(CREDENTIALS)
        .find(c => c.email === creds.email && c.password === creds.password)
      if (!match) return this.json(route, 401, { detail: 'Invalid credentials' })
      return this.json(route, 200, { token: `e2e-token-${match.role}`, role: match.role })
    }

    if (method === 'GET' && path === '/regions') return this.json(route, 200, this.regions)

    if (method === 'GET' && path === '/regions/status') {
      return this.json(route, 200, Object.fromEntries(
        this.regions.map(r => [r.id, this.statuses[r.id] ?? { status: 'idle', has_shapes: false }]),
      ))
    }

    if (method === 'POST' && path === '/regions') {
      const data = body as Omit<MockRegion, 'id'>
      const region = { ...data, id: this.nextId++ }
      this.regions.push(region)
      this.statuses[region.id] = { status: 'warming', has_shapes: false }
      return this.json(route, 200, { id: region.id, name: region.name })
    }

    const regionDelete = path.match(/^\/regions\/(\d+)$/)
    if (method === 'DELETE' && regionDelete) {
      this.regions = this.regions.filter(r => r.id !== Number(regionDelete[1]))
      return this.json(route, 200, { ok: true })
    }

    if (method === 'GET' && path === '/stops') {
      const regionId = Number(url.searchParams.get('region_id'))
      const status = this.statuses[regionId]?.status
      if (status !== 'ready') return this.json(route, 202, { status: 'warming' })
      return this.json(route, 200, this.stops)
    }

    if (method === 'GET' && path === '/render') {
      if (this.renderFailure) {
        return this.json(route, this.renderFailure.status, { detail: this.renderFailure.detail })
      }
      return route.fulfill({ status: 200, headers: CORS, contentType: 'image/png', body: PNG_1PX })
    }

    if (method === 'POST' && path === '/render/custom') {
      return route.fulfill({ status: 200, headers: CORS, contentType: 'image/png', body: PNG_1PX })
    }

    if (method === 'GET' && path === '/users') return this.json(route, 200, this.users)

    if (method === 'POST' && path === '/users') {
      const data = body as { email: string; role: MockUser['role'] }
      if (this.users.some(u => u.email === data.email)) {
        return this.json(route, 409, { detail: 'Email already registered' })
      }
      const user = { id: this.nextId++, email: data.email, role: data.role }
      this.users.push(user)
      return this.json(route, 201, user)
    }

    const userDelete = path.match(/^\/users\/(\d+)$/)
    if (method === 'DELETE' && userDelete) {
      this.users = this.users.filter(u => u.id !== Number(userDelete[1]))
      return this.json(route, 200, { ok: true })
    }

    if (method === 'GET' && path === '/auth/me') {
      return this.json(route, 200, { id: 1, email: CREDENTIALS.admin.email, role: 'admin' })
    }

    // Unmapped endpoint: fail loudly so a contract drift breaks the test.
    return this.json(route, 500, { detail: `MockApi: unhandled ${method} ${path}` })
  }
}
