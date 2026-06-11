import { useState, useEffect } from 'react'
import { useAppStore } from '../stores/useAppStore'
import { useDiskStore } from '../stores/useDiskStore'
import { formatSize } from '../utils/formatSize'
import { toast } from '../stores/useToastStore'
import { Settings as SettingsIcon, Moon, Sun, Monitor, Bot, Shield, Database, History, RotateCcw, AlertCircle } from 'lucide-react'

const AI_PROVIDER_OPTIONS = [
  { value: 'gemini', label: 'Google Gemini', defaultModel: 'gemini-2.0-flash', needKey: true },
  { value: 'openai', label: 'OpenAI', defaultModel: 'gpt-4o-mini', needKey: true },
  { value: 'qwen', label: '通义千问（DashScope）', defaultModel: 'qwen-plus', needKey: true },
  { value: 'deepseek', label: 'DeepSeek', defaultModel: 'deepseek-chat', needKey: true },
  { value: 'ollama', label: 'Ollama（本地，无需 Key）', defaultModel: 'llama3.1', needKey: false },
]

interface HistoryRecord {
  id: string
  time: string
  type: 'clean' | 'migrate' | 'undo'
  action: string
  detail: string
  bytes: number
  source?: string
  target?: string
  undoable?: boolean
  undone?: boolean
}

