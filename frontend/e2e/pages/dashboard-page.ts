import type { Locator, Page } from '@playwright/test'

export class DashboardPage {
  readonly regionSelect: Locator
  readonly warmingBanner: Locator
  readonly stopSearch: Locator
  readonly stopOptions: Locator
  readonly previewButton: Locator
  readonly downloadButton: Locator
  readonly previewImage: Locator
  readonly renderAlert: Locator
  readonly routesTab: Locator
  readonly departuresTab: Locator

  constructor(readonly page: Page) {
    this.regionSelect = page.getByLabel('Select a region')
    this.warmingBanner = page.getByRole('status')
    this.stopSearch = page.getByRole('combobox', { name: /search stop/i })
    this.stopOptions = page.getByRole('listbox', { name: /matching stops/i }).getByRole('option')
    this.previewButton = page.getByRole('button', { name: /preview board/i })
    this.downloadButton = page.getByRole('button', { name: /download/i })
    this.previewImage = page.getByAltText('Generated departure board')
    this.renderAlert = page.getByRole('alert')
    this.routesTab = page.getByRole('tab', { name: 'Routes' })
    this.departuresTab = page.getByRole('tab', { name: 'Departures' })
  }

  async goto(): Promise<void> {
    await this.page.goto('/dashboard')
  }

  async selectRegionById(id: number): Promise<void> {
    await this.regionSelect.selectOption(String(id))
  }

  async pickStop(query: string, optionName: string | RegExp): Promise<void> {
    await this.stopSearch.fill(query)
    await this.stopOptions.filter({ hasText: optionName as string }).first().click()
  }
}
