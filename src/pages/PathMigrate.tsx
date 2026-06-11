import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDiskStore, SystemFolderInfo } from '../stores/useDiskStore'
import { formatSize } from '../utils/formatSize'
import { toast } from '../stores/useToastStore'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import {
  FolderSync,
  Monitor,
  FileText,
  Download,
  Image,
  Video,
  Music,
  MessageCircle,
  MessageSquare,
  Globe,
  Code,
  Package,
  Container,
  ArrowRight,
  Bot,
  Rocket,
  AlertTriangle,
  X,
} from 'lucide-react'

const folderIcons: Record<string, React.ElementType> = {
  monitor: Monitor, 'file-text': FileText, download: Download,
  image: Image, video: Video, music: Music,
  'message-circle': MessageCircle, 'message-square': MessageSquare,
  globe: Globe, code: Code, package: Package, container: Container,
}

type TabKey = 'system' | 'app'

const folderBaseName = (folderPath: string) => folderPath.split('\\').filter(Boolean).pop() || 'Folder'

export default function PathMigrate() {
  const { systemFolders, softwareList, disks } = useDiskStore()
  const navigate = useNavigate()
  const totalMigratable = systemFolders.reduce((acc, f) => acc + f.size, 0)
  const [activeTab, setActiveTab] = useState<TabKey>('system')
  const [planning, setPlanning] = useState<string | null>(null)
  const [migrationMessage, setMigrationMessage] = useState<string | null>(null)
  const [highlightedId, setHighlightedId] = useState<string | null>(null)
  const [confirmFolder, setConfirmFolder] = useState<SystemFolderInfo | null>(null)

  // 可选目标盘：除 C 盘外的真实磁盘；也支持完全自定义目标目录
  const targetDrives = useMemo(() => disks.filter((d) => !d.drive.toUpperCase().startsWith('C')), [disks])
  const [targetDrive, setTargetDrive] = useState<string>('')
  const [customDir, setCustomDir] = useState<string>('')
  const effectiveDrive = targetDrive || (systemFolders[0]?.targetPath ? systemFolders[0].targetPath.slice(0, 2) : targetDrives[0]?.drive || '')
  const noTargetDisk = targetDrives.length === 0 && !customDir

  const computeTarget = (folder: SystemFolderInfo) => {
    if (customDir) return `${customDir.replace(/\\+$/, '')}\\${folderBaseName(folder.path)}`
    return effectiveDrive ? `${effectiveDrive}\\${folderBaseName(folder.path)}` : ''
  }

  const handlePickCustomDir = async () => {
    if (!window.cleanC?.selectDirectory) {
      toast.error('网页预览模式不支持选择目录，请在桌面版中使用')
      return
    }
    const result = await window.cleanC.selectDirectory('选择迁移目标文件夹（将在其中创建同名子文件夹）')
    if (result.ok && result.path) {
      if (result.path.toUpperCase().startsWith('C:')) {
        toast.warning('所选目录仍在 C 盘，迁移不会释放 C 盘空间，请选择其他磁盘的目录')
      }
      setCustomDir(result.path)
      toast.success(`目标目录已设为：${result.path}`)
    }
  }

  // 真实预案：按实际扫描大小降序排序
  const sortedBySize = useMemo(
    () => [...systemFolders].filter((f) => f.size > 0).sort((a, b) => b.size - a.size),
    [systemFolders]
  )

  const doMigrate = async (folder: SystemFolderInfo) => {
    setPlanning(folder.id)
    setMigrationMessage(null)
    try {
      const target = computeTarget(folder)
      if (!target) {
        setMigrationMessage('没有可用的目标磁盘，无法迁移。')
        return
      }
      const result = await useDiskStore.getState().migratePath(folder.path, target)
      if (result.success) {
        toast.success(`${folder.name} 已迁移到 ${target}`)
        setMigrationMessage(`${folder.name} 已迁移完成，原路径已替换为软链接，可在「设置 → 操作历史」中撤销。`)
      } else {
        toast.error(`${folder.name} 迁移失败：${result.error || '未知错误'}`)
        setMigrationMessage(`${folder.name} 迁移失败：${result.error || '未知错误'}`)
      }
    } finally {
      setPlanning(null)
    }
  }

  const handleMigrateClick = (folder: SystemFolderInfo) => {
    // 尊重「操作二次确认」设置：开启时弹确认框，关闭时直接执行
    const needConfirm = localStorage.getItem('cleanc_confirm_dialog') !== 'false'
    if (needConfirm) {
      setConfirmFolder(folder)
    } else {
      void doMigrate(folder)
    }
  }

  const handlePlanAll = () => {
    setMigrationMessage(null)
    if (sortedBySize.length === 0) {
      setMigrationMessage('暂未扫描到可迁移的系统文件夹，请先刷新数据。')
      return
    }
    const top = sortedBySize[0]
    const lines = sortedBySize
      .map((f, i) => `${i + 1}. ${f.name}（${formatSize(f.size)}）→ ${computeTarget(f)}`)
      .join('；')
    setMigrationMessage(`迁移预案（按真实占用从大到小）：${lines}。已为你高亮收益最大的「${top.name}」，请逐项点击“立即迁移”执行。`)
    setHighlightedId(top.id)
    setTimeout(() => setHighlightedId(null), 5000)
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
          <FolderSync size={24} style={{ color: 'var(--color-primary)' }} /> 路径迁移
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
          真实软链接迁移：确认后执行，迁移后可在「设置 → 操作历史」中一键撤销
        </p>
      </div>

      {/* AI Full Migration Card */}
      <div
        className="card-base p-6 relative overflow-hidden"
      >
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(139, 92, 246, 0.1)' }}>
            <Rocket size={20} style={{ color: 'var(--color-ai-start)' }} />
          </div>
          <div className="flex-1">
            <div className="text-base font-medium mb-2" style={{ color: 'var(--color-text)' }}>智能全量迁移预案</div>
            <p className="text-sm mb-3" style={{ color: 'var(--color-text-secondary)' }}>
              基于真实扫描，预计可迁移 <span className="font-bold text-[var(--color-primary)]">{formatSize(totalMigratable)}</span>。采用软链接迁移，程序仍按原路径访问，迁移后可在「设置」中一键撤销。
            </p>
            <div className="space-y-1.5 text-sm mb-4">
              {systemFolders.length === 0 && (
                <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                  暂未扫描到可迁移的系统文件夹，请在桌面版刷新后查看
                </div>
              )}
              {sortedBySize.slice(0, 3).map((f) => (
                <div key={f.id} className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/50 p-2 rounded-lg" style={{ color: 'var(--color-text)' }}>
                  <span className="font-medium px-2 py-0.5 rounded text-xs" style={{ backgroundColor: 'rgba(249, 115, 22, 0.1)', color: 'var(--color-primary)' }}>推荐</span>
                  {f.name} → {computeTarget(f)}（{formatSize(f.size)}）
                </div>
              ))}
            </div>
            <button className="btn-ai text-sm" onClick={handlePlanAll} disabled={planning !== null || noTargetDisk}>
              生成迁移预案（按真实占用排序）
            </button>
          </div>
        </div>
      </div>

      {noTargetDisk && (
        <div className="p-3 rounded-lg text-xs flex items-center gap-2 bg-red-50 text-red-700 border border-red-200">
          <AlertTriangle size={14} /> 未检测到除 C 盘以外的磁盘，无法进行迁移。请接入其他磁盘后重试。
        </div>
      )}

      {migrationMessage && (
        <div className="p-3 rounded-lg text-xs bg-amber-50 text-amber-700 border border-amber-200">
          {migrationMessage}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-lg" style={{ backgroundColor: 'var(--color-card)' }}>
        {[
          { key: 'system' as TabKey, label: '系统文件夹' },
          { key: 'app' as TabKey, label: '软件输出路径' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className="flex-1 px-3 py-2 rounded-md text-xs font-medium transition-all"
            style={{
              backgroundColor: activeTab === tab.key ? 'var(--color-primary)' : 'transparent',
              color: activeTab === tab.key ? 'white' : 'var(--color-text-secondary)',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* System Folders */}
      {activeTab === 'system' && (
        <div className="space-y-3">
          {/* 真实排序建议 + 目标盘选择 */}
          <div className="p-3 rounded-lg text-xs flex flex-wrap items-center gap-3" style={{ backgroundColor: 'rgba(124,58,237,0.08)', color: 'var(--color-ai-start)' }}>
            <span>
              <Bot size={12} className="inline mr-1" />
              {sortedBySize.length > 0
                ? `按真实占用排序：${sortedBySize.map((f) => `${f.name} (${formatSize(f.size)})`).join(' → ')}`
                : '暂无扫描数据，刷新后将按真实占用大小给出迁移顺序建议'}
            </span>
            <span className="flex items-center gap-1.5 ml-auto">
              {!customDir && targetDrives.length > 0 && (
                <>
                  目标磁盘:
                  <select
                    value={effectiveDrive}
                    onChange={(e) => setTargetDrive(e.target.value)}
                    className="px-2 py-1 rounded border text-xs outline-none"
                    style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                    aria-label="选择迁移目标磁盘"
                  >
                    {targetDrives.map((d) => (
                      <option key={d.drive} value={d.drive}>
                        {d.drive}（{formatSize(d.available)} 可用）
                      </option>
                    ))}
                  </select>
                </>
              )}
              {customDir && (
                <span className="flex items-center gap-1 px-2 py-1 rounded border text-xs font-mono" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>
                  {customDir}
                  <button onClick={() => setCustomDir('')} aria-label="清除自定义目录" className="ml-1 hover:text-red-500">
                    <X size={12} />
                  </button>
                </span>
              )}
              <button className="px-2 py-1 rounded border text-xs hover:bg-slate-50 dark:hover:bg-slate-800" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }} onClick={handlePickCustomDir}>
                自定义目录...
              </button>
            </span>
          </div>
          {systemFolders.length === 0 && (
            <div className="p-8 text-center text-sm text-[var(--color-text-secondary)]">
              暂未读取到系统文件夹数据，请在桌面版中刷新后重试。
            </div>
          )}
          {systemFolders.map((folder) => {
            const Icon = folderIcons[folder.icon] || Monitor
            const target = computeTarget(folder)
            return (
              <Card 
                key={folder.id} 
                hoverable 
                className={`p-5 flex items-center gap-5 transition-all duration-500 ${
                  folder.id === highlightedId ? 'border-orange-500 ring-2 ring-orange-500/20 shadow-lg scale-[1.01]' : ''
                }`}
              >
                <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(249,115,22,0.08)' }}>
                  <Icon size={24} style={{ color: 'var(--color-primary)' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-base font-medium mb-1" style={{ color: 'var(--color-text)' }}>{folder.name}</div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-mono opacity-70" style={{ color: 'var(--color-text-secondary)' }}>{folder.path}</span>
                    <ArrowRight size={12} style={{ color: 'var(--color-primary)' }} />
                    <span className="font-mono" style={{ color: 'var(--color-primary)' }}>{target || '无可用目标盘'}</span>
                  </div>
                </div>
                <div className="text-base font-bold" style={{ color: 'var(--color-primary)' }}>{formatSize(folder.size)}</div>
                <Button
                  variant="primary"
                  size="sm"
                  className="w-24 ml-2"
                  onClick={() => handleMigrateClick(folder)}
                  disabled={planning === folder.id || noTargetDisk || !target}
                >
                  {planning === folder.id ? '迁移中...' : '立即迁移'}
                </Button>
              </Card>
            )
          })}
        </div>
      )}

      {/* Migration Confirm Dialog */}
      {confirmFolder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="card-base p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
                <AlertTriangle size={18} className="text-amber-500" /> 确认迁移
              </h3>
              <button onClick={() => setConfirmFolder(null)} style={{ color: 'var(--color-text-secondary)' }} aria-label="关闭确认弹窗">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-2 text-sm mb-4" style={{ color: 'var(--color-text)' }}>
              <p>即将把 <strong>{confirmFolder.name}</strong>（{formatSize(confirmFolder.size)}）迁移到其他磁盘：</p>
              <div className="p-3 rounded-lg text-xs font-mono space-y-1" style={{ backgroundColor: 'var(--color-bg)' }}>
                <div style={{ color: 'var(--color-text-secondary)' }}>{confirmFolder.path}</div>
                <div className="flex items-center gap-1" style={{ color: 'var(--color-primary)' }}>
                  <ArrowRight size={12} /> {computeTarget(confirmFolder)}
                </div>
              </div>
            </div>
            <div className="p-3 rounded-lg text-xs mb-4 space-y-1" style={{ backgroundColor: 'rgba(245, 158, 11, 0.08)', color: 'var(--color-risk-warning)' }}>
              <p>· 迁移期间请勿关闭应用或强制关机；大文件夹可能需要数分钟。</p>
              <p>· 迁移后原路径变为软链接，程序仍按原路径访问，不影响使用。</p>
              <p>· 如需恢复，可在「设置 → 操作历史」中一键撤销。</p>
            </div>
            <div className="flex gap-2 justify-end">
              <button className="btn-outline" onClick={() => setConfirmFolder(null)}>取消</button>
              <button
                className="btn-primary"
                onClick={() => {
                  const folder = confirmFolder
                  setConfirmFolder(null)
                  if (folder) void doMigrate(folder)
                }}
              >
                确认迁移
              </button>
            </div>
          </div>
        </div>
      )}

      {/* App Paths */}
      {activeTab === 'app' && (
        <div className="space-y-3">
          <div className="p-3 rounded-lg text-xs" style={{ backgroundColor: 'rgba(124,58,237,0.08)', color: 'var(--color-ai-start)' }}>
            <Bot size={12} className="inline mr-1" />
            以下为检测到的真实 C 盘软件。软件迁移涉及进程检测与回滚，请前往「软件迁移」完成完整流程。
          </div>
          {softwareList.length === 0 && (
            <div className="p-8 text-center text-sm text-[var(--color-text-secondary)]">
              暂未检测到 C 盘软件，请在桌面版刷新后查看
            </div>
          )}
          {softwareList.slice(0, 8).map((sw) => {
            const Icon = folderIcons[sw.icon] || Package
            return (
              <div key={sw.id} className="card-base p-4">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(255,107,53,0.08)' }}>
                    <Icon size={20} style={{ color: 'var(--color-primary)' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium mb-0.5" style={{ color: 'var(--color-text)' }}>{sw.name}</div>
                    <div className="text-xs font-mono truncate" style={{ color: 'var(--color-text-secondary)' }}>{sw.installPath}</div>
                  </div>
                  <div className="text-sm font-bold" style={{ color: 'var(--color-primary)' }}>{formatSize(sw.size)}</div>
                  <button
                    className="btn-primary text-xs !py-1.5 w-28"
                    onClick={() => navigate('/software-migrate')}
                  >
                    前往迁移
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
