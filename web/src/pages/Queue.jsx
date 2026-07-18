import { useMemo, useState } from 'react'
import DraftCard from '../components/DraftCard.jsx'
import { useQueue } from '../lib/queries.js'

const PLATFORM_LABEL = { x: 'X', linkedin: 'LinkedIn', substack: 'Substack' }

export default function Queue() {
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

  if (isLoading) {
    return (
      <div className="content">
        <div className="card placeholder"><p>Loading queue…</p></div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="content">
        <div className="card placeholder">
          <h2>Couldn’t load the queue</h2>
          <p>{error?.message || 'The backend may not be running.'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="content">
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
    </div>
  )
}
