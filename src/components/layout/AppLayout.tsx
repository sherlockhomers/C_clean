import { Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import Sidebar from './Sidebar'
import BottomBar from './BottomBar'
import AIFloatingButton from '../shared/AIFloatingButton'
import ToastContainer from '../shared/ToastContainer'
import { useAppStore } from '../../stores/useAppStore'
import { useEffect } from 'react'

export default function AppLayout() {
  const { theme } = useAppStore()
  const location = useLocation()

  useEffect(() => {
    const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light')

    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      const handler = (e: MediaQueryListEvent) => {
        document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light')
      }
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    }
  }, [theme])

  return (
    <div className="flex h-screen overflow-hidden select-none" style={{ backgroundColor: 'var(--color-bg)' }}>
      {/* 顶部拖拽区域 (Electron Titlebar) */}
      <div className="absolute top-0 left-0 right-0 h-8 z-50" style={{ WebkitAppRegion: 'drag' } as any} />
      
      {/* 浏览器环境警告 */}
      {!window.cleanC && (
        <div className="absolute top-8 left-0 right-0 z-40 bg-amber-500 text-white text-xs py-1.5 px-4 text-center shadow-md">
          ⚠️ 当前运行在普通浏览器中，无法读取本地磁盘。请在终端运行 <code className="bg-black/20 px-1 rounded">npm run electron:dev</code> 体验真实清理功能。
        </div>
      )}

      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <main className="flex-1 overflow-y-auto p-6 relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="h-full"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
        <BottomBar />
      </div>
      <AIFloatingButton />
      <ToastContainer />
    </div>
  )
}
