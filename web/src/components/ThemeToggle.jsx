// Light/dark toggle. Sets data-theme on <html>; CSS reveals the correct icon.
export default function ThemeToggle() {
  function current() {
    return (
      document.documentElement.dataset.theme ||
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    )
  }
  function toggle() {
    document.documentElement.dataset.theme = current() === 'dark' ? 'light' : 'dark'
  }
  return (
    <button className="icon-btn theme-toggle" onClick={toggle} aria-label="Toggle theme">
      <svg className="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
      <svg className="moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
    </button>
  )
}
