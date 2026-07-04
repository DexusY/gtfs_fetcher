export function getToken(): string | null {
  return localStorage.getItem('token')
}

export function setToken(token: string): void {
  localStorage.setItem('token', token)
}

export function clearToken(): void {
  localStorage.removeItem('token')
  localStorage.removeItem('role')
}

export function getRole(): string | null {
  return localStorage.getItem('role')
}

export function setRole(role: string): void {
  localStorage.setItem('role', role)
}

export function isLoggedIn(): boolean {
  return !!getToken()
}
