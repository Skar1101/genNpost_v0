import { Routes, Route } from 'react-router-dom'
import AppShell from './layout/AppShell.jsx'
import TittoDock from './components/TittoDock.jsx'
import ControlCenter from './pages/ControlCenter.jsx'
import Queue from './pages/Queue.jsx'
import TittoPage from './pages/TittoPage.jsx'
import RavenPage from './pages/RavenPage.jsx'
import KoelPage from './pages/KoelPage.jsx'
import QuillPage from './pages/QuillPage.jsx'
import ArticleWriterPage from './pages/ArticleWriterPage.jsx'
import AnalystPage from './pages/AnalystPage.jsx'
import PortedPage from './pages/PortedPage.jsx'
import { portedPages } from './lib/nav.js'

// Agents with a real, built page. Everything else in portedPages still renders
// the PortedPage placeholder (Parrot/Heron/Schedules/Settings — not built yet).
const REAL_PAGES = {
  titto: TittoPage,
  raven: RavenPage,
  'quill-x': QuillPage,
  koel: KoelPage,
  article: ArticleWriterPage,
  analyst: AnalystPage,
}

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<ControlCenter />} />
        <Route path="/queue" element={<Queue />} />
        {portedPages.map((p) => {
          const Real = REAL_PAGES[p.id]
          return <Route key={p.id} path={p.to} element={Real ? <Real /> : <PortedPage meta={p} />} />
        })}
      </Routes>
      <TittoDock />
    </AppShell>
  )
}
