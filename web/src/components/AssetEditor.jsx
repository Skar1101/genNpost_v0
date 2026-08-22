import { useEffect, useState } from 'react'
import { useUpdateAsset, useRevertAsset, useGenerateImage, useImages, useAdaptAsset } from '../lib/queries.js'

const OTHER_PLATFORMS = { x: ['linkedin', 'substack'], linkedin: ['x', 'substack'], substack: ['x', 'linkedin'] }
const PLATFORM_LABEL = { x: 'X', linkedin: 'LinkedIn', substack: 'Substack' }

const LIMIT = { x: 280, linkedin: 3000, substack: 5000 }

function WarningList({ warnings }) {
  if (!warnings?.length) return null
  return (
    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
      {warnings.map((w, i) => (
        <div key={i} className="hint" style={{ color: w.level === 'error' ? 'var(--crit)' : 'var(--warn, var(--muted))' }}>
          {w.level === 'error' ? '✗' : '!'} {w.message}
        </div>
      ))}
    </div>
  )
}

// Edit an asset in place. Saving appends a version rather than overwriting, so every earlier state
// stays restorable from the version list.
export default function AssetEditor({ asset, onClose }) {
  const update = useUpdateAsset()
  const revert = useRevertAsset()
  const genImage = useGenerateImage()
  const imagesQ = useImages()
  const adapt = useAdaptAsset()

  const [segments, setSegments] = useState(asset.segments)
  const [dirty, setDirty] = useState(false)

  useEffect(() => { setSegments(asset.segments); setDirty(false) }, [asset.id, asset.updatedAt])

  const images = imagesQ.data?.images || []
  const imageById = (id) => images.find((i) => i.id === id) || null
  const limit = LIMIT[asset.platform] || LIMIT.x

  function setSegText(i, text) {
    setSegments((s) => s.map((seg, idx) => (idx === i ? { ...seg, text } : seg)))
    setDirty(true)
  }

  function addSegment() {
    setSegments((s) => [...s, { text: '', imageId: null }])
    setDirty(true)
  }

  function removeSegment(i) {
    setSegments((s) => s.filter((_, idx) => idx !== i))
    setDirty(true)
  }

  function save() {
    update.mutate({ id: asset.id, segments, platform: asset.platform }, { onSuccess: () => setDirty(false) })
  }

  function makeImage() {
    const text = segments.map((s) => s.text).join('\n\n')
    genImage.mutate(
      { text, platform: asset.platform },
      {
        onSuccess: (data) => {
          const id = data?.image?.id
          if (!id) return
          const next = segments.map((s, idx) => (idx === 0 ? { ...s, imageId: id } : s))
          setSegments(next)
          update.mutate({ id: asset.id, segments: next, platform: asset.platform, note: 'image attached' })
        },
      },
    )
  }

  const heroImage = imageById(segments[0]?.imageId)

  return (
    <div className="card" style={{ padding: 18 }}>
      <div className="choice-row" style={{ alignItems: 'center', marginBottom: 12 }}>
        <span className={`agent-badge`}>{asset.platform}</span>
        <span className="hint">{asset.origin} · {asset.state} · v{asset.versions?.length || 1}</span>
        <div className="spacer" style={{ flex: 1 }} />
        <button className="btn sm" onClick={onClose}>Close</button>
      </div>

      {segments.map((seg, i) => {
        const over = seg.text.length > limit
        return (
          <div key={i} style={{ marginBottom: 12 }}>
            <div className="choice-row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
              <span className="hint">
                {segments.length > 1 ? `${asset.platform === 'x' ? 'Tweet' : 'Part'} ${i + 1}` : 'Post'}
              </span>
              <span className="mono hint" style={{ color: over ? 'var(--crit)' : 'var(--faint)' }}>
                {seg.text.length}/{limit}
                {segments.length > 1 && (
                  <button className="btn sm" style={{ marginLeft: 8 }} onClick={() => removeSegment(i)}>Remove</button>
                )}
              </span>
            </div>
            <textarea
              className="field"
              rows={asset.platform === 'x' ? 4 : 10}
              value={seg.text}
              onChange={(e) => setSegText(i, e.target.value)}
              style={over ? { borderColor: 'var(--crit)' } : undefined}
            />
          </div>
        )
      })}

      {asset.platform === 'x' && (
        <button className="btn sm" onClick={addSegment} style={{ marginBottom: 12 }}>+ Add tweet</button>
      )}

      <WarningList warnings={asset.warnings} />

      {/* Image */}
      <div style={{ borderTop: '1px solid var(--border)', marginTop: 14, paddingTop: 14 }}>
        <div className="choice-row" style={{ alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontWeight: 650, fontSize: 13 }}>Image</span>
          <button className="btn sm" onClick={makeImage} disabled={genImage.isPending}>
            {genImage.isPending ? 'Generating…' : heroImage ? 'Regenerate' : 'Generate image'}
          </button>
          {genImage.isError && <span className="hint" style={{ color: 'var(--crit)' }}>{genImage.error?.message}</span>}
        </div>
        {heroImage ? (
          <div>
            <img src={heroImage.url} alt="" style={{ maxWidth: '100%', borderRadius: 8, display: 'block' }} />
            <div className="hint" style={{ marginTop: 6 }}>
              {heroImage.provider}/{heroImage.model} · ${heroImage.cost ?? '—'}
              {heroImage.subject ? ` · ${heroImage.subject}` : ''}
            </div>
          </div>
        ) : (
          <div className="hint">No image attached.</div>
        )}
      </div>

      {/* Adapt for another platform — a real rewrite in that platform's register, saved as a new
          asset so this one is untouched. */}
      <div style={{ borderTop: '1px solid var(--border)', marginTop: 14, paddingTop: 14 }}>
        <div className="choice-row" style={{ alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 650, fontSize: 13 }}>Adapt for</span>
          {(OTHER_PLATFORMS[asset.platform] || []).map((p) => (
            <button
              key={p}
              className="btn sm"
              disabled={adapt.isPending}
              onClick={() => adapt.mutate({ id: asset.id, platform: p })}
            >
              {adapt.isPending && adapt.variables?.platform === p ? 'Rewriting…' : PLATFORM_LABEL[p]}
            </button>
          ))}
        </div>
        <div className="hint" style={{ marginTop: 6 }}>
          Rewrites the idea for that platform's reader — not a reformat. Lands as a new library item.
        </div>
        {adapt.isError && <div className="hint" style={{ color: 'var(--crit)', marginTop: 6 }}>{adapt.error?.message}</div>}
        {adapt.isSuccess && <div className="hint" style={{ color: 'var(--good)', marginTop: 6 }}>Created a {PLATFORM_LABEL[adapt.data?.asset?.platform]} version — it's in the list.</div>}
      </div>

      {/* Save + versions */}
      <div className="choice-row" style={{ gap: 8, marginTop: 16, alignItems: 'center' }}>
        <button className="btn primary sm" onClick={save} disabled={!dirty || update.isPending}>
          {update.isPending ? 'Saving…' : dirty ? 'Save as new version' : 'Saved'}
        </button>
        {asset.versions?.length > 1 && (
          <>
            <span className="hint">Restore:</span>
            {asset.versions.slice(0, -1).map((v) => (
              <button key={v.v} className="btn sm" title={v.note} onClick={() => revert.mutate({ id: asset.id, v: v.v })}>
                v{v.v}
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
