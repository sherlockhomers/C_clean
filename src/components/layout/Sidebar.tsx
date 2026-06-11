import { NavLink, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAppStore } from '../../stores/useAppStore'
import {
  LayoutDashboard,
  Sparkles,
  Radar,
  Search,
  HardDriveDownload,
  FolderSync,
  Bot,
  HeartPulse,
  Settings,
  Info,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'

const APP_VERSION = '2.0.0'

const navGroups = [
  {
    label: '总览',
    items: [{ path: '/', icon: LayoutDashboard, label: '仪表盘' }],
  },
  {
    label: '清理瘦身',
    items: [
      { path: '/quick-clean', icon: Sparkles, label: '快速清理' },
      { path: '/detective', icon: Radar, label: '占用侦探' },
      { path: '/deep-scan', icon: Search, label: '深度扫描' },
    ],
  },
  {
    label: '迁移扩容',
    items: [
      { path: '/software-migrate', icon: HardDriveDownload, label: '软件迁移' },
      { path: '/path-migrate', icon: FolderSync, label: '路径迁移' },
    ],
  },
  {
    label: '智能守护',
    items: [
      { path: '/ai-assistant', icon: Bot, label: 'AI 助手' },
      { path: '/monitor', icon: HeartPulse, label: '空间监控' },
    ],
  },
  {
    label: '系统',
    items: [
      { path: '/settings', icon: Settings, label: '设置' },
      { path: '/about', icon: Info, label: '关于' },
    ],
  },
]

export default function Sidebar() {
  const { sidebarCollapsed, toggleSidebar } = useAppStore()
  const location = useLocation()

  return (
    <aside
      className="h-full flex flex-col border-r transition-all duration-300 ease-in-out relative z-10"
      style={{
        width: sidebarCollapsed ? '72px' : '240px',
        backgroundColor: 'var(--color-sidebar)',
        borderColor: 'var(--color-border)',
      }}
    >
      {/* Logo */}
      <div className="flex items-center h-16 px-5 border-b flex-shrink-0" style={{ borderColor: 'var(--color-border)' }}>
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 shadow-[0_4px_12px_rgba(249,115,22,0.35)]"
          style={{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-light))' }}
        >
          <span className="text-white font-bold text-sm">C</span>
        </div>
        {!sidebarCollapsed && (
          <div className="ml-3 min-w-0">
            <div className="font-semibold text-base leading-5 tracking-tight" style={{ color: 'var(--color-text)' }}>
              CleanC
            </div>
            <div className="text-[10px] leading-3 mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
              C盘清理助手
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 overflow-y-auto overflow-x-hidden">
        {navGroups.map((group, groupIdx) => (
          <div key={group.label} className={groupIdx > 0 ? 'mt-2' : ''}>
            {!sidebarCollapsed ? (
              <div
                className="px-6 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider select-none"
                style={{ color: 'var(--color-text-secondary)', opacity: 0.7 }}
              >
                {group.label}
              </div>
            ) : (
              groupIdx > 0 && (
                <div className="mx-5 my-2 border-t" style={{ borderColor: 'var(--color-border)' }} />
              )
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = location.pathname === item.path
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className="flex items-center h-10 mx-3 rounded-xl transition-colors duration-200 group relative"
                    style={{
                      backgroundColor: isActive ? 'var(--color-primary-soft)' : 'transparent',
                      color: isActive ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                    }}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="sidebar-active-indicator"
                        className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-full"
                        style={{ backgroundColor: 'var(--color-primary)' }}
                        transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                      />
                    )}
                    <div className="flex items-center w-full px-3">
                      <item.icon size={19} className="flex-shrink-0" strokeWidth={isActive ? 2.5 : 2} />
                      {!sidebarCollapsed && (
                        <span className="ml-3 text-sm font-medium whitespace-nowrap">{item.label}</span>
                      )}
                    </div>
                    {/* Tooltip for collapsed state */}
                    {sidebarCollapsed && (
                      <div
                        className="absolute left-full ml-2 px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-sm"
                        style={{ backgroundColor: 'var(--color-text)', color: 'var(--color-card)' }}
                      >
                        {item.label}
                      </div>
                    )}
                  </NavLink>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer: version + collapse toggle */}
      <div className="p-2 border-t flex items-center gap-1" style={{ borderColor: 'var(--color-border)' }}>
        {!sidebarCollapsed && (
          <span
            className="flex-1 px-2 text-[10px] font-medium tracking-wide select-none"
            style={{ color: 'var(--color-text-secondary)', opacity: 0.8 }}
          >
            v{APP_VERSION}
          </span>
        )}
        <button
          onClick={toggleSidebar}
          className={`h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 ${sidebarCollapsed ? 'w-full' : 'w-8'}`}
          style={{ color: 'var(--color-text-secondary)' }}
          aria-label={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
        >
          {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>
    </aside>
  )
}
