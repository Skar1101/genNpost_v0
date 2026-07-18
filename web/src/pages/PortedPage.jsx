import Sparrow from '../components/Sparrow.jsx'

// Temporary placeholder for the existing dashboard panels. Each of these keeps its
// current layout when ported from public/index.html — this screen just names the page
// and its role until that port happens, step by step.
export default function PortedPage({ meta }) {
  return (
    <div className="content">
      <div className="card placeholder">
        <Sparrow className="pmark" />
        <h2>{meta.title}</h2>
        <p>{meta.desc}</p>
        <ul>
          <li>Same layout as today — ported from the current dashboard, reskinned</li>
          <li>Available on both the web dashboard and Telegram</li>
          <li>Draft-only — nothing posts to any platform automatically</li>
        </ul>
      </div>
    </div>
  )
}
