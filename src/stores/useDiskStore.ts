import { create } from 'zustand'

export interface DiskInfo {
  drive: string
  total: number
  used: number
  available: number
  type: 'SSD' | 'HDD'
  healthScore: number
}

export interface CleanItem {
  id: string
  name: string
  path: string
  size: number
  riskLevel: 'safe' | 'warning' | 'danger'
  selected: boolean
  description: string
  icon: string
}

export interface SoftwareInfo {
  id: string
  name: string
  icon: string
  installPath: string
  size: number
  compatibility: 'compatible' | 'incompatible'
  category: string
}

export interface OccupancyRecord {
  id: string
  name: string
  size: number
  percentage: number
  trend: 'up' | 'down' | 'stable'
  category: 'software' | 'folder' | 'fileType'
  icon: string
  path?: string
  children?: { name: string; size: number; percentage: number }[]
}

export interface SuggestionItem {
  id: string
  type: 'clean' | 'migrate' | 'alert' | 'largeFile' | 'occupancy'
  title: string
  description: string
  size: number
  riskLevel: 'safe' | 'warning' | 'danger'
  action: string
}

export interface CleanResult {
  released: number
  failed: number
  skipped: number
  mode?: 'trash' | 'delete'
}

export interface SystemFolderInfo {
  id: string
  name: string
  icon: string
  path: string
  targetPath: string
  size: number
}

export interface FileTypeStat {
  key: string
  label: string
  fill: string
  bytes: number
}

export interface HistoryEntry {
  id: string
  time: number
  type: 'clean' | 'migrate' | 'scan'
  action: string
  detail: string
  bytes: number
}

export interface SpacePoint {
  date: string
  total: number
  used: number
  available: number
}

interface DiskState {
  disks: DiskInfo[]
  cleanItems: CleanItem[]
  softwareList: SoftwareInfo[]
  systemFolders: SystemFolderInfo[]
  occupancyRecords: OccupancyRecord[]
  suggestions: SuggestionItem[]
  scanning: boolean
  scanProgress: number
  loadingSystemData: boolean
  systemDataError: string | null
  dataSource: 'mock' | 'system'
  lastCleanResult: CleanResult | null
  lastRefreshedAt: number
  occupancyLoading: boolean
  occupancyLoadedAt: number
  fileTypeStats: FileTypeStat[]
  fileTypeLoadedAt: number
  history: HistoryEntry[]
  spaceTimeline: SpacePoint[]
  toggleCleanItem: (id: string) => void
  selectAllCleanItems: () => void
  deselectAllCleanItems: () => void
  refreshSystemData: (force?: boolean) => Promise<void>
  runSafeClean: (ids: string[]) => Promise<CleanResult>
  startScan: () => Promise<void>
  migratePath: (source: string, target: string) => Promise<{ success: boolean; error?: string }>
  refreshOccupancy: (force?: boolean) => Promise<void>
  refreshFileTypeStats: (force?: boolean) => Promise<void>
  refreshHistory: () => Promise<void>
  refreshSpaceTimeline: () => Promise<void>
  checkSoftwareRunning: (installPath: string) => Promise<{ running: boolean; processes: string[]; error?: string }>
  killProcesses: (processNames: string[]) => Promise<{ success: boolean; results: { name: string; success: boolean }[] }>
}

const mockDisks: DiskInfo[] = [
  { drive: 'C:', total: 100 * 1024 * 1024 * 1024, used: 78 * 1024 * 1024 * 1024, available: 22 * 1024 * 1024 * 1024, type: 'SSD', healthScore: 72 },
  { drive: 'D:', total: 500 * 1024 * 1024 * 1024, used: 180 * 1024 * 1024 * 1024, available: 320 * 1024 * 1024 * 1024, type: 'HDD', healthScore: 85 },
  { drive: 'E:', total: 1000 * 1024 * 1024 * 1024, used: 350 * 1024 * 1024 * 1024, available: 650 * 1024 * 1024 * 1024, type: 'HDD', healthScore: 90 },
]

