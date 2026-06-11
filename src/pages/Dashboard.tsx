import { useDiskStore } from '../stores/useDiskStore'
import { formatSize } from '../utils/formatSize'
import { toast } from '../stores/useToastStore'
import CircularProgress from '../components/shared/CircularProgress'
import HealthScore from '../components/shared/HealthScore'
import RiskBadge from '../components/shared/RiskBadge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { useNavigate } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  Bot,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  FolderSync,
  HardDriveDownload,
  CheckCircle2,
  X,
} from 'lucide-react'

const historyIconMap: Record<string, React.ElementType> = {
  clean: Sparkles,
  migrate: FolderSync,
  scan: HardDriveDownload,
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} 天前`
  return new Date(timestamp).toLocaleDateString('zh-CN')
}

export default function Dashboard() {
  const { disks, suggestions, loadingSystemData, systemDataError, dataSource, refreshSystemData, history, refreshHistory, runSafeClean } = useDiskStore()
  const navigate = useNavigate()
  const bridgeReady = Boolean(window.cleanC)
  const cDrive = disks[0]
  const usedPercentage = cDrive?.total ? Math.round((cDrive.used / cDrive.total) * 100) : 0
  const totalCleanable = useMemo(
    () => suggestions.reduce((acc, s) => acc + (s.type === 'clean' ? s.size : 0), 0),
    [suggestions]
  )
  const totalMigratable = useMemo(
    () => suggestions.reduce((acc, s) => acc + (s.type === 'migrate' ? s.size : 0), 0),
    [suggestions]
  )

  useEffect(() => {
    refreshSystemData()
    refreshHistory()
  }, [refreshSystemData, refreshHistory])

  // 一键全面优化：扫描 → 清理安全项 → 报告，真实串联流程
  const [optimizing, setOptimizing] = useState(false)
  const [optimizeStage, setOptimizeStage] = useState('')
  const [showOptimizeConfirm, setShowOptimizeConfirm] = useState(false)
  const [pendingItems, setPendingItems] = useState<{ id: string; name: string; size: number }[]>([])

  const executeOptimize = async (ids: string[]) => {
    setShowOptimizeConfirm(false)
    setOptimizing(true)
    try {
      setOptimizeStage('正在清理安全项...')
      const result = await runSafeClean(ids)
      const modeText = result.mode === 'trash' ? '已移入回收站' : '已彻底删除'
      if (result.released > 0) {
        toast.success(`一键优化完成：释放 ${formatSize(result.released)}（${modeText}），失败 ${result.failed} 项`)
      } else {
        toast.warning('本次没有可释放的空间，可尝试深度扫描或迁移大文件夹')
      }
    } finally {
      setOptimizing(false)
      setOptimizeStage('')
    }
  }

  const handleOptimizeAll = async () => {
    if (!bridgeReady) {
      navigate('/quick-clean')
      return
    }
    setOptimizing(true)
    setOptimizeStage('正在扫描可清理项...')
    try {
      await refreshSystemData(true)
      const items = useDiskStore.getState().cleanItems
        .filter((i) => i.riskLevel === 'safe' && i.size > 0)
        .map((i) => ({ id: i.id, name: i.name, size: i.size }))

      if (items.length === 0) {
        toast.warning('未发现可安全清理的项目，建议使用「深度扫描」查找大文件')
        setOptimizing(false)
        setOptimizeStage('')
        return
      }

      // 尊重「操作二次确认」设置
      const needConfirm = localStorage.getItem('cleanc_confirm_dialog') !== 'false'
      if (needConfirm) {
        setPendingItems(items)
        setOptimizing(false)
        setOptimizeStage('')
        setShowOptimizeConfirm(true)
      } else {
        await executeOptimize(items.map((i) => i.id))
      }
    } catch {
      setOptimizing(false)
      setOptimizeStage('')
    }
  }

  const commandCards = [
    {
      title: '安全清理',
      description: `预计释放 ${formatSize(totalCleanable)}`,
      action: '立即处理',
      path: '/quick-clean',
      icon: Sparkles,
      tone: 'emerald',
    },
    {
      title: '深度扫描',
      description: '查找下载、桌面、文档中的真实大文件',
      action: '开始扫描',
      path: '/deep-scan',
      icon: Search,
      tone: 'blue',
    },
    {
      title: '路径迁移',
      description: `可迁移 ${formatSize(totalMigratable)} 到其他盘`,
      action: '查看预案',
      path: '/path-migrate',
      icon: FolderSync,
      tone: 'orange',
    },
  ]

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Page Title & One-Click Optimize */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>仪表盘</h1>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              C盘空间概览与智能建议
            </p>
            <span
              className="text-xs px-2 py-0.5 rounded-full"
              style={{ backgroundColor: 'rgba(249,115,22,0.1)', color: 'var(--color-primary)' }}
            >
              {loadingSystemData ? '正在读取系统数据' : dataSource === 'system' ? '真实系统数据' : '演示数据'}
            </span>
            {systemDataError && (
              <span className="text-xs text-amber-600">读取失败，已使用演示数据</span>
            )}
          </div>
        </div>
        <Button 
          variant="primary" 
          size="lg" 
          className="shadow-lg shadow-orange-500/20"
          onClick={handleOptimizeAll}
          disabled={optimizing}
        >
          <Sparkles size={18} className={optimizing ? 'animate-pulse' : ''} />
          {optimizing ? (optimizeStage || '优化中...') : '一键全面优化'}
        </Button>
      </div>

      {/* 一键优化确认弹窗 */}
      {showOptimizeConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="card-base p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>一键优化确认</h3>
              <button onClick={() => setShowOptimizeConfirm(false)} style={{ color: 'var(--color-text-secondary)' }} aria-label="关闭确认弹窗">
                <X size={20} />
              </button>
            </div>
            <p className="text-sm mb-3" style={{ color: 'var(--color-text)' }}>
              将清理以下安全项，共 <span className="font-bold" style={{ color: 'var(--color-primary)' }}>
                {formatSize(pendingItems.reduce((a, i) => a + i.size, 0))}
              </span>：
            </p>
            <div className="space-y-1.5 mb-4 max-h-44 overflow-y-auto">
              {pendingItems.map((item) => (
                <div key={item.id} className="flex items-center gap-2 text-xs">
                  <CheckCircle2 size={12} className="text-green-500 flex-shrink-0" />
                  <span style={{ color: 'var(--color-text)' }}>{item.name}</span>
                  <span className="ml-auto" style={{ color: 'var(--color-text-secondary)' }}>{formatSize(item.size)}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-2 justify-end">
              <button className="btn-outline" onClick={() => setShowOptimizeConfirm(false)}>取消</button>
              <button className="btn-primary" onClick={() => void executeOptimize(pendingItems.map((i) => i.id))}>
                确认优化
              </button>
            </div>
          </div>
        </div>
      )}

      <Card className="overflow-hidden border-none shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
        <div className="relative p-6 bg-gradient-to-br from-orange-500 via-orange-400 to-violet-500 text-white">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.35),transparent_32%)]" />
          <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/18 px-3 py-1 text-xs font-medium backdrop-blur">
                  <ShieldCheck size={14} /> {bridgeReady ? '桌面引擎已连接' : '网页预览模式'}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/18 px-3 py-1 text-xs font-medium backdrop-blur">
                  <Activity size={14} /> {dataSource === 'system' ? '真实系统数据' : '演示数据'}
                </span>
              </div>
              <h2 className="text-2xl font-bold tracking-tight">可信执行中心</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/85">
                优先显示可验证的清理收益、真实扫描状态和可回滚迁移路径，让每一步操作都有明确边界。
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                size="sm"
                className="bg-white/12 text-white border-white/30 hover:bg-white/20 hover:text-white"
                onClick={() => refreshSystemData(true)}
                disabled={loadingSystemData}
              >
                <RefreshCw size={16} className={loadingSystemData ? 'animate-spin' : ''} />
                {loadingSystemData ? '刷新中' : '刷新真实数据'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="!bg-white !text-orange-600 !border-white/40 hover:!bg-white/90 hover:!text-orange-700 shadow-sm font-semibold"
                style={{ color: '#ea580c', backgroundColor: '#ffffff' }}
                onClick={() => navigate('/deep-scan')}
              >
                <Search size={16} style={{ color: '#ea580c' }} /> 深度扫描
              </Button>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-0 divide-y md:divide-y-0 md:divide-x" style={{ borderColor: 'var(--color-border)' }}>
          {commandCards.map((card) => {
            const Icon = card.icon
            return (
              <button
                key={card.title}
                onClick={() => navigate(card.path)}
                className="group p-5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
              >
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    card.tone === 'emerald'
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      : card.tone === 'blue'
                        ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                        : 'bg-orange-500/10 text-orange-600 dark:text-orange-400'
                  }`}>
                    <Icon size={20} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{card.title}</div>
                    <p className="mt-1 text-xs leading-5" style={{ color: 'var(--color-text-secondary)' }}>{card.description}</p>
                    <div className="mt-3 text-xs font-medium text-[var(--color-primary)] group-hover:translate-x-0.5 transition-transform">
                      {card.action}
                    </div>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </Card>

      {/* Top Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* C Drive Usage */}
        <Card className="p-6 flex items-center gap-6">
          <CircularProgress percentage={usedPercentage} label="使用率" />
          <div className="space-y-2">
            <div className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
              C盘 <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(255,107,53,0.1)', color: 'var(--color-primary)' }}>{cDrive?.type || 'SSD'}</span>
            </div>
            <div className="text-xs space-y-1" style={{ color: 'var(--color-text-secondary)' }}>
              <div>总容量: {formatSize(cDrive?.total || 0)}</div>
              <div>已使用: {formatSize(cDrive?.used || 0)}</div>
              <div>可用: {formatSize(cDrive?.available || 0)}</div>
            </div>
          </div>
        </Card>

        {/* Health Score */}
        <Card className="p-6 flex items-center gap-6">
          <HealthScore score={cDrive?.healthScore || 0} size={120} />
          <div className="space-y-2">
            <div className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>健康评分</div>
            <div className="text-xs space-y-1" style={{ color: 'var(--color-text-secondary)' }}>
              <div>可用空间占比: {cDrive?.total ? Math.round((cDrive.available / cDrive.total) * 100) : 0}%</div>
              <div>待清理空间: {formatSize(totalCleanable)}</div>
              <div>可迁移空间: {formatSize(totalMigratable)}</div>
              <div>其他可用磁盘: {Math.max(0, disks.length - 1)} 个</div>
            </div>
          </div>
        </Card>

        {/* Quick Stats */}
        <Card className="p-6 space-y-4">
          <div className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>可释放空间</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl" style={{ backgroundColor: 'rgba(16, 185, 129, 0.08)' }}>
              <Sparkles size={18} className="text-emerald-500 mb-1" />
              <div className="text-lg font-bold text-emerald-600">{formatSize(totalCleanable)}</div>
              <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>可清理</div>
            </div>
            <div className="p-3 rounded-xl" style={{ backgroundColor: 'rgba(249, 115, 22, 0.08)' }}>
              <FolderSync size={18} style={{ color: 'var(--color-primary)' }} className="mb-1" />
              <div className="text-lg font-bold" style={{ color: 'var(--color-primary)' }}>{formatSize(totalMigratable)}</div>
              <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>可迁移</div>
            </div>
          </div>
          {/* Other drives */}
          <div className="space-y-2 pt-2">
            {disks.slice(1).map((d) => (
              <div key={d.drive} className="flex items-center gap-2 text-xs">
                <span className="font-medium" style={{ color: 'var(--color-text)' }}>{d.drive}</span>
                <div className="flex-1 h-2 rounded-full" style={{ backgroundColor: 'var(--color-border)' }}>
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(d.used / d.total) * 100}%`,
                      backgroundColor: 'var(--color-primary)',
                    }}
                  />
                </div>
                <span style={{ color: 'var(--color-text-secondary)' }}>{formatSize(d.available)} 可用</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* AI Summary Card */}
      <div>
        <div
          className={`card-base p-6 relative overflow-hidden ${loadingSystemData ? 'ai-shimmer-loading' : 'ai-card-glimmer'}`}
        >
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(139, 92, 246, 0.1)' }}>
              <Bot size={20} style={{ color: 'var(--color-ai-start)' }} />
            </div>
            <div className="flex-1">
              <div className="text-base font-medium mb-3" style={{ color: 'var(--color-text)' }}>智能分析建议</div>
              <div className="text-sm space-y-2" style={{ color: 'var(--color-text-secondary)' }}>
                <p>你的C盘主要被以下3个"大户"占据：</p>
                <div className="space-y-2 pl-2 mt-2">
                  {suggestions.slice(0, 3).map((s, idx) => (
                    <div key={s.id} className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/50 p-2 rounded-lg">
                      <span className="font-medium px-2 py-0.5 rounded text-xs" style={{ backgroundColor: 'rgba(249, 115, 22, 0.1)', color: 'var(--color-primary)' }}>#{idx + 1}</span>
                      <span style={{ color: 'var(--color-text)' }}>{s.title} ({formatSize(s.size)})</span>
                      <span className="text-xs ml-auto">— {s.type === 'migrate' ? '建议迁移到D盘' : '安全，可直接清理'}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 mt-5">
                <Button variant="primary" size="sm" onClick={() => navigate('/quick-clean')}>一键执行全部建议</Button>
                <Button variant="outline" size="sm" onClick={() => navigate('/detective')}>查看详细分析</Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Suggestions */}
      <div>
        <div className="flex items-center justify-between mb-4 mt-2">
          <h2 className="text-lg font-medium" style={{ color: 'var(--color-text)' }}>待处理项目</h2>
          <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>按释放空间大小排序</span>
        </div>
        <div className="space-y-3">
          {suggestions.map((s) => (
            <div
              key={s.id}
              className="card-base p-5 flex items-center gap-5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1.5">
                  <span className="text-base font-medium" style={{ color: 'var(--color-text)' }}>{s.title}</span>
                  <RiskBadge level={s.riskLevel} />
                  {s.type === 'migrate' && (
                    <span className="text-xs px-2 py-1 rounded-md font-medium" style={{ backgroundColor: 'rgba(249, 115, 22, 0.1)', color: 'var(--color-primary)' }}>
                      可迁移
                    </span>
                  )}
                </div>
                <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{s.description}</p>
              </div>
              {s.size > 0 && (
                <div className="text-base font-semibold" style={{ color: 'var(--color-primary)' }}>
                  {formatSize(s.size)}
                </div>
              )}
              <button
                className="btn-outline text-sm whitespace-nowrap ml-2"
                onClick={() => {
                  if (s.type === 'clean') navigate('/quick-clean')
                  else if (s.type === 'migrate') navigate('/path-migrate')
                  else if (s.type === 'alert') navigate('/quick-clean')
                  else navigate('/detective')
                }}
              >
                {s.action}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Operations */}
      <div>
        <h2 className="text-base font-semibold mb-3" style={{ color: 'var(--color-text)' }}>最近操作</h2>
        <div className="card-base p-4 space-y-3">
          {history.length === 0 && (
            <div className="text-sm py-4 text-center" style={{ color: 'var(--color-text-secondary)' }}>
              {dataSource === 'system' ? '暂无操作记录，执行清理或迁移后会自动记录在这里' : '桌面版中执行清理 / 迁移后，真实操作记录会显示在这里'}
            </div>
          )}
          {history.slice(0, 6).map((op) => {
            const Icon = historyIconMap[op.type] || Sparkles
            return (
              <div key={op.id} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(255,107,53,0.1)' }}>
                  <Icon size={16} style={{ color: 'var(--color-primary)' }} />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{op.action}</div>
                  <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{op.detail}</div>
                </div>
                <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{formatRelativeTime(op.time)}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
