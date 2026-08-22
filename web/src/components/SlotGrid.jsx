import { Fragment, useState } from 'react'

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

// The week grid. Drag a scheduled asset onto any cell to move it; click an empty cell to write
// something into that slot. Everything is keyed by the cell's real ISO instant, so drag targets
// carry no ambiguity about timezone.
export default function SlotGrid({ data, todayYmd, onMove, onOpen, onFill, busyIso }) {
  const [dragId, setDragId] = useState(null)
  const [overIso, setOverIso] = useState(null)

  if (!data?.grid?.length) return null

  return (
    <div className="slot-grid-wrap">
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
              const isOver = overIso === cell.iso
              const busy = busyIso === cell.iso
              return (
                <div
                  key={cell.iso}
                  className={`slot-cell ${cell.past && !asset ? 'past' : ''} ${isOver ? 'over' : ''}`}
                  onDragOver={(e) => { e.preventDefault(); setOverIso(cell.iso) }}
                  onDragLeave={() => setOverIso((c) => (c === cell.iso ? null : c))}
                  onDrop={(e) => {
                    e.preventDefault()
                    setOverIso(null)
                    if (dragId && dragId !== asset?.id) onMove(dragId, cell.iso)
                    setDragId(null)
                  }}
                  onClick={() => { if (!asset && !busy) onFill(cell.iso) }}
                >
                  {busy ? (
                    <div className="slot-empty mono">writing…</div>
                  ) : asset ? (
                    <div
                      className={`slot-chip ${PLATFORM_CLASS[asset.platform] || ''} ${asset.state === 'posted' ? 'done' : ''}`}
                      draggable
                      onDragStart={() => setDragId(asset.id)}
                      onDragEnd={() => setDragId(null)}
                      onClick={(e) => { e.stopPropagation(); onOpen(asset) }}
                      title={asset.title}
                    >
                      <span className="chip-plat mono">{asset.platform === 'linkedin' ? 'in' : asset.platform === 'substack' ? 'sub' : 'x'}</span>
                      <span className="chip-title">{asset.title}</span>
                      {asset.imageId && <span className="chip-img">🖼</span>}
                    </div>
                  ) : (
                    <div className="slot-empty">{cell.past ? '' : '+'}</div>
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
              <button key={o.asset.id} className="btn sm" onClick={() => onOpen(o.asset)}>
                {o.date} {o.time} · {o.asset.platform} · {o.asset.title.slice(0, 30)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