const mockCleanItems: CleanItem[] = [
  { id: '1', name: 'Windows 临时文件', path: '%TEMP%, Windows\\Temp', size: 2.3 * 1024 * 1024 * 1024, riskLevel: 'safe', selected: true, description: '系统临时文件，可安全清理', icon: 'file' },
  { id: '2', name: '浏览器缓存', path: 'Chrome/Edge/Firefox', size: 1.8 * 1024 * 1024 * 1024, riskLevel: 'safe', selected: true, description: '浏览器缓存文件，已保留近7天常用缓存', icon: 'globe' },
  { id: '3', name: '回收站', path: '$Recycle.Bin', size: 0.5 * 1024 * 1024 * 1024, riskLevel: 'safe', selected: true, description: '回收站中的文件，共 23 个文件', icon: 'trash' },
  { id: '4', name: 'Windows 更新缓存', path: 'SoftwareDistribution\\Download', size: 1.2 * 1024 * 1024 * 1024, riskLevel: 'safe', selected: true, description: 'Windows Update 下载缓存', icon: 'download' },
  { id: '5', name: '缩略图缓存', path: 'thumbcache_*.db', size: 0.3 * 1024 * 1024 * 1024, riskLevel: 'safe', selected: true, description: '资源管理器缩略图缓存', icon: 'image' },
  { id: '6', name: '系统日志', path: 'Windows\\Logs', size: 0.8 * 1024 * 1024 * 1024, riskLevel: 'safe', selected: true, description: 'Windows 系统日志文件', icon: 'scroll' },
  { id: '7', name: 'Prefetch 文件', path: 'Windows\\Prefetch', size: 0.4 * 1024 * 1024 * 1024, riskLevel: 'safe', selected: true, description: '程序预读文件', icon: 'zap' },
  { id: '8', name: '错误报告', path: 'ProgramData\\Microsoft\\Windows\\WER', size: 0.2 * 1024 * 1024 * 1024, riskLevel: 'safe', selected: true, description: 'Windows 错误报告', icon: 'alert-circle' },
  { id: '9', name: '旧 Windows 安装', path: 'Windows.old', size: 15 * 1024 * 1024 * 1024, riskLevel: 'warning', selected: false, description: '旧版 Windows 安装文件，清理后不可恢复', icon: 'archive' },
]

const mockSoftware: SoftwareInfo[] = [
  { id: '1', name: '微信', icon: 'message-circle', installPath: 'C:\\Program Files\\Tencent\\WeChat', size: 18.6 * 1024 * 1024 * 1024, compatibility: 'compatible', category: '社交' },
  { id: '2', name: 'VS Code', icon: 'code', installPath: 'C:\\Users\\xxx\\AppData\\Local\\Programs\\Microsoft VS Code', size: 6.2 * 1024 * 1024 * 1024, compatibility: 'compatible', category: '开发' },
  { id: '3', name: 'Steam', icon: 'gamepad-2', installPath: 'C:\\Program Files (x86)\\Steam', size: 45.2 * 1024 * 1024 * 1024, compatibility: 'compatible', category: '游戏' },
  { id: '4', name: 'Chrome', icon: 'globe', installPath: 'C:\\Program Files\\Google\\Chrome', size: 3.8 * 1024 * 1024 * 1024, compatibility: 'compatible', category: '浏览器' },
  { id: '5', name: 'QQ', icon: 'message-square', installPath: 'C:\\Program Files\\Tencent\\QQ', size: 8.4 * 1024 * 1024 * 1024, compatibility: 'compatible', category: '社交' },
  { id: '6', name: 'Docker Desktop', icon: 'container', installPath: 'C:\\Program Files\\Docker', size: 12.5 * 1024 * 1024 * 1024, compatibility: 'compatible', category: '开发' },
  { id: '7', name: 'Node.js', icon: 'hexagon', installPath: 'C:\\Program Files\\nodejs', size: 1.2 * 1024 * 1024 * 1024, compatibility: 'compatible', category: '开发' },
  { id: '8', name: 'Windows Defender', icon: 'shield', installPath: 'C:\\Program Files\\Windows Defender', size: 2.1 * 1024 * 1024 * 1024, compatibility: 'incompatible', category: '系统' },
]

