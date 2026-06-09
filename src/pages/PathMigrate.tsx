import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDiskStore } from '../stores/useDiskStore'
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
  Check,
  Rocket,
} from 'lucide-react'

const folderIcons: Record<string, React.ElementType> = {
  monitor: Monitor, 'file-text': FileText, download: Download,
  image: Image, video: Video, music: Music,
  'message-circle': MessageCircle, 'message-square': MessageSquare,
  globe: Globe, code: Code, package: Package, container: Container,
}

type TabKey = 'system' | 'app'

export default function PathMigrate() {
  const { systemFolders, softwareList } = useDiskStore()
  const navigate = useNavigate()
  const totalMigratable = systemFolders.reduce((acc, f) => acc + f.size, 0)
  const [activeTab, setActiveTab] = useState<TabKey>('system')
  const [planning, setPlanning] = useState<string | null>(null)
  const [migrationMessage, setMigrationMessage] = useState<string | null>(null)
  const [highlightedId, setHighlightedId] = useState<string | null>(null)

  const handlePlan = async (id: string) => {
    setPlanning(id)
    setMigrationMessage(null)
    
    if (id === 'ai-all') {
      setMigrationMessage('已生成全量迁移预案。已为您自动高亮推荐迁移的系统文件夹，请在下方确认后点击执行。')
      setPlanning(null)
      // 自动高亮“下载”文件夹
      setHighlightedId('downloads')
      // 5秒后取消高亮
      setTimeout(() => setHighlightedId(null), 5000)
      return
    }

    try {
      const folder = systemFolders.find(f => f.id === id)
      if (!folder) {
        setMigrationMessage('未找到要迁移的文件夹，请重新扫描后再试。')
        return
      }

      const result = await useDiskStore.getState().migratePath(folder.path, folder.targetPath)
      if (result.success) {
        toast.success(`${folder.name} 已迁移到 ${folder.targetPath}`)
        setMigrationMessage(`${folder.name} 已迁移完成。`)
      } else {
        toast.error(`${folder.name} 迁移失败：${result.error || '未知错误'}`)
        setMigrationMessage(`${folder.name} 迁移失败：${result.error || '未知错误'}`)
      }
    } finally {
      setPlanning(null)
    }
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
          <FolderSync size={24} style={{ color: 'var(--color-primary)' }} /> 路径迁移
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
          生成路径迁移建议；真实迁移需确认备份、权限与回滚
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
            <div className="text-base font-medium mb-2" style={{ color: 'var(--color-text)' }}>AI 智能全量迁移</div>
            <p className="text-sm mb-3" style={{ color: 'var(--color-text-secondary)' }}>
              基于真实扫描，预计可迁移 <span className="font-bold text-[var(--color-primary)]">{formatSize(totalMigratable)}</span>。采用软链接迁移，程序仍按原路径访问，请逐项确认后再执行。
            </p>
            <div className="space-y-1.5 text-sm mb-4">
              {systemFolders.length === 0 && (
                <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                  暂未扫描到可迁移的系统文件夹，请在桌面版刷新后查看
                </div>
              )}
              {systemFolders.slice(0, 3).map((f) => (
                <div key={f.id} className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/50 p-2 rounded-lg" style={{ color: 'var(--color-text)' }}>
                  <span className="font-medium px-2 py-0.5 rounded text-xs" style={{ backgroundColor: 'rgba(249, 115, 22, 0.1)', color: 'var(--color-primary)' }}>推荐</span>
                  {f.name} → {f.targetPath}（{formatSize(f.size)}）
                </div>
              ))}
            </div>
            <button className="btn-ai text-sm" onClick={() => handlePlan('ai-all')} disabled={planning !== null}>
              {planning === 'ai-all' ? '正在生成预案...' : '生成 AI 迁移预案'}
            </button>
          </div>
        </div>
      </div>

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
          {/* AI Sort Suggestion */}
          <div className="p-3 rounded-lg text-xs" style={{ backgroundColor: 'rgba(124,58,237,0.08)', color: 'var(--color-ai-start)' }}>
            <Bot size={12} className="inline mr-1" />
            AI 建议按收益排序：下载 (8.2GB) → 视频 (15.6GB) → 桌面 (2.3GB) → 图片 (3.5GB) → 音乐 (2.1GB) → 文档 (1.1GB)
          </div>
          {systemFolders.length === 0 && (
            <div className="p-8 text-center text-sm text-[var(--color-text-secondary)]">
              暂未读取到系统文件夹数据，请在桌面版中刷新后重试。
            </div>
          )}
          {systemFolders.map((folder) => {
            const Icon = folderIcons[folder.icon] || Monitor
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
                    <span className="font-mono" style={{ color: 'var(--color-primary)' }}>{folder.targetPath}</span>
                  </div>
                </div>
                <div className="text-base font-bold" style={{ color: 'var(--color-primary)' }}>{formatSize(folder.size)}</div>
                <Button
                  variant="primary"
                  size="sm"
                  className="w-24 ml-2"
                  onClick={() => handlePlan(folder.id)}
                  disabled={planning === folder.id}
                >
                  {planning === folder.id ? '迁移中...' : '立即迁移'}
                </Button>
              </Card>
            )
          })}
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
