// LinkedIn OAuth (3-legged, "Sign In with LinkedIn using OpenID Connect" + "Share on LinkedIn").
// One-time interactive setup: the member (Souvik) visits GET /api/parrot/oauth/start, logs into
// LinkedIn, consents, gets redirected back to GET /api/parrot/oauth/callback which exchanges the code
// for a token and stores it here. Standard/self-serve LinkedIn apps get NO refresh token — access
// tokens expire after ~60 days flat and re-authorizing means repeating this same browser flow again.
// isTokenValid()'s warnDays lets the scheduler nudge the user before that happens silently.
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const axios = require('axios')

const DATA_DIR = path.join(__dirname, '..', 'state', 'data')
const FILE = path.join(DATA_DIR, 'parrotAuth.json')

const AUTH_URL = 'https://www.linkedin.com/oauth/v2/authorization'
const TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken'
const USERINFO_URL = 'https://api.linkedin.com/v2/userinfo'
const SCOPES = 'openid profile w_member_social'

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
}

function readRaw() {
  if (!fs.existsSync(FILE)) return null
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')) } catch (_) { return null }
}

function writeRaw(data) {
  ensureDir()
  const tmp = FILE + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
  fs.renameSync(tmp, FILE)
}

// In-memory CSRF state — the OAuth round-trip happens within the same running process, within
// minutes, so this doesn't need to survive a restart.
let _pendingState = null

function getRedirectUri() {
  return process.env.LINKEDIN_REDIRECT_URI || `http://localhost:${process.env.PORT || 3001}/api/parrot/oauth/callback`
}

function getAuthUrl() {
  const clientId = process.env.LINKEDIN_CLIENT_ID
  if (!clientId) throw new Error('LINKEDIN_CLIENT_ID not set in .env')
  _pendingState = crypto.randomBytes(16).toString('hex')
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: getRedirectUri(),
    scope: SCOPES,
    state: _pendingState,
  })
  return `${AUTH_URL}?${params.toString()}`
}

function verifyState(state) {
  return !!_pendingState && state === _pendingState
}

// Exchanges an auth code for an access token, fetches the member's own URN, and persists both.
// Returns the stored record. Throws on any failure — the caller (the /callback route) turns that
// into a clear error page rather than a silent no-op.
async function exchangeCode(code) {
  const clientId = process.env.LINKEDIN_CLIENT_ID
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('LINKEDIN_CLIENT_ID/LINKEDIN_CLIENT_SECRET not set in .env')

  const tokenRes = await axios.post(TOKEN_URL, new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: getRedirectUri(),
    client_id: clientId,
    client_secret: clientSecret,
  }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })

  const { access_token: accessToken, expires_in: expiresIn } = tokenRes.data
  if (!accessToken) throw new Error('LinkedIn token exchange succeeded but returned no access_token')

  const userRes = await axios.get(USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } })
  const sub = userRes.data?.sub
  if (!sub) throw new Error('LinkedIn userinfo call succeeded but returned no sub (member id)')

  const record = {
    accessToken,
    personUrn: `urn:li:person:${sub}`,
    name: userRes.data?.name || null,
    obtainedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + (expiresIn || 60 * 24 * 60 * 60) * 1000).toISOString(),
  }
  writeRaw(record)
  return record
}

function getStoredToken() {
  return readRaw()
}

// { connected, valid, expiringSoon, daysLeft } — never throws, always safe to call for a status card.
function tokenStatus({ warnDays = 7 } = {}) {
  const rec = readRaw()
  if (!rec?.accessToken) return { connected: false, valid: false, expiringSoon: false, daysLeft: null }
  const daysLeft = (new Date(rec.expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)
  return {
    connected: true,
    valid: daysLeft > 0,
    expiringSoon: daysLeft <= warnDays,
    daysLeft: Math.round(daysLeft * 10) / 10,
  }
}

module.exports = { getAuthUrl, verifyState, exchangeCode, getStoredToken, tokenStatus, getRedirectUri }
