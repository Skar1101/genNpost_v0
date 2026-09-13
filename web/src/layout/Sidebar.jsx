import { NavLink, Link } from 'react-router-dom'
import Sparrow from '../components/Sparrow.jsx'
import ThemeToggle from '../components/ThemeToggle.jsx'
import { navSections } from '../lib/nav.js'
import { useQueue } from '../lib/queries.js'

export default function Sidebar() {
  // Real unrated-draft count for History's nav badge — item.badge in nav.js is just a "show a badge
  // here" flag now, not the actual number (it used to be hardcoded to 12, which never matched reality).
  const queue = useQueue('generated')
  const pendingCount = queue.data?.drafts?.length ?? 0

  return (
    <aside className="sidebar">
      <Link to="/welcome" className="brand" title="Go to the welcome page">
        <Sparrow className="mark" />
        <div>
          <div className="brand-name">genNpost</div>
          <div className="brand-sub">SOCIAL MEDIA MANAGER</div>
        </div>
      </Link>

      <nav className="nav">
        {navSections.map((section, i) => (
          <div className="nav-group" key={section.eyebrow || `group-${i}`}>
            {section.eyebrow && <span className="nav-eyebrow">{section.eyebrow}</span>}
            {section.items.map((item) => (
              <NavLink
                key={item.id}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) => 'nav-item' + (isActive ? ' is-active' : '')}
              >
                {item.dot && <span className={`sdot ${item.dot}`} />}
                <span className="lbl">{item.label}</span>
                {item.sub && <span className="sub">{item.sub}</span>}
                {item.badge && <span className="nav-badge">{item.id === 'queue' ? pendingCount : item.badge}</span>}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="side-foot">
        <div className="avatar">SK</div>
        <div className="acct">
          <div className="h">Souvik</div>
          <div className="s">@skar_connect</div>
        </div>
        <ThemeToggle />
      </div>
    </aside>
  )
}
