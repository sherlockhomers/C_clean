import { useState } from 'react'
import { useDiskStore } from '../stores/useDiskStore'
import { formatSize } from '../utils/formatSize'
import CompatibilityBadge from '../components/shared/CompatibilityBadge'
import {
  AlertTriangle,
  HardDriveDownload,
  ChevronRight,
  ChevronLeft,
  Check,
  Bot,
  ArrowRight,
} from 'lucide-react'

const sanitizePathSegment = (value: string) =>
  value.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim() || 'UnknownApp'

export default function SoftwareMigrate() {
  const { softwareList, disks } = useDiskStore()
  const [step, setStep] = useState(0)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [targetDrive, setTargetDrive] = useState('D:')
  const [planning, setPlanning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [migrationFailures, setMigrationFailures] = useState<string[]>([])
  const [runningProcesses, setRunningProcesses] = useState<string[]>([])
  const [checkingProcesses, setCheckingProcesses] = useState(false)
  const [processError, setProcessError] = useState<string | null>(null)

  const selectedSoftware = softwareList.filter((s) => selectedIds.includes(s.id))
  const totalSize = selectedSoftware.reduce((acc, s) => acc + s.size, 0)

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id])
  }

  const handleNextStep = async () => {
    setStep(1)
    setCheckingProcesses(true)
    setRunningProcesses([])
    
    try {
      const allRunning: string[] = []
      for (const sw of selectedSoftware) {
        const result = await useDiskStore.getState().checkSoftwareRunning(sw.installPath)
        if (result.running && result.processes.length > 0) {
          allRunning.push(...result.processes)
        }
      }
      // 去重
      setRunningProcesses(Array.from(new Set(allRunning)))
    } catch (err) {
      console.error('检测进程失败:', err)
    } finally {
      setCheckingProcesses(false)
    }
  }

  const handleKillProcesses = async () => {
    if (runningProcesses.length === 0) return
    
    const result = await useDiskStore.getState().killProcesses(runningProcesses)
    if (result.success) {
      setRunningProcesses([])
    } else {
      // 重新检测一次
      setCheckingProcesses(true)
      try {
        const allRunning: string[] = []
        for (const sw of selectedSoftware) {
          const res = await useDiskStore.getState().checkSoftwareRunning(sw.installPath)
          if (res.running && res.processes.length > 0) {
            allRunning.push(...res.processes)
          }
        }
        setRunningProcesses(Array.from(new Set(allRunning)))
      } catch (err) {
        console.error('重检进程失败:', err)
      } finally {
        setCheckingProcesses(false)
      }
    }
  }

  const handleMigrate = async () => {
    setPlanning(true)
    setProgress(0)
    setMigrationFailures([])
    setStep(2)
    
    // 模拟进度条，因为真实迁移可能需要一些时间
    const interval = setInterval(() => {
      setProgress((p) => Math.min(p + Math.random() * 5, 95))
    }, 500)

    try {
      const failures: string[] = []

      for (const sw of selectedSoftware) {
        const targetPath = `${targetDrive}\\Apps\\${sanitizePathSegment(sw.name)}`
        const result = await useDiskStore.getState().migratePath(sw.installPath, targetPath)
        if (!result.success) {
          failures.push(`${sw.name}: ${result.error || '未知错误'}`)
        }
      }

      setMigrationFailures(failures)
    } finally {
      clearInterval(interval)
      setProgress(100)
      setTimeout(() => {
        setPlanning(false)
        setStep(3)
      }, 500)
    }
  }

  const steps = ['选择软件', '确认预案', '生成预案', '完成']

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
          <HardDriveDownload size={24} style={{ color: 'var(--color-primary)' }} /> 软件迁移
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
          生成迁移预案；真实迁移将在校验与回滚能力完善后开放
        </p>
      </div>

      {/* Stepper */}
      <div className="card-base p-4">
        <div className="flex items-center">
          {steps.map((s, i) => (
            <div key={i} className="flex items-center flex-1">
              <div className="flex items-center gap-2">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{
                    backgroundColor: i <= step ? 'var(--color-primary)' : 'var(--color-border)',
                    color: i <= step ? 'white' : 'var(--color-text-secondary)',
                  }}
                >
                  {i < step ? <Check size={14} /> : i + 1}
                </div>
                <span className="text-xs font-medium" style={{ color: i <= step ? 'var(--color-text)' : 'var(--color-text-secondary)' }}>
                  {s}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div className="flex-1 h-px mx-3" style={{ backgroundColor: i < step ? 'var(--color-primary)' : 'var(--color-border)' }} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step Content */}
      {step === 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              已选 {selectedIds.length} 项，共 {formatSize(totalSize)}
            </span>
            <button
              className="btn-primary text-xs !py-1.5"
              onClick={handleNextStep}
              disabled={selectedIds.length === 0}
            >
              下一步
            </button>
          </div>
          {softwareList.map((sw) => (
            <div
              key={sw.id}
              className={`card-base p-4 flex items-center gap-4 cursor-pointer transition-all ${
                sw.compatibility === 'incompatible' ? 'opacity-60' : ''
              }`}
              onClick={() => sw.compatibility === 'compatible' && toggleSelect(sw.id)}
            >
              <div
                className="w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0"
                style={{
                  borderColor: selectedIds.includes(sw.id) ? 'var(--color-primary)' : 'var(--color-border)',
                  backgroundColor: selectedIds.includes(sw.id) ? 'var(--color-primary)' : 'transparent',
                }}
              >
                {selectedIds.includes(sw.id) && <Check size={12} className="text-white" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{sw.name}</span>
                  <CompatibilityBadge compatibility={sw.compatibility} />
                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(255,107,53,0.1)', color: 'var(--color-primary)' }}>
                    {sw.category}
                  </span>
                </div>
                <p className="text-xs font-mono" style={{ color: 'var(--color-text-secondary)' }}>{sw.installPath}</p>
              </div>
              <div className="text-sm font-bold" style={{ color: 'var(--color-primary)' }}>{formatSize(sw.size)}</div>
              {sw.compatibility === 'compatible' && (
                <button
                  type="button"
                  className="btn-ai text-xs !py-1 flex items-center gap-1"
                  onClick={(event) => event.stopPropagation()}
                >
                  <Bot size={12} /> AI评估
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {step === 1 && (
        <div className="card-base p-6 space-y-4">
          <h3 className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>迁移预案与确认</h3>
          <div className="space-y-3">
            {selectedSoftware.map((sw) => (
              <div key={sw.id} className="flex items-center gap-3 p-3 rounded-lg" style={{ backgroundColor: 'var(--color-bg)' }}>
                <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{sw.name}</span>
                <span className="text-xs font-mono" style={{ color: 'var(--color-text-secondary)' }}>{sw.installPath}</span>
                <ArrowRight size={14} style={{ color: 'var(--color-primary)' }} />
                <span className="text-xs font-mono" style={{ color: 'var(--color-primary)' }}>{targetDrive}\\Apps\\{sw.name}</span>
                <span className="text-xs ml-auto" style={{ color: 'var(--color-text-secondary)' }}>{formatSize(sw.size)}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm" style={{ color: 'var(--color-text)' }}>目标磁盘:</span>
            <select
              value={targetDrive}
              onChange={(e) => setTargetDrive(e.target.value)}
              className="px-3 py-1.5 rounded-lg border text-sm outline-none"
              style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            >
              {disks.slice(1).map((d) => (
                <option key={d.drive} value={d.drive}>
                  {d.drive} ({formatSize(d.available)} 可用)
                </option>
              ))}
            </select>
          </div>

          {/* 进程占用检测 UI */}
          {checkingProcesses ? (
            <div className="p-4 rounded-xl text-xs flex items-center gap-2 bg-slate-50 dark:bg-slate-800/50" style={{ color: 'var(--color-text-secondary)' }}>
              <div className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--color-primary)' }} />
              正在进行真实的软件进程占用检测，请稍候...
            </div>
          ) : runningProcesses.length > 0 ? (
            <div className="p-4 rounded-xl text-xs border border-red-200 dark:border-red-900/50" style={{ backgroundColor: 'rgba(239, 68, 68, 0.05)', color: 'var(--color-risk-danger)' }}>
              <div className="flex items-center justify-between mb-2">
                <strong className="text-sm flex items-center gap-1"><AlertTriangle size={14} /> 检测到软件正在运行，迁移受阻</strong>
                <button 
                  className="px-2.5 py-1 rounded-md text-xs font-medium text-white bg-red-500 hover:bg-red-600 transition-colors flex items-center gap-1"
                  onClick={handleKillProcesses}
                  disabled={checkingProcesses}
                >
                  <Bot size={12} /> {checkingProcesses ? '处理中...' : '一键关闭占用进程'}
                </button>
              </div>
              以下进程正在后台运行，直接迁移会导致文件损坏或丢失。请点击上方按钮一键关闭，或手动关闭后再试：
              <div className="flex flex-wrap gap-1.5 mt-2">
                {runningProcesses.map(p => (
                  <span key={p} className="px-2 py-0.5 rounded font-mono text-[10px] bg-red-100 dark:bg-red-950/50 text-red-600 dark:text-red-400">
                    {p}
                  </span>
                ))}
              </div>
              {processError && (
                <p className="mt-3 text-red-600 dark:text-red-300">{processError}</p>
              )}
            </div>
          ) : (
            <div className="p-4 rounded-xl text-xs flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/30 text-emerald-600 dark:text-emerald-400">
              <Check size={14} /> 占用检测通过：所选软件当前无后台进程运行，可安全迁移。
            </div>
          )}
          {processError && runningProcesses.length === 0 && !checkingProcesses && (
            <div className="p-3 rounded-lg text-xs bg-amber-50 text-amber-700 border border-amber-200">
              {processError}
            </div>
          )}

          <div className="p-4 rounded-xl text-xs border border-amber-200 dark:border-amber-900/50" style={{ backgroundColor: 'rgba(245, 158, 11, 0.05)', color: 'var(--color-risk-warning)' }}>
            <strong className="block mb-1 text-sm">真实迁移警告</strong>
            点击确认后，将执行真实的底层软链接迁移。请务必确保：
            <ul className="list-disc pl-4 mt-1 space-y-0.5">
              <li>以上软件的 <strong>所有后台进程</strong> 均已彻底关闭。</li>
              <li>迁移过程中请勿关闭本软件或强制关机。</li>
              <li>大文件迁移可能需要数分钟，请耐心等待。</li>
            </ul>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button className="btn-outline" onClick={() => setStep(0)}>上一步</button>
            <button 
              className="btn-primary" 
              onClick={handleMigrate} 
              disabled={runningProcesses.length > 0 || checkingProcesses}
              style={{ opacity: (runningProcesses.length > 0 || checkingProcesses) ? 0.5 : 1 }}
            >
              {runningProcesses.length > 0 ? '请先关闭占用进程' : '确认并开始真实迁移'}
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="card-base p-8 text-center">
          <div className="w-20 h-20 rounded-full mx-auto mb-5 flex items-center justify-center animate-spin" style={{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-light))' }}>
            <HardDriveDownload size={32} className="text-white" />
          </div>
          <p className="text-base font-medium" style={{ color: 'var(--color-text)' }}>{planning ? '正在执行底层软链接迁移...' : '迁移即将完成...'}</p>
          <p className="text-xs mt-2" style={{ color: 'var(--color-text-secondary)' }}>正在跨盘复制文件，请勿关闭软件</p>
          <div className="mt-6 max-w-md mx-auto">
            <div className="h-2.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-border)' }}>
              <div
                className="h-full rounded-full relative"
                style={{
                  backgroundColor: 'var(--color-primary)',
                  width: `${Math.min(progress, 100)}%`,
                  transition: 'width 300ms ease-out',
                }}
              >
                <div className="absolute inset-0 bg-white/20 animate-[pulse_1.5s_ease-in-out_infinite]" />
              </div>
            </div>
            <p className="text-sm mt-3 font-bold" style={{ color: 'var(--color-primary)' }}>{Math.round(progress)}%</p>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="card-base p-8 text-center">
          <div className="w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-900/30 mx-auto mb-5 flex items-center justify-center">
            <Check size={40} className="text-emerald-500" />
          </div>
          <h3 className="text-xl font-bold mb-3" style={{ color: 'var(--color-text)' }}>
            {migrationFailures.length > 0 ? '迁移完成，部分失败' : '迁移成功！'}
          </h3>
          <p className="text-sm mb-5" style={{ color: 'var(--color-text-secondary)' }}>
            已处理 {selectedSoftware.length} 个软件，目标位置为 {targetDrive}。
            {migrationFailures.length === 0 && (
              <> 为你释放了 <span className="font-bold text-[var(--color-primary)]">{formatSize(totalSize)}</span> 的 C 盘空间。</>
            )}
          </p>
          {migrationFailures.length > 0 && (
            <div className="p-4 rounded-xl text-xs max-w-md mx-auto text-left mb-4 bg-amber-50 text-amber-700 border border-amber-200">
              <strong className="block mb-2">失败项</strong>
              {migrationFailures.map((failure) => (
                <div key={failure}>{failure}</div>
              ))}
            </div>
          )}
          <div className="p-4 rounded-xl text-xs max-w-md mx-auto text-left" style={{ backgroundColor: 'rgba(139, 92, 246, 0.08)', color: 'var(--color-ai-start)' }}>
            <strong className="block mb-1">软链接状态</strong>
            {migrationFailures.length > 0
              ? '成功项已通过软链接生效，失败项未完成迁移，请根据上方错误处理后重试。'
              : `操作系统和快捷方式仍会认为软件安装在 C 盘，但文件已经存放在了 ${targetDrive}。`}
          </div>
          <button className="btn-primary mt-6 px-8" onClick={() => { setStep(0); setSelectedIds([]); }}>
            完成
          </button>
        </div>
      )}
    </div>
  )
}
