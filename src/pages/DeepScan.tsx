import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatSize } from '../utils/formatSize'
import { toast } from '../stores/useToastStore'
import { useAIStore } from '../stores/useAIStore'
import { useDiskStore } from '../stores/useDiskStore'
import RiskBadge from '../components/shared/RiskBadge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import {
  Search,
  File,
  Copy,
  Ghost,
  Bot,
  ExternalLink,
  Ban,
  SlidersHorizontal,
  Trash2,
  CheckCircle2,
  X,
  AlertTriangle,
  HardDrive,
} from 'lucide-react'

type ScanTab = 'large' | 'duplicate' | 'residual'
type ScanFile = {
  id: string
  name: string
  path: string
  size: number
  lastAccess: string
  type: ScanTab
  aiNote: string
  protected?: boolean
}

const IGNORE_KEY = 'cleanc_ignored_paths'

function loadIgnoredPaths(): string[] {
  try {
    const raw = localStorage.getItem(IGNORE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export default function DeepScan() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<ScanTab>('large')
  const [sizeThreshold, setSizeThreshold] = useState(50)
  const [fullScan, setFullScan] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState(0)
  const [scanFiles, setScanFiles] = useState<ScanFile[]>([])
  const [scanSource, setScanSource] = useState<'demo' | 'system'>('system')
  const [scanError, setScanError] = useState<string | null>(null)
  const [currentScanningFile, setCurrentScanningFile] = useState<string | null>(null)
  const [ignoredPaths, setIgnoredPaths] = useState<string[]>(() => loadIgnoredPaths())
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showCleanConfirm, setShowCleanConfirm] = useState(false)
  const [cleaning, setCleaning] = useState(false)
  const useTrash = localStorage.getItem('cleanc_recycle_bin') !== 'false'

  const handleIgnore = (file: ScanFile) => {
    const next = Array.from(new Set([...ignoredPaths, file.path]))
    setIgnoredPaths(next)
    localStorage.setItem(IGNORE_KEY, JSON.stringify(next))
    toast.success(`已忽略：${file.name}（后续扫描结果中不再显示）`)
  }

  const handleClearIgnored = () => {
    setIgnoredPaths([])
    localStorage.setItem(IGNORE_KEY, JSON.stringify([]))
    toast.success('已清空忽略列表')
  }

  // 把文件交给 AI 助手分析（配置了大模型则真实问答，否则使用本地规则引擎）
  const handleAskAI = (file: ScanFile) => {
    useAIStore.getState().sendMessage(`请帮我分析这个文件：${file.path}（大小 ${formatSize(file.size)}，最后访问 ${file.lastAccess}）。它可能是什么？可以安全删除吗？`)
    navigate('/ai-assistant')
  }

  const filteredFiles = scanFiles.filter((f) => {
    if (ignoredPaths.includes(f.path)) return false
    if (activeTab === 'large') return f.type === 'large'
    if (activeTab === 'duplicate') return f.type === 'duplicate'
    return f.type === 'residual'
  })

  // 勾选与一键清理
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectableFiles = useMemo(() => filteredFiles.filter((f) => !f.protected), [filteredFiles])
  const selectedFiles = useMemo(
    () => selectableFiles.filter((f) => selectedIds.has(f.id)),
    [selectableFiles, selectedIds]
  )
  const selectedSize = selectedFiles.reduce((acc, f) => acc + f.size, 0)
  const allSelected = selectableFiles.length > 0 && selectableFiles.every((f) => selectedIds.has(f.id))

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allSelected) {
        selectableFiles.forEach((f) => next.delete(f.id))
      } else {
        selectableFiles.forEach((f) => next.add(f.id))
      }
      return next
    })
  }

  const handleCleanSelected = async () => {
    if (!window.cleanC?.deleteItems || selectedFiles.length === 0) return
    setShowCleanConfirm(false)
    setCleaning(true)
    try {
      const result = await window.cleanC.deleteItems(selectedFiles.map((f) => f.path), { useTrash })
      const okPaths = new Set(result.results.filter((r) => r.success).map((r) => r.path))
      // 从结果列表中移除已删除项
      setScanFiles((prev) => prev.filter((f) => !okPaths.has(f.path)))
      setSelectedIds(new Set())

      if (result.released > 0) {
        toast.success(`已清理 ${okPaths.size} 项，释放 ${formatSize(result.released)}（${result.mode === 'trash' ? '已移入回收站' : '已彻底删除'}）`)
      }
      if (result.failed > 0) {
        const firstError = result.results.find((r) => !r.success)
        toast.warning(`${result.failed} 项清理失败${firstError?.error ? `：${firstError.error}` : ''}`)
      }
      void useDiskStore.getState().refreshHistory()
    } finally {
      setCleaning(false)
    }
  }

  const handleScan = async () => {
    if (!window.cleanC) {
      setScanSource('demo')
      setScanError('真实深度扫描仅在桌面安装版中可用，当前页面展示演示数据。')
      return
    }

    setScanning(true)
    setScanProgress(0)
    setCurrentScanningFile(null)
    setScanError(null)

    // 清空当前 Tab 对应的旧数据
    setScanFiles((prev) => prev.filter(f => f.type !== activeTab))

    let unsubscribeProgress: (() => void) | undefined
    let unsubscribeFileFound: (() => void) | undefined

    try {
      if (activeTab === 'large') {
        // 1. 监听流式进度
        if (window.cleanC.onScanProgress) {
          unsubscribeProgress = window.cleanC.onScanProgress((data: any) => {
            setScanProgress(data.progress)
            setCurrentScanningFile(data.currentFile)
          })
        }

        // 2. 监听流式大文件发现
        if (window.cleanC.onLargeFileFound) {
          unsubscribeFileFound = window.cleanC.onLargeFileFound((fileItem: any) => {
            setScanFiles((prev) => {
              if (prev.some(f => f.id === fileItem.id)) return prev
              return [...prev, fileItem as ScanFile]
            })
          })
        }

        // 3. 发起真实的扫描（全盘模式扩大范围与时限）
        const files = await window.cleanC.scanLargeFiles({
          thresholdMB: sizeThreshold,
          deadlineMs: fullScan ? 120000 : 30000,
          maxEntries: fullScan ? 600000 : 180000,
          scope: fullScan ? 'full' : 'user',
        })

        // 4. 最终结果兜底并排序
        setScanFiles((prev) => {
          const nonLarge = prev.filter(f => f.type !== 'large')
          const large = files.filter((f: any) => f.type === 'large')
          return [...nonLarge, ...large].sort((a, b) => b.size - a.size) as ScanFile[]
        })
      } else if (activeTab === 'duplicate') {
        setCurrentScanningFile('正在扫描重复文件大小分组...')

        // 订阅主进程推送的真实扫描进度（遍历阶段 0-60%，哈希阶段 70-99%）
        if (window.cleanC.onScanProgress) {
          unsubscribeProgress = window.cleanC.onScanProgress((data: any) => {
            setScanProgress(data.progress)
            setCurrentScanningFile(data.currentFile)
          })
        }

        const files = await window.cleanC.scanDuplicateFiles()

        setScanFiles((prev) => {
          const nonDup = prev.filter(f => f.type !== 'duplicate')
          return [...nonDup, ...files] as ScanFile[]
        })
      } else if (activeTab === 'residual') {
        setScanProgress(30)
        setCurrentScanningFile('正在读取系统已安装软件列表...')
        
        const files = await window.cleanC.scanResidualFiles()
        
        setScanProgress(70)
        setCurrentScanningFile('正在比对 AppData 缓存残留特征库...')
        
        setScanFiles((prev) => {
          const nonRes = prev.filter(f => f.type !== 'residual')
          return [...nonRes, ...files] as ScanFile[]
        })
      }
      
      setScanSource('system')
      setScanProgress(100)
    } catch (error) {
      setScanError(error instanceof Error ? error.message : '扫描失败')
    } finally {
      if (unsubscribeProgress) unsubscribeProgress()
      if (unsubscribeFileFound) unsubscribeFileFound()
      setScanning(false)
      setCurrentScanningFile(null)
    }
  }

  const handleReveal = async (targetPath: string) => {
    if (!window.cleanC) {
      setScanError('打开位置仅在桌面安装版中可用。')
      return
    }

    const result = await window.cleanC.revealPath(targetPath)
    if (!result.ok) {
      setScanError(result.error || '打开位置失败')
    }
  }

  const tabConfig: { key: ScanTab; label: string; icon: React.ElementType }[] = [
    { key: 'large', label: '大文件', icon: File },
    { key: 'duplicate', label: '重复文件', icon: Copy },
    { key: 'residual', label: '卸载残留', icon: Ghost },
  ]

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
          <Search size={24} style={{ color: 'var(--color-primary)' }} /> 深度扫描
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
          发现深层冗余，保持用户控制权 · {scanSource === 'system' ? '真实大文件扫描' : '当前为演示数据'}
        </p>
      </div>

      {/* Scan Config */}
      <Card className="p-5">
        <div className="flex items-center gap-5 flex-wrap">
          {activeTab === 'large' && (
            <div className="flex items-center gap-3">
              <SlidersHorizontal size={18} style={{ color: 'var(--color-text-secondary)' }} />
              <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>大文件阈值:</span>
              <input
                type="range"
                min={10}
                max={500}
                value={sizeThreshold}
                onChange={(e) => setSizeThreshold(Number(e.target.value))}
                className="w-40 accent-orange-500"
                aria-label="大文件扫描阈值"
              />
              <span className="text-sm font-bold w-16" style={{ color: 'var(--color-primary)' }}>{sizeThreshold} MB</span>
            </div>
          )}
          {activeTab === 'duplicate' && (
            <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              扫描用户目录中大于 1MB 的文件，按「大小 + 头尾内容哈希」识别疑似重复
            </span>
          )}
          {activeTab === 'residual' && (
            <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              比对已安装软件列表与 AppData 特征库，找出已卸载软件的残留数据
            </span>
          )}
          {activeTab === 'large' && (
            <button
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors"
              style={{
                borderColor: fullScan ? 'var(--color-primary)' : 'var(--color-border)',
                color: fullScan ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                backgroundColor: fullScan ? 'rgba(249,115,22,0.08)' : 'transparent',
              }}
              onClick={() => setFullScan((v) => !v)}
              title="全盘扫描覆盖整个 C 盘（跳过 Windows 系统目录），耗时更长"
            >
              <HardDrive size={14} /> {fullScan ? '全盘扫描（C:\\ 全部）' : '快速扫描（用户目录）'}
            </button>
          )}
          <Button
            variant="primary"
            onClick={handleScan}
            disabled={scanning}
            className="!text-white font-semibold"
            style={{ color: '#ffffff', backgroundColor: 'var(--color-primary)' }}
          >
            {scanning ? '扫描中...' : '开始扫描'}
          </Button>
          
          {scanning && (
            <div className="flex-1 space-y-1.5 min-w-[200px]">
              <div className="flex items-center gap-3">
                <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-border)' }}>
                  <div
                    className="h-full rounded-full relative"
                    style={{
                      backgroundColor: 'var(--color-primary)',
                      width: `${Math.min(scanProgress, 100)}%`,
                      transition: 'width 300ms ease-out',
                    }}
                  >
                    <div className="absolute inset-0 bg-white/30 animate-pulse" />
                  </div>
                </div>
                <span className="text-sm font-bold" style={{ color: 'var(--color-primary)' }}>{Math.round(scanProgress)}%</span>
              </div>
              {currentScanningFile && (
                <div className="text-[10px] font-mono truncate max-w-md" style={{ color: 'var(--color-text-secondary)' }}>
                  正在扫描: {currentScanningFile}
                </div>
              )}
            </div>
          )}
        </div>
      </Card>

      {scanError && (
        <div className="p-3 rounded-lg text-xs bg-amber-50 text-amber-700 border border-amber-200">
          {scanError}
        </div>
      )}

      {ignoredPaths.length > 0 && (
        <div className="p-3 rounded-lg text-xs flex items-center gap-2 bg-slate-50 dark:bg-slate-800/50" style={{ color: 'var(--color-text-secondary)' }}>
          <Ban size={12} /> 已忽略 {ignoredPaths.length} 项（不在结果中显示）
          <button className="underline ml-auto" onClick={handleClearIgnored}>清空忽略列表</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-lg" style={{ backgroundColor: 'var(--color-card)' }}>
        {tabConfig.map((tab) => (
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

      {/* Selection Toolbar */}
      {filteredFiles.length > 0 && (
        <Card className="p-4 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <button
              className="w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0"
              style={{
                borderColor: allSelected ? 'var(--color-primary)' : 'var(--color-border)',
                backgroundColor: allSelected ? 'var(--color-primary)' : 'transparent',
              }}
              onClick={toggleSelectAll}
              aria-label={allSelected ? '取消全选' : '全选'}
            >
              {allSelected && <CheckCircle2 size={12} className="text-white" />}
            </button>
            <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              已选 <span className="font-bold" style={{ color: 'var(--color-text)' }}>{selectedFiles.length}</span> 项，
              共 <span className="font-bold" style={{ color: 'var(--color-primary)' }}>{formatSize(selectedSize)}</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              {useTrash ? '清理将移入回收站（可恢复）' : '当前为彻底删除模式'}
            </span>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setShowCleanConfirm(true)}
              disabled={selectedFiles.length === 0 || cleaning || !window.cleanC}
            >
              <Trash2 size={14} /> {cleaning ? '清理中...' : '清理选中项'}
            </Button>
          </div>
        </Card>
      )}

      {/* Results */}
      <div className="space-y-3">
        {filteredFiles.length === 0 && (
          <Card className="p-12 text-center flex flex-col items-center justify-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-orange-50 dark:bg-orange-950/20 flex items-center justify-center">
              <Search size={32} style={{ color: 'var(--color-primary)' }} />
            </div>
            <h3 className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>
              {scanning ? '正在深度扫描中...' : '开启深度扫描'}
            </h3>
            <p className="text-xs max-w-md" style={{ color: 'var(--color-text-secondary)' }}>
              {scanning 
                ? '正在为您实时扫描磁盘中的大文件、重复文件与卸载残留，请耐心等待...' 
                : '深度扫描将真实扫描您的 C 盘，找出占用巨大的冗余文件、疑似重复文件以及已卸载软件的残留缓存。请点击上方“开始扫描”按钮。'}
            </p>
          </Card>
        )}
        {filteredFiles.map((file) => (
          <Card key={file.id} hoverable className="p-5">
            <div className="flex items-center gap-4">
              {file.protected ? (
                <span className="w-5 h-5 flex-shrink-0" title="系统保护文件，不可删除" />
              ) : (
                <button
                  className="w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0"
                  style={{
                    borderColor: selectedIds.has(file.id) ? 'var(--color-primary)' : 'var(--color-border)',
                    backgroundColor: selectedIds.has(file.id) ? 'var(--color-primary)' : 'transparent',
                  }}
                  onClick={() => toggleSelect(file.id)}
                  aria-label={`选择 ${file.name}`}
                >
                  {selectedIds.has(file.id) && <CheckCircle2 size={12} className="text-white" />}
                </button>
              )}
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: 'rgba(249,115,22,0.08)' }}
              >
                {file.type === 'large' ? <File size={24} style={{ color: 'var(--color-primary)' }} /> :
                 file.type === 'duplicate' ? <Copy size={24} style={{ color: '#F59E0B' }} /> :
                 <Ghost size={24} style={{ color: '#94A3B8' }} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <span className="text-base font-medium" style={{ color: 'var(--color-text)' }}>{file.name}</span>
                  <RiskBadge level={file.type === 'residual' ? 'warning' : 'safe'} />
                </div>
                <p className="text-xs font-mono truncate opacity-70" style={{ color: 'var(--color-text-secondary)' }}>{file.path}</p>
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>最后访问: {file.lastAccess}</span>
                  <span className="text-xs px-2 py-0.5 rounded-md" style={{ backgroundColor: 'rgba(139, 92, 246, 0.1)', color: 'var(--color-ai-start)' }}>
                    AI: {file.aiNote}
                  </span>
                </div>
              </div>
              <div className="text-base font-bold" style={{ color: 'var(--color-primary)' }}>{formatSize(file.size)}</div>
              <div className="flex gap-1.5 ml-4">
                <button
                  className="p-2 rounded-lg transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
                  title="打开位置"
                  aria-label={`打开 ${file.name} 所在位置`}
                  onClick={() => handleReveal(file.path)}
                >
                  <ExternalLink size={16} style={{ color: 'var(--color-text-secondary)' }} />
                </button>
                <button
                  className="p-2 rounded-lg transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
                  title="忽略此项（不再显示在扫描结果中）"
                  aria-label={`忽略 ${file.name}`}
                  onClick={() => handleIgnore(file)}
                >
                  <Ban size={16} style={{ color: 'var(--color-text-secondary)' }} />
                </button>
                <button
                  className="p-2 rounded-lg transition-colors hover:bg-purple-50 dark:hover:bg-purple-900/30"
                  title="让 AI 助手分析这个文件"
                  aria-label={`让 AI 助手分析 ${file.name}`}
                  onClick={() => handleAskAI(file)}
                >
                  <Bot size={16} style={{ color: 'var(--color-ai-start)' }} />
                </button>
                {!file.protected && (
                  <button
                    className="p-2 rounded-lg transition-colors hover:bg-red-50 dark:hover:bg-red-900/30"
                    title={useTrash ? '移入回收站' : '彻底删除'}
                    aria-label={`删除 ${file.name}`}
                    onClick={() => {
                      setSelectedIds(new Set([file.id]))
                      setShowCleanConfirm(true)
                    }}
                  >
                    <Trash2 size={16} className="text-red-500" />
                  </button>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Clean Confirm Dialog */}
      {showCleanConfirm && selectedFiles.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="card-base p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
                <AlertTriangle size={18} className="text-amber-500" /> 确认清理 {selectedFiles.length} 项
              </h3>
              <button onClick={() => setShowCleanConfirm(false)} style={{ color: 'var(--color-text-secondary)' }} aria-label="关闭确认弹窗">
                <X size={20} />
              </button>
            </div>
            <p className="text-sm mb-3" style={{ color: 'var(--color-text)' }}>
              共 <span className="font-bold" style={{ color: 'var(--color-primary)' }}>{formatSize(selectedSize)}</span>，
              {useTrash ? '将移入系统回收站，可在回收站中恢复。' : '将被彻底删除，不可恢复！'}
            </p>
            <div className="space-y-1.5 mb-4 max-h-44 overflow-y-auto">
              {selectedFiles.slice(0, 30).map((f) => (
                <div key={f.id} className="flex items-center gap-2 text-xs">
                  <CheckCircle2 size={12} className="text-green-500 flex-shrink-0" />
                  <span className="truncate" style={{ color: 'var(--color-text)' }}>{f.name}</span>
                  <span className="ml-auto flex-shrink-0" style={{ color: 'var(--color-text-secondary)' }}>{formatSize(f.size)}</span>
                </div>
              ))}
              {selectedFiles.length > 30 && (
                <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>……以及另外 {selectedFiles.length - 30} 项</div>
              )}
            </div>
            {selectedFiles.some((f) => f.type === 'duplicate') && (
              <div className="p-3 rounded-lg text-xs mb-3 bg-amber-50 text-amber-700 border border-amber-200">
                包含疑似重复文件：建议先用「打开位置」核对内容确为重复后再删除，每组请至少保留一份。
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <button className="btn-outline" onClick={() => setShowCleanConfirm(false)}>取消</button>
              <button className="btn-primary" onClick={handleCleanSelected}>
                {useTrash ? '确认移入回收站' : '确认彻底删除'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cleaning Overlay */}
      {cleaning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm" style={{ backgroundColor: 'rgba(15, 23, 42, 0.4)' }}>
          <Card className="p-8 text-center flex flex-col items-center shadow-2xl border-none">
            <div className="w-12 h-12 rounded-full border-4 border-transparent border-t-[var(--color-primary)] animate-spin mb-4" />
            <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
              {useTrash ? '正在移入回收站...' : '正在彻底删除...'}
            </p>
          </Card>
        </div>
      )}
    </div>
  )
}
