import { useState } from 'react'
import { formatSize } from '../utils/formatSize'
import RiskBadge from '../components/shared/RiskBadge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import {
  Search,
  File,
  Copy,
  Ghost,
  FolderOpen,
  Bot,
  ExternalLink,
  FolderSync,
  Ban,
  SlidersHorizontal,
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
}

export default function DeepScan() {
  const [activeTab, setActiveTab] = useState<ScanTab>('large')
  const [sizeThreshold, setSizeThreshold] = useState(50)
  const [scanning, setScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState(0)
  const [scanFiles, setScanFiles] = useState<ScanFile[]>([])
  const [scanSource, setScanSource] = useState<'demo' | 'system'>('system')
  const [scanError, setScanError] = useState<string | null>(null)
  const [currentScanningFile, setCurrentScanningFile] = useState<string | null>(null)

  const filteredFiles = scanFiles.filter((f) => {
    if (activeTab === 'large') return f.type === 'large'
    if (activeTab === 'duplicate') return f.type === 'duplicate'
    return f.type === 'residual'
  })

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

        // 3. 发起真实的扫描
        const files = await window.cleanC.scanLargeFiles({
          thresholdMB: sizeThreshold,
          deadlineMs: 30000,
          maxEntries: 180000,
        })

        // 4. 最终结果兜底并排序
        setScanFiles((prev) => {
          const nonLarge = prev.filter(f => f.type !== 'large')
          const large = files.filter((f: any) => f.type === 'large')
          return [...nonLarge, ...large].sort((a, b) => b.size - a.size) as ScanFile[]
        })
      } else if (activeTab === 'duplicate') {
        setScanProgress(30)
        setCurrentScanningFile('正在扫描重复文件大小分组...')
        
        const files = await window.cleanC.scanDuplicateFiles()
        
        setScanProgress(70)
        setCurrentScanningFile('正在计算快速哈希比对...')
        
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
                  className="p-2 rounded-lg transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 opacity-50 cursor-not-allowed"
                  title="迁移功能暂未开放"
                  aria-label={`${file.name} 迁移功能暂未开放`}
                  disabled
                >
                  <FolderSync size={16} style={{ color: 'var(--color-text-secondary)' }} />
                </button>
                <button
                  className="p-2 rounded-lg transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 opacity-50 cursor-not-allowed"
                  title="忽略功能暂未开放"
                  aria-label={`${file.name} 忽略功能暂未开放`}
                  disabled
                >
                  <Ban size={16} style={{ color: 'var(--color-text-secondary)' }} />
                </button>
                <button
                  className="p-2 rounded-lg transition-colors hover:bg-purple-50 dark:hover:bg-purple-900/30 opacity-50 cursor-not-allowed"
                  title="AI 分析暂未接入真实模型"
                  aria-label={`${file.name} AI 分析暂未接入真实模型`}
                  disabled
                >
                  <Bot size={16} style={{ color: 'var(--color-ai-start)' }} />
                </button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
