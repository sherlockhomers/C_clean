import { useState, useEffect, useMemo } from 'react'
import { useDiskStore } from '../stores/useDiskStore'
import { formatSize } from '../utils/formatSize'
import {
  HeartPulse,
  Bell,
  Clock,
  Calendar,
  TrendingUp,
  TrendingDown,
  Inbox,
} from 'lucide-react'

interface TrendPoint {
  date: string
  used: number
  available: number
}

function SpaceTrendChart({ points }: { points: TrendPoint[] }) {
  const width = 700
  const height = 240
  const padding = 28
  const allValues = points.flatMap((item) => [item.used, item.available])
  const min = Math.min(...allValues)
  const max = Math.max(...allValues)
  const range = max - min || 1

  const buildLine = (key: 'used' | 'available') => points.map((item, index) => {
    const x = padding + (index / Math.max(1, points.length - 1)) * (width - padding * 2)
    const y = height - padding - ((item[key] - min) / range) * (height - padding * 2)
    return `${index === 0 ? 'M' : 'L'} ${x} ${y}`
  }).join(' ')

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-64">
      {[0, 1, 2, 3].map((line) => {
        const y = padding + line * ((height - padding * 2) / 3)
        return <line key={line} x1={padding} x2={width - padding} y1={y} y2={y} stroke="var(--color-border)" strokeDasharray="4 4" />
      })}
      <path d={buildLine('used')} fill="none" stroke="var(--color-primary)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d={buildLine('available')} fill="none" stroke="#4CAF50" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((item, index) => {
        if (points.length > 8 && index % 5 !== 0 && index !== points.length - 1) return null
        const x = padding + (index / Math.max(1, points.length - 1)) * (width - padding * 2)
        return (
          <text key={`${item.date}-${index}`} x={x} y={height - 6} textAnchor="middle" fontSize="10" fill="var(--color-text-secondary)">
            {item.date}
          </text>
        )
      })}
    </svg>
  )
}

function formatDateTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function Monitor() {
  const { disks, spaceTimeline, history, refreshSpaceTimeline, refreshHistory } = useDiskStore()
  const [alertThreshold, setAlertThreshold] = useState(10)
  const [weeklyClean, setWeeklyClean] = useState(false)
  const [monthlyScan, setMonthlyScan] = useState(false)
  const bridgeReady = Boolean(window.cleanC)

  useEffect(() => {
    refreshSpaceTimeline()
    refreshHistory()
  }, [refreshSpaceTimeline, refreshHistory])

  // 从主进程读取持久化设置，保证刷新/重启后状态一致
  useEffect(() => {
    window.cleanC?.getSettings?.().then((s) => {
      setAlertThreshold(s.alertThreshold)
      setWeeklyClean(s.weeklyClean)
      setMonthlyScan(s.monthlyScanReminder)
    }).catch(() => {})
  }, [])

  const handleAlertThresholdChange = (value: number) => {
    setAlertThreshold(value)
    void window.cleanC?.setSettings?.({ alertThreshold: value })
  }
  const handleWeeklyCleanChange = (value: boolean) => {
    setWeeklyClean(value)
    void window.cleanC?.setSettings?.({ weeklyClean: value })
  }
  const handleMonthlyScanChange = (value: boolean) => {
    setMonthlyScan(value)
    void window.cleanC?.setSettings?.({ monthlyScanReminder: value })
  }

  const cDrive = disks[0]

  const trendPoints = useMemo<TrendPoint[]>(() => {
    return spaceTimeline
      .filter((p) => p.total > 0)
      .map((p) => ({
        date: p.date.slice(5),
        used: Math.round((p.used / 1024 ** 3) * 10) / 10,
        available: Math.round((p.available / 1024 ** 3) * 10) / 10,
      }))
  }, [spaceTimeline])

  const prediction = useMemo(() => {
    if (spaceTimeline.length < 2 || !cDrive) return null
    const first = spaceTimeline[0]
    const last = spaceTimeline[spaceTimeline.length - 1]
    const daySpan = Math.max(1, (new Date(last.date).getTime() - new Date(first.date).getTime()) / 86400000)
    const usedGrowthPerDay = (last.used - first.used) / daySpan
    if (usedGrowthPerDay <= 0) {
      return { trend: 'down' as const, text: '近期 C 盘使用量保持平稳或下降，暂无空间压力' }
    }
    const thresholdBytes = cDrive.total * (alertThreshold / 100)
    const remaining = cDrive.available - thresholdBytes
    if (remaining <= 0) {
      return { trend: 'up' as const, text: `C 盘可用空间已低于 ${alertThreshold}% 告警线，建议立即清理` }
    }
    const days = Math.round(remaining / usedGrowthPerDay)
    return { trend: 'up' as const, text: `按近期增长速度，C 盘约 ${days} 天后将低于 ${alertThreshold}%` }
  }, [spaceTimeline, cDrive, alertThreshold])

  const ToggleSwitch = ({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => (
    <button
      onClick={() => onChange(!checked)}
      className="relative w-10 h-5 rounded-full transition-colors duration-200 flex-shrink-0"
      style={{ backgroundColor: checked ? 'var(--color-primary)' : 'var(--color-border)' }}
    >
      <div
        className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform duration-200"
        style={{ transform: checked ? 'translateX(20px)' : 'translateX(0)' }}
      />
    </button>
  )

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
          <HeartPulse size={24} style={{ color: 'var(--color-primary)' }} /> 空间监控
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
          基于每日自动记录的真实空间快照，呈现趋势、预测与操作历史
        </p>
      </div>

      {/* Trend Chart */}
      <div className="card-base p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>C盘空间变化趋势</h3>
          <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>共 {spaceTimeline.length} 条快照</span>
        </div>
        {trendPoints.length >= 2 ? (
          <>
            <SpaceTrendChart points={trendPoints} />
            <div className="flex items-center gap-4 text-xs mt-2" style={{ color: 'var(--color-text-secondary)' }}>
              <span><span className="inline-block w-3 h-3 rounded-sm mr-1" style={{ backgroundColor: 'var(--color-primary)' }} />已用空间 (GB)</span>
              <span><span className="inline-block w-3 h-3 rounded-sm mr-1" style={{ backgroundColor: '#4CAF50' }} />可用空间 (GB)</span>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Inbox size={36} style={{ color: 'var(--color-text-secondary)' }} className="mb-3 opacity-60" />
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              空间趋势正在积累中，应用每天会自动记录一次 C 盘快照
            </p>
            {cDrive && (
              <p className="text-xs mt-2" style={{ color: 'var(--color-text-secondary)' }}>
                今日快照：已用 {formatSize(cDrive.used)} · 可用 {formatSize(cDrive.available)}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Alert Settings */}
      <div className="card-base p-5">
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
          <Bell size={16} style={{ color: 'var(--color-primary)' }} /> 告警设置
        </h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm" style={{ color: 'var(--color-text)' }}>空间不足告警</div>
              <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>C盘可用空间低于阈值时发送系统通知（应用运行期间每小时检查）</div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={5}
                max={30}
                value={alertThreshold}
                onChange={(e) => handleAlertThresholdChange(Number(e.target.value))}
                className="w-24 accent-orange-500"
                aria-label="空间告警阈值"
              />
              <span className="text-sm font-medium" style={{ color: 'var(--color-primary)' }}>{alertThreshold}%</span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm" style={{ color: 'var(--color-text)' }}>空间增长预测</div>
              <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                {prediction ? prediction.text : '趋势数据积累中（每天记录一次），暂无法预测增长速度'}
              </div>
            </div>
            {prediction?.trend === 'down'
              ? <TrendingDown size={18} className="text-emerald-500" />
              : <TrendingUp size={18} className="text-orange-500" />}
          </div>
        </div>
      </div>

      {/* Scheduled Tasks */}
      <div className="card-base p-5">
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
          <Clock size={16} style={{ color: 'var(--color-primary)' }} /> 定时清理计划
        </h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 rounded-lg" style={{ backgroundColor: 'var(--color-bg)' }}>
            <div className="flex items-center gap-3">
              <Calendar size={16} style={{ color: 'var(--color-primary)' }} />
              <div>
                <div className="text-sm" style={{ color: 'var(--color-text)' }}>每周自动清理</div>
                <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>每 7 天自动清理一次安全项（用户临时文件、浏览器缓存），完成后发送通知</div>
              </div>
            </div>
            <ToggleSwitch checked={weeklyClean} onChange={handleWeeklyCleanChange} />
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg" style={{ backgroundColor: 'var(--color-bg)' }}>
            <div className="flex items-center gap-3">
              <Calendar size={16} style={{ color: 'var(--color-primary)' }} />
              <div>
                <div className="text-sm" style={{ color: 'var(--color-text)' }}>每月深度扫描提醒</div>
                <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>每 30 天发送一次系统通知，提醒进行深度扫描</div>
              </div>
            </div>
            <ToggleSwitch checked={monthlyScan} onChange={handleMonthlyScanChange} />
          </div>
        </div>
        <p className="text-xs mt-3" style={{ color: 'var(--color-text-secondary)' }}>
          {bridgeReady
            ? '以上计划在 CleanC 运行期间自动执行（每小时检查一次）；应用关闭期间不会执行'
            : '网页预览模式下计划任务不生效，请在桌面版中使用'}
        </p>
      </div>

      {/* Operation History */}
      <div className="card-base p-5">
        <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--color-text)' }}>操作历史</h3>
        {history.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Inbox size={32} style={{ color: 'var(--color-text-secondary)' }} className="mb-2 opacity-60" />
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              暂无操作记录，执行清理或迁移后会自动记录在这里
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {history.map((h) => (
              <div key={h.id} className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: h.type === 'migrate' ? 'var(--color-ai-start)' : 'var(--color-primary)' }} />
                <span className="text-xs font-mono" style={{ color: 'var(--color-text-secondary)' }}>{formatDateTime(h.time)}</span>
                <span className="text-sm" style={{ color: 'var(--color-text)' }}>{h.action}</span>
                <span className="text-xs ml-auto truncate max-w-[50%]" style={{ color: 'var(--color-text-secondary)' }}>{h.detail}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
