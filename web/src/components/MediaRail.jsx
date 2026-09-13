import { useRef, useState } from 'react'
import { useImages, useGenerateImage, useUploadImage, useVideos, useUploadVideo, useLinkCard } from '../lib/queries.js'

// Picture · video · link in one place, because they're alternatives to each other rather than
// separate concerns — a post carries one of them. Image and video are mutually exclusive: picking
// one clears the other, so the preview never has to guess which to show.
export default function MediaRail({ platform, text, image, video, link, onChange, onGenerateFromImage, generatingFromImage = false }) {
  const [tab, setTab] = useState('picture')
  const [gallery, setGallery] = useState(false)
  const [url, setUrl] = useState('')
  const [err, setErr] = useState('')
  const imgInput = useRef(null)
  const vidInput = useRef(null)

  const images = useImages()
  const videos = useVideos()
  const genImage = useGenerateImage()
  const upImage = useUploadImage()
  const upVideo = useUploadVideo()
  const linkCard = useLinkCard()

  const set = (patch) => onChange({ image, video, link, ...patch })

  function pickImageFile(file) {
    if (!file?.type?.startsWith('image/')) return
    setErr('')
    const reader = new FileReader()
    reader.onload = () => {
      upImage.mutate({ data: reader.result, contentType: file.type, platform }, {
        onSuccess: (d) => set({ image: d.image, video: null }),
        onError: (e) => setErr(e.message),
      })
    }
    reader.readAsDataURL(file)
  }

  function pickVideoFile(file) {
    if (!file?.type?.startsWith('video/')) { setErr('That is not a video file'); return }
    setErr('')
    upVideo.mutate(file, {
      onSuccess: (d) => set({ video: d.video, image: null }),
      onError: (e) => setErr(e.message),
    })
  }

  function fetchLink() {
    const u = url.trim()
    if (!u) return
    setErr('')
    linkCard.mutate({ url: u }, {
      onSuccess: (d) => { set({ link: d.card }); setUrl('') },
      onError: (e) => setErr(e.message),
    })
  }

  const busy = genImage.isPending || upImage.isPending || upVideo.isPending || linkCard.isPending

  return (
    <div className="card studio-panel">
      <div className="hint" style={{ fontWeight: 700, letterSpacing: '.05em', marginBottom: 8 }}>MEDIA</div>

      <div className="choice-row" style={{ gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        {['picture', 'video', 'link'].map((t) => (
          <button key={t} className={`btn sm${tab === t ? ' primary' : ''}`} onClick={() => setTab(t)}>
            {t === 'picture' ? '🖼 Picture' : t === 'video' ? '🎬 Video' : '🔗 Link'}
            {t === 'picture' && image ? ' ✓' : ''}{t === 'video' && video ? ' ✓' : ''}{t === 'link' && link ? ' ✓' : ''}
          </button>
        ))}
      </div>

      {err && <div className="pv-warn error" style={{ marginBottom: 8 }}>{err}</div>}

      {tab === 'picture' && (
        <>
          <div
            className="studio-dropzone"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); pickImageFile(e.dataTransfer.files?.[0]) }}
            onPaste={(e) => { const f = [...(e.clipboardData?.files || [])][0]; if (f) pickImageFile(f) }}
          >
            {image
              ? <img src={image.url} alt="" style={{ maxWidth: '100%', borderRadius: 8, display: 'block' }} />
              : <div className="hint">Drop or paste an image, or use the buttons below.</div>}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            {image && <button className="btn sm" onClick={() => set({ image: null })}>Remove</button>}
            <button className="btn sm" disabled={busy || !text.trim()} onClick={() => genImage.mutate({ text, platform }, { onSuccess: (d) => set({ image: d.image, video: null }), onError: (e) => setErr(e.message) })}>
              {genImage.isPending ? 'Generating…' : 'Generate'}
            </button>
            <button className="btn sm" disabled={busy} onClick={() => imgInput.current?.click()}>Upload</button>
            <button className="btn sm" onClick={() => setGallery((g) => !g)}>Gallery ({images.data?.images?.length || 0})</button>
            <input ref={imgInput} type="file" accept="image/*" hidden onChange={(e) => pickImageFile(e.target.files?.[0])} />
          </div>
          {/* Reverse of Generate above (image -> text instead of text -> image) — vision-grounded,
              same pipeline Telegram's photo-grounded generation uses. Only makes sense once a photo
              is actually attached. */}
          {image && onGenerateFromImage && (
            <button
              className="btn sm primary" style={{ marginTop: 8 }}
              disabled={busy || generatingFromImage}
              onClick={() => onGenerateFromImage(image.id)}
            >
              {generatingFromImage ? 'Writing from photo…' : '✨ Write post from this photo'}
            </button>
          )}
          {gallery && (
            <div className="media-gallery">
              {(images.data?.images || []).slice(0, 24).map((im) => (
                <button key={im.id} className="media-thumb" onClick={() => { set({ image: im, video: null }); setGallery(false) }}>
                  <img src={im.url} alt="" />
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'video' && (
        <>
          <div
            className="studio-dropzone"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); pickVideoFile(e.dataTransfer.files?.[0]) }}
          >
            {video
              ? <video src={video.url} controls style={{ maxWidth: '100%', borderRadius: 8, display: 'block' }} />
              : <div className="hint">Drop an mp4, mov or webm — up to 200MB.</div>}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {video && <button className="btn sm" onClick={() => set({ video: null })}>Remove</button>}
            <button className="btn sm" disabled={busy} onClick={() => vidInput.current?.click()}>
              {upVideo.isPending ? 'Uploading…' : 'Upload video'}
            </button>
            <button className="btn sm" onClick={() => setGallery((g) => !g)}>Recent ({videos.data?.videos?.length || 0})</button>
            <input ref={vidInput} type="file" accept="video/mp4,video/quicktime,video/webm" hidden onChange={(e) => pickVideoFile(e.target.files?.[0])} />
          </div>
          {video && <div className="hint" style={{ marginTop: 6 }}>{(video.bytes / 1048576).toFixed(1)}MB · {video.contentType}</div>}
          {gallery && (
            <div className="media-gallery">
              {(videos.data?.videos || []).slice(0, 12).map((v) => (
                <button key={v.id} className="media-thumb" onClick={() => { set({ video: v, image: null }); setGallery(false) }}>
                  <video src={v.url} preload="metadata" />
                </button>
              ))}
            </div>
          )}
          <div className="hint" style={{ marginTop: 8 }}>
            {platform === 'linkedin'
              ? 'LinkedIn posts the video for real at its slot.'
              : 'X and Substack get a download link in Telegram — you post the video yourself.'}
          </div>
        </>
      )}

      {tab === 'link' && (
        <>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              className="field" placeholder="https://…" value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchLink()}
            />
            <button className="btn sm" onClick={fetchLink} disabled={busy || !url.trim()}>
              {linkCard.isPending ? 'Reading…' : 'Fetch'}
            </button>
          </div>
          {link && (
            <div style={{ marginTop: 10 }}>
              <div className="hint" style={{ marginBottom: 4 }}>{link.siteName}</div>
              <div style={{ fontWeight: 600 }}>{link.title}</div>
              {link.description && <div className="hint" style={{ marginTop: 3 }}>{link.description}</div>}
              <button className="btn sm" style={{ marginTop: 8 }} onClick={() => set({ link: null })}>Remove link</button>
            </div>
          )}
          {platform === 'linkedin' && link && (
            <div className="pv-warn warn" style={{ marginTop: 8 }}>
              ⚠️ LinkedIn suppresses reach on posts with links. Consider putting it in the first comment.
            </div>
          )}
        </>
      )}
    </div>
  )
}
