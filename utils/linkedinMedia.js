// Uploading media to LinkedIn so a post can carry a picture or a video.
//
// Until now postToLinkedIn() took a bare string and the post body had no media field at all, so an
// image attached in Studio was silently dropped — LinkedIn posts went out as text only and nothing
// said so.
//
// Both flows are three steps: ask LinkedIn where to put the file, PUT the bytes there, then attach
// the returned URN to the post. Video adds a finalize call because large files come back with
// several upload instructions that must each be PUT and their ETags collected in order.
const fs = require('fs')
const axios = require('axios')

const REST = 'https://api.linkedin.com/rest'

function headers(token, version) {
  return {
    Authorization: `Bearer ${token}`,
    'LinkedIn-Version': version,
    'X-Restli-Protocol-Version': '2.0.0',
    'Content-Type': 'application/json',
  }
}

// ── Image ─────────────────────────────────────────────────────────────────────
// initializeUpload → PUT bytes → the image URN is usable immediately.
async function uploadImage({ token, version, personUrn, filePath }) {
  const init = await axios.post(
    `${REST}/images?action=initializeUpload`,
    { initializeUploadRequest: { owner: personUrn } },
    { headers: headers(token, version) },
  )
  const { uploadUrl, image } = init.data?.value || {}
  if (!uploadUrl || !image) throw new Error('LinkedIn did not return an image upload URL')

  await axios.put(uploadUrl, fs.readFileSync(filePath), {
    headers: { Authorization: `Bearer ${token}` },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  })
  return image
}

// ── Video ─────────────────────────────────────────────────────────────────────
// initializeUpload (with the real byte size, which LinkedIn uses to decide how many parts) →
// PUT each part → finalizeUpload with the ETags in order.
async function uploadVideo({ token, version, personUrn, filePath }) {
  const size = fs.statSync(filePath).size

  const init = await axios.post(
    `${REST}/videos?action=initializeUpload`,
    {
      initializeUploadRequest: {
        owner: personUrn,
        fileSizeBytes: size,
        uploadCaptions: false,
        uploadThumbnail: false,
      },
    },
    { headers: headers(token, version) },
  )

  const value = init.data?.value || {}
  const video = value.video
  const instructions = value.uploadInstructions || []
  if (!video || !instructions.length) throw new Error('LinkedIn did not return video upload instructions')

  // Each instruction covers a byte range; the ETags must be sent back in the same order.
  const fd = fs.openSync(filePath, 'r')
  const etags = []
  try {
    for (const ins of instructions) {
      const first = Number(ins.firstByte) || 0
      const last = Number(ins.lastByte)
      const len = (Number.isFinite(last) ? last : size - 1) - first + 1
      const buf = Buffer.alloc(len)
      fs.readSync(fd, buf, 0, len, first)

      const put = await axios.put(ins.uploadUrl, buf, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      })
      const tag = put.headers.etag || put.headers.ETag
      if (!tag) throw new Error('LinkedIn upload part returned no ETag')
      etags.push(String(tag).replace(/"/g, ''))
    }
  } finally {
    fs.closeSync(fd)
  }

  await axios.post(
    `${REST}/videos?action=finalizeUpload`,
    { finalizeUploadRequest: { video, uploadToken: '', uploadedPartIds: etags } },
    { headers: headers(token, version) },
  )

  return video
}

module.exports = { uploadImage, uploadVideo }
