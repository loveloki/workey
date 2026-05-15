import { useState, useRef, type ChangeEvent } from 'react'
import { settings } from '../../lib/api'
import { Card } from '../../components/Card'

export function DataSection() {
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [msg, setMsg] = useState('')
  const [isError, setIsError] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleExport = async () => {
    setExporting(true)
    setMsg('')
    try {
      const blob = await settings.exportData()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `workey-export-${new Date().toISOString().split('T')[0]}.zip`
      a.click()
      URL.revokeObjectURL(url)
      setMsg('导出成功')
      setIsError(false)
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : '导出失败')
      setIsError(true)
    } finally {
      setExporting(false)
    }
  }

  const handleImport = () => {
    fileRef.current?.click()
  }

  const onFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImporting(true)
    setMsg('')
    try {
      const result = await settings.importData(file)
      const parts = []
      if (result.attendance_count) parts.push(`${result.attendance_count} 条考勤`)
      if (result.work_log_count) parts.push(`${result.work_log_count} 条工作日志`)
      setMsg(`导入成功：${parts.join('，') || '无新数据'}`)
      setIsError(false)
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : '导入失败')
      setIsError(true)
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <Card title="数据管理">
      <p className="text-sm mb-4" style={{ fontFamily: 'Georgia, serif', color: 'var(--color-ink-muted)' }}>
        导出所有考勤、工作日志和待办等数据为 ZIP 压缩包，或从 ZIP 文件导入数据。
      </p>
      <div className="flex flex-col sm:flex-row items-start gap-3">
        <button
          onClick={handleExport}
          disabled={exporting}
          className="font-mono text-sm px-5 py-2 rounded-md text-[var(--color-solid-text)] transition-colors disabled:opacity-50"
          style={{ background: 'var(--color-solid)', borderRadius: '6px' }}
        >
          {exporting ? '导出中...' : '↓ 导出数据'}
        </button>
        <button
          onClick={handleImport}
          disabled={importing}
          className="font-mono text-sm px-5 py-2 rounded-md bg-[var(--color-surface-strong)] transition-colors hover:bg-[var(--color-surface-hover)] disabled:opacity-50"
          style={{ border: '1px solid var(--color-border)', borderRadius: '6px' }}
        >
          {importing ? '导入中...' : '↑ 导入数据'}
        </button>
        <input ref={fileRef} type="file" accept=".zip" onChange={onFileChange} className="hidden" />
      </div>
      {msg && (
        <p className="font-mono text-sm mt-3" style={{ color: isError ? 'var(--color-danger-text)' : 'var(--color-ink-muted)' }}>
          {msg}
        </p>
      )}
    </Card>
  )
}
