import { Card } from '../../components/Card'
import { useSystemVersion } from '../../lib/queries'

export function VersionSection() {
  const { data: version, isLoading } = useSystemVersion()

  return (
    <Card title="关于系统">
      <p className="text-sm mb-4" style={{ fontFamily: 'Georgia, serif', color: 'var(--color-ink-muted)' }}>
        当前部署的系统版本信息。
      </p>
      {isLoading ? (
        <p className="font-mono text-sm" style={{ color: 'var(--color-ink-muted)' }}>
          加载中...
        </p>
      ) : version ? (
        <div className="space-y-2 font-mono text-sm">
          <div className="flex flex-col sm:flex-row sm:gap-4">
            <span style={{ color: 'var(--color-ink-muted)', minWidth: '80px' }}>更新日期</span>
            <span style={{ color: 'var(--color-ink)' }}>{version.date}</span>
          </div>
          <div className="flex flex-col sm:flex-row sm:gap-4">
            <span style={{ color: 'var(--color-ink-muted)', minWidth: '80px' }}>更新 Commit</span>
            <span style={{ color: 'var(--color-ink)' }}>{version.commit}</span>
          </div>
          <div className="flex flex-col sm:flex-row sm:gap-4">
            <span style={{ color: 'var(--color-ink-muted)', minWidth: '80px' }}>更新内容</span>
            <span style={{ color: 'var(--color-ink)' }}>{version.content}</span>
          </div>
        </div>
      ) : (
        <p className="font-mono text-sm" style={{ color: 'var(--color-ink-muted)' }}>
          未知版本
        </p>
      )}
    </Card>
  )
}
