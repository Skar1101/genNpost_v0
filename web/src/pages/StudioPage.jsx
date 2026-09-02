import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import MediaRail from '../components/MediaRail.jsx'
import PostPreview from '../components/PostPreview.jsx'
import {
  useAssets, useCreateAsset, useUpdateAsset, usePreviewAsset, useGenerateAssetText,
  useSendAsset, useSchedule, useReschedule, useImages, useRevertAsset, useAdaptAsset, useProfile,
} from '../lib/queries.js'

const PLATFORMS = [
  { id: 'x', label: 'X', hint: 'Threads split on "Tweet 1/". No hashtags.' },
  { id: 'linkedin', label: 'LinkedIn', hint: '150-300 words, 3-5 hashtags, no links in the body.' },
  { id: 'substack', label: 'Substack', hint: 'Notes stay short; mid-posts 80-120 words. No hashtags.' },
]

function fmtSlot(iso) {
  return new Date(iso).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', weekday: 'short', day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit', hour12: true,
  })
}

// One place to make a post: write or generate it, give it a picture, save it, schedule or send it.
// Replaces the old /compose, and is also where library items are edited — so there is a single
// editor rather than one for creating and a different one for revising.
export default function StudioPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const editingId = params.get('id')

  const assetsQ = useAssets()
  const imagesQ = useImages()
  const profileQ = useProfile()
  const scheduleQ = useSchedule({ days: 7 })
  const create = useCreateAsset()
  const update = useUpdateAsset()
  const preview = usePreviewAsset()
  const genText = useGenerateAssetText()
  const send = useSendAsset()
  const reschedule = useReschedule()
  const revert = useRevertAsset()
  const adapt = useAdaptAsset()

  const [platform, setPlatform] = useState('x')
  const [text, setText] = useState('')
  const [image, setImage] = useState(null)
  const [video, setVideo] = useState(null)
  const [link, setLink] = useState(null)
  const [brief, setBrief] = useState('')
  const [assetId, setAssetId] = useState(editingId || null)
  const [dirty, setDirty] = useState(false)
  const [suggestions, setSuggestions] = useState(null)
  const [note, setNote] = useState('')
  const loadedFor = useRef(null)

  const asset = (assetsQ.data?.assets || []).find((a) => a.id === assetId) || null

  // Loading an existing item populates all three panels, so revising is the same flow as creating.
  useEffect(() => {
    if (!editingId || loadedFor.current === editingId) return
    const a = (assetsQ.data?.assets || []).find((x) => x.id === editingId)
    if (!a) return
    loadedFor.current = editingId
    setAssetId(a.id)
    setPlatform(a.platform)
    // Put the "Tweet N/" markers back when loading a thread. Splitting CONSUMES them
    // (utils/finishDraft.js), so joining the stored segments with blank lines produced text that no
    // longer re-split — a saved 3-part thread reopened as one 581-character post, which is neither
    // what was stored nor postable. Rebuilding with markers makes the round trip lossless and keeps
    // the editor in the same format you'd author a thread in.
    setText(a.platform === 'x' && a.segments.length > 1
      ? a.segments.map((s, i) => `Tweet ${i + 1}/ ${s.text}`).join('\n\n')
      : a.segments.map((s) => s.text).join('\n\n'))
    const imgId = a.segments?.[0]?.imageId
    setImage(imgId ? (imagesQ.data?.images || []).find((i) => i.id === imgId) || null : null)
    setVideo(a.segments?.[0]?.video || null)
    setLink(a.segments?.[0]?.link || null)
    setDirty(false)
  }, [editingId, assetsQ.data, imagesQ.data])

  // Live split + validation. Never mutates what you typed — purely informational.
  useEffect(() => {
    if (!text.trim()) return
    const t = setTimeout(() => preview.mutate({ text, platform }), 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, platform])

  const pv = preview.data
  const segments = pv?.segments || []
  const warnings = pv?.warnings || []

  function edit(fn) { fn(); setDirty(true); setNote('') }

  function save() {
    const body = { text, platform, origin: 'manual', polish: false, imageId: image?.id || null, videoId: video?.id || null, link }
    if (assetId) {
      // Media rides on segment 0 — the same convention the image already used.
      const segs = (pv?.segments || [{ text }]).map((s, i) => (i === 0
        ? { text: s.text, imageId: image?.id || null, videoId: video?.id || null, link: link || null }
        : { text: s.text, imageId: null }))
      update.mutate({ id: assetId, segments: segs, platform }, {
        onSuccess: () => { setDirty(false); setNote('Updated') },
      })
    } else {
      create.mutate(body, {
        onSuccess: (d) => {
          setAssetId(d.asset.id)
          setParams({ id: d.asset.id }, { replace: true })
          loadedFor.current = d.asset.id
          setDirty(false)
          setNote('Saved to library')
          setSuggestions(d.suggestions?.changes?.length ? d.suggestions : null)
        },
      })
    }
  }

  function applyPolish() {
    if (!assetId || !suggestions) return
    update.mutate(
      { id: assetId, segments: suggestions.polishedSegments, platform, note: 'house style applied' },
      { onSuccess: () => { setSuggestions(null); setText(suggestions.polishedSegments.map((s) => s.text).join('\n\n')); setNote('Polish applied') } },
    )
  }

  function generate() {
    genText.mutate({ brief, platform }, {
      onSuccess: (d) => { setText(d.text || ''); setDirty(true); setBrief(''); setNote('Generated — edit freely') },
    })
  }

  function onKeyDown(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); if (text.trim()) save() }
  }

  // Free upcoming slots, so scheduling is a pick rather than a date-typing exercise.
  const freeSlots = (scheduleQ.data?.grid || [])
    .flatMap((d) => d.cells)
    .filter((c) => !c.asset && !c.past)
    .slice(0, 12)

  const activePlatform = PLATFORMS.find((p) => p.id === platform)
  const saving = create.isPending || update.isPending
  const canSave = text.trim() && (dirty || !assetId)

  return (
    <div className="content">
      <div className="toolbar">
        <span style={{ fontSize: 13, fontWeight: 650 }}>Studio</span>
        <span className="hint">Write or generate · add a picture · save, schedule or send</span>
        <div className="spacer" style={{ flex: 1 }} />
        {assetId && <span className="hint">{dirty ? '● unsaved changes' : note || 'saved'}</span>}
        <button className="btn sm" onClick={() => navigate('/library')}>Library →</button>
        {assetId && (
          <button className="btn sm" onClick={() => {
            setAssetId(null); setText(''); setImage(null); setVideo(null); setLink(null); setSuggestions(null)
            setDirty(false); setNote(''); loadedFor.current = null; setParams({}, { replace: true })
          }}>New</button>
        )}
      </div>

      <div className="studio-two">
        {/* ── LEFT · what it will actually look like ────────────── */}
        <PostPreview
          platform={platform}
          segments={text.trim() ? (segments.length ? segments : [{ text }]) : []}
          image={image}
          video={video}
          link={link}
          profile={profileQ.data?.profile || null}
          warnings={warnings}
        />

        {/* ── RIGHT · compose, media, publish ────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
        {/* ── 1 · CONTENT ─────────────────────────────────────────── */}
        <div className="card studio-panel">
          <div className="studio-panel-head">
            <span className="studio-panel-title">Content</span>
          </div>

          <div className="choice-row" style={{ gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
            {PLATFORMS.map((p) => (
              <button key={p.id} className={`btn sm ${platform === p.id ? 'primary' : ''}`}
                onClick={() => edit(() => setPlatform(p.id))}>{p.label}</button>
            ))}
          </div>
          <div className="hint" style={{ marginBottom: 10 }}>{activePlatform.hint}</div>

          <textarea
            className="field studio-text"
            value={text}
            onChange={(e) => edit(() => setText(e.target.value))}
            onKeyDown={onKeyDown}
            placeholder={'Write or paste your post here.\n\nOr give a one-line brief below and let it draft one for you.'}
          />

          <div className="choice-row" style={{ gap: 6, marginTop: 8 }}>
            <input
              className="field" style={{ flex: 1 }}
              value={brief} onChange={(e) => setBrief(e.target.value)}
              placeholder="Brief for AI — e.g. why most AI agent demos fail in production"
              onKeyDown={(e) => { if (e.key === 'Enter' && brief.trim()) generate() }}
            />
            <button className="btn sm" onClick={generate} disabled={!brief.trim() || genText.isPending}>
              {genText.isPending ? 'Writing…' : 'Generate'}
            </button>
          </div>
          {genText.isError && <div className="hint" style={{ color: 'var(--crit)', marginTop: 6 }}>{genText.error?.message}</div>}

        </div>

        {/* ── 2 · MEDIA · picture / video / link ──────────────────── */}
        <MediaRail
          platform={platform} text={text} image={image} video={video} link={link}
          onChange={(m) => edit(() => { setImage(m.image); setVideo(m.video); setLink(m.link) })}
        />

        {/* ── 3 · PUBLISH ─────────────────────────────────────────── */}
        <div className="card studio-panel">
          <div className="studio-panel-head">
            <span className="studio-panel-title">Publish</span>
          </div>

          <button className="btn primary" style={{ width: '100%' }} onClick={save} disabled={!canSave || saving}>
            {saving ? 'Saving…' : assetId ? (dirty ? 'Update' : 'Saved') : 'Save to library'}
          </button>
          <div className="hint" style={{ marginTop: 6 }}>⌘/Ctrl + Enter</div>
          {(create.isError || update.isError) && (
            <div className="hint" style={{ color: 'var(--crit)', marginTop: 6 }}>{create.error?.message || update.error?.message}</div>
          )}

          {/* Polish is offered, never applied — this is your writing. */}
          {suggestions && (
            <div style={{ borderTop: '1px solid var(--border)', marginTop: 14, paddingTop: 12 }}>
              <div className="hint" style={{ marginBottom: 6 }}>Saved exactly as written. Available if you want it:</div>
              <ul style={{ margin: '0 0 8px', paddingLeft: 18 }}>
                {suggestions.changes.map((c, i) => <li key={i} className="hint">{c}</li>)}
              </ul>
              <div className="choice-row" style={{ gap: 6 }}>
                <button className="btn sm primary" onClick={applyPolish}>Apply</button>
                <button className="btn sm" onClick={() => setSuggestions(null)}>Keep mine</button>
              </div>
            </div>
          )}

          <div style={{ borderTop: '1px solid var(--border)', marginTop: 14, paddingTop: 12 }}>
            <div className="hint" style={{ marginBottom: 6 }}>Schedule</div>
            {!assetId ? (
              <div className="hint">Save it first.</div>
            ) : (
              <>
                {asset?.scheduledFor && (
                  <div className="hint" style={{ marginBottom: 6, color: 'var(--accent)' }}>
                    Scheduled for {fmtSlot(asset.scheduledFor)}
                  </div>
                )}
                <select
                  className="field"
                  value={asset?.scheduledFor || ''}
                  onChange={(e) => reschedule.mutate({ assetId, scheduledFor: e.target.value || null })}
                >
                  <option value="">Not scheduled</option>
                  {asset?.scheduledFor && !freeSlots.some((s) => s.iso === asset.scheduledFor) && (
                    <option value={asset.scheduledFor}>{fmtSlot(asset.scheduledFor)} (current)</option>
                  )}
                  {freeSlots.map((s) => <option key={s.iso} value={s.iso}>{fmtSlot(s.iso)}</option>)}
                </select>
                <div className="hint" style={{ marginTop: 6 }}>
                  {platform === 'linkedin'
                    ? 'LinkedIn posts for real at its slot.'
                    : `Arrives in ${platform === 'substack' ? "Heron's" : 'your'} Telegram at its slot, copy-ready.`}
                </div>
              </>
            )}
          </div>

          {/* Version history — moved here from the old library-side editor so creating, revising
              and restoring all happen in one place. */}
          {asset?.versions?.length > 1 && (
            <div style={{ borderTop: '1px solid var(--border)', marginTop: 14, paddingTop: 12 }}>
              <div className="hint" style={{ marginBottom: 6 }}>Restore a version</div>
              <div className="choice-row" style={{ gap: 6, flexWrap: 'wrap' }}>
                {asset.versions.slice(0, -1).map((v) => (
                  <button key={v.v} className="btn sm" title={v.note}
                    onClick={() => revert.mutate({ id: assetId, v: v.v }, {
                      onSuccess: (d) => {
                        setText(d.asset.segments.map((s) => s.text).join('\n\n'))
                        setDirty(false); setNote(`Restored v${v.v}`)
                      },
                    })}>v{v.v}</button>
                ))}
              </div>
            </div>
          )}

          {/* Rewrite for another platform — a real rewrite in that platform's register, saved as a
              separate library item so this one is untouched. */}
          {assetId && (
            <div style={{ borderTop: '1px solid var(--border)', marginTop: 14, paddingTop: 12 }}>
              <div className="hint" style={{ marginBottom: 6 }}>Rewrite for another platform</div>
              <div className="choice-row" style={{ gap: 6, flexWrap: 'wrap' }}>
                {PLATFORMS.filter((p) => p.id !== platform).map((p) => (
                  <button key={p.id} className="btn sm" disabled={adapt.isPending}
                    onClick={() => adapt.mutate({ id: assetId, platform: p.id }, {
                      onSuccess: (d) => setNote(`Created a ${p.label} version — in the library`),
                    })}>
                    {adapt.isPending && adapt.variables?.platform === p.id ? 'Rewriting…' : p.label}
                  </button>
                ))}
              </div>
              {adapt.isError && <div className="hint" style={{ color: 'var(--crit)', marginTop: 6 }}>{adapt.error?.message}</div>}
            </div>
          )}

          <div style={{ borderTop: '1px solid var(--border)', marginTop: 14, paddingTop: 12 }}>
            <button
              className="btn" style={{ width: '100%' }}
              disabled={!assetId || dirty || send.isPending}
              title={dirty ? 'Save your changes first' : ''}
              onClick={() => send.mutate(assetId, { onSuccess: (d) => setNote(d.mode === 'posted' ? 'Posted to LinkedIn' : 'Sent to Telegram') })}
            >
              {send.isPending ? 'Sending…' : platform === 'linkedin' ? 'Post to LinkedIn now' : 'Send to Telegram now'}
            </button>
            {send.isError && <div className="hint" style={{ color: 'var(--crit)', marginTop: 6 }}>{send.error?.message}</div>}
            {note && !send.isError && <div className="hint" style={{ marginTop: 6, color: 'var(--good)' }}>{note}</div>}
          </div>
        </div>
        </div>
      </div>
    </div>
  )
}
