import { useState } from 'react'
import { useDiskStore } from '../../stores/useDiskStore'
import { formatSize } from '../../utils/formatSize'
import { HardDrive, Clock, CheckCircle2, Wind } from 'lucide-react'
import ZenMode from '../shared/ZenMode'

export default function BottomBar() {
  const { disks, lastCleanResult, scanning, scanProgress } = useDiskStore()
  const [zenModeOpen, setZenModeOpen] = useState(false)
  const cDrive = disks[0]

  return (
    <>
      <div
        className="h-7 flex items-center justify-between px-3 text-[11px] border-t select-none"
        style={{
          backgroundColor: 'var(--color-sidebar)',
          borderColor: 'var(--color-border)',
          color: 'var(--color-text-secondary)',
        }}
      >
        <div className="flex items-center gap-4 h-full">
          <div className="flex items-center gap-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 px-1.5 h-full cursor-default transition-colors">
            <HardDrive size={12} />
            <span>
              C盘剩余: <span className="font-medium text-[var(--color-text)]">{formatSize(cDrive?.available || 0)}</span> / {formatSize(cDrive?.total || 0)}
            </span>
          </div>
          {lastCleanResult && (
            <div className="flex items-center gap-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 px-1.5 h-full cursor-default transition-colors text-emerald-600 dark:text-emerald-500">
              <CheckCircle2 size={12} />
              <span>释放了 {formatSize(lastCleanResult.released)}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 h-full">
          <button 
            onClick={() => setZenModeOpen(true)}
            className="flex items-center gap-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 px-2 h-full transition-colors text-[var(--color-ai-start)]"
            title="进入沉浸清理模式"
            aria-label="进入沉浸清理模式"
          >
            <Wind size={12} />
            <span>禅定模式</span>
          </button>
          <div className="flex items-center gap-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 px-1.5 h-full cursor-default transition-colors">
            <Clock size={12} />
            <span>就绪</span>
          </div>
        </div>
      </div>

      <ZenMode 
        isOpen={zenModeOpen} 
        onClose={() => setZenModeOpen(false)} 
        taskName={scanning ? '深度扫描中...' : '系统静默守护中'}
        progress={scanning ? scanProgress : 100}
      />
    </>
  )
}
