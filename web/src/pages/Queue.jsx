import { useMemo, useState } from 'react'
import DraftCard from '../components/DraftCard.jsx'
import { useQueue } from '../lib/queries.js'

const PLATFORM_LABEL = { x: 'X', linkedin: 'LinkedIn', substack: 'Substack' }

// Unrated drafts, awaiting a decision — unchanged from the page's original (pre-History) behavior.
function QueueTab() {
  const { data, isLoading, isError, error } = useQueue('generated')
  const [platform, setPlatform] = useState('all')

  const drafts = data?.drafts || []

  const counts = useMemo(() => {
    const byPlatform = {}
    for (const d of drafts) byPlatform[d.platform] = (byPlatform[d.platform] || 0) + 1
    return byPlatform
  }, [drafts])

  const filtered = platform === 'all' ? drafts : drafts.filter((d) => d.platform === platform)
  const platformsPresent = Object.keys(counts)

  if (isLoading) return <div className="card placeholder"><p>Loading queue…</p></div>
  if (isError) {
    return (
      <div className="card placeholder">
        <h2>Couldn’t load the queue</h2>
        <p>{error?.message || 'The backend may not be running.'}</p>
      </div>
    )
  }

  return (
    <>
      <div className="queue-bar">
        <div className="filters">
          <button className={'chip' + (platform === 'all' ? ' is-active' : '')} onClick={() => setPlatform('all')}>
            All · {drafts.length}
          </button>
          {platformsPresent.map((p) => (
            <button key={p} className={'chip' + (platform === p ? ' is-active' : '')} onClick={() => setPlatform(p)}>
              {(PLATFORM_LABEL[p] || p)} · {counts[p]}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card placeholder">
          <h2>Queue’s clear</h2>
          <p>No drafts waiting on a decision right now. New ones show up here as soon as Raven, Koel, or Quill produce them.</p>
        </div>
      ) : (
        <div className="drafts">
          {filtered.map((d) => (
            <DraftCard key={d.id} draft={d} />
          ))}
        </div>
      )}
    </>
  )
}

// Everything already decided — approved (queued/edited/posted) or rejected. The Queue tab above only
// ever shows undecided drafts; once you approve/reject in Telegram or here, the record still exists
// (this is the same draft-lifecycle store), it just had nowhere to be seen afterward. This tab reads
// it back with no filter and splits it client-side.
function HistoryTab() {
  const { data, isLoading, isError, error } = useQueue(null)
  const [section, setSection] = useState('accepted')

  const all = data?.drafts || []
  const accepted = useMemo(() => all.filter((d) => d.state === 'queued' || d.state === 'edited' || d.state === 'posted').reverse(), [all])
  const rejected = useMemo(() => all.filter((d) => d.state === 'rejected').reverse(), [all])
  const list = section === 'accepted' ? accepted : rejected

  if (isLoading) return <div className="card placeholder"><p>Loading history…</p></div>
  if (isError) {
    return (
      <div className="card placeholder">
        <h2>Couldn’t load history</h2>
        <p>{error?.message || 'The backend may not be running.'}</p>
      </div>
    )
  }

  return (
    <>
      <div className="queue-bar">
        <div className="filters">
          <button className={'chip' + (section === 'accepted' ? ' is-active' : '')} onClick={() => setSection('accepted')}>
            Accepted · {accepted.length}
          </button>
          <button className={'chip' + (section === 'rejected' ? ' is-active' : '')} onClick={() => setSection('rejected')}>
            Rejected · {rejected.length}
          </button>
        </div>
      </div>

      {list.length === 0 ? (
        <div className="card placeholder">
          <h2>Nothing here yet</h2>
          <p>
            {section === 'accepted'
              ? 'Drafts you approve (Telegram or the Queue tab) show up here — including ones already posted to LinkedIn.'
              : 'Drafts you reject (Telegram or the Queue tab) show up here, with the reason.'}
          </p>
        </div>
      ) : (
        <div className="drafts">
          {list.map((d) => (
            <DraftCard key={d.id} draft={d} />
          ))}
        </div>
      )}
    </>
  )
}

export default function Queue() {
  const [tab, setTab] = useState('queue')

  return (
    <div className="content">
      <div className="toolbar" style={{ marginBottom: 18 }}>
        <div className="tabs">
          <button className={tab === 'queue' ? 'is-active' : ''} onClick={() => setTab('queue')}>Queue</button>
          <button className={tab === 'history' ? 'is-active' : ''} onClick={() => setTab('history')}>Accepted &amp; Rejected</button>
        </div>
      </div>

      {tab === 'queue' ? <QueueTab /> : <HistoryTab />}
    </div>
  )
}