const mockOccupancy: OccupancyRecord[] = [
  { id: '1', name: 'Steam', size: 45.2 * 1024 * 1024 * 1024, percentage: 48, trend: 'up', category: 'software', icon: 'gamepad-2', children: [{ name: '游戏库', size: 40 * 1024 * 1024 * 1024, percentage: 88 }, { name: '缓存', size: 3.2 * 1024 * 1024 * 1024, percentage: 7 }, { name: '程序本体', size: 2 * 1024 * 1024 * 1024, percentage: 5 }] },
  { id: '2', name: '微信', size: 18.6 * 1024 * 1024 * 1024, percentage: 20, trend: 'up', category: 'software', icon: 'message-circle', children: [{ name: '聊天记录/文件', size: 12.3 * 1024 * 1024 * 1024, percentage: 65 }, { name: '图片/视频缓存', size: 4.8 * 1024 * 1024 * 1024, percentage: 26 }, { name: '程序本体', size: 1.5 * 1024 * 1024 * 1024, percentage: 8 }] },
  { id: '3', name: 'Docker Desktop', size: 12.5 * 1024 * 1024 * 1024, percentage: 13, trend: 'stable', category: 'software', icon: 'container', children: [{ name: '镜像存储', size: 10 * 1024 * 1024 * 1024, percentage: 80 }, { name: '容器数据', size: 1.5 * 1024 * 1024 * 1024, percentage: 12 }, { name: '程序本体', size: 1 * 1024 * 1024 * 1024, percentage: 8 }] },
  { id: '4', name: 'QQ', size: 8.4 * 1024 * 1024 * 1024, percentage: 9, trend: 'stable', category: 'software', icon: 'message-square', children: [{ name: '聊天记录/文件', size: 5.6 * 1024 * 1024 * 1024, percentage: 67 }, { name: '缓存', size: 2 * 1024 * 1024 * 1024, percentage: 24 }, { name: '程序本体', size: 0.8 * 1024 * 1024 * 1024, percentage: 9 }] },
  { id: '5', name: 'VS Code', size: 6.2 * 1024 * 1024 * 1024, percentage: 7, trend: 'stable', category: 'software', icon: 'code', children: [{ name: '扩展及缓存', size: 4.7 * 1024 * 1024 * 1024, percentage: 76 }, { name: '程序本体', size: 1.5 * 1024 * 1024 * 1024, percentage: 24 }] },
  { id: '6', name: 'Windows 临时文件', size: 4.1 * 1024 * 1024 * 1024, percentage: 4, trend: 'down', category: 'folder', icon: 'file', children: [{ name: '用户临时文件', size: 2.3 * 1024 * 1024 * 1024, percentage: 56 }, { name: '系统临时文件', size: 1.8 * 1024 * 1024 * 1024, percentage: 44 }] },
  { id: '7', name: 'Chrome', size: 3.8 * 1024 * 1024 * 1024, percentage: 4, trend: 'stable', category: 'software', icon: 'globe', children: [{ name: '缓存', size: 2.1 * 1024 * 1024 * 1024, percentage: 55 }, { name: '用户数据', size: 1.2 * 1024 * 1024 * 1024, percentage: 32 }, { name: '程序本体', size: 0.5 * 1024 * 1024 * 1024, percentage: 13 }] },
]

const mockSuggestions: SuggestionItem[] = [
  { id: '1', type: 'clean', title: 'Windows 临时文件', description: '系统临时文件，可安全清理', size: 2.3 * 1024 * 1024 * 1024, riskLevel: 'safe', action: '一键清理' },
  { id: '2', type: 'clean', title: '浏览器缓存', description: 'Chrome/Edge 缓存文件', size: 1.8 * 1024 * 1024 * 1024, riskLevel: 'safe', action: '一键清理' },
  { id: '3', type: 'migrate', title: '微信聊天记录', description: '可迁移到D盘，释放大量空间', size: 12.3 * 1024 * 1024 * 1024, riskLevel: 'safe', action: '查看建议' },
  { id: '4', type: 'migrate', title: 'QQ文件', description: '可迁移到D盘', size: 5.6 * 1024 * 1024 * 1024, riskLevel: 'safe', action: '查看建议' },
  { id: '5', type: 'alert', title: 'C盘空间不足', description: 'C盘使用率已达78%，建议尽快清理', size: 0, riskLevel: 'warning', action: '去清理' },
  { id: '6', type: 'largeFile', title: 'Steam 游戏库', description: '占用45.2GB，为C盘最大占用者', size: 45.2 * 1024 * 1024 * 1024, riskLevel: 'warning', action: '查看详情' },
  { id: '7', type: 'occupancy', title: 'Docker 镜像', description: '10GB 未清理的Docker镜像', size: 10 * 1024 * 1024 * 1024, riskLevel: 'warning', action: '查看详情' },
]

const mockMigrationSuggestions = mockSuggestions.filter((item) => item.type !== 'clean' && item.type !== 'alert')

