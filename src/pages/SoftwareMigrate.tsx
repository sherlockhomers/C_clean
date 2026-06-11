import { useEffect, useState } from 'react'
import { useDiskStore, SoftwareInfo } from '../stores/useDiskStore'
import { formatSize } from '../utils/formatSize'
import CompatibilityBadge from '../components/shared/CompatibilityBadge'
import {
  AlertTriangle,
  HardDriveDownload,
  Check,
  Bot,
  ArrowRight,
  X,
} from 'lucide-react'

const sanitizePathSegment = (value: string) =>
  value.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim() || 'UnknownApp'

interface EvalResult {
  software: SoftwareInfo
  checking: boolean
  running: boolean
  processes: string[]
  notes: string[]
  verdict: 'good' | 'caution' | 'bad'
}

// 基于真实数据的规则评估：路径位置、体量、运行状态
function buildEvalNotes(sw: SoftwareInfo, running: boolean, processes: string[]): { notes: string[]; verdict: EvalResult['verdict'] } {
  const notes: string[] = []
  let verdict: EvalResult['verdict'] = 'good'
  const pathLower = sw.installPath.toLowerCase()

  if (sw.compatibility === 'incompatible') {
    notes.push('系统组件或微软软件，强烈不建议迁移')
    verdict = 'bad'
  }
  if (pathLower.includes('program files')) {
    notes.push('安装在 Program Files：迁移需要管理员权限，且该类软件可能注册了系统服务')
    if (verdict === 'good') verdict = 'caution'
  } else if (pathLower.includes('appdata')) {
    notes.push('安装在用户目录（AppData）：权限风险低，较适合迁移')
  }
  if (sw.size > 5 * 1024 * 1024 * 1024) {
    notes.push(`体量较大（${formatSize(sw.size)}）：迁移收益高，但跨盘复制耗时较长`)
  } else if (sw.size > 0 && sw.size < 200 * 1024 * 1024) {
    notes.push(`体量较小（${formatSize(sw.size)}）：迁移收益有限`)
  }
  if (running) {
    notes.push(`检测到正在运行的进程：${processes.join(', ')}，迁移前必须关闭`)
    if (verdict === 'good') verdict = 'caution'
  } else {
    notes.push('当前无相关进程在运行')
  }
  if (notes.length === 1) {
    notes.push('未发现明显风险，可以迁移')
  }
  return { notes, verdict }
}

