import { test as base } from '@playwright/test'
import { MockApi } from './mocks/api'
import { LoginPage } from './pages/login-page'
import { DashboardPage } from './pages/dashboard-page'
import { AdminPage } from './pages/admin-page'

interface Fixtures {
  api: MockApi
  loginPage: LoginPage
  dashboardPage: DashboardPage
  adminPage: AdminPage
}

// Every test gets a hermetic MockApi (installed before any navigation) and
// page objects. Auth is seeded via localStorage, not the login UI — the login
// flow itself is covered once in auth.spec.ts.
export const test = base.extend<Fixtures>({
  api: async ({ page }, use) => {
    const api = new MockApi(page)
    await api.install()
    await use(api)
  },
  loginPage: async ({ page }, use) => { await use(new LoginPage(page)) },
  dashboardPage: async ({ page }, use) => { await use(new DashboardPage(page)) },
  adminPage: async ({ page }, use) => { await use(new AdminPage(page)) },
})

export const expect = test.expect

export async function seedAuth(
  page: import('@playwright/test').Page,
  role: 'admin' | 'user',
): Promise<void> {
  await page.addInitScript(r => {
    window.localStorage.setItem('token', `e2e-token-${r}`)
    window.localStorage.setItem('role', r)
  }, role)
}
