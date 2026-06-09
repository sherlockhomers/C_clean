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
}

interface CleanCLargeFile {
  id: string
  name: string
  path: string
  size: number
  lastAccess: string
  type: 'large'
  aiNote: string
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
    cleanSelected: (ids: string[]) => Promise<CleanCCleanResult>
    scanLargeFiles: (options: { thresholdMB: number; deadlineMs?: number; maxEntries?: number }) => Promise<CleanCLargeFile[]>
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
    onScanProgress: (callback: (data: { progress: number; currentFile: string }) => void) => () => void
    onLargeFileFound: (callback: (fileItem: any) => void) => () => void
  }
}
