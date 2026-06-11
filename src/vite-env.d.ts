/// <reference types="vite/client" />

type CleanRiskLevel = 'safe' | 'warning' | 'danger'

interface CleanCDiskInfo {
  drive: string
  total: number
  used: number
  available: number
  type: 'SSD' | 'HDD'
  healthScore: number
}

interface CleanCCleanItem {
  id: string
  name: string
  path: string
  size: number
  riskLevel: CleanRiskLevel
  selected: boolean
  description: string
  icon: string
}

interface CleanCCleanResult {
  released: number
  failed: number
  skipped: number
  mode?: 'trash' | 'delete'
}

interface CleanCAppSettings {
  recycleBin: boolean
  weeklyClean: boolean
  monthlyScanReminder: boolean
  alertThreshold: number
  closeToTray: boolean
  lastAutoCleanAt: number
  lastMonthlyReminderAt: number
  lastLowSpaceAlertAt: number
}

interface CleanCHiddenOccupancyItem {
  name: string
  desc: string
  location: string
  size: number | null
}

interface CleanCAiChatPayload {
  provider: string
  apiKey?: string
  model?: string
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[]
}

interface CleanCAiChatResult {
  ok: boolean
  content?: string
  error?: string
}

interface CleanCDeleteResult {
  released: number
  failed: number
  mode: 'trash' | 'delete'
  results: { path: string; success: boolean; size: number; error?: string }[]
}

interface CleanCLargeFile {
  id: string
  name: string
  path: string
  size: number
  lastAccess: string
  type: 'large'
  aiNote: string
  protected?: boolean
}

interface CleanCSoftwareInfo {
  id: string
  name: string
  icon: string
  installPath: string
  size: number
  compatibility: 'compatible' | 'incompatible'
  category: string
}

interface CleanCSystemFolderInfo {
  id: string
  name: string
  icon: string
  path: string
  targetPath: string
  size: number
}

interface CleanCOccupancyChild {
  name: string
  size: number
  percentage: number
}

interface CleanCOccupancyRecord {
  id: string
  name: string
  size: number
  percentage: number
  trend: 'up' | 'down' | 'stable'
  category: 'software' | 'folder' | 'fileType'
  icon: string
  path?: string
  children?: CleanCOccupancyChild[]
}

interface CleanCFileTypeStat {
  key: string
  label: string
  fill: string
  bytes: number
}

interface CleanCHistoryEntry {
  id: string
  time: number
  type: 'clean' | 'migrate' | 'scan'
  action: string
  detail: string
  bytes: number
}

interface CleanCSpacePoint {
  date: string
  total: number
  used: number
  available: number
}

interface Window {
  cleanC?: {
    getDisks: () => Promise<CleanCDiskInfo[]>
    scanCleanItems: () => Promise<CleanCCleanItem[]>
    cleanSelected: (ids: string[], options?: { useTrash?: boolean }) => Promise<CleanCCleanResult>
    scanLargeFiles: (options: { thresholdMB: number; deadlineMs?: number; maxEntries?: number; scope?: 'user' | 'full' }) => Promise<CleanCLargeFile[]>
    revealPath: (targetPath: string) => Promise<{ ok: boolean; error?: string }>
    migratePath: (source: string, target: string) => Promise<{ success: boolean; error?: string }>
    getSoftware: () => Promise<CleanCSoftwareInfo[]>
    getSystemFolders: () => Promise<CleanCSystemFolderInfo[]>
    checkSoftwareRunning: (installPath: string) => Promise<{ running: boolean; processes: string[]; error?: string }>
    killProcesses: (processNames: string[]) => Promise<{ success: boolean; results: { name: string; success: boolean }[] }>
    analyzeOccupancy: () => Promise<CleanCOccupancyRecord[]>
    getFileTypeStats: (options?: { deadlineMs?: number; maxEntries?: number }) => Promise<CleanCFileTypeStat[]>
    getHistory: () => Promise<CleanCHistoryEntry[]>
    getSpaceTimeline: () => Promise<CleanCSpacePoint[]>
    recordSnapshot: () => Promise<void>
    undoMigration: (source: string, target: string) => Promise<{ success: boolean; error?: string }>
    scanDuplicateFiles: () => Promise<any[]>
    scanResidualFiles: () => Promise<any[]>
    getSettings: () => Promise<CleanCAppSettings>
    setSettings: (patch: Partial<CleanCAppSettings>) => Promise<CleanCAppSettings>
    deleteItems: (paths: string[], options?: { useTrash?: boolean }) => Promise<CleanCDeleteResult>
    selectDirectory: (title?: string) => Promise<{ ok: boolean; path?: string; canceled?: boolean }>
    getAutoStart: () => Promise<{ ok: boolean; enabled: boolean }>
    setAutoStart: (enabled: boolean) => Promise<{ ok: boolean; enabled?: boolean; error?: string }>
    getHiddenOccupancy: () => Promise<CleanCHiddenOccupancyItem[]>
    exportHistory: () => Promise<{ ok: boolean; path?: string; canceled?: boolean; error?: string }>
    clearAppCache: () => Promise<{ ok: boolean; clearedBytes?: number; error?: string }>
    aiChat: (payload: CleanCAiChatPayload) => Promise<CleanCAiChatResult>
    setTitleBarTheme: (isDark: boolean) => Promise<{ ok: boolean }>
    onScanProgress: (callback: (data: { progress: number; currentFile: string }) => void) => () => void
    onLargeFileFound: (callback: (fileItem: any) => void) => () => void
  }
}
