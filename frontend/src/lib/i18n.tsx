import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react'
import { zhCN } from './locales/zh-CN'
import { enUS } from './locales/en-US'

export type Language = 'zh-CN' | 'en-US'

/** 翻译 key 由中文词典推导，保证两种语言的 key 完全一致 */
export type TranslationKey = keyof typeof zhCN

export type TranslationVars = Record<string, string | number>

export const SUPPORTED_LANGUAGES: Language[] = ['zh-CN', 'en-US']

export const LANGUAGE_STORAGE_KEY = 'workey-language'

export const DEFAULT_LANGUAGE: Language = 'zh-CN'

const DICTIONARIES: Record<Language, Record<string, string>> = {
  'zh-CN': zhCN,
  'en-US': enUS,
}

/** 每种语言对应的 Intl locale 标识 */
const INTL_LOCALES: Record<Language, string> = {
  'zh-CN': 'zh-CN',
  'en-US': 'en-US',
}

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (SUPPORTED_LANGUAGES as string[]).includes(value)
}

/** 读取 localStorage 中保存的语言（无效值返回 null） */
export function getStoredLanguage(): Language | null {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY)
    return isLanguage(stored) ? stored : null
  } catch {
    return null
  }
}

export function storeLanguage(lang: Language): void {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lang)
  } catch {
    // 隐私模式下 localStorage 可能不可用，忽略
  }
}

/** 根据浏览器语言推断，zh* 归为中文，其余归为英文 */
export function detectBrowserLanguage(): Language {
  const candidates: string[] =
    typeof navigator === 'undefined'
      ? []
      : [...(navigator.languages ?? []), navigator.language].filter(Boolean)
  for (const candidate of candidates) {
    const lower = candidate.toLowerCase()
    if (lower.startsWith('zh')) return 'zh-CN'
    if (lower.startsWith('en')) return 'en-US'
  }
  return DEFAULT_LANGUAGE
}

/** 优先使用用户显式选择的语言，其次浏览器语言 */
export function resolveInitialLanguage(): Language {
  return getStoredLanguage() ?? detectBrowserLanguage()
}

export function applyDocumentLanguage(lang: Language): void {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang
    document.title = lang === 'en-US' ? 'Workey - Work Log' : 'Workey - 工作记录'
    const description = document.querySelector('meta[name="description"]')
    description?.setAttribute(
      'content',
      lang === 'en-US'
        ? 'Track daily work, clock-ins, and to-dos'
        : '记录每日工作内容、打卡与待办事项',
    )
  }
}

function interpolate(template: string, vars?: TranslationVars): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match,
  )
}

/** 纯函数翻译：缺失 key 时回退到中文词典，再回退到 key 本身 */
export function translate(lang: Language, key: TranslationKey, vars?: TranslationVars): string {
  const template = DICTIONARIES[lang]?.[key] ?? zhCN[key] ?? key
  return interpolate(template, vars)
}

// 模块级当前语言，供非 React 环境（date-utils / report-utils / api）读取
let currentLanguage: Language = DEFAULT_LANGUAGE

export function getLanguage(): Language {
  return currentLanguage
}

/** 设置模块级语言（由 I18nProvider 调用，测试中也可直接使用） */
export function setModuleLanguage(lang: Language): void {
  currentLanguage = lang
}

/** 当前语言对应的 Intl locale，供 toLocaleDateString 等使用 */
export function getLocale(lang: Language = currentLanguage): string {
  return INTL_LOCALES[lang] ?? INTL_LOCALES[DEFAULT_LANGUAGE]
}

/** 非 React 环境下的翻译入口，使用当前语言 */
export function t(key: TranslationKey, vars?: TranslationVars): string {
  return translate(currentLanguage, key, vars)
}

export interface I18nContextValue {
  lang: Language
  setLang: (lang: Language) => void
  t: (key: TranslationKey, vars?: TranslationVars) => string
  /** Intl locale，如 zh-CN / en-US */
  locale: string
}

// 默认值回退到模块级语言，使未被 Provider 包裹的组件（如单测）仍能正常翻译
const I18nContext = createContext<I18nContextValue>({
  get lang() {
    return currentLanguage
  },
  setLang: setModuleLanguage,
  t: (key, vars) => translate(currentLanguage, key, vars),
  get locale() {
    return getLocale(currentLanguage)
  },
})

export function useI18n(): I18nContextValue {
  return useContext(I18nContext)
}

export function I18nProvider({
  children,
  initialLanguage,
}: {
  children: ReactNode
  initialLanguage?: Language
}) {
  const [lang, setLangState] = useState<Language>(() => {
    const initial = initialLanguage ?? resolveInitialLanguage()
    setModuleLanguage(initial)
    return initial
  })

  useEffect(() => {
    setModuleLanguage(lang)
    applyDocumentLanguage(lang)
  }, [lang])

  const setLang = useCallback((next: Language) => {
    if (!isLanguage(next)) return
    storeLanguage(next)
    setModuleLanguage(next)
    applyDocumentLanguage(next)
    setLangState(next)
  }, [])

  const value = useMemo<I18nContextValue>(
    () => ({
      lang,
      setLang,
      t: (key, vars) => translate(lang, key, vars),
      locale: getLocale(lang),
    }),
    [lang, setLang],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
