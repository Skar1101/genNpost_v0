import { NavLink } from 'react-router-dom'
import Sparrow from '../components/Sparrow.jsx'
import ThemeToggle from '../components/ThemeToggle.jsx'
import { navSections } from '../lib/nav.js'

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="brand">
        <Sparrow className="mark" />
        <div>
          <div className="brand-name">TinySparrow</div>
          <div className="brand-sub">SOCIAL MEDIA MANAGER</div>
        </div>
      </div>

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
                {item.badge != null && <span className="nav-badge">{item.badge}</span>}
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
