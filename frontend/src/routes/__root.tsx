import { createRootRoute, Outlet, Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { useState, useRef, useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from '../lib/auth-context'
import { ThemeProvider } from '../lib/theme-context'
import { ToastProvider } from '../lib/toast-context'
import { PWAReloadPrompt } from '../lib/pwa-reload-prompt'
import { useI18n, type TranslationKey } from '../lib/i18n'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
})

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <ToastProvider>
            <div className="min-h-screen flex flex-col">
              <Header />
              <main className="flex-1">
                <Outlet />
              </main>
              <Footer />
              <PWAReloadPrompt />
            </div>
          </ToastProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}

const primaryLinks: { to: '/' | '/history'; labelKey: TranslationKey; exact?: boolean }[] = [
  { to: '/' as const, labelKey: 'nav.today', exact: true },
  { to: '/history' as const, labelKey: 'nav.history' },
]

const secondaryLinks = [
  { to: '/todos' as const, labelKey: 'nav.todos' as TranslationKey },
  { to: '/ticket-issues' as const, labelKey: 'nav.tickets' as TranslationKey },
  { to: '/clock' as const, labelKey: 'nav.clock' as TranslationKey },
  { to: '/checklists' as const, labelKey: 'nav.checklists' as TranslationKey },
  { to: '/trends' as const, labelKey: 'nav.trends' as TranslationKey },
  { to: '/settings' as const, labelKey: 'nav.settings' as TranslationKey },
]

const allLinks = [
  { to: '/clock' as const, labelKey: 'nav.clock' as TranslationKey },
  { to: '/' as const, labelKey: 'nav.today' as TranslationKey, exact: true },
  { to: '/history' as const, labelKey: 'nav.history' as TranslationKey },
  { to: '/todos' as const, labelKey: 'nav.todos' as TranslationKey },
  { to: '/ticket-issues' as const, labelKey: 'nav.tickets' as TranslationKey },
  { to: '/checklists' as const, labelKey: 'nav.checklists' as TranslationKey },
  { to: '/trends' as const, labelKey: 'nav.trends' as TranslationKey },
  { to: '/settings' as const, labelKey: 'nav.settings' as TranslationKey },
]

function Header() {
  const { t } = useI18n()
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
    <header className="sticky top-0 z-50 border-b bg-[var(--color-surface-strong)] border-[var(--color-border)]">
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
                className="font-mono text-sm no-underline transition-colors text-[var(--color-ink-muted)]"
                {...(link.exact ? { activeOptions: { exact: true } } : {})}
                activeProps={{ className: 'font-mono text-sm no-underline font-medium text-[var(--color-ink)]' }}
              >
                {t(link.labelKey)}
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
                className="font-mono text-sm no-underline transition-colors text-[var(--color-ink-muted)]"
                {...(link.exact ? { activeOptions: { exact: true } } : {})}
                activeProps={{ className: 'font-mono text-sm no-underline font-medium text-[var(--color-ink)]' }}
              >
                {t(link.labelKey)}
              </Link>
            ))}

            {/* More menu */}
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen(v => !v)}
                className={`font-mono text-sm px-2 py-1 rounded transition-colors ${
                  isSecondaryActive
                    ? 'text-[var(--color-ink)] font-medium'
                    : 'text-[var(--color-ink-muted)] font-normal'
                } ${menuOpen ? 'bg-[var(--color-surface-hover)]' : 'bg-transparent'}`}
              >
                {t('nav.more')}
                <span className="ml-0.5 text-xs">▾</span>
              </button>
              {menuOpen && (
                <div
                  className="absolute right-0 top-full mt-1 py-1 rounded-md shadow-lg min-w-[120px] bg-[var(--color-surface-strong)] border border-[var(--color-border)]"
                >
                  {secondaryLinks.map(link => (
                    <Link
                      key={link.to}
                      to={link.to}
                      className="block px-4 py-2 font-mono text-sm no-underline transition-colors hover:bg-[var(--color-surface-hover)] text-[var(--color-ink-muted)]"
                      activeProps={{ className: 'block px-4 py-2 font-mono text-sm no-underline font-medium text-[var(--color-ink)] bg-[var(--color-surface-hover)]' }}
                    >
                      {t(link.labelKey)}
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
                className="font-mono text-sm px-3 py-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-hover)] whitespace-nowrap bg-[var(--color-surface-strong)] border border-[var(--color-border)]"
              >
                {t('nav.logout')}
              </button>
            </>
          )}
        </div>
      </nav>
    </header>
  )
}

function Footer() {
  const { t } = useI18n()
  return (
    <footer className="py-8 text-center">
      <p className="font-mono text-xs text-[var(--color-ink-faint)]">
        {t('footer.tagline')}
      </p>
    </footer>
  )
}
