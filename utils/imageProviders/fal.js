const axios = require('axios')
const G = require('../../config/guardrails')

// fal.ai — cheapest per image, and the ONLY provider here that can fine-tune. Once ~15-20 generated
// images have been approved (state/imagesStore.js tracks the verdict), that set can train a Flux
// LoRA on fal and this file's `models` list gains the trained model id. No other provider offers
// that, which is why fal stays first in the registry's priority order.
//
// Needs FAL_KEY. Without it the registry simply skips to the next provider.

const BASE = 'https://fal.run'

// fal takes named sizes rather than pixel dimensions.
function falSize(size) {
  const ratio = size.width / size.height
  if (ratio > 1.5) return 'landscape_16_9'
  if (ratio > 1.1) return 'landscape_4_3'
  if (ratio < 0.67) return 'portrait_16_9'
  if (ratio < 0.9) return 'portrait_4_3'
  return 'square_hd'
}

module.exports = {
  id: 'fal',
  label: 'fal.ai',
  envKey: 'FAL_KEY',

  models: [
    { id: 'fal-ai/flux/schnell',    label: 'Flux schnell (fastest, cheapest)', perImage: 0.003 },
    { id: 'fal-ai/flux/dev',        label: 'Flux dev (better quality)',        perImage: 0.025 },
    { id: 'fal-ai/flux-pro/v1.1',   label: 'Flux 1.1 pro (best)',              perImage: 0.04 },
    // A trained LoRA is added here once one exists — same shape, its own id.
  ],

  defaultModel: 'fal-ai/flux/dev',

  isConfigured() { return !!process.env.FAL_KEY },

  async generate({ prompt, model, size }) {
    const res = await axios.post(
      `${BASE}/${model}`,
      { prompt, image_size: falSize(size), num_images: 1, enable_safety_checker: true },
      {
        headers: { Authorization: `Key ${process.env.FAL_KEY}`, 'Content-Type': 'application/json' },
        timeout: G.TIMEOUT_MS,
      },
    )

    const first = res.data?.images?.[0]
    if (!first?.url) throw new Error('fal.ai returned no image URL')

    // fal hands back a hosted URL; pull the bytes so images live locally like every other asset and
    // don't depend on their CDN staying up.
    const img = await axios.get(first.url, { responseType: 'arraybuffer', timeout: G.TIMEOUT_MS })

    return {
      buffer: Buffer.from(img.data),
      contentType: first.content_type || 'image/jpeg',
      modelUsed: model,
      cost: null,   // fal doesn't report cost per request — the registry prices it
    }
  },
}
