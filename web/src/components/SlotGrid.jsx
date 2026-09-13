import { Fragment, useEffect, useState } from 'react'

const PLATFORM_CLASS = { x: 'slot-x', linkedin: 'slot-li', substack: 'slot-su' }

function dayLabel(ymd) {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return {
    dow: dt.toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'UTC' }),
    day: String(d).padStart(2, '0'),
    month: dt.toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' }),
  }
}

// The week calendar — hour rows, like any normal calendar. Drag a post onto any hour to move it;
// click an hour to write something into it. Everything is keyed by the cell's real ISO instant, so
// drag targets carry no timezone ambiguity.
//
// An hour holds as many posts as you put in it, across any mix of platforms: a bucket used to be a
// single fixed slot that one post could occupy, so scheduling X at 13:00 blocked LinkedIn at 13:00,
// and anything at 13:37 disappeared off the grid entirely.
export default function SlotGrid({ data, todayYmd, onMove, onOpen, onFill, busyIso, highlightIso }) {
  const [dragId, setDragId] = useState(null)
  const [overIso, setOverIso] = useState(null)

  // Scroll a just-scheduled cell into view and flash it, so landing here from Studio's "Set" button
  // actually shows you the post sitting on the calendar instead of just trusting it happened.
  useEffect(() => {
    if (!highlightIso) return
    const el = document.querySelector(`[data-iso="${highlightIso}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [highlightIso])

  if (!data?.grid?.length) return null

  return (
    <div className="slot-grid-wrap cal-scroll">
      <div className="slot-grid" style={{ gridTemplateColumns: `64px repeat(${data.grid.length}, minmax(120px, 1fr))` }}>
        {/* header row */}
        <div className="slot-corner" />
        {data.grid.map((day) => {
          const l = dayLabel(day.date)
          const isToday = day.date === todayYmd
          return (
            <div key={day.date} className={`slot-dayhead ${isToday ? 'today' : ''}`}>
              <span className="dow">{l.dow}</span>
              <span className="day">{l.day} {l.month}</span>
            </div>
          )
        })}

        {/* one row per slot time */}
        {data.slots.map((time, rowIdx) => (
          <Fragment key={time}>
            <div className="slot-time mono">{time}</div>
            {data.grid.map((day) => {
              const cell = day.cells[rowIdx]
              const asset = cell.asset
              // A cell can legitimately hold more than one post. `assets` is the full list; the
              // fallback keeps this working against an older server that only sends `asset`.
              const here = cell.assets || (asset ? [asset] : [])
              const isOver = overIso === cell.iso
              const busy = busyIso === cell.iso
              return (
                <div
                  key={cell.iso}
                  data-iso={cell.iso}
                  className={`slot-cell ${cell.past && !here.length ? 'past' : ''} ${isOver ? 'over' : ''} ${highlightIso === cell.iso ? 'highlighted' : ''}`}
                  onDragOver={(e) => { e.preventDefault(); setOverIso(cell.iso) }}
                  onDragLeave={() => setOverIso((c) => (c === cell.iso ? null : c))}
                  onDrop={(e) => {
                    e.preventDefault()
                    setOverIso(null)
                    if (dragId && dragId !== asset?.id) onMove(dragId, cell.iso)
                    setDragId(null)
                  }}
                  onClick={() => { if (!busy) onFill(cell.iso) }}
                >
                  {busy ? (
                    <div className="slot-empty mono">writing…</div>
                  ) : here.length ? (
                    // Every asset at this instant, not just the first — two posts could share a slot,
                    // and the calendar used to draw only one while delivery still sent both.
                    here.map((a) => (
                      <div
                        key={a.id}
                        className={`slot-chip ${PLATFORM_CLASS[a.platform] || ''} ${a.state === 'posted' ? 'done' : ''}`}
                        draggable
                        onDragStart={() => setDragId(a.id)}
                        onDragEnd={() => setDragId(null)}
                        onClick={(e) => { e.stopPropagation(); onOpen(a) }}
                        title={a.title}
                      >
                        <span className="chip-plat mono">{a.platform === 'linkedin' ? 'in' : a.platform === 'substack' ? 'sub' : 'x'}</span>
                        <span className="chip-title">{a.title}</span>
                        {a.videoId && <span className="chip-img">🎬</span>}
                        {!a.videoId && a.imageId && <span className="chip-img">🖼</span>}
                      </div>
                    ))
                  ) : null}
                  {!busy && !cell.past && (
                    <div className="slot-empty">+</div>
                  )}
                </div>
              )
            })}
          </Fragment>
        ))}
      </div>

      {data.offGrid?.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="hint" style={{ marginBottom: 6 }}>
            Scheduled off the slot grid (moved to a custom time, or the slot times changed since):
          </div>
          <div className="choice-row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {data.offGrid.map((o) => (
              <button
                key={o.asset.id} className="btn sm"
                draggable
                onDragStart={() => setDragId(o.asset.id)}
                onDragEnd={() => setDragId(null)}
                onClick={() => onOpen(o.asset)}
              >
                {o.date} {o.time} · {o.asset.platform} · {o.asset.title.slice(0, 30)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
