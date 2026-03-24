import { createRootRoute, Outlet, Link, useNavigate } from '@tanstack/react-router'
import { AuthProvider, useAuth } from '../lib/auth-context'

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  return (
    <AuthProvider>
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1">
          <Outlet />
        </main>
        <Footer />
      </div>
    </AuthProvider>
  )
}

function Header() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  return (
    <header className="sticky top-0 z-50 border-b" style={{ background: 'var(--color-surface-strong)', borderColor: 'var(--color-border)' }}>
      <nav className="max-w-5xl mx-auto flex items-center justify-between px-4 py-3">
        {/* Left: Logo */}
        <Link
          to="/"
          className="font-mono text-lg font-bold no-underline text-[var(--color-ink)]"
        >
          Workey
        </Link>

        {/* Middle: Nav links */}
        {user && (
          <div className="flex items-center gap-6">
            <Link
              to="/clock"
              className="font-mono text-sm no-underline transition-colors"
              style={{ color: 'var(--color-ink-muted)' }}
              activeProps={{ className: 'font-mono text-sm no-underline font-medium text-[var(--color-ink)]' }}
            >
              打卡
            </Link>
            <Link
              to="/"
              className="font-mono text-sm no-underline transition-colors"
              style={{ color: 'var(--color-ink-muted)' }}
              activeOptions={{ exact: true }}
              activeProps={{ className: 'font-mono text-sm no-underline font-medium text-[var(--color-ink)]' }}
            >
              今日
            </Link>
            <Link
              to="/history"
              className="font-mono text-sm no-underline transition-colors"
              style={{ color: 'var(--color-ink-muted)' }}
              activeProps={{ className: 'font-mono text-sm no-underline font-medium text-[var(--color-ink)]' }}
            >
              历史
            </Link>
            <Link
              to="/todos"
              className="font-mono text-sm no-underline transition-colors"
              style={{ color: 'var(--color-ink-muted)' }}
              activeProps={{ className: 'font-mono text-sm no-underline font-medium text-[var(--color-ink)]' }}
            >
              待办
            </Link>
            <Link
              to="/trends"
              className="font-mono text-sm no-underline transition-colors"
              style={{ color: 'var(--color-ink-muted)' }}
              activeProps={{ className: 'font-mono text-sm no-underline font-medium text-[var(--color-ink)]' }}
            >
              趋势
            </Link>
            <Link
              to="/settings"
              className="font-mono text-sm no-underline transition-colors"
              style={{ color: 'var(--color-ink-muted)' }}
              activeProps={{ className: 'font-mono text-sm no-underline font-medium text-[var(--color-ink)]' }}
            >
              设置
            </Link>
          </div>
        )}

        {/* Right: User + logout */}
        <div className="flex items-center gap-3">
          {user && (
            <>
              <span className="hidden sm:inline font-mono text-sm text-[var(--color-ink-muted)]">
                {user.username}
              </span>
              <button
                onClick={() => { logout(); navigate({ to: '/login' }) }}
                className="font-mono text-sm px-4 py-2 rounded-md transition-colors hover:bg-[var(--color-surface-hover)]"
                style={{ background: 'var(--color-surface-strong)', border: '1px solid var(--color-border)', borderRadius: '6px' }}
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
    <footer className="py-8 text-center">
      <p className="font-mono text-xs" style={{ color: 'var(--color-ink-faint)' }}>
        Workey · 工作记录
      </p>
    </footer>
  )
}
