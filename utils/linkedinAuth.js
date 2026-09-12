// LinkedIn OAuth (3-legged, "Sign In with LinkedIn using OpenID Connect" + "Share on LinkedIn").
// One-time interactive setup per account: the member visits GET /api/parrot/oauth/start (as whichever
// account is active in the dashboard at that moment), logs into LinkedIn, consents, gets redirected
// back to GET /api/parrot/oauth/callback which exchanges the code for a token and stores it — now
// keyed per account (state/data/accounts/<slug>/parrotAuth.json) rather than one global file, so a
// second account's LinkedIn connection never overwrites the first's. Standard/self-serve LinkedIn apps
// get NO refresh token — access tokens expire after ~60 days flat and re-authorizing means repeating
// this same browser flow again. isTokenValid()'s warnDays lets the scheduler nudge the user before
// that happens silently.
const fs = require('fs')
const crypto = require('crypto')
const axios = require('axios')
const accounts = require('../state/accounts')

const FILE_NAME = 'parrotAuth.json'

const AUTH_URL = 'https://www.linkedin.com/oauth/v2/authorization'
const TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken'
const USERINFO_URL = 'https://api.linkedin.com/v2/userinfo'
const SCOPES = 'openid profile w_member_social'

function fileFor(account) {
  return accounts.accountFile(account, FILE_NAME)
}

function readRaw(account) {
  const file = fileFor(account)
  if (!fs.existsSync(file)) return null
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch (_) { return null }
}

function writeRaw(account, data) {
  const file = fileFor(account)
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
  fs.renameSync(tmp, file)
}

// In-memory CSRF state, one pending flow at a time per process — the OAuth round-trip happens within
// the same running process, within minutes, so this doesn't need to survive a restart. Now also
// carries WHICH account started the flow, so the callback (a plain LinkedIn redirect with no other
// account context) knows where to save the token.
let _pending = null // { state, account }

function getRedirectUri() {
  return process.env.LINKEDIN_REDIRECT_URI || `http://localhost:${process.env.PORT || 3001}/api/parrot/oauth/callback`
}

function getAuthUrl(account = null) {
  const clientId = process.env.LINKEDIN_CLIENT_ID
  if (!clientId) throw new Error('LINKEDIN_CLIENT_ID not set in .env')
  const acct = accounts.slug(account || accounts.getActiveAccount())
  const state = crypto.randomBytes(16).toString('hex')
  _pending = { state, account: acct }
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: getRedirectUri(),
    scope: SCOPES,
    state,
  })
  return `${AUTH_URL}?${params.toString()}`
}

function verifyState(state) {
  return !!_pending && state === _pending.state
}

// The account the currently-pending flow was started for (only meaningful right after verifyState()
// returns true for the same state — the callback route checks state first, then reads this).
function pendingAccount() {
  return _pending?.account || accounts.getActiveAccount()
}

// Exchanges an auth code for an access token, fetches the member's own URN, and persists both under
// the given account (defaults to whichever account started the pending flow). Returns the stored
// record. Throws on any failure — the caller (the /callback route) turns that into a clear error page
// rather than a silent no-op.
async function exchangeCode(code, account = null) {
  const clientId = process.env.LINKEDIN_CLIENT_ID
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('LINKEDIN_CLIENT_ID/LINKEDIN_CLIENT_SECRET not set in .env')

  const acct = accounts.slug(account || pendingAccount())

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
  writeRaw(acct, record)
  _pending = null
  return record
}

function getStoredToken(account = null) {
  return readRaw(account || accounts.getActiveAccount())
}

// { connected, valid, expiringSoon, daysLeft } — never throws, always safe to call for a status card.
// Single options object (not (account, opts)) so existing tokenStatus({ warnDays: 7 }) callers keep
// working unchanged — they just implicitly use the active account, same as before.
function tokenStatus({ account = null, warnDays = 7 } = {}) {
  const rec = readRaw(account || accounts.getActiveAccount())
  if (!rec?.accessToken) return { connected: false, valid: false, expiringSoon: false, daysLeft: null }
  const daysLeft = (new Date(rec.expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)
  return {
    connected: true,
    valid: daysLeft > 0,
    expiringSoon: daysLeft <= warnDays,
    daysLeft: Math.round(daysLeft * 10) / 10,
  }
}

module.exports = { getAuthUrl, verifyState, pendingAccount, exchangeCode, getStoredToken, tokenStatus, getRedirectUri }