const buildSuggestions = (
  cleanItems: CleanItem[],
  disks: DiskInfo[],
  systemFolders: SystemFolderInfo[],
  isRealData: boolean
): SuggestionItem[] => {
  const cDrive = disks.find((disk) => disk.drive.toUpperCase().startsWith('C')) || disks[0]
  const cleanSuggestions = cleanItems
    .filter((item) => item.size > 0)
    .sort((a, b) => b.size - a.size)
    .slice(0, 4)
    .map<SuggestionItem>((item) => ({
      id: `clean-${item.id}`,
      type: 'clean',
      title: item.name,
      description: item.description,
      size: item.size,
      riskLevel: item.riskLevel,
      action: '去清理',
    }))

  const alertSuggestion: SuggestionItem[] = cDrive && cDrive.total > 0 && cDrive.available / cDrive.total < 0.15
    ? [{
        id: 'low-space-alert',
        type: 'alert',
        title: `${cDrive.drive} 空间不足`,
        description: `${cDrive.drive} 可用空间低于 15%，建议优先清理安全项`,
        size: 0,
        riskLevel: 'warning',
        action: '去清理',
      }]
    : []

  // 真实数据模式：迁移建议来自真实扫描到的系统文件夹；仅网页演示模式才展示示例数据
  const migrationSuggestions: SuggestionItem[] = isRealData
    ? systemFolders
        .filter((folder) => folder.size > 300 * 1024 * 1024 && folder.targetPath)
        .sort((a, b) => b.size - a.size)
        .slice(0, 3)
        .map<SuggestionItem>((folder) => ({
          id: `migrate-${folder.id}`,
          type: 'migrate',
          title: `迁移「${folder.name}」到 ${folder.targetPath.slice(0, 2)} 盘`,
          description: `${folder.path} → ${folder.targetPath}（软链接迁移，可撤销）`,
          size: folder.size,
          riskLevel: 'safe',
          action: '去迁移',
        }))
    : mockMigrationSuggestions

  return [...cleanSuggestions, ...alertSuggestion, ...migrationSuggestions]
}

const mergeSelection = (nextItems: CleanItem[], currentItems: CleanItem[]) => {
  const selectedById = new Map(currentItems.map((item) => [item.id, item.selected]))
  return nextItems.map((item) => ({
    ...item,
    selected: selectedById.get(item.id) ?? item.selected,
  }))
}

const getSystemBridge = () => window.cleanC

