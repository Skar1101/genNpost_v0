// The house visual style. This is the image equivalent of prompts/styleRules.js — one spec, applied
// to every generation, with an explicit never-produce list.
//
// The failure mode for AI imagery is the same as for AI text: instantly recognisable genre output.
// A glowing brain over a circuit board says "generated" as loudly as "in today's fast-paced world"
// does. The NEVER list exists to keep that off the feed.
//
// Edit this file to change how every generated image looks. Once ~15-20 images have been approved,
// that set becomes the training data for a Flux LoRA on fal.ai — at which point this spec stays as
// the prompt layer on top of a model that already knows the look.

module.exports = {
  // The core look, injected into every prompt.
  style: [
    'editorial photography',
    'natural light, single dominant light source',
    'muted, restrained colour palette — deep neutrals with one warm accent',
    'shallow depth of field',
    'documentary framing, slightly off-centre subject, generous negative space',
    'film grain, subtle imperfection, nothing over-polished',
  ],

  // Composition rules that keep images usable as social assets.
  composition: [
    'one clear subject, no busy collage',
    'space in the frame where text could sit without covering the subject',
    'reads clearly at thumbnail size',
  ],

  // Hard bans. These are the tells that make an image look machine-made.
  never: [
    'glowing brains, neon circuit boards, humanoid robots, floating holograms',
    'cyberpunk neon, lens flares, HDR over-saturation',
    'stock-photo business clichés — handshakes, people pointing at charts, suited figures on white',
    'text, letters, numbers, logos, watermarks or UI chrome rendered inside the image',
    'literal illustrations of metaphors (a lightbulb for an idea, a rocket for growth, chess for strategy)',
    'faces of identifiable real people',
    'six-fingered hands, warped anatomy, extra limbs',
    'collage or split-screen layouts',
  ],

  // Per-platform output dimensions, expressed provider-neutrally. Each provider in
  // utils/imageProviders/ translates these into whatever its own API wants (fal takes named sizes,
  // OpenAI takes WxH strings, OpenRouter takes pixels) — so adding a provider never means editing
  // this file.
  platformSpec: {
    x:        { width: 1536, height: 1024, aspect: '3:2',  note: 'inline X image, wide' },
    linkedin: { width: 1024, height: 1024, aspect: '1:1',  note: 'LinkedIn feed square' },
    substack: { width: 1536, height: 1024, aspect: '3:2',  note: 'Substack header, wide' },
  },

  defaultPlatform: 'x',
}
