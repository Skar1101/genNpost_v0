// Thin fetch client for the existing Express API. Sends the optional API token
// (stored in localStorage) as a Bearer header. Not wired into pages yet — the
// scaffold renders mock data until we connect each endpoint.

const TOKEN_KEY = 'ts_api_token'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || ''
}
export function setToken(t) {
  if (t) localStorage.setItem(TOKEN_KEY, t)
  else localStorage.removeItem(TOKEN_KEY)
}

export async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`API ${method} ${path} → ${res.status}`)
  return res.status === 204 ? null : res.json()
}

// For endpoints that respond text/plain (the log viewer).
export async function apiText(path) {
  const headers = {}
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`/api${path}`, { headers })
  if (!res.ok) throw new Error(`API GET ${path} → ${res.status}`)
  return res.text()
}