export const useDiskStore = create<DiskState>((set, get) => ({
  disks: mockDisks,
  cleanItems: mockCleanItems,
  softwareList: mockSoftware,
  systemFolders: [],
  occupancyRecords: mockOccupancy,
  suggestions: mockSuggestions,
  scanning: false,
  scanProgress: 0,
  loadingSystemData: false,
  systemDataError: null,
  dataSource: 'mock',
  lastCleanResult: null,
  lastRefreshedAt: 0,
  occupancyLoading: false,
  occupancyLoadedAt: 0,
  fileTypeStats: [],
  fileTypeLoadedAt: 0,
  history: [],
  spaceTimeline: [],
  toggleCleanItem: (id) => set((s) => ({
    cleanItems: s.cleanItems.map((item) => item.id === id ? { ...item, selected: !item.selected } : item)
  })),
  selectAllCleanItems: () => set((s) => ({
    cleanItems: s.cleanItems.map((item) => ({ ...item, selected: item.riskLevel === 'safe' }))
  })),
  deselectAllCleanItems: () => set((s) => ({
    cleanItems: s.cleanItems.map((item) => ({ ...item, selected: false }))
  })),
  refreshSystemData: async (force = false) => {
    const bridge = getSystemBridge()
    if (!bridge) {
      set({ dataSource: 'mock', systemDataError: null })
      return
    }

    // 性能优化：引入 30 秒缓存节流机制，避免页面频繁切换时重复扫描磁盘
    const now = Date.now()
    const lastRefreshed = get().lastRefreshedAt
    if (!force && lastRefreshed > 0 && now - lastRefreshed < 30000) {
      return
    }

    set({ loadingSystemData: true, systemDataError: null })

    try {
      const bridgeDisks = bridge.getDisks().catch(() => [])
      const bridgeCleanItems = bridge.scanCleanItems().catch(() => [])
      const bridgeSoftware = bridge.getSoftware ? bridge.getSoftware().catch(() => []) : Promise.resolve([])
      const bridgeSystemFolders = bridge.getSystemFolders ? bridge.getSystemFolders().catch(() => []) : Promise.resolve([])

      const [disks, cleanItems, softwareList, systemFolders] = await Promise.all([
        bridgeDisks,
        bridgeCleanItems,
        bridgeSoftware,
        bridgeSystemFolders
      ])
      
      const currentItems = get().cleanItems
      const nextDisks = disks.length > 0 ? disks : get().disks
      const nextCleanItems = cleanItems.length > 0 ? mergeSelection(cleanItems, currentItems) : currentItems
      const nextSoftware = softwareList.length > 0 ? softwareList : get().softwareList
      const nextSystemFolders = systemFolders.length > 0 ? systemFolders : get().systemFolders

      set({
        disks: nextDisks,
        cleanItems: nextCleanItems,
        softwareList: nextSoftware,
        systemFolders: nextSystemFolders,
        suggestions: buildSuggestions(nextCleanItems, nextDisks, nextSystemFolders, true),
        dataSource: 'system',
        loadingSystemData: false,
        systemDataError: null,
        lastRefreshedAt: Date.now(),
      })
    } catch (error) {
      set({
        loadingSystemData: false,
        systemDataError: error instanceof Error ? error.message : '读取系统数据失败',
      })
    }
  },
  runSafeClean: async (ids) => {
    const bridge = getSystemBridge()
    if (!bridge) {
      const result = { released: 0, failed: 0, skipped: ids.length }
      set({ lastCleanResult: result })
      return result
    }

    // 读取「删除文件先进回收站」设置，透传给主进程真实生效
    const useTrash = localStorage.getItem('cleanc_recycle_bin') !== 'false'
    const result = await bridge.cleanSelected(ids, { useTrash })
    set({ lastCleanResult: result })
    await get().refreshSystemData(true)
    await get().refreshHistory()
    return result
  },
  startScan: async () => {
    set({ scanning: true, scanProgress: 10, systemDataError: null })

    try {
      set({ scanProgress: 45 })
      await get().refreshSystemData()
      set({ scanProgress: 100 })
    } finally {
      set({ scanning: false })
    }
  },
  migratePath: async (source: string, target: string) => {
    const bridge = getSystemBridge()
    if (!bridge || !bridge.migratePath) {
      return { success: false, error: '当前环境不支持真实迁移' }
    }
    const result = await bridge.migratePath(source, target)
    if (result.success) {
      await get().refreshSystemData(true)
      await get().refreshHistory()
    }
    return result
  },
  refreshOccupancy: async (force = false) => {
    const bridge = getSystemBridge()
    if (!bridge || !bridge.analyzeOccupancy) return
    const now = Date.now()
    if (!force && get().occupancyLoadedAt > 0 && now - get().occupancyLoadedAt < 60000) return
    set({ occupancyLoading: true })
    try {
      const records = await bridge.analyzeOccupancy()
      if (Array.isArray(records) && records.length > 0) {
        set({ occupancyRecords: records as OccupancyRecord[], occupancyLoadedAt: Date.now(), dataSource: 'system' })
      }
    } catch {
      // 保留已有数据
    } finally {
      set({ occupancyLoading: false })
    }
  },
  refreshFileTypeStats: async (force = false) => {
    const bridge = getSystemBridge()
    if (!bridge || !bridge.getFileTypeStats) return
    const now = Date.now()
    if (!force && get().fileTypeLoadedAt > 0 && now - get().fileTypeLoadedAt < 60000) return
    try {
      const stats = await bridge.getFileTypeStats()
      if (Array.isArray(stats)) {
        set({ fileTypeStats: stats, fileTypeLoadedAt: Date.now() })
      }
    } catch {
      // ignore
    }
  },
  refreshHistory: async () => {
    const bridge = getSystemBridge()
    if (!bridge || !bridge.getHistory) return
    try {
      const list = await bridge.getHistory()
      if (Array.isArray(list)) set({ history: list })
    } catch {
      // ignore
    }
  },
  refreshSpaceTimeline: async () => {
    const bridge = getSystemBridge()
    if (!bridge || !bridge.getSpaceTimeline) return
    try {
      const list = await bridge.getSpaceTimeline()
      if (Array.isArray(list)) set({ spaceTimeline: list })
    } catch {
      // ignore
    }
  },
  checkSoftwareRunning: async (installPath: string) => {
    const bridge = getSystemBridge()
    if (!bridge || !bridge.checkSoftwareRunning) {
      return { running: false, processes: [] }
    }
    return await bridge.checkSoftwareRunning(installPath)
  },
  killProcesses: async (processNames: string[]) => {
    const bridge = getSystemBridge()
    if (!bridge || !bridge.killProcesses) {
      return { success: true, results: [] }
    }
    return await bridge.killProcesses(processNames)
  },
}))
