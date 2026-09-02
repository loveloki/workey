import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LanguageSection } from './LanguageSection'
import { I18nProvider, LANGUAGE_STORAGE_KEY, setModuleLanguage } from '../../lib/i18n'

function renderSection(initial: 'zh-CN' | 'en-US' = 'zh-CN') {
  return render(
    <I18nProvider initialLanguage={initial}>
      <LanguageSection />
    </I18nProvider>,
  )
}

describe('LanguageSection', () => {
  beforeEach(() => {
    localStorage.clear()
    setModuleLanguage('zh-CN')
  })
  afterEach(() => setModuleLanguage('zh-CN'))

  it('渲染中英文两个选项与中文标题', () => {
    renderSection('zh-CN')
    expect(screen.getByText('语言设置')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '中文' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'English' })).toBeInTheDocument()
  })

  it('当前语言按钮处于选中态', () => {
    renderSection('zh-CN')
    expect(screen.getByRole('button', { name: '中文' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('点击 English 后界面切换为英文并持久化', () => {
    renderSection('zh-CN')
    fireEvent.click(screen.getByRole('button', { name: 'English' }))

    expect(screen.getByText('Language')).toBeInTheDocument()
    expect(screen.getByText('Current: English')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true')
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en-US')
    expect(document.documentElement.lang).toBe('en-US')
  })

  it('从英文切回中文', () => {
    renderSection('en-US')
    expect(screen.getByText('Language')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '中文' }))

    expect(screen.getByText('语言设置')).toBeInTheDocument()
    expect(screen.getByText('当前：中文')).toBeInTheDocument()
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('zh-CN')
  })
})
