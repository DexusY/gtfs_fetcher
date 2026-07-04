import { test, expect, seedAuth } from './fixtures'

test.beforeEach(async ({ page }) => {
  await seedAuth(page, 'admin')
})

test.describe('operator management', () => {
  test('the roster lists accounts from the API', async ({ api, adminPage }) => {
    await adminPage.goto()
    await expect(adminPage.userRow('admin@e2e.test')).toBeVisible()
    await expect(adminPage.userRow('user@e2e.test')).toBeVisible()
  })

  test('inviting an operator posts the form and refreshes the roster', async ({ api, adminPage }) => {
    await adminPage.goto()
    await adminPage.inviteOperator('new@e2e.test', 'brand-new-pass', 'user')

    await expect(adminPage.toast).toContainText('Operator added.')
    await expect(adminPage.userRow('new@e2e.test')).toBeVisible()
    expect(api.sent('POST', '/users')[0]?.body).toEqual({
      email: 'new@e2e.test',
      password: 'brand-new-pass',
      role: 'user',
    })
  })

  test('a duplicate email shows the backend detail message', async ({ api, adminPage }) => {
    await adminPage.goto()
    await adminPage.inviteOperator('user@e2e.test', 'whatever-pass', 'user')
    await expect(adminPage.toast).toContainText('Email already registered')
  })

  test('removing an operator requires an explicit confirmation', async ({ api, adminPage, page }) => {
    await adminPage.goto()
    await page.getByRole('button', { name: 'Remove user@e2e.test' }).click()

    // Nothing is deleted until the confirm step.
    expect(api.sent('DELETE', '/users/2')).toHaveLength(0)

    await page.getByRole('group', { name: 'Remove user@e2e.test' })
      .getByRole('button', { name: 'Remove', exact: true }).click()

    await expect(adminPage.toast).toContainText('Removed user@e2e.test')
    await expect(adminPage.userRow('user@e2e.test')).toBeHidden()
    expect(api.sent('DELETE', '/users/2')).toHaveLength(1)
  })

  test('cancelling a removal keeps the account', async ({ api, adminPage, page }) => {
    await adminPage.goto()
    await page.getByRole('button', { name: 'Remove user@e2e.test' }).click()
    await page.getByRole('button', { name: 'Cancel' }).click()

    await expect(adminPage.userRow('user@e2e.test')).toBeVisible()
    expect(api.sent('DELETE', '/users/2')).toHaveLength(0)
  })
})

test.describe('region management', () => {
  test('commissioning a region posts the feed config and starts warming', async ({ api, adminPage }) => {
    await adminPage.goto()
    await adminPage.regionsTab.click()

    await adminPage.regionName.fill('Warsaw Metro')
    await adminPage.regionCountry.fill('pl')
    await adminPage.regionCity.fill('Warsaw')
    await adminPage.regionStaticUrl.fill('https://feeds.test/warsaw.zip')
    await adminPage.regionSubmit.click()

    await expect(adminPage.toast).toContainText('Region commissioned')
    await expect(adminPage.page.getByText('Warsaw Metro')).toBeVisible()
    expect(api.sent('POST', '/regions')[0]?.body).toEqual({
      name: 'Warsaw Metro',
      country: 'PL',            // uppercased by the form
      city: 'Warsaw',
      static_url: 'https://feeds.test/warsaw.zip',
      rt_url: null,             // empty optional field normalised to null
    })
  })

  test('decommissioning a region removes it after confirmation', async ({ api, adminPage, page }) => {
    await adminPage.goto()
    await adminPage.regionsTab.click()

    await page.getByRole('button', { name: 'Remove ZTM Gdańsk' }).click()
    await page.getByRole('group', { name: 'Remove ZTM Gdańsk' })
      .getByRole('button', { name: 'Remove', exact: true }).click()

    await expect(adminPage.toast).toContainText('Decommissioned ZTM Gdańsk')
    expect(api.sent('DELETE', '/regions/1')).toHaveLength(1)
  })
})
