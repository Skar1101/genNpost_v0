import { useLocation, useNavigate } from 'react-router-dom'
import { pageMetaFor } from '../lib/nav.js'
import { useQueue } from '../lib/queries.js'

export default function TopBar() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const queue = useQueue('generated')
  const pendingCount = queue.data?.drafts?.length
  const { title, crumb } = pageMetaFor(pathname, pendingCount)

  return (
    <header className="topbar">
      <div className="titles">
        <h1>{title}</h1>
        <div className="crumb mono" title={crumb}>{crumb}</div>
      </div>
      {pathname !== '/queue' && (
        <button className="btn primary" onClick={() => navigate('/queue')}>
          Review queue
        </button>
      )}
    </header>
  )
}
