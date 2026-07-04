import { test, expect, seedAuth } from './fixtures'

test.beforeEach(async ({ page }) => {
  await seedAuth(page, 'user')
})

test.describe('region and stop selection', () => {
  test('regions from the API populate the selector', async ({ api, dashboardPage }) => {
    await dashboardPage.goto()
    await expect(dashboardPage.regionSelect).toBeVisible()
    const labels = await dashboardPage.regionSelect.locator('option').allTextContents()
    expect(labels.join(' ')).toContain('ZTM Gdańsk')
    expect(labels.join(' ')).toContain('MVV München')
  })

  test('a warming region shows progress, then loads stops when the feed is ready', async ({ api, dashboardPage }) => {
    api.statuses[1] = { status: 'warming', has_shapes: false }

    await dashboardPage.goto()
    await dashboardPage.selectRegionById(1)
    await expect(dashboardPage.warmingBanner).toContainText(/warming/i)

    // Backend finishes ingesting between two polls of /stops.
    api.statuses[1] = { status: 'ready', has_shapes: true }

    await expect(dashboardPage.stopSearch).toBeVisible({ timeout: 10_000 })
    await expect(dashboardPage.warmingBanner).toBeHidden()
  })

  test('stop search filters, supports keyboard selection, and pins the stop', async ({ api, dashboardPage, page }) => {
    await dashboardPage.goto()
    await dashboardPage.selectRegionById(1)

    await dashboardPage.stopSearch.fill('harb')
    await expect(dashboardPage.stopOptions).toHaveCount(1)
    await expect(dashboardPage.stopOptions.first()).toContainText('Harbour Gate')

    await page.keyboard.press('Enter')
    await expect(page.getByText('ID · S002')).toBeVisible()
  })

  test('search with no matches says so', async ({ api, dashboardPage }) => {
    await dashboardPage.goto()
    await dashboardPage.selectRegionById(1)
    await dashboardPage.stopSearch.fill('zzz-no-such-stop')
    await expect(dashboardPage.page.getByText('No matching stops.')).toBeVisible()
  })

  test('routes template is disabled for regions without shapes', async ({ api, dashboardPage }) => {
    await dashboardPage.goto()
    await dashboardPage.selectRegionById(2)   // has_shapes: false
    await expect(dashboardPage.routesTab).toBeDisabled()
    await expect(dashboardPage.page.getByText(/no shapes\.txt/i)).toBeVisible()
  })
})

test.describe('rendering', () => {
  test('preview is gated until both region and stop are chosen', async ({ api, dashboardPage }) => {
    await dashboardPage.goto()
    await expect(dashboardPage.previewButton).toBeDisabled()

    await dashboardPage.selectRegionById(1)
    await expect(dashboardPage.previewButton).toBeDisabled()

    await dashboardPage.pickStop('central', 'Central Station')
    await expect(dashboardPage.previewButton).toBeEnabled()
  })

  test('preview renders the board image with the configured parameters', async ({ api, dashboardPage }) => {
    await dashboardPage.goto()
    await dashboardPage.selectRegionById(1)
    await dashboardPage.pickStop('central', 'Central Station')
    await dashboardPage.previewButton.click()

    await expect(dashboardPage.previewImage).toBeVisible()

    const render = api.sent('GET', '/render').at(-1)
    expect(render?.query).toMatchObject({
      region_id: '1',
      stop_id: 'S001',
      template: 'rti_display',
      format: 'png',
      width: '1600',
      height: '1200',
    })
  })

  test('a failed render surfaces the error instead of a broken image', async ({ api, dashboardPage }) => {
    api.renderFailure = { status: 503, detail: 'GTFS data not ready' }

    await dashboardPage.goto()
    await dashboardPage.selectRegionById(1)
    await dashboardPage.pickStop('central', 'Central Station')
    await dashboardPage.previewButton.click()

    await expect(dashboardPage.renderAlert).toContainText(/render failed: 503/i)
    await expect(dashboardPage.previewImage).toBeHidden()
  })

  test('switching to the routes template renders gtfs_routes_map', async ({ api, dashboardPage }) => {
    await dashboardPage.goto()
    await dashboardPage.selectRegionById(1)
    await dashboardPage.pickStop('central', 'Central Station')

    await dashboardPage.routesTab.click()
    await dashboardPage.previewButton.click()

    await expect(dashboardPage.previewImage).toBeVisible()
    expect(api.sent('GET', '/render').at(-1)?.query.template).toBe('gtfs_routes_map')
  })
})
