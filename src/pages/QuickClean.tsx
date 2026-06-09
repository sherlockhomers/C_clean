import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDiskStore } from '../stores/useDiskStore'
import { formatSize } from '../utils/formatSize'
import { toast } from '../stores/useToastStore'
import RiskBadge from '../components/shared/RiskBadge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import {
  Sparkles,
  File,
  Globe,
  Trash2,
  Download,
  Image,
  ScrollText,
  Zap,
  AlertCircle,
  Archive,
  CheckCircle2,
  X,
  Eye,
} from 'lucide-react'

const iconMap: Record<string, React.ElementType> = {
  file: File,
  globe: Globe,
  trash: Trash2,
  download: Download,
  image: Image,
  scroll: ScrollText,
  zap: Zap,
  'alert-circle': AlertCircle,
  archive: Archive,
}

export default function QuickClean() {
  const navigate = useNavigate()
  const {
    cleanItems,
    toggleCleanItem,
    selectAllCleanItems,
    deselectAllCleanItems,
    refreshSystemData,
    runSafeClean,
    loadingSystemData,
    systemDataError,
    dataSource,
  } = useDiskStore()
  const [showConfirm, setShowConfirm] = useState(false)
  const [showResult, setShowResult] = useState(false)
  const [cleaning, setCleaning] = useState(false)
  const [cleanResult, setCleanResult] = useState({ released: 0, failed: 0, skipped: 0 })

  const safeItems = useMemo(() => cleanItems.filter((i) => i.riskLevel === 'safe'), [cleanItems])
  const selectedItems = useMemo(() => cleanItems.filter((i) => i.selected), [cleanItems])
  const totalSize = useMemo(() => selectedItems.reduce((acc, i) => acc + i.size, 0), [selectedItems])
  const allSafeSelected = safeItems.length > 0 && safeItems.every((i) => i.selected)
  const canRunClean = Boolean(window.cleanC)

  useEffect(() => {
    refreshSystemData()
  }, [refreshSystemData])

  const handleClean = async () => {
    setShowConfirm(false)
    setCleaning(true)
    try {
      const result = await runSafeClean(selectedItems.map((item) => item.id))
      setCleanResult(result)
      setShowResult(true)
      if (result.released > 0) {
        toast.success(`清理完成，已释放 ${formatSize(result.released)}`)
      } else if (result.failed > 0) {
        toast.warning(`清理完成，但有 ${result.failed} 项未能清理`)
      }
    } finally {
      setCleaning(false)
    }
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>快速清理</h1>
        <div className="flex items-center gap-3 mt-1">
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {canRunClean ? '已选项目会优先移入回收站，风险项请确认后再勾选' : '网页预览仅展示数据，真实清理请使用桌面安装版'}
          </p>
          <span
            className="text-xs px-2 py-0.5 rounded-full"
            style={{ backgroundColor: 'rgba(249,115,22,0.1)', color: 'var(--color-primary)' }}
          >
            {loadingSystemData ? '扫描中' : dataSource === 'system' ? '真实扫描' : '演示数据'}
          </span>
          {systemDataError && <span className="text-xs text-amber-600">读取失败，已使用回退数据</span>}
        </div>
      </div>

      {/* Toolbar */}
      <Card className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={allSafeSelected ? deselectAllCleanItems : selectAllCleanItems}
          >
            {allSafeSelected ? '取消全选' : '全选安全项'}
          </Button>
          <span className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
            已选 {selectedItems.length} 项，共 <span className="text-[var(--color-text)]">{formatSize(totalSize)}</span>
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refreshSystemData(true)}
            disabled={loadingSystemData}
          >
            <Eye size={16} /> {loadingSystemData ? '扫描中...' : '重新扫描'}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowConfirm(true)}
            disabled={selectedItems.length === 0 || !canRunClean}
          >
            <Sparkles size={16} /> {canRunClean ? '一键清理' : '桌面版可清理'}
          </Button>
        </div>
      </Card>

      {/* Clean Items List */}
      <div className="space-y-3">
        {cleanItems.map((item) => {
          const Icon = iconMap[item.icon] || File
          return (
            <Card key={item.id} hoverable className="p-5 flex items-center gap-5">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors"
                style={{ backgroundColor: item.selected ? 'rgba(249,115,22,0.1)' : 'var(--color-bg)' }}
              >
                <Icon size={24} style={{ color: item.selected ? 'var(--color-primary)' : 'var(--color-text-secondary)' }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <span className="text-base font-medium" style={{ color: 'var(--color-text)' }}>{item.name}</span>
                  <RiskBadge level={item.riskLevel} />
                </div>
                <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{item.description}</p>
                <p className="text-xs mt-1 font-mono truncate" style={{ color: 'var(--color-text-secondary)', opacity: 0.7 }}>{item.path}</p>
              </div>
              <div className="text-base font-semibold" style={{ color: item.selected ? 'var(--color-primary)' : 'var(--color-text-secondary)' }}>
                {formatSize(item.size)}
              </div>
              <button
                onClick={() => toggleCleanItem(item.id)}
                className="relative w-12 h-6 rounded-full transition-colors duration-300 flex-shrink-0 ml-2"
                style={{ backgroundColor: item.selected ? 'var(--color-primary)' : 'var(--color-border)' }}
              >
                <div
                  className="absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform duration-300 shadow-sm"
                  style={{ transform: item.selected ? 'translateX(24px)' : 'translateX(0)' }}
                />
              </button>
            </Card>
          )
        })}
      </div>

      {/* Confirm Dialog */}
      {showConfirm && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          >
            <div
              className="card-base p-6 max-w-md w-full mx-4"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>AI 确认报告</h3>
                <button onClick={() => setShowConfirm(false)} style={{ color: 'var(--color-text-secondary)' }}>
                  <X size={20} />
                </button>
              </div>
              <p className="text-sm mb-3" style={{ color: 'var(--color-text)' }}>
                即将为你释放 <span className="font-bold" style={{ color: 'var(--color-primary)' }}>{formatSize(totalSize)}</span> 空间，包括：
              </p>
              <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
                {selectedItems.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 text-sm">
                    <CheckCircle2 size={14} className="text-green-500 flex-shrink-0" />
                    <span style={{ color: 'var(--color-text)' }}>{item.name}</span>
                    <span className="ml-auto" style={{ color: 'var(--color-text-secondary)' }}>{formatSize(item.size)}</span>
                  </div>
                ))}
              </div>
              <div
                className="p-3 rounded-lg text-xs mb-4"
                style={{ backgroundColor: 'rgba(124,58,237,0.08)', color: 'var(--color-ai-start)' }}
              >
                安全策略：清理前会展示风险标签，执行时优先移入回收站；警告项请确认用途后再继续。
              </div>
              <div className="flex gap-2 justify-end">
                <button className="btn-outline" onClick={() => setShowConfirm(false)}>取消</button>
                <button className="btn-primary" onClick={handleClean}>确认安全清理</button>
              </div>
            </div>
          </div>
        )}

      {/* Cleaning Progress */}
      {cleaning && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm"
            style={{ backgroundColor: 'rgba(15, 23, 42, 0.4)' }}
          >
            <div>
              <Card className="p-10 text-center flex flex-col items-center justify-center shadow-2xl border-none">
                <div className="relative w-24 h-24 mb-6">
                  {/* Outer spinning ring */}
                  <div
                    className="absolute inset-0 rounded-full border-4 border-transparent border-t-[var(--color-primary)] border-r-[var(--color-primary-light)] opacity-80 animate-spin"
                  />
                  {/* Inner pulsing circle */}
                  <div
                    className="absolute inset-2 rounded-full bg-[var(--color-primary)]/20 flex items-center justify-center animate-pulse"
                  >
                    <Sparkles size={32} className="text-[var(--color-primary)]" />
                  </div>
                </div>
                <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--color-text)' }}>正在深度清理</h3>
                <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>正在安全地将文件移至回收站...</p>
              </Card>
            </div>
          </div>
        )}

      {/* Result Dialog */}
      {showResult && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          >
            <div
              className="card-base p-6 max-w-md w-full mx-4"
            >
              <div className="text-center mb-4">
                <div className="w-16 h-16 rounded-full bg-green-100 mx-auto mb-3 flex items-center justify-center">
                  <CheckCircle2 size={32} className="text-green-500" />
                </div>
                <h3 className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>清理完成！</h3>
              </div>
              <p className="text-sm text-center mb-2" style={{ color: 'var(--color-text)' }}>
                已移入回收站 <span className="font-bold text-lg" style={{ color: 'var(--color-primary)' }}>{formatSize(cleanResult.released)}</span>
              </p>
              <p className="text-xs text-center mb-4" style={{ color: 'var(--color-text-secondary)' }}>
                失败 {cleanResult.failed} 项，未匹配到的项目 {cleanResult.skipped} 项
              </p>
              <div
                className="p-3 rounded-lg text-xs mb-4"
                style={{ backgroundColor: 'rgba(124,58,237,0.08)', color: 'var(--color-ai-start)' }}
              >
                下一步建议：回收站保留了本次清理内容，如确认无误可在系统回收站中最终清空。
              </div>
              <div className="flex gap-2 justify-end">
                <button className="btn-outline" onClick={() => setShowResult(false)}>稍后再说</button>
                <button className="btn-primary" onClick={() => { setShowResult(false); navigate('/path-migrate') }}>去迁移</button>
              </div>
            </div>
          </div>
        )}
    </div>
  )
}
