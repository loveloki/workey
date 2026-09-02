import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import {
  I18nProvider,
  useI18n,
  translate,
  detectBrowserLanguage,
  resolveInitialLanguage,
  getStoredLanguage,
  storeLanguage,
  isLanguage,
  getLanguage,
  setModuleLanguage,
  getLocale,
  t,
  LANGUAGE_STORAGE_KEY,
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
} from './i18n'
import { zhCN } from './locales/zh-CN'
import { enUS } from './locales/en-US'

/** 修改 navigator.languages（happy-dom 下为只读属性） */
function mockNavigatorLanguages(languages: string[]) {
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(languages)
  vi.spyOn(navigator, 'language', 'get').mockReturnValue(languages[0] ?? '')
}

describe('i18n 词典', () => {
  it('zh-CN 与 en-US 的 key 集合完全一致', () => {
    expect(Object.keys(enUS).sort()).toEqual(Object.keys(zhCN).sort())
  })

  it('没有空文案', () => {
    for (const [key, value] of Object.entries(zhCN)) {
      expect(value, `zh-CN.${key}`).not.toBe('')
    }
    for (const [key, value] of Object.entries(enUS)) {
      expect(value, `en-US.${key}`).not.toBe('')
    }
  })

  it('英文文案不含中文字符', () => {
    const chinese = /[\u4e00-\u9fff]/
    for (const [key, value] of Object.entries(enUS)) {
      expect(chinese.test(value), `en-US.${key} = ${value}`).toBe(false)
    }
  })

  it('占位符在两种语言中一致', () => {
    const placeholders = (s: string) => (s.match(/\{(\w+)\}/g) ?? []).sort()
    for (const key of Object.keys(zhCN) as (keyof typeof zhCN)[]) {
      expect(placeholders(enUS[key]), `key ${key}`).toEqual(placeholders(zhCN[key]))
    }
  })
})

describe('translate', () => {
  it('按语言返回对应文案', () => {
    expect(translate('zh-CN', 'common.save')).toBe('保存')
    expect(translate('en-US', 'common.save')).toBe('Save')
  })

  it('支持占位符插值', () => {
    expect(translate('en-US', 'settings.language.current', { name: 'English' })).toBe('Current: English')
    expect(translate('zh-CN', 'settings.language.current', { name: '中文' })).toBe('当前：中文')
  })

  it('未提供的占位符保留原样', () => {
    expect(translate('en-US', 'settings.language.current', {})).toBe('Current: {name}')
  })

  it('未知 key 回退为 key 本身', () => {
    expect(translate('en-US', 'not.a.real.key' as never)).toBe('not.a.real.key')
  })
})

describe('isLanguage', () => {
  it('只接受支持的语言', () => {
    expect(isLanguage('zh-CN')).toBe(true)
    expect(isLanguage('en-US')).toBe(true)
    expect(isLanguage('fr-FR')).toBe(false)
    expect(isLanguage(null)).toBe(false)
    expect(isLanguage(undefined)).toBe(false)
  })

  it('SUPPORTED_LANGUAGES 包含两种语言且默认为中文', () => {
    expect(SUPPORTED_LANGUAGES).toEqual(['zh-CN', 'en-US'])
    expect(DEFAULT_LANGUAGE).toBe('zh-CN')
  })
})

describe('localStorage 持久化', () => {
  beforeEach(() => localStorage.clear())

  it('存取使用 workey-language 键', () => {
    storeLanguage('en-US')
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en-US')
    expect(LANGUAGE_STORAGE_KEY).toBe('workey-language')
    expect(getStoredLanguage()).toBe('en-US')
  })

  it('无存储时返回 null', () => {
    expect(getStoredLanguage()).toBeNull()
  })

  it('非法值返回 null', () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'ja-JP')
    expect(getStoredLanguage()).toBeNull()
  })
})

