import { useState, useEffect, useMemo } from 'react'
import { useDiskStore } from '../stores/useDiskStore'
import { formatSize } from '../utils/formatSize'
import LeaderboardMedal from '../components/shared/LeaderboardMedal'
import {
  Radar,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  PieChart,
  Clock,
  Eye,
  Inbox,
  RefreshCw,
  ExternalLink,
} from 'lucide-react'

type TabKey = 'software' | 'folder' | 'fileType' | 'timeline' | 'hidden'

const tabs: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: 'software', label: '占用排名', icon: Radar },
  { key: 'folder', label: '文件夹排名', icon: FolderOpen },
  { key: 'fileType', label: '文件类型', icon: PieChart },
  { key: 'timeline', label: '时间线', icon: Clock },
  { key: 'hidden', label: '隐藏占用', icon: Eye },
]

interface FileTypeStatLike {
  key: string
  label: string
  fill: string
  bytes: number
}

function FileTypeDonut({ stats }: { stats: FileTypeStatLike[] }) {
  const total = stats.reduce((sum, item) => sum + item.bytes, 0) || 1
  let offset = 0

  return (
    <svg viewBox="0 0 160 160" className="w-64 h-64">
      <circle cx="80" cy="80" r="46" fill="none" stroke="var(--color-border)" strokeWidth="22" />
      {stats.map((entry) => {
        const length = (entry.bytes / total) * 289
        const segment = (
          <circle
            key={entry.key}
            cx="80"
            cy="80"
            r="46"
            fill="none"
            stroke={entry.fill}
            strokeWidth="22"
            strokeDasharray={`${length} ${289 - length}`}
            strokeDashoffset={-offset}
            strokeLinecap="round"
            transform="rotate(-90 80 80)"
          />
        )
        offset += length
        return segment
      })}
      <text x="80" y="76" textAnchor="middle" className="text-xs font-semibold" fill="var(--color-text)">类型占用</text>
      <text x="80" y="94" textAnchor="middle" className="text-[10px]" fill="var(--color-text-secondary)">{formatSize(total)}</text>
    </svg>
  )
}

function TimelineArea({ points }: { points: { date: string; used: number }[] }) {
  const width = 640
  const height = 220
  const padding = 24
  const values = points.map((item) => item.used)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const coords = points.map((item, index) => {
    const x = padding + (index / Math.max(1, points.length - 1)) * (width - padding * 2)
    const y = height - padding - ((item.used - min) / range) * (height - padding * 2)
    return { x, y, item }
  })
  const linePath = coords.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
  const areaPath = `${linePath} L ${width - padding} ${height - padding} L ${padding} ${height - padding} Z`

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-64">
      {[0, 1, 2, 3].map((line) => {
        const y = padding + line * ((height - padding * 2) / 3)
        return <line key={line} x1={padding} x2={width - padding} y1={y} y2={y} stroke="var(--color-border)" strokeDasharray="4 4" />
      })}
      <path d={areaPath} fill="rgba(255,107,53,0.15)" />
      <path d={linePath} fill="none" stroke="var(--color-primary)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {coords.map((point, index) => (
        <g key={`${point.item.date}-${index}`}>
          <circle cx={point.x} cy={point.y} r={2.5} fill="var(--color-primary)" />
          {(coords.length <= 10 || index % 3 === 0) && (
            <text x={point.x} y={height - 6} textAnchor="middle" fontSize="10" fill="var(--color-text-secondary)">
              {point.item.date}
            </text>
          )}
        </g>
      ))}
    </svg>
  )
}

