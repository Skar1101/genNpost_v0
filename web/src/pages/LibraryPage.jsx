import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAssets, useImages, useDeleteAsset } from '../lib/queries.js'

const PLATFORMS = [
  { id: null, label: 'All' },
  { id: 'x', label: 'X' },
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'substack', label: 'Substack' },
]

function timeAgo(iso) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function AssetRow({ asset, image, active, onOpen, onDelete }) {
  const errors = (asset.warnings || []).filter((w) => w.level === 'error').length
  return (
    <div
      className="activity-row"
      style={{ cursor: 'pointer', borderColor: active ? 'var(--accent)' : undefined }}
      onClick={onOpen}
    >
      {image ? (
        <img src={image.url} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6, flex: 'none' }} />
      ) : (
        <span className="sdot good" />
      )}
      <span className="agent-badge">{asset.platform}</span>
      <div className="body">
        <div className="main">{asset.title || '(empty)'}</div>
        <div className="sub">
          {asset.origin} · {asset.segments.length} segment{asset.segments.length === 1 ? '' : 's'} · v{asset.versions?.length || 1}
          {errors > 0 && <span style={{ color: 'var(--crit)' }}> · {errors} blocking issue{errors === 1 ? '' : 's'}</span>}
        </div>
      </div>
      <span className={`run-trigger`}>{asset.state}</span>
      <span className="time">{timeAgo(asset.updatedAt)}</span>
      <button className="btn sm" onClick={(e) => { e.stopPropagation(); onDelete() }}>Delete</button>
    </div>
  )
}

export default function LibraryPage() {
  const navigate = useNavigate()
  const [platform, setPlatform] = useState(null)

  const assetsQ = useAssets({ platform })
  const imagesQ = useImages()
  const del = useDeleteAsset()

  const assets = assetsQ.data?.assets || []
  const images = imagesQ.data?.images || []

  return (
    <div className="content">
      <div className="toolbar">
        <span style={{ fontSize: 13, fontWeight: 650 }}>Library</span>
        <span className="hint">Finished, editable work — every edit keeps its history</span>
        <div className="spacer" style={{ flex: 1 }} />
        <button className="btn sm primary" onClick={() => navigate('/studio')}>+ New</button>
        <button className="btn sm" onClick={() => assetsQ.refetch()}>↻ Refresh</button>
      </div>

      <div className="choice-row" style={{ gap: 8, marginBottom: 14 }}>
        {PLATFORMS.map((p) => (
          <button
            key={p.label}
            className={`btn sm ${platform === p.id ? 'primary' : ''}`}
            onClick={() => setPlatform(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div>
          {assetsQ.isLoading ? (
            <div className="card placeholder"><p>Loading library…</p></div>
          ) : assets.length === 0 ? (
            <div className="card placeholder">
              <h2>Nothing in the library yet</h2>
              <p>
                Anything you make in the <strong>Studio</strong> lands here — text, picture and all —
                editable, versioned and ready to schedule. Start with <strong>+ New</strong>.
              </p>
            </div>
          ) : (
            assets.map((a) => (
              <AssetRow
                key={a.id}
                asset={a}
                image={images.find((i) => i.id === a.segments?.[0]?.imageId) || null}
                onOpen={() => navigate('/studio?id=' + a.id)}
                onDelete={() => del.mutate(a.id)}
              />
            ))
          )}
      </div>
    </div>
  )
}
