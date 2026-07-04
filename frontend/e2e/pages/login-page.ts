import type { Locator, Page } from '@playwright/test'

export class LoginPage {
  readonly email: Locator
  readonly password: Locator
  readonly submit: Locator
  readonly errorAlert: Locator

  constructor(readonly page: Page) {
    this.email = page.getByLabel('Email')
    this.password = page.getByLabel('Password')
    this.submit = page.getByRole('button', { name: /sign in/i })
    this.errorAlert = page.getByRole('alert')
  }

  async goto(): Promise<void> {
    await this.page.goto('/login')
  }

  async login(email: string, password: string): Promise<void> {
    await this.email.fill(email)
    await this.password.fill(password)
    await this.submit.click()
  }
}
