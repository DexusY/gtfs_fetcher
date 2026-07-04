import type { Locator, Page } from '@playwright/test'

export class AdminPage {
  readonly toast: Locator
  readonly usersTab: Locator
  readonly regionsTab: Locator
  // invite-operator form
  readonly inviteEmail: Locator
  readonly invitePassword: Locator
  readonly inviteRole: Locator
  readonly inviteSubmit: Locator
  // commission-region form
  readonly regionName: Locator
  readonly regionCountry: Locator
  readonly regionCity: Locator
  readonly regionStaticUrl: Locator
  readonly regionSubmit: Locator

  constructor(readonly page: Page) {
    this.toast = page.getByRole('alert')
    this.usersTab = page.getByRole('tab', { name: /operators/i })
    this.regionsTab = page.getByRole('tab', { name: /regions/i })

    this.inviteEmail = page.getByLabel('Email')
    this.invitePassword = page.getByLabel('Password')
    this.inviteRole = page.getByLabel('Role')
    this.inviteSubmit = page.getByRole('button', { name: /add operator/i })

    this.regionName = page.getByLabel('Region name')
    this.regionCountry = page.getByLabel('Country')
    this.regionCity = page.getByLabel('City')
    this.regionStaticUrl = page.getByLabel('Static GTFS URL')
    this.regionSubmit = page.getByRole('button', { name: /commission region/i })
  }

  async goto(): Promise<void> {
    await this.page.goto('/admin')
  }

  userRow(email: string): Locator {
    return this.page.getByRole('row').filter({ hasText: email })
  }

  async inviteOperator(email: string, password: string, role: 'user' | 'admin'): Promise<void> {
    await this.inviteEmail.fill(email)
    await this.invitePassword.fill(password)
    await this.inviteRole.selectOption(role)
    await this.inviteSubmit.click()
  }
}
