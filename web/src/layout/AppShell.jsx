import Sidebar from './Sidebar.jsx'
import TopBar from './TopBar.jsx'

export default function AppShell({ children }) {
  return (
    <div className="app">
      <Sidebar />
      <main className="main">
        <TopBar />
        {children}
      </main>
    </div>
  )
}
