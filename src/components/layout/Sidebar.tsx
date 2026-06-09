import { NavLink, useLocation } from 'react-router-dom'
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

const navItems = [
  { path: '/', icon: LayoutDashboard, label: '仪表盘' },
  { path: '/quick-clean', icon: Sparkles, label: '快速清理' },
  { path: '/detective', icon: Radar, label: '占用侦探' },
  { path: '/deep-scan', icon: Search, label: '深度扫描' },
  { path: '/software-migrate', icon: HardDriveDownload, label: '软件迁移' },
  { path: '/path-migrate', icon: FolderSync, label: '路径迁移' },
  { path: '/ai-assistant', icon: Bot, label: 'AI 助手' },
  { path: '/monitor', icon: HeartPulse, label: '空间监控' },
  { path: '/settings', icon: Settings, label: '设置' },
  { path: '/about', icon: Info, label: '关于' },
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
      <div className="flex items-center h-16 px-5 border-b" style={{ borderColor: 'var(--color-border)' }}>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0" style={{ background: 'var(--color-primary)' }}>
          C
        </div>
        {!sidebarCollapsed && (
          <span className="ml-3 font-semibold text-lg tracking-tight" style={{ color: 'var(--color-text)' }}>
            CleanC
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 overflow-y-auto space-y-1">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className="flex items-center h-11 mx-3 rounded-xl transition-all duration-200 group relative"
              style={{
                backgroundColor: isActive ? 'rgba(249, 115, 22, 0.08)' : 'transparent',
                color: isActive ? 'var(--color-primary)' : 'var(--color-text-secondary)',
              }}
            >
              <div className="flex items-center w-full px-3">
                <item.icon size={20} className="flex-shrink-0" strokeWidth={isActive ? 2.5 : 2} />
                {!sidebarCollapsed && (
                  <span className="ml-3 text-sm font-medium whitespace-nowrap">{item.label}</span>
                )}
              </div>
              {/* Tooltip for collapsed state */}
              {sidebarCollapsed && (
                <div className="absolute left-full ml-2 px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-sm"
                  style={{ backgroundColor: 'var(--color-text)', color: 'var(--color-card)' }}>
                  {item.label}
                </div>
              )}
            </NavLink>
          )
        })}
      </nav>

      {/* Collapse toggle */}
      <div className="p-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
        <button
          onClick={toggleSidebar}
          className="w-full h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
          style={{ color: 'var(--color-text-secondary)' }}
          aria-label={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
        >
          {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>
    </aside>
  )
}