describe('detectBrowserLanguage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('zh 开头归为 zh-CN', () => {
    mockNavigatorLanguages(['zh-TW', 'en-US'])
    expect(detectBrowserLanguage()).toBe('zh-CN')
  })

  it('en 开头归为 en-US', () => {
    mockNavigatorLanguages(['en-GB'])
    expect(detectBrowserLanguage()).toBe('en-US')
  })

  it('大小写不敏感', () => {
    mockNavigatorLanguages(['ZH-CN'])
    expect(detectBrowserLanguage()).toBe('zh-CN')
  })

  it('不支持的语言回退到默认语言', () => {
    mockNavigatorLanguages(['fr-FR', 'de-DE'])
    expect(detectBrowserLanguage()).toBe('zh-CN')
  })
})

describe('resolveInitialLanguage', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it('优先使用存储的语言', () => {
    mockNavigatorLanguages(['zh-CN'])
    storeLanguage('en-US')
    expect(resolveInitialLanguage()).toBe('en-US')
  })

  it('未存储时回退到浏览器语言', () => {
    mockNavigatorLanguages(['en-US'])
    expect(resolveInitialLanguage()).toBe('en-US')
  })
})

describe('模块级语言', () => {
  afterEach(() => setModuleLanguage('zh-CN'))

  it('setModuleLanguage 影响 t() 与 getLocale()', () => {
    setModuleLanguage('en-US')
    expect(getLanguage()).toBe('en-US')
    expect(t('common.save')).toBe('Save')
    expect(getLocale()).toBe('en-US')

    setModuleLanguage('zh-CN')
    expect(t('common.save')).toBe('保存')
    expect(getLocale()).toBe('zh-CN')
  })

  it('getLocale 可显式指定语言', () => {
    expect(getLocale('en-US')).toBe('en-US')
    expect(getLocale('zh-CN')).toBe('zh-CN')
  })
})

function Probe() {
  const { t, lang, setLang, locale } = useI18n()
  return (
    <div>
      <span data-testid="lang">{lang}</span>
      <span data-testid="locale">{locale}</span>
      <span data-testid="text">{t('common.save')}</span>
      <button onClick={() => setLang('en-US')}>to-en</button>
      <button onClick={() => setLang('zh-CN')}>to-zh</button>
    </div>
  )
}

describe('I18nProvider', () => {
  beforeEach(() => {
    localStorage.clear()
    setModuleLanguage('zh-CN')
    document.documentElement.lang = ''
  })
  afterEach(() => vi.restoreAllMocks())

  it('提供初始语言并设置 document.documentElement.lang', () => {
    render(
      <I18nProvider initialLanguage="en-US">
        <Probe />
      </I18nProvider>,
    )
    expect(screen.getByTestId('lang').textContent).toBe('en-US')
    expect(screen.getByTestId('text').textContent).toBe('Save')
    expect(document.documentElement.lang).toBe('en-US')
  })

  it('setLang 切换后更新文案、localStorage 与 html lang', () => {
    render(
      <I18nProvider initialLanguage="zh-CN">
        <Probe />
      </I18nProvider>,
    )
    expect(screen.getByTestId('text').textContent).toBe('保存')

    fireEvent.click(screen.getByText('to-en'))

    expect(screen.getByTestId('lang').textContent).toBe('en-US')
    expect(screen.getByTestId('locale').textContent).toBe('en-US')
    expect(screen.getByTestId('text').textContent).toBe('Save')
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en-US')
    expect(document.documentElement.lang).toBe('en-US')
    // 模块级语言同步更新，供 date-utils / report-utils 使用
    expect(getLanguage()).toBe('en-US')
  })

  it('未指定初始语言时从 localStorage 恢复', () => {
    storeLanguage('en-US')
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    )
    expect(screen.getByTestId('lang').textContent).toBe('en-US')
  })

  it('未存储时根据浏览器语言初始化', () => {
    mockNavigatorLanguages(['en-US'])
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    )
    expect(screen.getByTestId('lang').textContent).toBe('en-US')
  })

  it('未被 Provider 包裹时回退到模块级语言', () => {
    setModuleLanguage('en-US')
    render(<Probe />)
    expect(screen.getByTestId('text').textContent).toBe('Save')
    setModuleLanguage('zh-CN')
  })
})
