import type { ChecklistItem } from '../../lib/api'

/** Backward-compatible parsing: legacy = string[] */
export function parseItems(raw: string): ChecklistItem[] {
  try {
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr.map((it: unknown) =>
      typeof it === 'string'
        ? { text: it }
        : {
            text: String((it as Record<string, unknown>)?.text ?? ''),
            note: ((it as Record<string, unknown>)?.note as string) || undefined,
          }
    )
  } catch {
    return []
  }
}

export function itemsHash(items: ChecklistItem[]): string {
  return JSON.stringify(items.map(i => ({ text: i.text, note: i.note || '' })))
}
