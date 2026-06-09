import { create } from 'zustand'

interface AppState {
  theme: 'light' | 'dark' | 'system'
  sidebarCollapsed: boolean
  setTheme: (theme: 'light' | 'dark' | 'system') => void
  toggleSidebar: () => void
  isDark: () => boolean
}

export const useAppStore = create<AppState>((set, get) => ({
  theme: (localStorage.getItem('cleanc-theme') as 'light' | 'dark' | 'system') || 'system',
  sidebarCollapsed: false,
  setTheme: (theme) => {
    localStorage.setItem('cleanc-theme', theme)
    const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light')
    set({ theme })
  },
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  isDark: () => {
    const { theme } = get()
    return theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  },
}))
