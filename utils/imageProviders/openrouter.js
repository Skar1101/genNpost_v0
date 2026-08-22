const axios = require('axios')
const G = require('../../config/guardrails')

// OpenRouter — the Unified Image API (June 2026). 30+ models across 8 providers behind one key,
// including FLUX direct from Black Forest Labs.
//
// Note: fal.ai is NOT reachable through OpenRouter. Flux is — via Black Forest Labs themselves —
// which is what matters for generation. Training is the exception: OpenRouter is inference-only, so
// a LoRA on approved images still needs ./fal.js.
//
// Pricing is per MEGAPIXEL for FLUX, which a flat per-image table can't express — hence
// `perMegapixel` below. In practice the API returns the real cost per request and we use that
// instead; the table is only the fallback.

const BASE = 'https://openrouter.ai/api/v1/images'

// OpenRouter accepts a fixed set of normalized ratio strings, so snap the provider-neutral
// {width,height} from config/imageStyle.js to the nearest supported one.
const RATIOS = [
  { name: '1:1', v: 1 }, { name: '4:3', v: 4 / 3 }, { name: '3:2', v: 3 / 2 },
  { name: '16:9', v: 16 / 9 }, { name: '3:4', v: 3 / 4 }, { name: '2:3', v: 2 / 3 },
  { name: '9:16', v: 9 / 16 }, { name: '4:5', v: 4 / 5 }, { name: '5:4', v: 5 / 4 },
]

function aspectFor(size) {
  // An explicit `aspect` on the platform spec wins when it's one OpenRouter knows.
  if (size.aspect && RATIOS.some(r => r.name === size.aspect)) return size.aspect
  const target = (size.width || 1) / (size.height || 1)
  return RATIOS.reduce((best, r) => (Math.abs(r.v - target) < Math.abs(best.v - target) ? r : best), RATIOS[0]).name
}

// OpenRouter takes a tier rather than pixels. Derive it from the requested long edge so
// config/imageStyle.js stays purely dimensional and provider-neutral — nothing there needs to know
// this concept exists. 2K keeps wide platform images comparable to OpenAI's 1536px output for
// about a tenth of a cent more.
function resolutionFor(size) {
  const longEdge = Math.max(size.width || 0, size.height || 0)
  if (longEdge >= 2600) return '4K'
  if (longEdge >= 1400) return '2K'
  return '1K'
}

module.exports = {
  id: 'openrouter',
  label: 'OpenRouter',
  envKey: 'OPENROUTER_API_KEY',

  models: [
    {
      id: 'black-forest-labs/flux.2-klein-4b',
      label: 'FLUX.2 Klein 4B (cheapest)',
      perMegapixel: { first: 0.014, additional: 0.001 },
    },
    {
      id: 'black-forest-labs/flux.2-pro',
      label: 'FLUX.2 Pro (best quality)',
      perMegapixel: { first: 0.03, additional: 0.015 },
    },
    {
      id: 'bytedance-seed/seedream-4.5',
      label: 'Seedream 4.5',
      perImage: 0.04,
    },
  ],

  defaultModel: 'black-forest-labs/flux.2-klein-4b',

  isConfigured() { return !!process.env.OPENROUTER_API_KEY },

  async generate({ prompt, model, size }) {
    const res = await axios.post(
      BASE,
      {
        model,
        prompt,
        // OpenRouter takes `aspect_ratio` + `resolution`, NOT width/height — sending pixels was
        // silently ignored and every image came back 1:1 regardless of the platform asked for.
        // Do not also send `size`: the docs 400 on a mismatch between size and these two.
        aspect_ratio: aspectFor(size),
        resolution: resolutionFor(size),
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.PUBLIC_URL || 'http://localhost',
          'X-Title': 'TinySparrow',
        },
        timeout: G.TIMEOUT_MS,
      },
    )

    const first = res.data?.data?.[0]
    if (!first) throw new Error('OpenRouter returned no image data')

    let buffer
    if (first.b64_json) {
      buffer = Buffer.from(first.b64_json, 'base64')
    } else if (first.url) {
      const img = await axios.get(first.url, { responseType: 'arraybuffer', timeout: G.TIMEOUT_MS })
      buffer = Buffer.from(img.data)
    } else {
      throw new Error('OpenRouter image response had neither b64_json nor url')
    }

    return {
      buffer,
      contentType: first.media_type || 'image/png',
      modelUsed: model,
      // The real billed amount, straight from the API — always beats a local price table.
      cost: typeof res.data?.usage?.cost === 'number' ? res.data.usage.cost : null,
    }
  },
}
