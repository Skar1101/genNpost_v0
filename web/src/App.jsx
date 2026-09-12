import { Routes, Route, Navigate } from 'react-router-dom'
import AppShell from './layout/AppShell.jsx'
import TittoDock from './components/TittoDock.jsx'
import SchedulerPage from './pages/SchedulerPage.jsx'
import Queue from './pages/Queue.jsx'
import LibraryPage from './pages/LibraryPage.jsx'
import StudioPage from './pages/StudioPage.jsx'
import TittoPage from './pages/TittoPage.jsx'
import RavenPage from './pages/RavenPage.jsx'
import KoelPage from './pages/KoelPage.jsx'
import QuillPage from './pages/QuillPage.jsx'
import ArticleWriterPage from './pages/ArticleWriterPage.jsx'
import ImagePage from './pages/ImagePage.jsx'
import HeronPage from './pages/HeronPage.jsx'
import ParrotPage from './pages/ParrotPage.jsx'
import AnalystPage from './pages/AnalystPage.jsx'
import SettingsPage from './pages/SettingsPage.jsx'
import PortedPage from './pages/PortedPage.jsx'
import LandingPage from './pages/LandingPage.jsx'
import { portedPages } from './lib/nav.js'

// Agents with a real, built page.
const REAL_PAGES = {
  titto: TittoPage,
  raven: RavenPage,
  'quill-x': QuillPage,
  koel: KoelPage,
  article: ArticleWriterPage,
  image: ImagePage,
  heron: HeronPage,
  parrot: ParrotPage,
  analyst: AnalystPage,
  settings: SettingsPage,
}

// Public marketing page renders full-bleed, without the dashboard's sidebar/top bar — everything
// else keeps living inside AppShell exactly as before. "/welcome" is purely additive; "/" now renders
// the merged Scheduler page (was Control Center — see nav.js's 2026-09-12 restructure note).
export default function App() {
  return (
    <Routes>
      <Route path="/welcome" element={<LandingPage />} />
      <Route path="/*" element={
        <AppShell>
          <Routes>
            <Route path="/" element={<SchedulerPage />} />
            <Route path="/queue" element={<Queue />} />
            <Route path="/library" element={<LibraryPage />} />
            <Route path="/studio" element={<StudioPage />} />
            {/* Compose was the old half of this flow — keep the path working. */}
            <Route path="/compose" element={<Navigate to="/studio" replace />} />
            {/* Schedules got merged into Scheduler's own "Schedule settings" panel — redirect rather
                than 404 for anyone with the old link bookmarked. */}
            <Route path="/system/schedules" element={<Navigate to="/" replace />} />
            {portedPages.map((p) => {
              const Real = REAL_PAGES[p.id]
              return <Route key={p.id} path={p.to} element={Real ? <Real /> : <PortedPage meta={p} />} />
            })}
          </Routes>
          <TittoDock />
        </AppShell>
      } />
    </Routes>
  )
}
