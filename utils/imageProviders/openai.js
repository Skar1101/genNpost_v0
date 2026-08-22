const axios = require('axios')
const OpenAI = require('openai')
const G = require('../../config/guardrails')

// OpenAI images — the backstop. Last in the priority order because it is the most expensive of the
// three and cannot be fine-tuned, but it needs no key beyond OPENAI_API_KEY, which this app has
// always required anyway. That makes it the one provider guaranteed to work.

let _client = null
function client() {
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return _client
}

// gpt-image-1 accepts a fixed set of sizes; snap to the nearest by aspect.
function openaiSize(size) {
  const ratio = size.width / size.height
  if (ratio > 1.2) return '1536x1024'
  if (ratio < 0.83) return '1024x1536'
  return '1024x1024'
}

module.exports = {
  id: 'openai',
  label: 'OpenAI',
  envKey: 'OPENAI_API_KEY',

  models: [
    { id: 'gpt-image-1', label: 'OpenAI gpt-image-1', perImage: 0.04 },
  ],

  defaultModel: 'gpt-image-1',

  isConfigured() { return !!process.env.OPENAI_API_KEY },

  async generate({ prompt, model, size }) {
    const res = await client().images.generate({ model, prompt, size: openaiSize(size), n: 1 })
    const first = res.data?.[0]
    if (!first) throw new Error('OpenAI returned no image data')

    let buffer
    if (first.b64_json) {
      buffer = Buffer.from(first.b64_json, 'base64')
    } else if (first.url) {
      const img = await axios.get(first.url, { responseType: 'arraybuffer', timeout: G.TIMEOUT_MS })
      buffer = Buffer.from(img.data)
    } else {
      throw new Error('OpenAI image response had neither b64_json nor url')
    }

    return { buffer, contentType: 'image/png', modelUsed: model, cost: null }
  },
}