const hiddenOccupancyFallback: CleanCHiddenOccupancyItem[] = [
  { name: '系统还原 / 卷影副本', desc: '系统还原点，可在“系统保护”中调整', location: 'System Volume Information', size: null },
  { name: '休眠文件 hiberfil.sys', desc: '休眠功能产生，可用 powercfg /h off 关闭', location: 'C:\\hiberfil.sys', size: null },
  { name: '虚拟内存 pagefile.sys', desc: '页面文件，可在“虚拟内存”设置中调整', location: 'C:\\pagefile.sys', size: null },
  { name: 'WSL 子系统', desc: 'Linux 子系统磁盘镜像', location: '%LOCALAPPDATA%\\Packages', size: null },
  { name: 'Docker 数据', desc: '容器镜像与卷数据', location: '%LOCALAPPDATA%\\Docker', size: null },
  { name: 'Windows Search 索引', desc: '搜索索引数据库', location: 'ProgramData\\Microsoft\\Search', size: null },
]

export default function Detective() {
  const {
    occupancyRecords,
    occupancyLoading,
    occupancyLoadedAt,
    fileTypeStats,
    spaceTimeline,
    refreshOccupancy,
    refreshFileTypeStats,
    refreshSpaceTimeline,
  } = useDiskStore()
  const [activeTab, setActiveTab] = useState<TabKey>('software')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const bridgeReady = Boolean(window.cleanC)
  const isReal = occupancyLoadedAt > 0

  // 隐藏占用：真实检测（休眠文件 / 页面文件 / WSL / Docker 等）
  const [hiddenItems, setHiddenItems] = useState<CleanCHiddenOccupancyItem[]>(hiddenOccupancyFallback)
  const [hiddenLoading, setHiddenLoading] = useState(false)
  const [hiddenLoaded, setHiddenLoaded] = useState(false)

  useEffect(() => {
    refreshOccupancy()
    refreshFileTypeStats()
    refreshSpaceTimeline()
  }, [refreshOccupancy, refreshFileTypeStats, refreshSpaceTimeline])

  useEffect(() => {
    if (activeTab !== 'hidden' || hiddenLoaded || !window.cleanC?.getHiddenOccupancy) return
    setHiddenLoading(true)
    window.cleanC.getHiddenOccupancy()
      .then((items) => {
        if (Array.isArray(items) && items.length > 0) {
          setHiddenItems(items)
        }
        setHiddenLoaded(true)
      })
      .catch(() => {})
      .finally(() => setHiddenLoading(false))
  }, [activeTab, hiddenLoaded])

  const folderRecords = useMemo(
    () => occupancyRecords.filter((r) => r.category === 'folder'),
    [occupancyRecords]
  )
  const timelinePoints = useMemo(
    () => spaceTimeline.filter((p) => p.total > 0).map((p) => ({ date: p.date.slice(5), used: Math.round((p.used / 1024 ** 3) * 10) / 10 })),
    [spaceTimeline]
  )

  const getTrendIcon = (trend: string) => {
    if (trend === 'up') return <TrendingUp size={14} className="text-red-500" />
    if (trend === 'down') return <TrendingDown size={14} className="text-green-500" />
    return <Minus size={14} style={{ color: 'var(--color-text-secondary)' }} />
  }

  const handleReveal = async (targetPath?: string) => {
    if (targetPath && window.cleanC) {
      await window.cleanC.revealPath(targetPath)
    }
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
            <Radar size={24} style={{ color: 'var(--color-primary)' }} /> 占用侦探
          </h1>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              到底谁在偷吃你的C盘？多维度排名与溯源
            </p>
            <span
              className="text-xs px-2 py-0.5 rounded-full"
              style={{ backgroundColor: 'rgba(249,115,22,0.1)', color: 'var(--color-primary)' }}
            >
              {occupancyLoading ? '正在扫描真实占用' : isReal ? '真实扫描结果' : '演示数据'}
            </span>
          </div>
        </div>
        <button
          className="btn-outline text-sm flex items-center gap-1.5"
          onClick={() => { refreshOccupancy(true); refreshFileTypeStats(true) }}
          disabled={occupancyLoading || !bridgeReady}
        >
          <RefreshCw size={14} className={occupancyLoading ? 'animate-spin' : ''} />
          {occupancyLoading ? '扫描中' : '重新扫描'}
        </button>
      </div>

      {/* Leaderboard Header */}
      <div className="card-base p-5">
        <div className="flex items-center gap-2 mb-4">
          <Radar size={18} style={{ color: 'var(--color-primary)' }} />
          <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>C盘空间占用 TOP 榜</span>
        </div>
        <div className="space-y-3">
          {occupancyRecords.slice(0, 5).map((record, i) => (
            <div key={record.id} className="flex items-center gap-3">
              <LeaderboardMedal rank={i + 1} />
              <span className="text-sm font-medium w-28 truncate" style={{ color: 'var(--color-text)' }}>{record.name}</span>
              <div className="flex-1 h-3 rounded-full" style={{ backgroundColor: 'var(--color-border)' }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${record.percentage}%`,
                    backgroundColor: i < 3 ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                    transition: 'width 500ms ease-out',
                  }}
                />
              </div>
              <span className="text-sm font-bold w-16 text-right" style={{ color: 'var(--color-primary)' }}>
                {formatSize(record.size)}
              </span>
              <span className="text-xs w-10 text-right" style={{ color: 'var(--color-text-secondary)' }}>
                {record.percentage}%
              </span>
              {getTrendIcon(record.trend)}
            </div>
          ))}
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 p-1 rounded-lg" style={{ backgroundColor: 'var(--color-card)' }}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-all"
            style={{
              backgroundColor: activeTab === tab.key ? 'var(--color-primary)' : 'transparent',
              color: activeTab === tab.key ? 'white' : 'var(--color-text-secondary)',
            }}
          >
            <tab.icon size={14} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content: 占用排名 */}
      {activeTab === 'software' && (
        <div className="space-y-3">
          {occupancyRecords.map((record, i) => (
            <div key={record.id} className="card-base overflow-hidden">
              <div
                className="p-4 flex items-center gap-4 cursor-pointer"
                onClick={() => setExpandedId(expandedId === record.id ? null : record.id)}
              >
                <LeaderboardMedal rank={i + 1} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{record.name}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text-secondary)' }}>
                      {record.category === 'software' ? '软件' : '文件夹'}
                    </span>
                    {getTrendIcon(record.trend)}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 rounded-full" style={{ backgroundColor: 'var(--color-border)' }}>
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${record.percentage}%`, backgroundColor: 'var(--color-primary)' }}
                      />
                    </div>
                    <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{record.percentage}%</span>
                  </div>
                </div>
                <div className="text-sm font-bold" style={{ color: 'var(--color-primary)' }}>{formatSize(record.size)}</div>
                {expandedId === record.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </div>
              {expandedId === record.id && (
                <div className="px-4 pb-4 space-y-2">
                  <div className="border-t pt-3" style={{ borderColor: 'var(--color-border)' }}>
                    {record.path && (
                      <div className="text-xs font-mono mb-2 truncate" style={{ color: 'var(--color-text-secondary)' }}>{record.path}</div>
                    )}
                    {record.children && record.children.length > 0 ? (
                      <>
                        <div className="text-xs font-medium mb-2" style={{ color: 'var(--color-text-secondary)' }}>占用明细 (Top)</div>
                        {record.children.map((child, ci) => (
                          <div key={ci} className="flex items-center gap-2 py-1">
                            <span className="text-xs truncate max-w-[60%]" style={{ color: 'var(--color-text)' }}>{child.name}</span>
                            <span className="text-xs ml-auto" style={{ color: 'var(--color-primary)' }}>{formatSize(child.size)}</span>
                            <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>({child.percentage}%)</span>
                          </div>
                        ))}
                      </>
                    ) : (
                      <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>暂无更细的占用明细</div>
                    )}
                  </div>
                  {record.path && (
                    <div className="flex gap-2 pt-2">
                      <button className="btn-outline text-xs !py-1 flex items-center gap-1" onClick={() => handleReveal(record.path)}>
                        <ExternalLink size={12} /> 打开位置
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 文件夹排名 */}
      {activeTab === 'folder' && (
        <div className="card-base p-5">
          <p className="text-sm mb-4" style={{ color: 'var(--color-text-secondary)' }}>
            用户目录下的真实文件夹占用排名（按大小排序）
          </p>
          {folderRecords.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Inbox size={32} className="mb-2 opacity-60" style={{ color: 'var(--color-text-secondary)' }} />
              <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                {bridgeReady ? '点击右上角“重新扫描”以获取真实文件夹占用' : '桌面版中可查看真实文件夹占用排名'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {folderRecords.map((folder) => (
                <div key={folder.id} className="flex items-center gap-3 p-3 rounded-lg" style={{ backgroundColor: 'var(--color-bg)' }}>
                  <FolderOpen size={18} style={{ color: 'var(--color-primary)' }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{folder.name}</div>
                    <div className="text-xs font-mono truncate" style={{ color: 'var(--color-text-secondary)' }}>{folder.path}</div>
                  </div>
                  <span className="text-sm font-bold" style={{ color: 'var(--color-primary)' }}>{formatSize(folder.size)}</span>
                  {folder.path && (
                    <button className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800" title="打开位置" onClick={() => handleReveal(folder.path)}>
                      <ExternalLink size={14} style={{ color: 'var(--color-text-secondary)' }} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 文件类型 */}
      {activeTab === 'fileType' && (
        <div className="card-base p-5">
          {fileTypeStats.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Inbox size={32} className="mb-2 opacity-60" style={{ color: 'var(--color-text-secondary)' }} />
              <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                {bridgeReady ? '点击右上角“重新扫描”以统计真实文件类型分布' : '桌面版中可统计真实文件类型分布'}
              </p>
            </div>
          ) : (
            <div className="flex gap-6 flex-wrap">
              <FileTypeDonut stats={fileTypeStats} />
              <div className="flex-1 min-w-[200px] space-y-2">
                {fileTypeStats.map((ft) => (
                  <div key={ft.key} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: ft.fill }} />
                    <span className="text-xs" style={{ color: 'var(--color-text)' }}>{ft.label}</span>
                    <span className="text-xs ml-auto font-bold" style={{ color: 'var(--color-text)' }}>{formatSize(ft.bytes)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 时间线 */}
      {activeTab === 'timeline' && (
        <div className="card-base p-5">
          <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--color-text)' }}>C盘已用空间变化时间线 (GB)</h3>
          {timelinePoints.length >= 2 ? (
            <TimelineArea points={timelinePoints} />
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Clock size={32} className="mb-2 opacity-60" style={{ color: 'var(--color-text-secondary)' }} />
              <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                空间时间线正在积累中，应用每天会自动记录一次 C 盘快照
              </p>
            </div>
          )}
        </div>
      )}

      {/* 隐藏占用 */}
      {activeTab === 'hidden' && (
        <div className="card-base p-5 space-y-3">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
            隐藏占用{hiddenLoading ? '（正在真实检测...）' : hiddenLoaded ? '（真实检测结果）' : ''}
          </h3>
          <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            {bridgeReady
              ? '已对常见隐藏占用进行真实检测；显示「需管理员权限」的项目请以管理员身份运行后查看。'
              : '网页预览模式仅展示项目说明，请在桌面版中查看真实大小。'}
          </p>
          {hiddenItems.map((item, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-lg" style={{ backgroundColor: 'var(--color-bg)' }}>
              <Eye size={16} style={{ color: 'var(--color-primary)' }} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{item.name}</div>
                <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{item.desc}</div>
              </div>
              <span className="text-sm font-bold flex-shrink-0" style={{ color: item.size != null ? 'var(--color-primary)' : 'var(--color-text-secondary)' }}>
                {item.size != null ? formatSize(item.size) : (hiddenLoaded ? '需管理员权限' : '—')}
              </span>
              <span className="text-xs font-mono truncate max-w-[30%]" style={{ color: 'var(--color-text-secondary)' }}>{item.location}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
