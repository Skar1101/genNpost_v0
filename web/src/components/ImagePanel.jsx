import { useRef, useState } from 'react'
import { useImages, useGenerateImage, useUploadImage } from '../lib/queries.js'

// The Studio's picture panel. Three ways in, deliberately — a picture may already exist, may need
// making now, or may have been produced outside the app entirely. "Pick from gallery" is the one
// that makes "make it separately, club it later" actually work; without it the only way to attach
// an image was to generate or upload it in the same sitting.
export default function ImagePanel({ platform, text, image, onChange }) {
  const imagesQ = useImages()
  const generate = useGenerateImage()
  const upload = useUploadImage()
  const fileRef = useRef(null)
  const [browsing, setBrowsing] = useState(false)

  const gallery = imagesQ.data?.images || []

  function readFile(file) {
    if (!file?.type?.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => upload.mutate(
      { data: reader.result, contentType: file.type, platform },
      { onSuccess: (d) => { onChange(d.image); setBrowsing(false) } },
    )
    reader.readAsDataURL(file)
  }

  const busy = generate.isPending || upload.isPending

  return (
    <div className="card studio-panel">
      <div className="studio-panel-head">
        <span className="studio-panel-title">Picture</span>
        {image && <button className="btn sm" onClick={() => onChange(null)}>Remove</button>}
      </div>

      <div
        className="studio-dropzone"
        onDrop={(e) => { e.preventDefault(); readFile(e.dataTransfer?.files?.[0]) }}
        onDragOver={(e) => e.preventDefault()}
        onPaste={(e) => {
          const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'))
          if (item) { e.preventDefault(); readFile(item.getAsFile()) }
        }}
      >
        {image ? (
          <img src={image.url} alt="" className="studio-image" />
        ) : (
          <div className="hint" style={{ textAlign: 'center', padding: '28px 12px' }}>
            No picture yet.<br />Generate one, upload, or pick from the gallery.
          </div>
        )}
      </div>

      {image && (
        <div className="hint" style={{ marginTop: 6 }}>
          {image.source === 'upload' ? 'Uploaded' : `${image.provider}/${image.model}`}
          {image.cost != null ? ` · $${image.cost}` : ''}
        </div>
      )}

      <div className="choice-row" style={{ gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
        <button
          className="btn sm"
          disabled={!text.trim() || busy}
          title={!text.trim() ? 'Write the post first — the picture is derived from what it means' : ''}
          onClick={() => generate.mutate({ text, platform }, { onSuccess: (d) => onChange(d.image) })}
        >
          {generate.isPending ? 'Generating…' : 'Generate'}
        </button>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => readFile(e.target.files?.[0])} />
        <button className="btn sm" disabled={busy} onClick={() => fileRef.current?.click()}>
          {upload.isPending ? 'Uploading…' : 'Upload'}
        </button>
        <button className="btn sm" onClick={() => setBrowsing((b) => !b)}>
          {browsing ? 'Close gallery' : `Gallery (${gallery.length})`}
        </button>
      </div>

      {(generate.isError || upload.isError) && (
        <div className="hint" style={{ color: 'var(--crit)', marginTop: 8 }}>
          {generate.error?.message || upload.error?.message}
        </div>
      )}

      {browsing && (
        <div className="studio-gallery">
          {gallery.length === 0 ? (
            <div className="hint">Nothing in the gallery yet — make some on the Image page.</div>
          ) : (
            gallery.map((img) => (
              <img
                key={img.id}
                src={img.url}
                alt=""
                className={`studio-gallery-thumb ${image?.id === img.id ? 'selected' : ''}`}
                title={img.subject || img.platform}
                onClick={() => { onChange(img); setBrowsing(false) }}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}
