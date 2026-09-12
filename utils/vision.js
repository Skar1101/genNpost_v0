// Turns an uploaded photo into text a text-only writer (Koel/Parrot) can write from. This is the
// opposite direction of tools/generateImage.js (which makes a NEW image from a text prompt) — this
// looks at an EXISTING image and describes it, so a Telegram photo + caption like "write a post about
// this" has real content to ground the draft in, not just the caption words.
const llm = require('./llm')
const costTracker = require('./costTracker')

async function describeImage({ buffer, contentType = 'image/jpeg', instruction = '' } = {}) {
  if (!buffer) throw new Error('vision.describeImage needs an image buffer')
  const dataUrl = `data:${contentType};base64,${buffer.toString('base64')}`
  const messages = [
    {
      role: 'system',
      content: 'Describe exactly what is shown in this image — the scene, any visible text or quotes, mood, and colors — in 2-4 concrete sentences. This will be handed to a copywriter as source material for a social media post, so be specific and literal about what is actually visible. Do not write the post yourself.',
    },
    {
      role: 'user',
      content: [
        { type: 'text', text: instruction ? `Context from the person who sent this photo: "${instruction}"` : 'Describe this image.' },
        { type: 'image_url', image_url: { url: dataUrl } },
      ],
    },
  ]
  const response = await llm.chat({ model: 'openai/gpt-4o-mini', messages, temperature: 0.3, max_tokens: 300 })
  costTracker.priceAndRecord({ agent: 'titto', action: 'vision_describe', modelId: 'openai/gpt-4o-mini', usage: response.usage })
  return (response.choices?.[0]?.message?.content || '').trim()
}

module.exports = { describeImage }
