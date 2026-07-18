import { useLocation, useNavigate } from 'react-router-dom'
import { pageMetaFor } from '../lib/nav.js'

export default function TopBar() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { title, crumb } = pageMetaFor(pathname)

  return (
    <header className="topbar">
      <div className="titles">
        <h1>{title}</h1>
        <div className="crumb mono">{crumb}</div>
      </div>
      {pathname !== '/queue' && (
        <button className="btn primary" onClick={() => navigate('/queue')}>
          Review queue
        </button>
      )}
    </header>
  )
}
