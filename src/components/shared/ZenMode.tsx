import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useDiskStore } from '../../stores/useDiskStore'
import { formatSize } from '../../utils/formatSize'
import { Leaf, Wind, Droplets, X, Sparkles } from 'lucide-react'

interface ZenModeProps {
  isOpen: boolean
  onClose: () => void
  taskName?: string
  progress?: number
}

export default function ZenMode({ isOpen, onClose, taskName = '系统深度优化中', progress = 0 }: ZenModeProps) {
  const [time, setTime] = useState(new Date())
  const { disks, suggestions } = useDiskStore()
  const cDrive = disks[0]
  const clampedProgress = Math.min(100, Math.max(0, progress))
  
  const totalCleanable = useMemo(
    () => suggestions.reduce((acc, s) => acc + (s.type === 'clean' ? s.size : 0), 0),
    [suggestions]
  )

  useEffect(() => {
    if (!isOpen) return
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [isOpen])

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
          animate={{ opacity: 1, backdropFilter: 'blur(20px)' }}
          exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
          transition={{ duration: 0.8 }}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden"
          style={{ backgroundColor: 'rgba(15, 23, 42, 0.85)' }}
        >
          {/* Background Ambient Animations */}
          <motion.div
            animate={{ 
              scale: [1, 1.2, 1],
              opacity: [0.1, 0.2, 0.1],
              rotate: [0, 90, 0]
            }}
            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
            className="absolute -top-[20%] -left-[10%] w-[70vw] h-[70vw] rounded-full mix-blend-screen filter blur-[100px]"
            style={{ backgroundColor: 'rgba(139, 92, 246, 0.3)' }}
          />
          <motion.div
            animate={{ 
              scale: [1, 1.5, 1],
              opacity: [0.1, 0.3, 0.1],
              rotate: [0, -90, 0]
            }}
            transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
            className="absolute -bottom-[20%] -right-[10%] w-[60vw] h-[60vw] rounded-full mix-blend-screen filter blur-[100px]"
            style={{ backgroundColor: 'rgba(56, 189, 248, 0.3)' }}
          />

          {/* Close Button */}
          <button 
            onClick={onClose}
            className="absolute top-8 right-8 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-colors backdrop-blur-md"
          >
            <X size={24} />
          </button>

          {/* Clock */}
          <div className="text-center z-10 mb-16">
            <motion.div 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="text-8xl font-light tracking-tighter text-white/90 font-mono mb-4"
            >
              {time.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}
            </motion.div>
            <motion.div 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="text-xl text-white/50 tracking-widest"
            >
              {time.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}
            </motion.div>
          </div>

          {/* Task Progress */}
          <motion.div 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="w-full max-w-md z-10"
          >
            <div className="flex items-center justify-between mb-3 text-white/80">
              <div className="flex items-center gap-2">
                <Wind size={18} className={clampedProgress < 100 ? "animate-spin-slow" : ""} />
                <span className="text-sm font-medium tracking-wide">{clampedProgress >= 100 ? '系统已处于最佳状态' : taskName}</span>
              </div>
              <span className="text-sm font-mono">{Math.round(clampedProgress)}%</span>
            </div>
            <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden backdrop-blur-sm">
              <motion.div 
                className="h-full bg-gradient-to-r from-blue-400 to-purple-500 rounded-full relative"
                initial={{ width: 0 }}
                animate={{ width: `${clampedProgress}%` }}
                transition={{ ease: "linear" }}
              >
                {clampedProgress < 100 && (
                  <motion.div 
                    className="absolute inset-0 bg-white/30"
                    animate={{ x: ['-100%', '100%'] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                  />
                )}
              </motion.div>
            </div>
          </motion.div>

          {/* Disk Status Mini */}
          <motion.div 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="absolute bottom-12 flex gap-8 text-white/40 text-sm"
          >
            <div className="flex items-center gap-2">
              <Droplets size={16} />
              <span>C盘可用: {formatSize(cDrive?.available || 0)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Sparkles size={16} />
              <span>发现冗余: {formatSize(totalCleanable)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Leaf size={16} />
              <span>系统状态: {clampedProgress >= 100 ? '极佳' : '优化中'}</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}