import { createRootRoute, Outlet, Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { useState, useRef, useEffect } from 'react'
import { AuthProvider, useAuth } from '../lib/auth-context'
import { ThemeProvider } from '../lib/theme-context'

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <div className="min-h-screen flex flex-col">
          <Header />
          <main className="flex-1">
            <Outlet />
          </main>
          <Footer />
        </div>
      </AuthProvider>
    </ThemeProvider>
  )
}

const primaryLinks = [
  { to: '/' as const, label: '今日', exact: true },
  { to: '/todos' as const, label: '待办' },
]

const secondaryLinks = [
  { to: '/clock' as const, label: '打卡' },
  { to: '/history' as const, label: '历史' },
  { to: '/trends' as const, label: '趋势' },
  { to: '/settings' as const, label: '设置' },
]

const allLinks = [
  { to: '/clock' as const, label: '打卡' },
  { to: '/' as const, label: '今日', exact: true },
  { to: '/history' as const, label: '历史' },
  { to: '/todos' as const, label: '待办' },
  { to: '/trends' as const, label: '趋势' },
  { to: '/settings' as const, label: '设置' },
]

function Header() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const routerState = useRouterState()

  // Close menu on route change
  useEffect(() => {
    setMenuOpen(false)
  }, [routerState.location.pathname])

  // Close menu on click outside
  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  const isSecondaryActive = secondaryLinks.some(l => routerState.location.pathname === l.to)

  return (
    <header className="sticky top-0 z-50 border-b" style={{ background: 'var(--color-surface-strong)', borderColor: 'var(--color-border)' }}>
      <nav className="max-w-5xl mx-auto flex items-center justify-between px-4 py-3">
        {/* Left: Logo */}
        <Link
          to="/"
          className="font-mono text-lg font-bold no-underline text-[var(--color-ink)] shrink-0"
        >
          Workey
        </Link>

        {/* Middle: Nav links — desktop: all visible */}
        {user && (
          <div className="hidden sm:flex items-center gap-6">
            {allLinks.map(link => (
              <Link
                key={link.to}
                to={link.to}
                className="font-mono text-sm no-underline transition-colors"
                style={{ color: 'var(--color-ink-muted)' }}
                {...(link.exact ? { activeOptions: { exact: true } } : {})}
                activeProps={{ className: 'font-mono text-sm no-underline font-medium text-[var(--color-ink)]' }}
              >
                {link.label}
              </Link>
            ))}
          </div>
        )}

        {/* Middle: Nav links — mobile: primary + dropdown */}
        {user && (
          <div className="flex sm:hidden items-center gap-4 whitespace-nowrap">
            {primaryLinks.map(link => (
              <Link
                key={link.to}
                to={link.to}
                className="font-mono text-sm no-underline transition-colors"
                style={{ color: 'var(--color-ink-muted)' }}
                {...(link.exact ? { activeOptions: { exact: true } } : {})}
                activeProps={{ className: 'font-mono text-sm no-underline font-medium text-[var(--color-ink)]' }}
              >
                {link.label}
              </Link>
            ))}

            {/* More menu */}
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen(v => !v)}
                className="font-mono text-sm px-2 py-1 rounded transition-colors"
                style={{
                  color: isSecondaryActive ? 'var(--color-ink)' : 'var(--color-ink-muted)',
                  fontWeight: isSecondaryActive ? 500 : 400,
                  background: menuOpen ? 'var(--color-surface-hover)' : 'transparent',
                }}
              >
                更多
                <span className="ml-0.5 text-xs">▾</span>
              </button>
              {menuOpen && (
                <div
                  className="absolute right-0 top-full mt-1 py-1 rounded-md shadow-lg min-w-[120px]"
                  style={{ background: 'var(--color-surface-strong)', border: '1px solid var(--color-border)' }}
                >
                  {secondaryLinks.map(link => (
                    <Link
                      key={link.to}
                      to={link.to}
                      className="block px-4 py-2 font-mono text-sm no-underline transition-colors hover:bg-[var(--color-surface-hover)]"
                      style={{ color: 'var(--color-ink-muted)' }}
                      activeProps={{ className: 'block px-4 py-2 font-mono text-sm no-underline font-medium text-[var(--color-ink)] bg-[var(--color-surface-hover)]' }}
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Right: User + logout */}
        <div className="flex items-center gap-3 shrink-0">
          {user && (
            <>
              <span className="hidden sm:inline font-mono text-sm text-[var(--color-ink-muted)]">
                {user.username}
              </span>
              <button
                onClick={() => { logout(); navigate({ to: '/login' }) }}
                className="font-mono text-sm px-3 py-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-hover)] whitespace-nowrap"
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