export default function SoftwareMigrate() {
  const { softwareList, disks } = useDiskStore()
  const [step, setStep] = useState(0)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [targetDrive, setTargetDrive] = useState('')
  const [planning, setPlanning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState('')
  const [migrationFailures, setMigrationFailures] = useState<string[]>([])
  const [successCount, setSuccessCount] = useState(0)
  const [runningProcesses, setRunningProcesses] = useState<string[]>([])
  const [checkingProcesses, setCheckingProcesses] = useState(false)
  const [processError, setProcessError] = useState<string | null>(null)
  const [evalResult, setEvalResult] = useState<EvalResult | null>(null)

  const targetDrives = disks.filter((d) => !d.drive.toUpperCase().startsWith('C'))
  const effectiveDrive = targetDrive || targetDrives[0]?.drive || ''
  const [customDir, setCustomDir] = useState('')
  const noTargetDisk = targetDrives.length === 0 && !customDir
  // 迁移目标根目录：自定义目录优先，否则使用 <目标盘>\Apps
  const targetBase = customDir ? customDir.replace(/\\+$/, '') : (effectiveDrive ? `${effectiveDrive}\\Apps` : '')

  useEffect(() => {
    if (!targetDrive && targetDrives[0]) {
      setTargetDrive(targetDrives[0].drive)
    }
  }, [targetDrive, targetDrives])

  const handlePickCustomDir = async () => {
    if (!window.cleanC?.selectDirectory) return
    const result = await window.cleanC.selectDirectory('选择软件迁移目标文件夹（将在其中创建软件同名子文件夹）')
    if (result.ok && result.path) {
      setCustomDir(result.path)
    }
  }

  const selectedSoftware = softwareList.filter((s) => selectedIds.includes(s.id))
  const totalSize = selectedSoftware.reduce((acc, s) => acc + s.size, 0)

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id])
  }

  const handleEvaluate = async (sw: SoftwareInfo) => {
    setEvalResult({ software: sw, checking: true, running: false, processes: [], notes: [], verdict: 'good' })
    try {
      const result = await useDiskStore.getState().checkSoftwareRunning(sw.installPath)
      const { notes, verdict } = buildEvalNotes(sw, result.running, result.processes)
      setEvalResult({ software: sw, checking: false, running: result.running, processes: result.processes, notes, verdict })
    } catch {
      const { notes, verdict } = buildEvalNotes(sw, false, [])
      setEvalResult({ software: sw, checking: false, running: false, processes: [], notes, verdict })
    }
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
    setProgressLabel('')
    setMigrationFailures([])
    setSuccessCount(0)
    setStep(2)

    try {
      const failures: string[] = []
      let succeeded = 0
      const total = selectedSoftware.length

      // 真实进度：按软件逐个迁移，进度 = 已完成数 / 总数
      for (let i = 0; i < total; i++) {
        const sw = selectedSoftware[i]
        setProgressLabel(`正在迁移 ${sw.name}（${i + 1}/${total}）`)
        setProgress(Math.round((i / total) * 100))

        const targetPath = `${targetBase}\\${sanitizePathSegment(sw.name)}`
        const result = await useDiskStore.getState().migratePath(sw.installPath, targetPath)
        if (result.success) {
          succeeded += 1
        } else {
          failures.push(`${sw.name}: ${result.error || '未知错误'}`)
        }
      }

      setMigrationFailures(failures)
      setSuccessCount(succeeded)
    } finally {
      setProgress(100)
      setProgressLabel('迁移流程结束')
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
          基于注册表真实扫描 C 盘软件，检测占用进程后执行软链接迁移；建议以管理员身份运行以迁移 Program Files 下的软件
        </p>
      </div>

      {noTargetDisk && (
        <div className="p-3 rounded-lg text-xs flex items-center gap-2 bg-red-50 text-red-700 border border-red-200">
          <AlertTriangle size={14} /> 未检测到除 C 盘以外的磁盘，无法进行迁移。
        </div>
      )}

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
              disabled={selectedIds.length === 0 || noTargetDisk}
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
              <div className="text-sm font-bold" style={{ color: 'var(--color-primary)' }}>
                {sw.size > 0 ? formatSize(sw.size) : '大小未知'}
              </div>
              {sw.compatibility === 'compatible' && (
                <button
                  type="button"
                  className="btn-ai text-xs !py-1 flex items-center gap-1"
                  onClick={(event) => {
                    event.stopPropagation()
                    void handleEvaluate(sw)
                  }}
                >
                  <Bot size={12} /> 迁移评估
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
                <span className="text-xs font-mono" style={{ color: 'var(--color-primary)' }}>{targetBase}\\{sanitizePathSegment(sw.name)}</span>
                <span className="text-xs ml-auto" style={{ color: 'var(--color-text-secondary)' }}>{sw.size > 0 ? formatSize(sw.size) : '大小未知'}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm" style={{ color: 'var(--color-text)' }}>目标磁盘:</span>
            {!customDir && (
              <select
                value={effectiveDrive}
                onChange={(e) => setTargetDrive(e.target.value)}
                className="px-3 py-1.5 rounded-lg border text-sm outline-none"
                style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                aria-label="选择迁移目标磁盘"
              >
                {targetDrives.map((d) => (
                  <option key={d.drive} value={d.drive}>
                    {d.drive} ({formatSize(d.available)} 可用)
                  </option>
                ))}
              </select>
            )}
            {customDir && (
              <span className="flex items-center gap-1 px-2 py-1.5 rounded-lg border text-xs font-mono" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>
                {customDir}
                <button onClick={() => setCustomDir('')} aria-label="清除自定义目录" className="ml-1 hover:text-red-500">
                  <X size={12} />
                </button>
              </span>
            )}
            <button
              className="px-3 py-1.5 rounded-lg border text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              onClick={handlePickCustomDir}
            >
              自定义目录...
            </button>
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
          <p className="text-xs mt-2" style={{ color: 'var(--color-text-secondary)' }}>{progressLabel || '正在跨盘复制文件，请勿关闭软件'}</p>
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
            {migrationFailures.length > 0
              ? (successCount > 0 ? '迁移完成，部分失败' : '迁移失败')
              : '迁移成功！'}
          </h3>
          <p className="text-sm mb-5" style={{ color: 'var(--color-text-secondary)' }}>
            成功 {successCount} 个，失败 {migrationFailures.length} 个，目标位置为 {targetBase}。
            {successCount > 0 && migrationFailures.length === 0 && (
              <> 预计释放约 <span className="font-bold text-[var(--color-primary)]">{formatSize(totalSize)}</span>（按安装大小估算）。</>
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
              : `操作系统和快捷方式仍会认为软件安装在 C 盘，但文件已经存放在了 ${targetBase}。如需恢复可在「设置 → 操作历史」中撤销。`}
          </div>
          <button className="btn-primary mt-6 px-8" onClick={() => { setStep(0); setSelectedIds([]); }}>
            完成
          </button>
        </div>
      )}

      {/* 迁移评估弹窗（基于真实路径 / 体量 / 进程状态的规则评估） */}
      {evalResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="card-base p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
                <Bot size={18} style={{ color: 'var(--color-ai-start)' }} /> 迁移评估：{evalResult.software.name}
              </h3>
              <button onClick={() => setEvalResult(null)} style={{ color: 'var(--color-text-secondary)' }} aria-label="关闭评估弹窗">
                <X size={20} />
              </button>
            </div>
            {evalResult.checking ? (
              <div className="flex items-center gap-2 text-sm py-6 justify-center" style={{ color: 'var(--color-text-secondary)' }}>
                <div className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--color-primary)' }} />
                正在检测真实进程占用与安装信息...
              </div>
            ) : (
              <>
                <div
                  className="p-3 rounded-lg text-sm font-medium mb-3"
                  style={{
                    backgroundColor: evalResult.verdict === 'good' ? 'rgba(16,185,129,0.08)' : evalResult.verdict === 'caution' ? 'rgba(245,158,11,0.08)' : 'rgba(239,68,68,0.08)',
                    color: evalResult.verdict === 'good' ? '#059669' : evalResult.verdict === 'caution' ? '#d97706' : '#dc2626',
                  }}
                >
                  {evalResult.verdict === 'good' ? '结论：适合迁移' : evalResult.verdict === 'caution' ? '结论：可迁移，但需注意以下事项' : '结论：不建议迁移'}
                </div>
                <ul className="space-y-1.5 text-xs mb-4 list-disc pl-5" style={{ color: 'var(--color-text)' }}>
                  {evalResult.notes.map((note, i) => (
                    <li key={i}>{note}</li>
                  ))}
                </ul>
                <div className="flex gap-2 justify-end">
                  <button className="btn-outline" onClick={() => setEvalResult(null)}>关闭</button>
                  {evalResult.verdict !== 'bad' && (
                    <button
                      className="btn-primary"
                      onClick={() => {
                        if (!selectedIds.includes(evalResult.software.id)) {
                          toggleSelect(evalResult.software.id)
                        }
                        setEvalResult(null)
                      }}
                    >
                      选中此软件
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
