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
    <header className="sticky top-0 z-50 bg-white border-b" style={{ borderColor: '#e5e5e5' }}>
      <nav className="max-w-5xl mx-auto flex items-center justify-between px-4 py-3">
        {/* Left: Logo */}
        <Link
          to="/"
          className="font-mono text-lg font-bold text-black no-underline"
        >
          Workey
        </Link>

        {/* Middle: Nav links */}
        {user && (
          <div className="flex items-center gap-6">
            <Link
              to="/clock"
              className="font-mono text-sm no-underline transition-colors"
              style={{ color: '#414141' }}
              activeProps={{ className: 'font-mono text-sm no-underline font-medium !text-black' }}
            >
              打卡
            </Link>
            <Link
              to="/"
              className="font-mono text-sm no-underline transition-colors"
              style={{ color: '#414141' }}
              activeOptions={{ exact: true }}
              activeProps={{ className: 'font-mono text-sm no-underline font-medium !text-black' }}
            >
              今日
            </Link>
            <Link
              to="/history"
              className="font-mono text-sm no-underline transition-colors"
              style={{ color: '#414141' }}
              activeProps={{ className: 'font-mono text-sm no-underline font-medium !text-black' }}
            >
              历史
            </Link>
            <Link
              to="/trends"
              className="font-mono text-sm no-underline transition-colors"
              style={{ color: '#414141' }}
              activeProps={{ className: 'font-mono text-sm no-underline font-medium !text-black' }}
            >
              趋势
            </Link>
            <Link
              to="/settings"
              className="font-mono text-sm no-underline transition-colors"
              style={{ color: '#414141' }}
              activeProps={{ className: 'font-mono text-sm no-underline font-medium !text-black' }}
            >
              设置
            </Link>
          </div>
        )}

        {/* Right: User + logout */}
        <div className="flex items-center gap-3">
          {user && (
            <>
              <span className="hidden sm:inline font-mono text-sm text-neutral-600">
                {user.username}
              </span>
              <button
                onClick={() => { logout(); navigate({ to: '/login' }) }}
                className="font-mono text-sm px-4 py-2 rounded-md bg-white transition-colors hover:bg-neutral-50"
                style={{ border: '1px solid #e5e5e5', borderRadius: '6px' }}
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
      <p className="font-mono text-xs" style={{ color: '#9ca3af' }}>
        Workey · 工作记录
      </p>
    </footer>
  )
}
