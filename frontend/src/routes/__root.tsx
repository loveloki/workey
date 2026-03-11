import { createRootRoute, Outlet, Link, useNavigate } from '@tanstack/react-router'
import { AuthProvider, useAuth } from '../lib/auth-context'

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  return (
    <AuthProvider>
      <div className="min-h-screen">
        <Header />
        <Outlet />
        <Footer />
      </div>
    </AuthProvider>
  )
}

function Header() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--line)] bg-[var(--header-bg)] px-4 backdrop-blur-lg">
      <nav className="page-wrap flex items-center gap-3 py-3 sm:py-4">
        <Link
          to="/"
          className="inline-flex items-center gap-2 rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-3 py-1.5 text-sm font-semibold text-[var(--sea-ink)] no-underline shadow-[0_8px_24px_rgba(30,90,72,0.08)]"
        >
          <span className="h-2 w-2 rounded-full bg-[linear-gradient(90deg,#56c6be,#7ed3bf)]" />
          Workey
        </Link>

        {user && (
          <div className="flex items-center gap-4 text-sm font-semibold">
            <Link to="/" className="nav-link" activeOptions={{ exact: true }} activeProps={{ className: 'nav-link is-active' }}>
              今日
            </Link>
            <Link to="/history" className="nav-link" activeProps={{ className: 'nav-link is-active' }}>
              历史
            </Link>
            <Link to="/trends" className="nav-link" activeProps={{ className: 'nav-link is-active' }}>
              趋势
            </Link>
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          {user && (
            <>
              <span className="hidden text-sm text-[var(--sea-ink-soft)] sm:inline">{user.username}</span>
              <button
                onClick={() => { logout(); navigate({ to: '/login' }) }}
                className="rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--sea-ink-soft)] transition hover:-translate-y-0.5 hover:text-[var(--sea-ink)]"
              >
                退出
              </button>
            </>
          )}
        </div>
      </nav>
    </header>
  )
}

function Footer() {
  return (
    <footer className="mt-16 border-t border-[var(--line)] px-4 pb-10 pt-8 text-center">
      <p className="island-kicker m-0">Workey · 工作记录</p>
    </footer>
  )
}
