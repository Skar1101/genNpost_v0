// Real LinkedIn posting — the one platform in this codebase with an actual write path. Uses LinkedIn's
// Posts API (the current replacement for the legacy UGC Posts API). No edit-post endpoint exists on
// LinkedIn's side (confirmed) — a posted draft can only be deleted and reposted, never corrected.
const axios = require('axios')
const linkedinAuth = require('./linkedinAuth')
const linkedinMedia = require('./linkedinMedia')

const POSTS_URL = 'https://api.linkedin.com/rest/posts'
// LinkedIn versions its REST API by a YYYYMM string, and only keeps roughly the last 12 months' worth
// active — the CURRENT month is often NOT yet active (confirmed live: '202608' failed with "Requested
// version 20260801 is not active" on 2026-08-07). Use a version a couple months in the past, not the
// bleeding edge. Bump this periodically; if posting ever fails with "version ... is not active" again,
// step this back further.
const LINKEDIN_API_VERSION = '202606'

// Throws a plain Error with a clear, user-facing message on any failure — the caller (Telegram/API
// approve handlers) shows this directly rather than a generic "failed" string.
// Accepts either a plain string (the original call shape, still used by agents/parrot.js and
// scheduler/slotDelivery.js) or { text, imagePath, videoPath } to attach media.
async function postToLinkedIn(input) {
  const { text, imagePath = null, videoPath = null } =
    typeof input === 'string' ? { text: input } : (input || {})
  const stored = linkedinAuth.getStoredToken()
  if (!stored?.accessToken) {
    throw new Error('LinkedIn isn\'t connected yet — visit /api/parrot/oauth/start to connect.')
  }
  const status = linkedinAuth.tokenStatus()
  if (!status.valid) {
    throw new Error('LinkedIn token expired — visit /api/parrot/oauth/start to reconnect.')
  }

  // Upload media first — a failure here must abort before anything is posted, so a half-finished
  // post never reaches the feed. Video wins if both are somehow set.
  let mediaUrn = null
  try {
    if (videoPath) {
      mediaUrn = await linkedinMedia.uploadVideo({ token: stored.accessToken, version: LINKEDIN_API_VERSION, personUrn: stored.personUrn, filePath: videoPath })
    } else if (imagePath) {
      mediaUrn = await linkedinMedia.uploadImage({ token: stored.accessToken, version: LINKEDIN_API_VERSION, personUrn: stored.personUrn, filePath: imagePath })
    }
  } catch (err) {
    const msg = err.response?.data?.message || err.message
    throw new Error(`LinkedIn media upload failed: ${msg}`)
  }

  const body = {
    author: stored.personUrn,
    commentary: text,
    visibility: 'PUBLIC',
    distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false,
    ...(mediaUrn ? { content: { media: { id: mediaUrn } } } : {}),
  }

  let res
  try {
    res = await axios.post(POSTS_URL, body, {
      headers: {
        Authorization: `Bearer ${stored.accessToken}`,
        'LinkedIn-Version': LINKEDIN_API_VERSION,
        'X-Restli-Protocol-Version': '2.0.0',
        'Content-Type': 'application/json',
      },
    })
  } catch (err) {
    const msg = err.response?.data?.message || err.message
    throw new Error(`LinkedIn post failed: ${msg}`)
  }

  const postUrn = res.headers['x-restli-id'] || res.headers['x-linkedin-id'] || null
  const url = postUrn ? `https://www.linkedin.com/feed/update/${encodeURIComponent(postUrn)}/` : null
  return { postUrn, url }
}

module.exports = { postToLinkedIn }
