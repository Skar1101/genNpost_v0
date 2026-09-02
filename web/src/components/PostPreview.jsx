// What the post will actually look like once it's live.
//
// The old "Preview" was a chat bubble of plain text that never showed the attached image — text and
// picture were rendered in different columns and never together, so there was no way to judge the
// finished post before publishing it. Each platform renders its own chrome here because the same
// words genuinely look different on each: X splits into a connected thread, LinkedIn folds at
// ~140 characters, Substack is an article.
//
// Purely presentational — it renders what it's given and never mutates the draft.

const X_LIMIT = 280
const LI_FOLD = 140

function initials(name) {
  return String(name || 'You').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
}

function Avatar({ name, size = 40 }) {
  return (
    <div className="pv-avatar" style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {initials(name)}
    </div>
  )
}

// Image and video share a frame so swapping one for the other doesn't reflow the preview.
function Media({ image, video, rounded = 12 }) {
  if (video) {
    return (
      <div className="pv-media" style={{ borderRadius: rounded }}>
        <video src={video.url} controls preload="metadata" className="pv-video" />
      </div>
    )
  }
  if (image) {
    return (
      <div className="pv-media" style={{ borderRadius: rounded }}>
        <img src={image.url} alt="" className="pv-img" />
      </div>
    )
  }
  return null
}

function LinkCard({ link, compact = false }) {
  if (!link) return null
  let host = ''
  try { host = new URL(link.url).hostname.replace(/^www\./, '') } catch (_) { host = link.url }
  return (
    <a className={`pv-linkcard${compact ? ' compact' : ''}`} href={link.url} target="_blank" rel="noreferrer">
      {link.image && <div className="pv-linkcard-img"><img src={link.image} alt="" /></div>}
      <div className="pv-linkcard-body">
        <div className="pv-linkcard-host">{host}</div>
        <div className="pv-linkcard-title">{link.title || link.url}</div>
        {link.description && <div className="pv-linkcard-desc">{link.description}</div>}
      </div>
    </a>
  )
}

// ── X ─────────────────────────────────────────────────────────────────────────
// A thread, not a list: the connector line down the avatar gutter is what makes a multi-segment
// draft read as one thread rather than several unrelated posts.
function XPreview({ segments, image, video, link, name, handle }) {
  return (
    <div className="pv-x">
      {segments.map((s, i) => {
        const len = s.text.length
        const over = len > X_LIMIT
        const isLast = i === segments.length - 1
        return (
          <div className="pv-x-tweet" key={i}>
            <div className="pv-x-gutter">
              <Avatar name={name} />
              {!isLast && <div className="pv-thread-line" />}
            </div>
            <div className="pv-x-body">
              <div className="pv-x-head">
                <span className="pv-name">{name}</span>
                <span className="pv-handle">@{handle}</span>
                <span className="pv-dot">·</span>
                <span className="pv-handle">now</span>
              </div>
              <div className="pv-text">{s.text || <span className="pv-placeholder">Your post…</span>}</div>
              {i === 0 && <Media image={image} video={video} rounded={16} />}
              {i === 0 && <LinkCard link={link} />}
              <div className="pv-x-actions">
                <span>💬</span><span>🔁</span><span>♡</span><span>📊</span>
                <span className={`pv-count${over ? ' over' : ''}`}>{len}/{X_LIMIT}</span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── LinkedIn ──────────────────────────────────────────────────────────────────
// The fold is the thing worth seeing: everything past ~140 characters is hidden behind "see more",
// so the first two lines decide whether the post gets read at all.
function LinkedInPreview({ segments, image, video, link, name, headline }) {
  const full = segments.map((s) => s.text).join('\n\n')
  const folded = full.length > LI_FOLD
  const head = folded ? full.slice(0, LI_FOLD) : full

  return (
    <div className="pv-li">
      <div className="pv-li-head">
        <Avatar name={name} size={48} />
        <div>
          <div className="pv-name">{name}</div>
          <div className="pv-li-headline">{headline}</div>
          <div className="pv-handle">now · 🌐</div>
        </div>
      </div>
      <div className="pv-text pv-li-text">
        {head || <span className="pv-placeholder">Your post…</span>}
        {folded && <><span className="pv-fold">…</span> <span className="pv-seemore">see more</span></>}
      </div>
      <Media image={image} video={video} rounded={0} />
      <LinkCard link={link} compact />
      <div className="pv-li-actions">
        <span>👍 Like</span><span>💬 Comment</span><span>🔁 Repost</span><span>➤ Send</span>
      </div>
      {folded && (
        <div className="pv-note">
          Folds after {LI_FOLD} characters — {full.length - LI_FOLD} hidden behind “see more”.
        </div>
      )}
    </div>
  )
}

// ── Substack ──────────────────────────────────────────────────────────────────
function SubstackPreview({ segments, image, video, link, name }) {
  const [first, ...rest] = segments
  const title = (first?.text || '').split('\n')[0] || 'Untitled'
  const body = [(first?.text || '').split('\n').slice(1).join('\n'), ...rest.map((s) => s.text)]
    .filter(Boolean).join('\n\n')

  return (
    <div className="pv-su">
      <div className="pv-su-title">{title}</div>
      <div className="pv-su-byline">{name} · now</div>
      <Media image={image} video={video} rounded={6} />
      <div className="pv-text pv-su-body">
        {body || <span className="pv-placeholder">Your article…</span>}
      </div>
      <LinkCard link={link} compact />
    </div>
  )
}

export default function PostPreview({
  platform = 'x', segments = [], image = null, video = null, link = null,
  profile = null, warnings = [],
}) {
  const name = profile?.identity?.name || 'You'
  const handle = profile?.identity?.handle || 'you'
  const headline = profile?.identity?.niche || ''
  const segs = segments.length ? segments : [{ text: '' }]

  return (
    <div className="pv-wrap">
      <div className="pv-chrome">
        <span className="pv-chrome-label">
          {platform === 'x' ? 'X' : platform === 'linkedin' ? 'LinkedIn' : 'Substack'} preview
        </span>
        {segs.length > 1 && <span className="hint">{segs.length} parts</span>}
      </div>

      <div className="pv-frame">
        {platform === 'x' && <XPreview segments={segs} image={image} video={video} link={link} name={name} handle={handle} />}
        {platform === 'linkedin' && <LinkedInPreview segments={segs} image={image} video={video} link={link} name={name} headline={headline} />}
        {platform === 'substack' && <SubstackPreview segments={segs} image={image} video={video} link={link} name={name} />}
      </div>

      {warnings.length > 0 && (
        <div className="pv-warnings">
          {warnings.map((w, i) => (
            <div key={i} className={`pv-warn ${w.level}`}>
              {w.level === 'error' ? '⛔' : '⚠️'} {w.message}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
