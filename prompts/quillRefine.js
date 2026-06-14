// Refinement prompt for Quill. Rewrites an existing draft per the user's instruction
// while preserving Souvik's voice and the chosen format's length rules.

const FORMAT_LENGTH_RULES = {
  long:   'LENGTH: 400–900 characters, one cohesive single post. Personal/build-in-public voice. Line breaks every 1–2 sentences.',
  thread: 'LENGTH: strictly 3–5 tweets. Number each "Tweet 1/" "Tweet 2/" etc. Tweet 1 is the hook. Last tweet has a soft CTA.',
  medium: 'LENGTH: 150–260 characters. Punchy single post.',
  short:  'LENGTH: max 280 characters. Hook in line 1. Punchy close.',
}

function buildRefinePrompt({ draftText, instruction, format = 'short' }) {
  const lengthRule = FORMAT_LENGTH_RULES[format] || FORMAT_LENGTH_RULES.short
  return `REFINEMENT MODE — rewrite the draft below per the user's instruction.

USER INSTRUCTION (highest priority):
${instruction}

FORMAT: ${format.toUpperCase()}
${lengthRule}

RULES:
- Preserve Souvik's voice (substantive, build-in-public, no AI-slop fluff)
- Keep the core point unless the instruction asks to change it
- Output ONLY the rewritten post — no preamble, no "Here is the revised…", no DRAFT separators
- Do not add hashtags unless explicitly asked

ORIGINAL DRAFT:
${draftText}

Rewrite now.`
}

module.exports = { buildRefinePrompt, FORMAT_LENGTH_RULES }