export default function Settings() {
  const { theme, setTheme } = useAppStore()
  const [offlineMode, setOfflineMode] = useState(() => localStorage.getItem('cleanc_offline_mode') === 'true')
  const [recycleBin, setRecycleBin] = useState(() => localStorage.getItem('cleanc_recycle_bin') !== 'false')
  const [confirmDialog, setConfirmDialog] = useState(() => localStorage.getItem('cleanc_confirm_dialog') !== 'false')

  const handleOfflineModeChange = (val: boolean) => {
    setOfflineMode(val)
    localStorage.setItem('cleanc_offline_mode', String(val))
  }
  const handleRecycleBinChange = (val: boolean) => {
    setRecycleBin(val)
    localStorage.setItem('cleanc_recycle_bin', String(val))
    // 同步到主进程持久化设置，自动清理等后台任务也会遵循该选项
    void window.cleanC?.setSettings({ recycleBin: val })
  }
  const handleConfirmDialogChange = (val: boolean) => {
    setConfirmDialog(val)
    localStorage.setItem('cleanc_confirm_dialog', String(val))
  }

  // AI 配置：持久化并被 AI 助手真实使用
  const [aiProvider, setAiProvider] = useState(() => localStorage.getItem('cleanc_ai_provider') || 'gemini')
  const [aiKey, setAiKey] = useState(() => localStorage.getItem('cleanc_ai_key') || '')
  const [aiModel, setAiModel] = useState(() => localStorage.getItem('cleanc_ai_model') || '')
  const [testingAI, setTestingAI] = useState(false)

  const currentProvider = AI_PROVIDER_OPTIONS.find((p) => p.value === aiProvider) || AI_PROVIDER_OPTIONS[0]

  const handleAiProviderChange = (val: string) => {
    setAiProvider(val)
    localStorage.setItem('cleanc_ai_provider', val)
  }
  const handleAiKeyChange = (val: string) => {
    setAiKey(val)
    localStorage.setItem('cleanc_ai_key', val)
  }
  const handleAiModelChange = (val: string) => {
    setAiModel(val)
    localStorage.setItem('cleanc_ai_model', val)
  }

  const handleTestAI = async () => {
    if (!window.cleanC?.aiChat) {
      toast.error('网页预览模式无法连接大模型，请在桌面版中使用')
      return
    }
    setTestingAI(true)
    try {
      const result = await window.cleanC.aiChat({
        provider: aiProvider,
        apiKey: aiKey || undefined,
        model: aiModel || undefined,
        messages: [{ role: 'user', content: '请回复“连接成功”四个字' }],
      })
      if (result.ok) {
        toast.success(`连接成功：${(result.content || '').slice(0, 40)}`)
      } else {
        toast.error(`连接失败：${result.error || '未知错误'}`)
      }
    } finally {
      setTestingAI(false)
    }
  }

  const [exporting, setExporting] = useState(false)
  const [clearingCache, setClearingCache] = useState(false)

  // 系统集成：托盘常驻 + 开机自启
  const [closeToTray, setCloseToTray] = useState(true)
  const [autoStart, setAutoStart] = useState(false)

  useEffect(() => {
    window.cleanC?.getSettings?.().then((s) => setCloseToTray(s.closeToTray)).catch(() => {})
    window.cleanC?.getAutoStart?.().then((r) => setAutoStart(r.enabled)).catch(() => {})
  }, [])

  const handleCloseToTrayChange = (val: boolean) => {
    setCloseToTray(val)
    void window.cleanC?.setSettings?.({ closeToTray: val })
  }

  const handleAutoStartChange = async (val: boolean) => {
    if (!window.cleanC?.setAutoStart) {
      toast.error('网页预览模式不支持，请在桌面版中使用')
      return
    }
    setAutoStart(val)
    const result = await window.cleanC.setAutoStart(val)
    if (result.ok) {
      toast.success(val ? '已开启开机自启（登录后静默启动到托盘）' : '已关闭开机自启')
    } else {
      setAutoStart(!val)
      toast.error(result.error || '设置失败')
    }
  }

  const handleExportHistory = async () => {
    if (!window.cleanC?.exportHistory) {
      toast.error('网页预览模式不支持导出，请在桌面版中使用')
      return
    }
    setExporting(true)
    try {
      const result = await window.cleanC.exportHistory()
      if (result.ok) {
        toast.success(`日志已导出到：${result.path}`)
      } else if (!result.canceled) {
        toast.error(`导出失败：${result.error || '未知错误'}`)
      }
    } finally {
      setExporting(false)
    }
  }

  const handleClearAppCache = async () => {
    if (!window.cleanC?.clearAppCache) {
      toast.error('网页预览模式不支持，请在桌面版中使用')
      return
    }
    setClearingCache(true)
    try {
      const result = await window.cleanC.clearAppCache()
      if (result.ok) {
        toast.success(`已清理应用缓存 ${formatSize(result.clearedBytes || 0)}`)
      } else {
        toast.error(`清理失败：${result.error || '未知错误'}`)
      }
    } finally {
      setClearingCache(false)
    }
  }

  const [history, setHistory] = useState<HistoryRecord[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [undoingId, setUndoingId] = useState<string | null>(null)
  const [undoMessage, setUndoMessage] = useState<string | null>(null)
  const [showConfirmUndoId, setShowConfirmUndoId] = useState<string | null>(null)

  const fetchHistory = async () => {
    if (window.cleanC && window.cleanC.getHistory) {
      setLoadingHistory(true)
      try {
        const data = await window.cleanC.getHistory()
        // 格式化时间并转换为 HistoryRecord 数组
        const formatted = (data || []).map(item => ({
          ...item,
          time: typeof item.time === 'number' ? new Date(item.time).toLocaleString('zh-CN') : String(item.time),
          type: item.type as any,
        }))
        setHistory(formatted as HistoryRecord[])
      } catch (err) {
        console.error('获取历史记录失败:', err)
      } finally {
        setLoadingHistory(false)
      }
    }
  }

  useEffect(() => {
    fetchHistory()
  }, [])

  const handleUndo = async (record: HistoryRecord) => {
    if (!record.source || !record.target || !window.cleanC || !window.cleanC.undoMigration) return
    
    setUndoingId(record.id)
    setUndoMessage(null)
    
    try {
      const result = await window.cleanC.undoMigration(record.source, record.target)
      if (result.success) {
        setUndoMessage(`成功撤销迁移：${record.action}`)
        // 刷新磁盘数据
        await useDiskStore.getState().refreshSystemData(true)
        // 重新获取历史记录
        await fetchHistory()
      } else {
        setUndoMessage(`撤销失败：${result.error || '未知错误'}`)
      }
    } catch (err: any) {
      setUndoMessage(`撤销出错：${err.message || '未知错误'}`)
    } finally {
      setUndoingId(null)
      setTimeout(() => setUndoMessage(null), 5000)
    }
  }

  const themeOptions = [
    { value: 'light' as const, label: '浅色', icon: Sun },
    { value: 'dark' as const, label: '暗色', icon: Moon },
    { value: 'system' as const, label: '跟随系统', icon: Monitor },
  ]

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
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
          <SettingsIcon size={24} style={{ color: 'var(--color-primary)' }} /> 设置
        </h1>
      </div>

      {/* Appearance */}
      <div className="card-base p-5 space-y-4">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>外观</h3>
        <div>
          <div className="text-sm mb-2" style={{ color: 'var(--color-text)' }}>主题模式</div>
          <div className="flex gap-2">
            {themeOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setTheme(opt.value)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all"
                style={{
                  backgroundColor: theme === opt.value ? 'var(--color-primary)' : 'var(--color-bg)',
                  color: theme === opt.value ? 'white' : 'var(--color-text-secondary)',
                  border: `1px solid ${theme === opt.value ? 'var(--color-primary)' : 'var(--color-border)'}`,
                }}
              >
                <opt.icon size={16} />
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* AI Config */}
      <div className="card-base p-5 space-y-4">
        <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
          <Bot size={16} style={{ color: 'var(--color-ai-start)' }} /> AI 配置
        </h3>
        <div className="space-y-3">
          <div>
            <div className="text-sm mb-1" style={{ color: 'var(--color-text)' }}>AI 服务商</div>
            <select
              value={aiProvider}
              onChange={(e) => handleAiProviderChange(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border text-sm"
              style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              aria-label="选择 AI 服务商"
            >
              {AI_PROVIDER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <div className="text-sm mb-1" style={{ color: 'var(--color-text)' }}>
              API Key {currentProvider.needKey ? '（必填）' : '（本地服务无需填写）'}
            </div>
            <input
              type="password"
              value={aiKey}
              onChange={(e) => handleAiKeyChange(e.target.value)}
              placeholder={currentProvider.needKey ? '输入你的 API Key...' : '本地 Ollama 无需 Key'}
              className="w-full px-3 py-2 rounded-lg border text-sm"
              style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            />
            <p className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>
              {currentProvider.needKey
                ? '配置后 AI 助手将调用真实大模型；不配置则使用本地规则引擎（基于真实磁盘数据）'
                : '需要本机已启动 Ollama 服务（127.0.0.1:11434）'}
            </p>
          </div>
          <div>
            <div className="text-sm mb-1" style={{ color: 'var(--color-text)' }}>模型名称（可选）</div>
            <input
              type="text"
              value={aiModel}
              onChange={(e) => handleAiModelChange(e.target.value)}
              placeholder={`默认：${currentProvider.defaultModel}`}
              className="w-full px-3 py-2 rounded-lg border text-sm"
              style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm" style={{ color: 'var(--color-text)' }}>离线模式</div>
              <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>开启后不联网，AI 助手仅使用本地规则引擎</div>
            </div>
            <ToggleSwitch checked={offlineMode} onChange={handleOfflineModeChange} />
          </div>
          <button className="btn-outline text-xs !py-1.5" onClick={handleTestAI} disabled={testingAI}>
            {testingAI ? '正在测试连接...' : '测试连接'}
          </button>
        </div>
      </div>

      {/* Safety */}
      <div className="card-base p-5 space-y-4">
        <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
          <Shield size={16} style={{ color: 'var(--color-primary)' }} /> 安全设置
        </h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm" style={{ color: 'var(--color-text)' }}>删除文件先进回收站</div>
              <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                开启：清理项移入系统回收站，可恢复；关闭：直接彻底删除，立即释放空间
              </div>
            </div>
            <ToggleSwitch checked={recycleBin} onChange={handleRecycleBinChange} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm" style={{ color: 'var(--color-text)' }}>操作二次确认</div>
              <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>执行迁移/撤销前弹出确认对话框</div>
            </div>
            <ToggleSwitch checked={confirmDialog} onChange={handleConfirmDialogChange} />
          </div>
        </div>
      </div>

      {/* System Integration */}
      <div className="card-base p-5 space-y-4">
        <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
          <Monitor size={16} style={{ color: 'var(--color-primary)' }} /> 系统集成
        </h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm" style={{ color: 'var(--color-text)' }}>关闭时最小化到托盘</div>
              <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                点关闭按钮后驻留托盘，每周自动清理与低空间告警持续生效；从托盘菜单可彻底退出
              </div>
            </div>
            <ToggleSwitch checked={closeToTray} onChange={handleCloseToTrayChange} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm" style={{ color: 'var(--color-text)' }}>开机自启动</div>
              <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                通过系统计划任务实现（兼容管理员权限），登录后静默启动到托盘
              </div>
            </div>
            <ToggleSwitch checked={autoStart} onChange={handleAutoStartChange} />
          </div>
        </div>
      </div>

      {/* Data */}
      <div className="card-base p-5 space-y-4">
        <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
          <Database size={16} style={{ color: 'var(--color-primary)' }} /> 数据管理
        </h3>
        <div className="space-y-2">
          <button className="btn-outline text-xs !py-1.5" onClick={handleExportHistory} disabled={exporting}>
            {exporting ? '导出中...' : '导出操作日志'}
          </button>
          <button className="btn-outline text-xs !py-1.5 ml-2" onClick={handleClearAppCache} disabled={clearingCache}>
            {clearingCache ? '清理中...' : '清理应用缓存'}
          </button>
          <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            导出为 JSON（含操作历史与空间快照）；清理应用缓存仅清除 CleanC 自身的网页缓存，不影响你的文件
          </p>
        </div>
      </div>

      {/* Operation History */}
      <div className="card-base p-5 space-y-4">
        <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
          <History size={16} style={{ color: 'var(--color-primary)' }} /> 操作历史与撤销
        </h3>
        {undoMessage && (
          <div className="p-3 rounded-lg text-xs flex items-center gap-2 bg-slate-100 dark:bg-slate-800" style={{ color: 'var(--color-text)' }}>
            <AlertCircle size={14} style={{ color: 'var(--color-primary)' }} />
            {undoMessage}
          </div>
        )}
        <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
          {loadingHistory ? (
            <div className="text-xs text-center py-4" style={{ color: 'var(--color-text-secondary)' }}>正在加载历史记录...</div>
          ) : history.length === 0 ? (
            <div className="text-xs text-center py-4" style={{ color: 'var(--color-text-secondary)' }}>暂无操作历史记录</div>
          ) : (
            history.map((rec) => (
              <div key={rec.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-800/50">
                <div className="space-y-1 min-w-0 flex-1 pr-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded" style={{ 
                      backgroundColor: rec.type === 'clean' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(139, 92, 246, 0.1)',
                      color: rec.type === 'clean' ? 'var(--color-risk-safe)' : 'var(--color-ai-start)'
                    }}>
                      {rec.action}
                    </span>
                    <span className="text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>{rec.time}</span>
                  </div>
                  <div className="text-xs font-mono truncate" style={{ color: 'var(--color-text)' }} title={rec.detail}>
                    {rec.detail}
                  </div>
                </div>
                {rec.undoable && rec.source && rec.target && (
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {showConfirmUndoId === rec.id ? (
                      <>
                        <button
                          className="px-2.5 py-1 rounded-md text-xs font-medium text-white bg-red-500 hover:bg-red-600 transition-colors"
                          onClick={() => {
                            handleUndo(rec)
                            setShowConfirmUndoId(null)
                          }}
                          disabled={undoingId !== null}
                        >
                          确认撤销？
                        </button>
                        <button
                          className="px-2 py-1 rounded-md text-xs font-medium border hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
                          onClick={() => setShowConfirmUndoId(null)}
                          disabled={undoingId !== null}
                        >
                          取消
                        </button>
                      </>
                    ) : (
                      <button
                        className="btn-outline text-xs !py-1 !px-2.5 flex items-center gap-1"
                        onClick={() => {
                          if (confirmDialog) {
                            setShowConfirmUndoId(rec.id)
                          } else {
                            handleUndo(rec)
                          }
                        }}
                        disabled={undoingId !== null}
                      >
                        <RotateCcw size={12} />
                        {undoingId === rec.id ? '正在撤销...' : '撤销迁移'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
