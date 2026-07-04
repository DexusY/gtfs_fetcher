import { test, expect, seedAuth } from './fixtures'
import { CREDENTIALS } from './mocks/api'

test.describe('authentication', () => {
  test('unauthenticated visit to a protected route lands on /login', async ({ api, page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()
  })

  test('admin login routes to the admin panel and stores the session', async ({ api, page, loginPage }) => {
    await loginPage.goto()
    await loginPage.login(CREDENTIALS.admin.email, CREDENTIALS.admin.password)

    await expect(page).toHaveURL(/\/admin$/)
    await expect.poll(() => page.evaluate(() => localStorage.getItem('role'))).toBe('admin')
    expect(api.sent('POST', '/auth/login')[0]?.body).toEqual({
      email: CREDENTIALS.admin.email,
      password: CREDENTIALS.admin.password,
    })
  })

  test('regular user login routes to the dashboard', async ({ api, page, loginPage }) => {
    await loginPage.goto()
    await loginPage.login(CREDENTIALS.user.email, CREDENTIALS.user.password)
    await expect(page).toHaveURL(/\/dashboard$/)
  })

  test('wrong credentials surface an error and stay on /login', async ({ api, page, loginPage }) => {
    await loginPage.goto()
    await loginPage.login('nobody@e2e.test', 'wrong-password')

    await expect(loginPage.errorAlert).toContainText(/invalid email or password/i)
    await expect(page).toHaveURL(/\/login$/)
    await expect.poll(() => page.evaluate(() => localStorage.getItem('token'))).toBeNull()
  })

  test('rate-limited login (429) is handled as a failed attempt, not a crash', async ({ api, loginPage }) => {
    api.loginFailure = { status: 429, detail: 'Too many login attempts — try again later' }
    await loginPage.goto()
    await loginPage.login(CREDENTIALS.user.email, CREDENTIALS.user.password)
    await expect(loginPage.errorAlert).toBeVisible()
  })

  test('a non-admin cannot open the admin panel', async ({ api, page }) => {
    await seedAuth(page, 'user')
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/dashboard$/)
  })

  test('an admin can open both panels', async ({ api, page }) => {
    await seedAuth(page, 'admin')
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/dashboard$/)
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/admin$/)
  })
})
