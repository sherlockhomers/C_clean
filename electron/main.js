const { app, BrowserWindow, Menu, ipcMain, shell, dialog, session, Notification, Tray } = require('electron')
const path = require('path')
const fs = require('fs/promises')
const os = require('os')
const { execFile } = require('child_process')
const { promisify } = require('util')
const crypto = require('crypto')

const execFileAsync = promisify(execFile)

// 移除默认菜单
Menu.setApplicationMenu(null)

let mainWindow

const cleanTargets = [
  {
    id: 'user-temp',
    name: '用户临时文件',
    paths: [os.tmpdir()],
    riskLevel: 'safe',
    description: '当前用户临时目录，可安全清理',
    icon: 'file',
    selected: true,
  },
  {
    id: 'windows-temp',
    name: 'Windows 临时文件',
    paths: ['C:\\Windows\\Temp'],
    riskLevel: 'warning',
    description: '系统临时目录，部分文件可能需要管理员权限',
    icon: 'file',
    selected: false,
  },
  {
    id: 'browser-cache',
    name: '浏览器缓存',
    // 动态枚举 Chrome/Edge/Brave 的所有 Profile 与 Firefox 缓存，见 resolveBrowserCachePaths
    paths: [],
    resolvePaths: () => resolveBrowserCachePaths(),
    riskLevel: 'safe',
    description: '主流浏览器全部 Profile 的缓存（Chrome/Edge/Brave/Firefox），清理后首次访问网页稍慢',
    icon: 'globe',
    selected: true,
  },
  {
    id: 'dev-cache',
    name: '开发工具缓存',
    paths: [
      path.join(os.homedir(), 'AppData\\Local\\npm-cache'),
      path.join(os.homedir(), 'AppData\\Roaming\\npm-cache'),
      path.join(os.homedir(), 'AppData\\Local\\pip\\cache'),
      path.join(os.homedir(), 'AppData\\Local\\Yarn\\Cache'),
      path.join(os.homedir(), 'AppData\\Local\\NuGet\\Cache'),
      path.join(os.homedir(), 'AppData\\Local\\NuGet\\v3-cache'),
      path.join(os.homedir(), '.gradle\\caches'),
    ],
    riskLevel: 'safe',
    description: 'npm / pip / Yarn / NuGet / Gradle 包管理缓存，删除后下次安装依赖时会重新下载',
    icon: 'package',
    selected: false,
  },
  {
    id: 'wer',
    name: 'Windows 错误报告',
    paths: [
      'C:\\ProgramData\\Microsoft\\Windows\\WER',
      path.join(os.homedir(), 'AppData\\Local\\Microsoft\\Windows\\WER'),
    ],
    riskLevel: 'safe',
    description: 'Windows 错误报告缓存，失败项会自动跳过',
    icon: 'alert-circle',
    selected: false,
  },
  {
    id: 'thumbnail-cache',
    name: '缩略图缓存',
    paths: [path.join(os.homedir(), 'AppData\\Local\\Microsoft\\Windows\\Explorer')],
    riskLevel: 'safe',
    description: '资源管理器缩略图缓存，清理后系统自动重建；被占用的文件会自动跳过',
    icon: 'image',
    selected: false,
  },
  {
    id: 'dx-shader-cache',
    name: '显卡着色器缓存',
    paths: [
      path.join(os.homedir(), 'AppData\\Local\\D3DSCache'),
      path.join(os.homedir(), 'AppData\\Local\\NVIDIA\\DXCache'),
      path.join(os.homedir(), 'AppData\\Local\\NVIDIA\\GLCache'),
      path.join(os.homedir(), 'AppData\\Local\\AMD\\DxCache'),
    ],
    riskLevel: 'safe',
    description: 'DirectX/显卡着色器缓存，游戏与应用首次启动时会自动重建',
    icon: 'zap',
    selected: false,
  },
  {
    id: 'windows-update-cache',
    name: 'Windows 更新缓存',
    paths: ['C:\\Windows\\SoftwareDistribution\\Download'],
    riskLevel: 'warning',
    description: 'Windows Update 已下载的安装包缓存，清理后如需更新会重新下载（需管理员权限）',
    icon: 'download',
    selected: false,
  },
  {
    id: 'recycle-bin',
    name: '清空回收站',
    paths: ['C:\\$Recycle.Bin'],
    riskLevel: 'warning',
    description: '清空系统回收站。清空后不可恢复，请确认其中没有需要找回的文件',
    icon: 'trash',
    selected: false,
    special: 'recycle-bin',
  },
]

function toNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

// 动态枚举主流浏览器所有 Profile 的缓存目录（Chromium 系按 Profile 枚举，Firefox 按配置目录枚举）
async function resolveBrowserCachePaths() {
  const home = os.homedir()
  const results = []

  const chromiumUserDataDirs = [
    path.join(home, 'AppData\\Local\\Google\\Chrome\\User Data'),
    path.join(home, 'AppData\\Local\\Microsoft\\Edge\\User Data'),
    path.join(home, 'AppData\\Local\\BraveSoftware\\Brave-Browser\\User Data'),
  ]

  for (const userData of chromiumUserDataDirs) {
    const entries = await fs.readdir(userData, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      // Chromium Profile 目录命名规则：Default / Profile 1 / Profile 2 ...
      if (entry.name === 'Default' || /^Profile \d+$/.test(entry.name)) {
        results.push(path.join(userData, entry.name, 'Cache'))
        results.push(path.join(userData, entry.name, 'Code Cache'))
        results.push(path.join(userData, entry.name, 'GPUCache'))
      }
    }
  }

  // Firefox：Profiles 下每个配置目录的 cache2
  const firefoxProfiles = path.join(home, 'AppData\\Local\\Mozilla\\Firefox\\Profiles')
  const ffEntries = await fs.readdir(firefoxProfiles, { withFileTypes: true }).catch(() => [])
  for (const entry of ffEntries) {
    if (entry.isDirectory()) {
      results.push(path.join(firefoxProfiles, entry.name, 'cache2'))
    }
  }

  return results
}

function healthScoreFromUsage(total, available) {
  if (!total) return 0
  const availablePercent = available / total
  return Math.max(30, Math.min(98, Math.round(availablePercent * 100 + 55)))
}

// 真实检测各盘符的介质类型（SSD/HDD），结果缓存避免重复调用 PowerShell
let driveMediaTypeCache = null
async function getDriveMediaTypes() {
  if (driveMediaTypeCache) return driveMediaTypeCache
  if (process.platform !== 'win32') return {}

  const script = `
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8;
    $parts = Get-Partition -ErrorAction SilentlyContinue | Where-Object DriveLetter | Select-Object DriveLetter, DiskNumber;
    $disks = Get-PhysicalDisk -ErrorAction SilentlyContinue | Select-Object DeviceId, MediaType;
    @{ p = @($parts); d = @($disks) } | ConvertTo-Json -Compress
  `
  try {
    const { stdout } = await execFileAsync('powershell.exe', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script,
    ], { windowsHide: true, timeout: 10000 })

    const parsed = JSON.parse(stdout.trim() || '{}')
    const partitions = Array.isArray(parsed.p) ? parsed.p : (parsed.p ? [parsed.p] : [])
    const physical = Array.isArray(parsed.d) ? parsed.d : (parsed.d ? [parsed.d] : [])

    // MediaType 在不同 PowerShell 版本可能序列化为字符串或枚举数字（3=HDD, 4=SSD）
    const normalizeMedia = (value) => {
      if (value === 4 || value === '4' || value === 'SSD') return 'SSD'
      if (value === 3 || value === '3' || value === 'HDD') return 'HDD'
      return null
    }

    const diskTypeById = {}
    for (const d of physical) {
      diskTypeById[String(d.DeviceId)] = normalizeMedia(d.MediaType)
    }

    const map = {}
    for (const p of partitions) {
      const mediaType = diskTypeById[String(p.DiskNumber)]
      if (p.DriveLetter && mediaType) {
        map[String(p.DriveLetter).toUpperCase()] = mediaType
      }
    }
    driveMediaTypeCache = map
    return map
  } catch {
    return {}
  }
}

async function getFixedDisks() {
  if (process.platform !== 'win32') {
    return []
  }

  const mediaTypes = await getDriveMediaTypes().catch(() => ({}))
  const drives = ['C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z']
  
  const checkPromises = drives.map(async (drive) => {
    const drivePath = `${drive}:\\`
    try {
      // 快速检查盘符是否存在
      await fs.access(drivePath)
      // 使用 Node.js 18+ 原生的 fs.statfs 获取磁盘空间信息
      const stat = await fs.statfs(drivePath)
      const total = toNumber(stat.bsize) * toNumber(stat.blocks)
      const available = toNumber(stat.bsize) * toNumber(stat.bavail)
      
      return {
        drive: `${drive}:`,
        total,
        used: Math.max(0, total - available),
        available,
        type: mediaTypes[drive] || 'SSD',
        healthScore: healthScoreFromUsage(total, available),
      }
    } catch {
      return null
    }
  })

  const results = await Promise.all(checkPromises)
  return results.filter(Boolean)
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath)
    return true
  } catch {
    return false
  }
}

async function getDirSize(rootPath, options = {}) {
  const startedAt = Date.now()
  // 缩短超时时间，避免扫描过慢，最大允许 1.5 秒
  const deadlineMs = options.deadlineMs ?? 1500
  const maxEntries = options.maxEntries ?? 100000
  let size = 0
  let entries = 0
  const stack = [rootPath]

  while (stack.length > 0) {
    if (Date.now() - startedAt > deadlineMs || entries > maxEntries) {
      break
    }

    const current = stack.pop()
    let dir

    try {
      dir = await fs.opendir(current)
    } catch {
      continue
    }

    const statPromises = []

    for await (const dirent of dir) {
      entries += 1
      const itemPath = path.join(current, dirent.name)

      if (dirent.isDirectory()) {
        // 检查是否是 Junction 或符号链接，避免死循环
        try {
          const lstat = await fs.lstat(itemPath)
          if (!lstat.isSymbolicLink()) {
            stack.push(itemPath)
          }
        } catch {
          // 如果 lstat 失败，安全起见不递归
        }
      } else if (dirent.isFile()) {
        statPromises.push(
          fs.stat(itemPath).then(stat => { size += stat.size }).catch(() => {})
        )
      }

      // Batch process stats to avoid memory bloat
      if (statPromises.length >= 100) {
        await Promise.all(statPromises)
        statPromises.length = 0
      }
    }
    
    if (statPromises.length > 0) {
      await Promise.all(statPromises)
    }
  }

  return size
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = []
  const workers = Array.from({ length: Math.min(limit, items.length) }, async (_, workerIndex) => {
    for (let index = workerIndex; index < items.length; index += limit) {
      results[index] = await mapper(items[index], index)
    }
  })

  await Promise.all(workers)
  return results
}

// 解析目标的真实路径列表：支持静态 paths 与动态 resolvePaths
async function resolveTargetPaths(target) {
  if (typeof target.resolvePaths === 'function') {
    return await target.resolvePaths().catch(() => [])
  }
  return target.paths
}

async function scanCleanItems() {
  // 性能优化：各清理目标并行扫描（并发 4），单路径估算限时 1200ms，整体耗时从串行十几秒降到约 3-4 秒
  const scanned = await mapWithConcurrency(cleanTargets, 4, async (target) => {
    let size = 0
    const existingPaths = []
    const candidatePaths = await resolveTargetPaths(target)

    for (const targetPath of candidatePaths) {
      if (await pathExists(targetPath)) {
        existingPaths.push(targetPath)
        size += await getDirSize(targetPath, { deadlineMs: 1200, maxEntries: 80000 })
      }
    }

    if (existingPaths.length === 0) return null
    return {
      id: target.id,
      name: target.name,
      path: existingPaths.length > 3 ? `${existingPaths.slice(0, 3).join(', ')} 等 ${existingPaths.length} 处` : existingPaths.join(', '),
      size,
      riskLevel: target.riskLevel,
      selected: target.selected && size > 0,
      description: target.description,
      icon: target.icon,
    }
  })

  return scanned.filter(Boolean)
}

// 删除前测量条目真实大小：文件取 stat.size，目录做限时估算，保证“已释放”数字可信
async function measureEntrySize(itemPath, lstat) {
  try {
    if (lstat && lstat.isFile()) return lstat.size
    if (lstat && lstat.isSymbolicLink()) return 0
    if (lstat && lstat.isDirectory()) {
      return await getDirSize(itemPath, { deadlineMs: 400, maxEntries: 20000 })
    }
  } catch {
    // 测量失败不阻塞删除流程
  }
  return 0
}

async function trashDirectoryChildren(rootPath, useTrash) {
  let released = 0
  let failed = 0

  if (!(await pathExists(rootPath))) {
    return { released, failed }
  }

  let entries
  try {
    entries = await fs.readdir(rootPath, { withFileTypes: true })
  } catch {
    return { released, failed: failed + 1 }
  }

  // useTrash=true 时使用系统回收站（可恢复），false 时彻底删除（立即释放空间）
  const concurrency = useTrash ? 4 : 16
  const results = await mapWithConcurrency(entries, concurrency, async (entry) => {
    const itemPath = path.join(rootPath, entry.name)
    try {
      const lstat = await fs.lstat(itemPath).catch(() => null)
      const itemSize = await measureEntrySize(itemPath, lstat)

      if (useTrash) {
        await shell.trashItem(itemPath)
      } else {
        await fs.rm(itemPath, { recursive: true, force: true })
      }
      return { success: true, size: itemSize }
    } catch {
      return { success: false, size: 0 }
    }
  })

  for (const res of results) {
    if (res.success) {
      released += res.size
    } else {
      failed += 1
    }
  }

  return { released, failed }
}

// 清空系统回收站：先测量体积，再调用系统命令彻底清空
async function emptyRecycleBin() {
  const sizeBefore = await getDirSize('C:\\$Recycle.Bin', { deadlineMs: 2000, maxEntries: 50000 }).catch(() => 0)
  try {
    await execFileAsync('powershell.exe', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
      'Clear-RecycleBin -Force -ErrorAction SilentlyContinue',
    ], { windowsHide: true, timeout: 60000 })
    return { released: sizeBefore, failed: 0 }
  } catch {
    return { released: 0, failed: 1 }
  }
}

async function cleanSelected(ids, options = {}) {
  const allowedIds = new Set(Array.isArray(ids) ? ids : [])
  // 允许清理用户明确勾选的非 safe 项（如 Windows Temp）
  const targets = cleanTargets.filter((target) => allowedIds.has(target.id))

  let useTrash = options.useTrash
  if (typeof useTrash !== 'boolean') {
    const settings = await getAppSettings()
    useTrash = settings.recycleBin
  }

  let released = 0
  let failed = 0

  for (const target of targets) {
    // 特殊目标：清空回收站走系统命令，而不是「把回收站移入回收站」
    if (target.special === 'recycle-bin') {
      const result = await emptyRecycleBin()
      released += result.released
      failed += result.failed
      continue
    }
    const candidatePaths = await resolveTargetPaths(target)
    for (const targetPath of candidatePaths) {
      const result = await trashDirectoryChildren(targetPath, useTrash)
      released += result.released
      failed += result.failed
    }
  }

  return {
    released,
    failed,
    skipped: allowedIds.size - targets.length,
    mode: useTrash ? 'trash' : 'delete',
  }
}

// ---------- 任意文件/目录批量删除（深度扫描结果一键清理） ----------
// 多重保护：仅允许绝对路径，禁止删除系统关键目录、盘符根目录与用户目录骨架
const PROTECTED_PATH_PATTERNS = [
  /^[a-z]:\\?$/i,                                            // 盘符根目录
  /^c:\\windows(\\|$)/i,                                     // Windows 系统目录整棵树
  /^c:\\program files( \(x86\))?(\\|$)/i,                    // Program Files 整棵树（软件请走「软件迁移」或系统卸载）
  /^c:\\programdata\\microsoft(\\|$)/i,                      // 微软系统数据
  /^c:\\programdata\\?$/i,                                   // ProgramData 根
  /^c:\\users\\?$/i,                                         // Users 根
  /^c:\\users\\[^\\]+\\?$/i,                                 // 某个用户的主目录
  /^c:\\users\\[^\\]+\\appdata(\\local|\\roaming|\\locallow)?\\?$/i, // AppData 骨架目录
  /^c:\\\$recycle\.bin(\\|$)/i,                              // 回收站本体
  /^c:\\system volume information(\\|$)/i,
]

function isProtectedPath(targetPath) {
  const normalized = path.resolve(targetPath)
  return PROTECTED_PATH_PATTERNS.some((pattern) => pattern.test(normalized))
}

async function deleteItems(paths, options = {}) {
  const list = (Array.isArray(paths) ? paths : [])
    .filter((p) => typeof p === 'string' && p.length > 3 && path.isAbsolute(p))

  let useTrash = options.useTrash
  if (typeof useTrash !== 'boolean') {
    const settings = await getAppSettings()
    useTrash = settings.recycleBin
  }

  const results = await mapWithConcurrency(list, useTrash ? 4 : 8, async (itemPath) => {
    const resolved = path.resolve(itemPath)
    try {
      if (isProtectedPath(resolved)) {
        return { path: resolved, success: false, size: 0, error: '受保护的系统路径，已拒绝删除' }
      }
      const lstat = await fs.lstat(resolved).catch(() => null)
      if (!lstat) {
        return { path: resolved, success: false, size: 0, error: '路径不存在' }
      }
      const size = await measureEntrySize(resolved, lstat)
      if (useTrash) {
        await shell.trashItem(resolved)
      } else {
        await fs.rm(resolved, { recursive: true, force: true })
      }
      return { path: resolved, success: true, size }
    } catch (error) {
      return { path: resolved, success: false, size: 0, error: error.message }
    }
  })

  let released = 0
  let failed = 0
  for (const res of results) {
    if (res.success) released += res.size
    else failed += 1
  }

  return { released, failed, results, mode: useTrash ? 'trash' : 'delete' }
}

// 弹出系统目录选择框（用于自定义迁移目标）
async function selectDirectory(title) {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: title || '选择目标文件夹',
    properties: ['openDirectory', 'createDirectory'],
  })
  if (canceled || !filePaths || filePaths.length === 0) {
    return { ok: false, canceled: true }
  }
  return { ok: true, path: filePaths[0] }
}

async function getExistingScanRoots() {
  const candidates = [
    path.join(os.homedir(), 'Downloads'),
    path.join(os.homedir(), 'Desktop'),
    path.join(os.homedir(), 'Documents'),
    path.join(os.homedir(), 'Pictures'),
    path.join(os.homedir(), 'Videos'),
    path.join(os.homedir(), 'Music'),
  ]

  const roots = []
  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      roots.push(candidate)
    }
  }
  return roots
}

// 全盘扫描时跳过的目录：系统核心目录与无清理价值的噪音目录
const FULL_SCAN_SKIP_PATTERNS = [
  /^c:\\windows(\\|$)/i,
  /^c:\\\$recycle\.bin(\\|$)/i,
  /^c:\\system volume information(\\|$)/i,
  /^c:\\programdata\\microsoft\\windows defender(\\|$)/i,
  /\\node_modules$/i,
]

async function scanLargeFiles(options = {}) {
  const threshold = Math.max(10, Number(options.thresholdMB) || 50) * 1024 * 1024
  const fullScan = options.scope === 'full'
  const startedAt = Date.now()
  const deadlineMs = Math.min(Math.max(Number(options.deadlineMs) || 20000, 5000), fullScan ? 180000 : 60000)
  const maxEntries = Math.min(Math.max(Number(options.maxEntries) || 120000, 10000), fullScan ? 800000 : 300000)
  const roots = fullScan ? ['C:\\'] : await getExistingScanRoots()
  const stack = [...roots]
  const files = []
  let entries = 0

  while (stack.length > 0) {
    if (Date.now() - startedAt > deadlineMs || entries > maxEntries) {
      break
    }

    const current = stack.pop()
    let dir
    try {
      dir = await fs.opendir(current)
    } catch {
      continue
    }

    for await (const dirent of dir) {
      entries += 1
      const itemPath = path.join(current, dirent.name)

      // 性能优化：流式扫描进度推送，每 200 个文件推送一次
      // 进度取「时间进度」与「条目进度」的较大值，保证单调增长且不会长期停留在低百分比
      if (mainWindow && entries % 200 === 0) {
        const timePct = ((Date.now() - startedAt) / deadlineMs) * 100
        const entryPct = (entries / maxEntries) * 100
        mainWindow.webContents.send('cleanc:scan-progress', {
          progress: Math.min(Math.round(Math.max(timePct, entryPct)), 99),
          currentFile: dirent.name
        })
      }

      try {
        if (dirent.isDirectory()) {
          // 全盘模式下跳过系统核心目录与噪音目录
          if (fullScan && FULL_SCAN_SKIP_PATTERNS.some((p) => p.test(itemPath))) {
            continue
          }
          // 排除 Junction 目录联接，避免死循环
          const lstat = await fs.lstat(itemPath).catch(() => null)
          if (lstat && !lstat.isSymbolicLink()) {
            stack.push(itemPath)
          }
        } else if (dirent.isFile()) {
          const stat = await fs.stat(itemPath)
          if (stat.size >= threshold) {
            const isProtected = isProtectedPath(itemPath)
            const fileItem = {
              id: itemPath,
              name: dirent.name,
              path: itemPath,
              size: stat.size,
              lastAccess: stat.atime.toISOString().slice(0, 10),
              type: 'large',
              protected: isProtected,
              aiNote: isProtected
                ? '位于系统保护目录，仅供查看，应用不会删除该文件'
                : '真实扫描发现的大文件，请确认用途后再处理',
            }
            files.push(fileItem)
            
            // 性能优化：发现大文件时，流式推送给前端，实现实时流式渲染
            if (mainWindow) {
              mainWindow.webContents.send('cleanc:large-file-found', fileItem)
            }
          }
        }
      } catch {
        // Locked files and permission-restricted folders should not break a scan.
      }
    }
  }

  // 扫描完成，推送 100% 进度
  if (mainWindow) {
    mainWindow.webContents.send('cleanc:scan-progress', {
      progress: 100,
      currentFile: '扫描完成'
    })
  }

  return files.sort((a, b) => b.size - a.size).slice(0, fullScan ? 150 : 80)
}

async function getFileQuickHash(filePath, size) {
  let fd
  try {
    fd = await fs.open(filePath, 'r')
    const bufferSize = Math.min(4096, size)
    const headBuffer = Buffer.alloc(bufferSize)
    const tailBuffer = Buffer.alloc(bufferSize)

    // 读取头部
    const headResult = await fd.read(headBuffer, 0, bufferSize, 0)
    const headBytes = headResult.bytesRead
    
    let tailBytes = 0
    if (size > bufferSize) {
      // 读取尾部，确保起始位置正确
      const tailResult = await fd.read(tailBuffer, 0, bufferSize, size - bufferSize)
      tailBytes = tailResult.bytesRead
    }

    const hash = crypto.createHash('md5')
    hash.update(headBuffer.subarray(0, headBytes))
    if (tailBytes > 0) {
      hash.update(tailBuffer.subarray(0, tailBytes))
    }
    return hash.digest('hex')
  } catch {
    return null
  } finally {
    if (fd) await fd.close().catch(() => {})
  }
}

async function scanDuplicateFiles(options = {}) {
  const roots = await getExistingScanRoots()
  const stack = [...roots]
  const sizeMap = new Map() // size -> [filePath]
  let entries = 0
  const maxEntries = 100000
  const startedAt = Date.now()
  const deadlineMs = Math.min(Math.max(Number(options.deadlineMs) || 20000, 5000), 60000)

  // 1. 扫描所有文件并按大小分组
  while (stack.length > 0) {
    if (entries > maxEntries || Date.now() - startedAt > deadlineMs) break

    const current = stack.pop()
    let dir
    try {
      dir = await fs.opendir(current)
    } catch {
      continue
    }

    for await (const dirent of dir) {
      entries += 1

      // 第一阶段（遍历分组）占总进度 0~60%
      if (mainWindow && entries % 400 === 0) {
        const timePct = ((Date.now() - startedAt) / deadlineMs) * 60
        const entryPct = (entries / maxEntries) * 60
        mainWindow.webContents.send('cleanc:scan-progress', {
          progress: Math.min(Math.round(Math.max(timePct, entryPct)), 60),
          currentFile: dirent.name
        })
      }

      const itemPath = path.join(current, dirent.name)

      try {
        if (dirent.isDirectory()) {
          const lstat = await fs.lstat(itemPath).catch(() => null)
          if (lstat && !lstat.isSymbolicLink()) {
            stack.push(itemPath)
          }
        } else if (dirent.isFile()) {
          const stat = await fs.stat(itemPath)
          const size = stat.size
          if (size > 1024 * 1024) { // 只检测大于 1MB 的文件，避免琐碎小文件干扰
            if (!sizeMap.has(size)) {
              sizeMap.set(size, [])
            }
            sizeMap.get(size).push({
              path: itemPath,
              name: dirent.name,
              size,
              lastAccess: stat.atime.toISOString().slice(0, 10)
            })
          }
        }
      } catch {
        // Skip locked files
      }
    }
  }

  // 2. 筛选出大小相同的文件，并计算快速哈希
  const duplicates = []
  const hashMap = new Map() // hash -> [fileInfo]

  const duplicateSizeGroups = Array.from(sizeMap.values()).filter(files => files.length >= 2)
  const totalToHash = duplicateSizeGroups.reduce((acc, files) => acc + files.length, 0)
  let processedCount = 0

  for (const files of duplicateSizeGroups) {
    if (Date.now() - startedAt > deadlineMs + 15000) break // 哈希阶段额外预留时间上限，避免长时间阻塞

    for (const file of files) {
      processedCount++
      if (mainWindow && processedCount % 5 === 0) {
        mainWindow.webContents.send('cleanc:scan-progress', {
          progress: Math.min(70 + Math.round((processedCount / totalToHash) * 30), 99),
          currentFile: file.name
        })
      }

      const hash = await getFileQuickHash(file.path, file.size)
      if (hash) {
        const key = `${file.size}_${hash}`
        if (!hashMap.has(key)) {
          hashMap.set(key, [])
        }
        hashMap.get(key).push(file)
      }
    }
  }

  // 3. 整理重复文件格式
  for (const [key, files] of hashMap.entries()) {
    if (files.length < 2) continue // 排除唯一哈希的文件

    const original = files[0]
    for (let i = 1; i < files.length; i++) {
      const copy = files[i]
      duplicates.push({
        id: copy.path,
        name: copy.name,
        path: copy.path,
        size: copy.size,
        lastAccess: copy.lastAccess,
        type: 'duplicate',
        aiNote: `与 ${original.name} 大小及头尾内容一致，疑似重复，建议核对后再删除`,
      })
    }
  }

  return duplicates.sort((a, b) => b.size - a.size).slice(0, 50)
}

async function scanResidualFiles() {
  if (process.platform !== 'win32') return []

  try {
    // 1. 获取已安装软件列表，汇总「名称 + 安装路径」作为特征匹配依据
    const installedSoftware = await getRealSoftware()
    const installedNames = installedSoftware.map(s => `${s.name} ${s.installPath}`.toLowerCase())

    // 2. 常见软件的文件夹名称与软件名称的映射特征库（引入多语言关键字，避免误判）
    const FEATURE_LIBRARY = [
      { folder: 'thunder network', keywords: ['thunder', '迅雷'], software: '迅雷', note: '迅雷下载器残留缓存' },
      { folder: 'tencent', keywords: ['tencent', 'wechat', 'qq', '腾讯'], software: '腾讯软件', note: '腾讯相关软件残留数据' },
      { folder: 'baidu', keywords: ['baidu', '百度'], software: '百度软件', note: '百度相关软件残留数据' },
      { folder: 'youku', keywords: ['youku', '优酷'], software: '优酷', note: '优酷视频残留缓存' },
      { folder: 'iqiyi', keywords: ['iqiyi', 'qiyi', '爱奇艺'], software: '爱奇艺', note: '爱奇艺视频残留缓存' },
      { folder: 'netease', keywords: ['netease', 'cloudmusic', '网易云'], software: '网易云音乐', note: '网易云音乐残留缓存' },
      { folder: 'sogou', keywords: ['sogou', '搜狗'], software: '搜狗输入法', note: '搜狗输入法残留配置' },
      { folder: 'kingsoft', keywords: ['kingsoft', 'wps', '金山'], software: '金山软件', note: '金山/WPS相关残留数据' },
      { folder: 'alipay', keywords: ['alipay', '支付宝'], software: '支付宝', note: '支付宝相关残留缓存' },
      { folder: 'dingtalk', keywords: ['dingtalk', '钉钉'], software: '钉钉', note: '钉钉办公软件残留缓存' },
      { folder: 'zoom', keywords: ['zoom'], software: 'Zoom', note: 'Zoom 会议软件残留缓存' },
      { folder: 'skype', keywords: ['skype'], software: 'Skype', note: 'Skype 残留数据' },
      { folder: 'kugou', keywords: ['kugou', '酷狗'], software: '酷狗音乐', note: '酷狗音乐残留缓存' },
      { folder: 'kuwo', keywords: ['kuwo', '酷我'], software: '酷我音乐', note: '酷我音乐残留缓存' },
      { folder: 'bilibili', keywords: ['bilibili', '哔哩'], software: '哔哩哔哩', note: 'B站客户端残留缓存' },
      { folder: 'bytedance', keywords: ['bytedance', 'feishu', 'douyin', '飞书', '抖音', '字节'], software: '字节跳动软件', note: '飞书/抖音等字节系软件残留数据' },
      { folder: 'epicgameslauncher', keywords: ['epic'], software: 'Epic Games', note: 'Epic 启动器残留缓存' },
      { folder: 'battle.net', keywords: ['battle.net', 'blizzard', '暴雪'], software: '战网', note: '暴雪战网残留缓存' },
      { folder: 'xshell', keywords: ['xshell', 'netsarang'], software: 'Xshell', note: 'Xshell 残留配置' },
      { folder: '360safe', keywords: ['360'], software: '360 安全卫士', note: '360 系列软件残留数据' },
    ]

    const scanDirs = [
      path.join(os.homedir(), 'AppData\\Local'),
      path.join(os.homedir(), 'AppData\\Roaming'),
      path.join(os.homedir(), 'AppData\\LocalLow'),
    ]

    const residuals = []

    for (const scanDir of scanDirs) {
      if (!(await pathExists(scanDir))) continue

      const subDirs = await fs.readdir(scanDir, { withFileTypes: true }).catch(() => [])
      for (const dir of subDirs) {
        if (!dir.isDirectory()) continue

        const dirNameLower = dir.name.toLowerCase()
        
        // 检查是否在特征库中
        const feature = FEATURE_LIBRARY.find(f => dirNameLower.includes(f.folder))
        if (feature) {
          // 检查对应的软件是否未安装（多语言关键字交叉比对，降低误判）
          const isInstalled = installedNames.some(installedName =>
            feature.keywords.some(keyword => installedName.includes(keyword.toLowerCase()))
          )
          if (!isInstalled) {
            const itemPath = path.join(scanDir, dir.name)
            const size = await getDirSize(itemPath, { deadlineMs: 500, maxEntries: 5000 })
            if (size > 0) {
              residuals.push({
                id: itemPath,
                name: `${feature.software} 卸载残留`,
                path: itemPath,
                size,
                lastAccess: new Date().toISOString().slice(0, 10),
                type: 'residual',
                aiNote: feature.note,
              })
            }
          }
        }
      }
    }

    return residuals.sort((a, b) => b.size - a.size)
  } catch (error) {
    return []
  }
}

async function revealPath(targetPath) {
  if (typeof targetPath !== 'string' || targetPath.length === 0) {
    return { ok: false, error: '路径无效' }
  }

  try {
    if (await pathExists(targetPath)) {
      shell.showItemInFolder(targetPath)
      return { ok: true }
    }

    const parent = path.dirname(targetPath)
    if (await pathExists(parent)) {
      await shell.openPath(parent)
      return { ok: true }
    }

    return { ok: false, error: '路径不存在' }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : '打开失败' }
  }
}

function isPathInside(parentPath, childPath) {
  const relative = path.relative(parentPath, childPath)
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative)
}

async function ensureMigratableDirectory(sourcePath, targetPath) {
  if (typeof sourcePath !== 'string' || typeof targetPath !== 'string') {
    throw new Error('迁移路径无效')
  }

  const source = path.resolve(sourcePath)
  const target = path.resolve(targetPath)

  if (source === target) {
    throw new Error('源路径和目标路径不能相同')
  }

  if (isPathInside(source, target) || isPathInside(target, source)) {
    throw new Error('源路径和目标路径不能互相包含')
  }

  const sourceStat = await fs.lstat(source)
  if (!sourceStat.isDirectory() || sourceStat.isSymbolicLink()) {
    throw new Error('当前版本仅支持迁移普通文件夹')
  }

  if (await pathExists(target)) {
    throw new Error(`目标路径已存在: ${target}`)
  }

  return { source, target }
}

async function moveAndSymlink(sourcePath, targetPath) {
  let source
  let target
  let backupPath
  let targetCreated = false
  let migrationCommitted = false
  let isSameDrive = false

  try {
    const paths = await ensureMigratableDirectory(sourcePath, targetPath)
    source = paths.source
    target = paths.target
    backupPath = `${source}.cleanc-backup-${Date.now()}`

    await fs.mkdir(path.dirname(target), { recursive: true })

    try {
      // 尝试直接重命名（同盘极速移动优化，几毫秒内完成）
      await fs.rename(source, target)
      isSameDrive = true
      targetCreated = true
    } catch (renameError) {
      // 如果是跨设备/跨盘移动错误 (EXDEV)
      if (renameError.code === 'EXDEV' || renameError.message.includes('EXDEV') || renameError.message.includes('cross-device')) {
        await fs.cp(source, target, { recursive: true, errorOnExist: true, force: false })
        targetCreated = true
      } else {
        throw renameError
      }
    }

    if (isSameDrive) {
      try {
        await fs.symlink(target, source, 'junction')
        migrationCommitted = true
      } catch (linkError) {
        // 同盘移动回滚：将目标路径重新命名回源路径
        await fs.rename(target, source).catch(() => {})
        throw linkError
      }
    } else {
      // 跨盘复制成功，重命名源目录为备份目录，防止直接删除导致无法回滚
      await fs.rename(source, backupPath)

      try {
        await fs.symlink(target, source, 'junction')
        await fs.rm(backupPath, { recursive: true, force: true })
        migrationCommitted = true
      } catch (linkError) {
        // 跨盘移动回滚：删除可能创建的软链接，恢复备份目录为源目录
        await fs.rm(source, { recursive: true, force: true }).catch(() => {})
        await fs.rename(backupPath, source).catch(() => {})
        throw linkError
      }
    }

    return { success: true }
  } catch (error) {
    // 顶层回滚：如果复制了目标但迁移未提交，清理目标路径
    if (targetCreated && !migrationCommitted && target) {
      await fs.rm(target, { recursive: true, force: true }).catch(() => {})
    }
    let message = error.message
    if (error.code === 'EPERM' || error.code === 'EACCES' || /EPERM|EACCES/.test(message || '')) {
      message = `权限不足（${error.code || 'EPERM'}）：该目录受系统保护，请右键以管理员身份运行 CleanC 后重试`
    } else if (error.code === 'EBUSY' || /EBUSY/.test(message || '')) {
      message = '目录正被其他程序占用（EBUSY）：请关闭相关程序后重试'
    }
    return { success: false, error: message }
  }
}

async function undoMigration(sourcePath, targetPath) {
  if (typeof sourcePath !== 'string' || typeof targetPath !== 'string') {
    return { success: false, error: '撤销路径无效' }
  }

  const source = path.resolve(sourcePath)
  const target = path.resolve(targetPath)

  const sourceStat = await fs.lstat(source).catch(() => null)
  if (!sourceStat) {
    return { success: false, error: '源路径不存在，可能已被移动' }
  }
  if (!sourceStat.isSymbolicLink()) {
    return { success: false, error: '源路径不是迁移产生的链接，无法自动撤销' }
  }
  if (!(await pathExists(target))) {
    return { success: false, error: '目标数据不存在，无法撤销' }
  }

  // 1. 移除 junction 链接（仅删除链接本身，不影响 target 真实数据）
  try {
    await fs.unlink(source)
  } catch {
    try {
      await fs.rmdir(source)
    } catch (rmError) {
      return { success: false, error: `无法移除链接: ${rmError.message}` }
    }
  }

  // 2. 把真实数据从 target 移回 source
  try {
    await fs.rename(target, source)
    return { success: true }
  } catch (renameError) {
    if (renameError.code === 'EXDEV' || (renameError.message || '').includes('EXDEV')) {
      try {
        await fs.cp(target, source, { recursive: true })
        await fs.rm(target, { recursive: true, force: true })
        return { success: true }
      } catch (cpError) {
        // 跨盘失败：重建 junction 恢复迁移状态，避免数据悬空
        await fs.symlink(target, source, 'junction').catch(() => {})
        return { success: false, error: `移回数据失败: ${cpError.message}` }
      }
    }
    // 同盘 rename 失败：重建 junction 恢复
    await fs.symlink(target, source, 'junction').catch(() => {})
    return { success: false, error: `移回数据失败: ${renameError.message}` }
  }
}


async function getRealSoftware() {
  if (process.platform !== 'win32') return []

  // 使用 PowerShell 查询注册表获取已安装软件，并强制输出编码为 UTF-8，彻底解决中文乱码问题
  const script = `
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8;
    $paths = @(
      "HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*",
      "HKLM:\\Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*",
      "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*"
    )
    Get-ItemProperty $paths -ErrorAction SilentlyContinue | 
    Where-Object { $_.DisplayName -and $_.InstallLocation } |
    Select-Object DisplayName, InstallLocation, EstimatedSize |
    ConvertTo-Json -Compress
  `

  try {
    const { stdout } = await execFileAsync('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      script,
    ], { windowsHide: true, timeout: 15000 })

    const raw = stdout.trim()
    if (!raw) return []

    const parsed = JSON.parse(raw)
    const softwareList = Array.isArray(parsed) ? parsed : [parsed]

    // 去重并格式化
    const uniqueMap = new Map()
    for (const sw of softwareList) {
      if (!sw.InstallLocation || sw.InstallLocation.trim() === '') continue
      
      const installPath = sw.InstallLocation.replace(/"/g, '').trim()
      // 只保留安装在 C 盘的软件
      if (!installPath.toUpperCase().startsWith('C:')) continue

      const name = sw.DisplayName.trim()
      if (uniqueMap.has(name)) continue

      // EstimatedSize 是 KB，转换为 Bytes；缺失时先记 0，稍后真实测量
      const size = toNumber(sw.EstimatedSize) * 1024

      uniqueMap.set(name, {
        // 用名称哈希作为稳定 id，避免 base64 截断导致的碰撞
        id: crypto.createHash('md5').update(name).digest('hex').slice(0, 12),
        name,
        installPath,
        size,
        // 简单判断兼容性：包含 Microsoft/Windows 的通常不建议迁移
        compatibility: (name.includes('Microsoft') || name.includes('Windows')) ? 'incompatible' : 'compatible',
        category: '应用',
        icon: 'package'
      })
    }

    const list = Array.from(uniqueMap.values())

    // 注册表缺失大小的条目：限量做一次真实目录测量，避免编造 500MB 假数据
    const missing = list.filter((item) => item.size === 0).slice(0, 15)
    await mapWithConcurrency(missing, 4, async (item) => {
      item.size = await getDirSize(item.installPath, { deadlineMs: 600, maxEntries: 30000 }).catch(() => 0)
      return item
    })

    return list.sort((a, b) => b.size - a.size)
  } catch (error) {
    return []
  }
}

async function getSystemFolders() {
  if (process.platform !== 'win32') return []

  const folders = [
    { id: 'downloads', name: '下载', icon: 'download', subPath: 'Downloads' },
    { id: 'desktop', name: '桌面', icon: 'monitor', subPath: 'Desktop' },
    { id: 'documents', name: '文档', icon: 'file-text', subPath: 'Documents' },
    { id: 'pictures', name: '图片', icon: 'image', subPath: 'Pictures' },
    { id: 'videos', name: '视频', icon: 'video', subPath: 'Videos' },
    // 知名「空间大户」数据目录：存在才会出现在列表中
    { id: 'wechat-files', name: '微信文件（经典版）', icon: 'message-circle', subPath: 'Documents\\WeChat Files' },
    { id: 'wechat-files-new', name: '微信文件（新版）', icon: 'message-circle', subPath: 'Documents\\xwechat_files' },
    { id: 'qq-files', name: 'QQ 文件', icon: 'message-square', subPath: 'Documents\\Tencent Files' },
    { id: 'telegram-files', name: 'Telegram 数据', icon: 'message-circle', subPath: 'AppData\\Roaming\\Telegram Desktop' },
  ]

  // 动态选择默认目标盘：非 C 盘中可用空间最大的一个；没有则返回空串由前端处理
  const disks = await getFixedDisks().catch(() => [])
  const bestTarget = disks
    .filter((d) => !d.drive.toUpperCase().startsWith('C'))
    .sort((a, b) => b.available - a.available)[0]

  // 性能优化：各文件夹并行估算（并发 4）
  const scanned = await mapWithConcurrency(folders, 4, async (folder) => {
    const folderPath = path.join(os.homedir(), folder.subPath)
    if (!(await pathExists(folderPath))) return null
    const size = await getDirSize(folderPath, { deadlineMs: 1800, maxEntries: 50000 })
    return {
      id: folder.id,
      name: folder.name,
      icon: folder.icon,
      path: folderPath,
      targetPath: bestTarget ? `${bestTarget.drive}\\${path.basename(folder.subPath)}` : '',
      size,
    }
  })

  return scanned.filter(Boolean).sort((a, b) => b.size - a.size)
}

async function checkSoftwareRunning(installPath) {
  if (process.platform !== 'win32') return { running: false, processes: [] }

  try {
    // 1. 使用 PowerShell 获取进程列表，并强制输出编码为 UTF-8，彻底解决中文乱码问题
    const script = `
      [Console]::OutputEncoding = [System.Text.Encoding]::UTF8;
      Get-Process | Where-Object { $_.Path } | Select-Object ProcessName, Path | ConvertTo-Json -Compress
    `
    const { stdout } = await execFileAsync('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      script,
    ], { windowsHide: true, timeout: 8000 })

    const raw = stdout.trim()
    if (!raw) return { running: false, processes: [] }

    const runningProcesses = JSON.parse(raw)
    const processList = Array.isArray(runningProcesses) ? runningProcesses : [runningProcesses]

    // 2. 扫描软件安装目录，找出所有的 .exe 文件
    const files = await fs.readdir(installPath).catch(() => [])
    const exeFiles = files.filter(f => f.toLowerCase().endsWith('.exe')).map(f => f.toLowerCase())

    // 3. 检查这些 .exe 是否在运行列表中（通过路径或进程名比对）
    const runningExes = []
    const installPathLower = installPath.toLowerCase()

    for (const proc of processList) {
      if (!proc.Path) continue
      const procPathLower = proc.Path.toLowerCase()
      // 检查进程路径是否在软件安装目录下，或者进程名是否匹配
      if (procPathLower.startsWith(installPathLower)) {
        const exeName = path.basename(proc.Path).toLowerCase()
        runningExes.push(exeName)
      }
    }

    // 兜底：如果有些进程没有 Path（权限限制），我们用进程名比对
    if (runningExes.length === 0) {
      for (const exe of exeFiles) {
        const nameWithoutExe = exe.replace('.exe', '')
        const isRunning = processList.some(p => p.ProcessName && p.ProcessName.toLowerCase() === nameWithoutExe)
        if (isRunning) {
          runningExes.push(exe)
        }
      }
    }

    const uniqueRunning = Array.from(new Set(runningExes))

    return {
      running: uniqueRunning.length > 0,
      processes: uniqueRunning
    }
  } catch (error) {
    return { running: false, processes: [], error: error.message }
  }
}

async function killProcesses(processNames) {
  if (process.platform !== 'win32' || !Array.isArray(processNames)) {
    return { success: true, results: [] }
  }

  const killPromises = processNames.map(async (name) => {
    try {
      await execFileAsync('taskkill', ['/F', '/IM', name], { windowsHide: true })
      return { name, success: true }
    } catch {
      return { name, success: false }
    }
  })

  const results = await Promise.all(killPromises)
  return {
    success: results.every(r => r.success),
    results
  }
}

// ---------- 操作历史与空间快照持久化 ----------
function formatBytes(bytes) {
  const value = toNumber(bytes)
  if (value <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)))
  return `${(value / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`
}

function historyFilePath() {
  return path.join(app.getPath('userData'), 'cleanc-history.json')
}

function snapshotFilePath() {
  return path.join(app.getPath('userData'), 'cleanc-space-history.json')
}

function settingsFilePath() {
  return path.join(app.getPath('userData'), 'cleanc-settings.json')
}

function occupancyHistoryFilePath() {
  return path.join(app.getPath('userData'), 'cleanc-occupancy-history.json')
}

const DEFAULT_SETTINGS = {
  recycleBin: true,          // 清理时优先移入回收站
  weeklyClean: false,        // 每 7 天自动清理安全项
  monthlyScanReminder: false, // 每月提醒深度扫描
  alertThreshold: 10,        // C 盘可用空间低于该百分比时通知
  closeToTray: true,         // 点击关闭时最小化到托盘，保证后台计划任务持续运行
  lastAutoCleanAt: 0,
  lastMonthlyReminderAt: 0,
  lastLowSpaceAlertAt: 0,
}

// 同步缓存一份设置，供窗口 close 事件等同步场景使用
let cachedSettings = { ...DEFAULT_SETTINGS }

async function getAppSettings() {
  const saved = await readJsonSafe(settingsFilePath(), {})
  cachedSettings = { ...DEFAULT_SETTINGS, ...(saved && typeof saved === 'object' ? saved : {}) }
  return cachedSettings
}

async function setAppSettings(patch) {
  const current = await getAppSettings()
  const next = { ...current, ...(patch && typeof patch === 'object' ? patch : {}) }
  await writeJsonSafe(settingsFilePath(), next)
  cachedSettings = next
  return next
}

// ---------- 开机自启（使用计划任务以兼容管理员权限应用） ----------
const AUTO_START_TASK_NAME = 'CleanC AutoStart'

async function getAutoStartEnabled() {
  try {
    await execFileAsync('schtasks', ['/Query', '/TN', AUTO_START_TASK_NAME], { windowsHide: true, timeout: 8000 })
    return { ok: true, enabled: true }
  } catch {
    return { ok: true, enabled: false }
  }
}

async function setAutoStartEnabled(enabled) {
  try {
    if (enabled) {
      // /RL HIGHEST：以最高权限随登录启动（普通 Run 注册表项无法启动需要管理员权限的程序）
      await execFileAsync('schtasks', [
        '/Create', '/TN', AUTO_START_TASK_NAME,
        '/TR', `"${process.execPath}" --hidden`,
        '/SC', 'ONLOGON', '/RL', 'HIGHEST', '/F',
      ], { windowsHide: true, timeout: 10000 })
    } else {
      await execFileAsync('schtasks', ['/Delete', '/TN', AUTO_START_TASK_NAME, '/F'], { windowsHide: true, timeout: 10000 })
    }
    return { ok: true, enabled }
  } catch (error) {
    return { ok: false, error: `设置开机自启失败（可能需要管理员权限）：${error.message}` }
  }
}

async function readJsonSafe(file, fallback) {
  try {
    const raw = await fs.readFile(file, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

async function writeJsonSafe(file, data) {
  try {
    await fs.writeFile(file, JSON.stringify(data), 'utf-8')
    return true
  } catch {
    return false
  }
}

async function getHistory() {
  const list = await readJsonSafe(historyFilePath(), [])
  return Array.isArray(list) ? list.slice(0, 100) : []
}

async function appendHistory(entry) {
  const list = await getHistory()
  const record = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    time: Date.now(),
    type: entry && entry.type ? entry.type : 'clean',
    action: entry && entry.action ? entry.action : '',
    detail: entry && entry.detail ? entry.detail : '',
    bytes: toNumber(entry && entry.bytes),
    source: entry && entry.source ? entry.source : undefined,
    target: entry && entry.target ? entry.target : undefined,
    undoable: Boolean(entry && entry.undoable),
  }
  const next = [record, ...list].slice(0, 100)
  await writeJsonSafe(historyFilePath(), next)
  return record
}

async function recordSpaceSnapshot() {
  try {
    const disks = await getFixedDisks()
    const cDrive = disks.find((d) => d.drive.toUpperCase().startsWith('C'))
    if (!cDrive) return
    const history = await readJsonSafe(snapshotFilePath(), [])
    const list = Array.isArray(history) ? history : []
    const today = new Date().toISOString().slice(0, 10)
    const filtered = list.filter((item) => item && item.date !== today)
    filtered.push({
      date: today,
      total: cDrive.total,
      used: cDrive.used,
      available: cDrive.available,
    })
    await writeJsonSafe(snapshotFilePath(), filtered.slice(-60))
  } catch {
    // 快照失败不应影响主流程
  }
}

async function getSpaceTimeline() {
  const list = await readJsonSafe(snapshotFilePath(), [])
  return Array.isArray(list) ? list : []
}

// ---------- 真实占用分析 ----------
async function getTopChildren(dir, limit) {
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }

  const sized = await mapWithConcurrency(entries.slice(0, 60), 4, async (entry) => {
    const full = path.join(dir, entry.name)
    try {
      if (typeof entry.isSymbolicLink === 'function' && entry.isSymbolicLink()) return null
      if (entry.isDirectory()) {
        const size = await getDirSize(full, { deadlineMs: 1200, maxEntries: 40000 })
        return { name: entry.name, size }
      }
      if (entry.isFile()) {
        const stat = await fs.stat(full)
        return { name: entry.name, size: stat.size }
      }
    } catch {
      return null
    }
    return null
  })

  return sized
    .filter((item) => item && item.size > 0)
    .sort((a, b) => b.size - a.size)
    .slice(0, limit)
}

async function analyzeOccupancy() {
  if (process.platform !== 'win32') return []

  const home = os.homedir()
  const candidates = [
    { name: '下载', icon: 'download', dir: path.join(home, 'Downloads') },
    { name: '文档', icon: 'file-text', dir: path.join(home, 'Documents') },
    { name: '桌面', icon: 'monitor', dir: path.join(home, 'Desktop') },
    { name: '图片', icon: 'image', dir: path.join(home, 'Pictures') },
    { name: '视频', icon: 'video', dir: path.join(home, 'Videos') },
    { name: '音乐', icon: 'music', dir: path.join(home, 'Music') },
    { name: '本地应用数据', icon: 'database', dir: path.join(home, 'AppData', 'Local') },
    { name: '漫游应用数据', icon: 'database', dir: path.join(home, 'AppData', 'Roaming') },
  ]

  const folderRecords = await mapWithConcurrency(candidates, 4, async (c) => {
    if (!(await pathExists(c.dir))) return null
    const size = await getDirSize(c.dir, { deadlineMs: 4000, maxEntries: 200000 })
    if (size <= 0) return null
    const children = await getTopChildren(c.dir, 3)
    return { name: c.name, icon: c.icon, size, category: 'folder', path: c.dir, children }
  })

  const records = folderRecords.filter(Boolean)

  const software = await getRealSoftware().catch(() => [])
  for (const sw of software.slice(0, 6)) {
    records.push({ name: sw.name, icon: 'package', size: sw.size, category: 'software', path: sw.installPath, children: [] })
  }

  const totalSize = records.reduce((sum, r) => sum + r.size, 0) || 1

  // 真实趋势：把每日各项占用大小持久化为快照，与最近一次历史快照对比得出 up/down/stable
  const today = new Date().toISOString().slice(0, 10)
  const occupancyHistory = await readJsonSafe(occupancyHistoryFilePath(), [])
  const historyList = Array.isArray(occupancyHistory) ? occupancyHistory : []
  const previousEntry = [...historyList].reverse().find((entry) => entry && entry.date && entry.date < today)

  const todayItems = {}
  for (const r of records) {
    todayItems[r.name] = r.size
  }
  const withoutToday = historyList.filter((entry) => entry && entry.date !== today)
  withoutToday.push({ date: today, items: todayItems })
  await writeJsonSafe(occupancyHistoryFilePath(), withoutToday.slice(-30))

  const getTrend = (name, size) => {
    if (!previousEntry || !previousEntry.items || previousEntry.items[name] == null) {
      return 'stable'
    }
    const prevSize = toNumber(previousEntry.items[name])
    const threshold = Math.max(50 * 1024 * 1024, prevSize * 0.03)
    if (size > prevSize + threshold) return 'up'
    if (size < prevSize - threshold) return 'down'
    return 'stable'
  }

  return records
    .sort((a, b) => b.size - a.size)
    .slice(0, 12)
    .map((r, index) => ({
      id: `occ-${index}`,
      name: r.name,
      size: r.size,
      percentage: Math.max(1, Math.round((r.size / totalSize) * 100)),
      trend: getTrend(r.name, r.size),
      category: r.category,
      icon: r.icon,
      path: r.path,
      children: (r.children || []).map((ch) => ({
        name: ch.name,
        size: ch.size,
        percentage: Math.max(1, Math.round((ch.size / Math.max(1, r.size)) * 100)),
      })),
    }))
}

// ---------- 文件类型分布 ----------
const FILE_TYPE_CATEGORIES = [
  { key: 'video', label: '视频', fill: '#3B82F6', exts: ['.mp4', '.mkv', '.avi', '.mov', '.flv', '.wmv', '.webm', '.m4v'] },
  { key: 'image', label: '图片', fill: '#10B981', exts: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.heic', '.raw'] },
  { key: 'audio', label: '音频', fill: '#F59E0B', exts: ['.mp3', '.wav', '.flac', '.aac', '.m4a', '.ogg', '.wma'] },
  { key: 'archive', label: '压缩包', fill: '#8B5CF6', exts: ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2'] },
  { key: 'doc', label: '文档', fill: '#EC4899', exts: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.md', '.csv'] },
  { key: 'installer', label: '安装包', fill: '#EF4444', exts: ['.exe', '.msi', '.apk', '.dmg'] },
  { key: 'dev', label: '程序/数据', fill: '#06B6D4', exts: ['.dll', '.iso', '.vhdx', '.db', '.sqlite', '.log', '.dat', '.bin'] },
]

async function getFileTypeStats(options = {}) {
  const startedAt = Date.now()
  const deadlineMs = Math.min(Math.max(Number(options.deadlineMs) || 8000, 2000), 20000)
  const maxEntries = Math.min(Math.max(Number(options.maxEntries) || 120000, 10000), 300000)
  const roots = await getExistingScanRoots()
  const stack = [...roots]
  let entries = 0

  const extToKey = {}
  for (const def of FILE_TYPE_CATEGORIES) {
    for (const ext of def.exts) extToKey[ext] = def.key
  }

  const totals = {}
  let otherBytes = 0

  while (stack.length > 0) {
    if (Date.now() - startedAt > deadlineMs || entries > maxEntries) break
    const current = stack.pop()
    let dir
    try {
      dir = await fs.opendir(current)
    } catch {
      continue
    }

    for await (const dirent of dir) {
      entries += 1
      const itemPath = path.join(current, dirent.name)
      try {
        if (dirent.isDirectory()) {
          stack.push(itemPath)
        } else if (dirent.isFile()) {
          const ext = path.extname(dirent.name).toLowerCase()
          const key = extToKey[ext]
          const stat = await fs.stat(itemPath)
          if (key) totals[key] = (totals[key] || 0) + stat.size
          else otherBytes += stat.size
        }
      } catch {
        // 忽略无权限/被占用文件
      }
    }
  }

  const result = FILE_TYPE_CATEGORIES
    .map((def) => ({ key: def.key, label: def.label, fill: def.fill, bytes: totals[def.key] || 0 }))
    .filter((item) => item.bytes > 0)
    .sort((a, b) => b.bytes - a.bytes)

  if (otherBytes > 0) {
    result.push({ key: 'other', label: '其他', fill: '#94A3B8', bytes: otherBytes })
  }

  return result
}

// ---------- 隐藏占用真实检测 ----------
async function statSizeOrNull(filePath) {
  try {
    const stat = await fs.stat(filePath)
    return stat.size
  } catch {
    return null
  }
}

async function dirSizeOrNull(dirPath, options) {
  if (!(await pathExists(dirPath))) return null
  try {
    const size = await getDirSize(dirPath, options)
    return size > 0 ? size : null
  } catch {
    return null
  }
}

async function getHiddenOccupancy() {
  if (process.platform !== 'win32') return []

  const home = os.homedir()
  const local = path.join(home, 'AppData', 'Local')

  const [hiberfil, pagefile, swapfile, svi, docker, searchIndex] = await Promise.all([
    statSizeOrNull('C:\\hiberfil.sys'),
    statSizeOrNull('C:\\pagefile.sys'),
    statSizeOrNull('C:\\swapfile.sys'),
    dirSizeOrNull('C:\\System Volume Information', { deadlineMs: 1500, maxEntries: 20000 }),
    dirSizeOrNull(path.join(local, 'Docker'), { deadlineMs: 1500, maxEntries: 40000 }),
    dirSizeOrNull('C:\\ProgramData\\Microsoft\\Search', { deadlineMs: 1500, maxEntries: 40000 }),
  ])

  // WSL 发行版磁盘镜像：在 Packages 下查找已知发行版目录并测量 LocalState
  let wslSize = null
  try {
    const packagesDir = path.join(local, 'Packages')
    const entries = await fs.readdir(packagesDir, { withFileTypes: true }).catch(() => [])
    const wslDirs = entries
      .filter((e) => e.isDirectory() && /CanonicalGroup|Ubuntu|Debian|kali|SUSE|Pengwin|Oracle.*Linux/i.test(e.name))
      .slice(0, 4)
    if (wslDirs.length > 0) {
      let total = 0
      for (const dir of wslDirs) {
        total += await getDirSize(path.join(packagesDir, dir.name, 'LocalState'), { deadlineMs: 800, maxEntries: 5000 })
      }
      wslSize = total > 0 ? total : null
    }
  } catch {
    wslSize = null
  }

  return [
    { name: '休眠文件 hiberfil.sys', desc: '休眠功能产生，可用 powercfg /h off 关闭', location: 'C:\\hiberfil.sys', size: hiberfil },
    { name: '虚拟内存 pagefile.sys', desc: '页面文件，可在“虚拟内存”设置中调整', location: 'C:\\pagefile.sys', size: pagefile },
    { name: '系统交换文件 swapfile.sys', desc: 'UWP 应用交换文件', location: 'C:\\swapfile.sys', size: swapfile },
    { name: '系统还原 / 卷影副本', desc: '系统还原点，可在“系统保护”中调整', location: 'System Volume Information', size: svi },
    { name: 'WSL 子系统', desc: 'Linux 子系统磁盘镜像', location: '%LOCALAPPDATA%\\Packages', size: wslSize },
    { name: 'Docker 数据', desc: '容器镜像与卷数据', location: '%LOCALAPPDATA%\\Docker', size: docker },
    { name: 'Windows Search 索引', desc: '搜索索引数据库', location: 'ProgramData\\Microsoft\\Search', size: searchIndex },
  ]
}

// ---------- 导出操作日志 / 清理应用缓存 ----------
async function exportHistory() {
  try {
    const [history, timeline] = await Promise.all([getHistory(), getSpaceTimeline()])
    const defaultName = `cleanc-history-${new Date().toISOString().slice(0, 10)}.json`
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: '导出操作日志',
      defaultPath: path.join(app.getPath('documents'), defaultName),
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (canceled || !filePath) {
      return { ok: false, canceled: true }
    }
    const payload = {
      exportedAt: new Date().toISOString(),
      app: `CleanC ${app.getVersion()}`,
      history,
      spaceTimeline: timeline,
    }
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf-8')
    return { ok: true, path: filePath }
  } catch (error) {
    return { ok: false, error: error.message }
  }
}

async function clearAppCache() {
  try {
    const ses = session.defaultSession
    const before = await ses.getCacheSize().catch(() => 0)
    await ses.clearCache()
    await ses.clearCodeCaches({}).catch(() => {})
    return { ok: true, clearedBytes: before }
  } catch (error) {
    return { ok: false, error: error.message }
  }
}

// ---------- AI 对话代理（在主进程发起请求，避免渲染层 CORS 限制） ----------
const AI_PROVIDERS = {
  openai: { url: 'https://api.openai.com/v1/chat/completions', defaultModel: 'gpt-4o-mini', needKey: true },
  deepseek: { url: 'https://api.deepseek.com/chat/completions', defaultModel: 'deepseek-chat', needKey: true },
  qwen: { url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', defaultModel: 'qwen-plus', needKey: true },
  ollama: { url: 'http://127.0.0.1:11434/v1/chat/completions', defaultModel: 'llama3.1', needKey: false },
}

async function aiChat(payload = {}) {
  const provider = String(payload.provider || 'gemini')
  const apiKey = typeof payload.apiKey === 'string' ? payload.apiKey.trim() : ''
  const messages = Array.isArray(payload.messages) ? payload.messages : []
  if (messages.length === 0) {
    return { ok: false, error: '消息为空' }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30000)

  try {
    if (provider === 'gemini') {
      if (!apiKey) return { ok: false, error: '未配置 Gemini API Key' }
      const model = payload.model || 'gemini-2.0-flash'
      const systemText = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n')
      const contents = messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: String(m.content || '') }] }))
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents,
            ...(systemText ? { systemInstruction: { parts: [{ text: systemText }] } } : {}),
          }),
          signal: controller.signal,
        }
      )
      if (!response.ok) {
        const text = await response.text().catch(() => '')
        return { ok: false, error: `Gemini ${response.status}: ${text.slice(0, 200)}` }
      }
      const data = await response.json()
      const content = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || ''
      if (!content) return { ok: false, error: 'Gemini 返回为空' }
      return { ok: true, content }
    }

    const config = AI_PROVIDERS[provider]
    if (!config) return { ok: false, error: `不支持的服务商: ${provider}` }
    if (config.needKey && !apiKey) return { ok: false, error: '未配置 API Key' }

    const response = await fetch(config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: payload.model || config.defaultModel,
        messages: messages.map((m) => ({ role: m.role, content: String(m.content || '') })),
        temperature: 0.7,
      }),
      signal: controller.signal,
    })
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      return { ok: false, error: `${provider} ${response.status}: ${text.slice(0, 200)}` }
    }
    const data = await response.json()
    const content = data?.choices?.[0]?.message?.content || ''
    if (!content) return { ok: false, error: '模型返回为空' }
    return { ok: true, content }
  } catch (error) {
    const message = error.name === 'AbortError' ? '请求超时（30s）' : error.message
    return { ok: false, error: message }
  } finally {
    clearTimeout(timer)
  }
}

// ---------- 后台调度：每周自动清理 / 每月扫描提醒 / 低空间告警 ----------
function showNotification(title, body) {
  try {
    if (Notification.isSupported()) {
      new Notification({ title, body }).show()
    }
  } catch {
    // 通知失败不影响主流程
  }
}

async function runScheduledTasks() {
  try {
    const settings = await getAppSettings()
    const now = Date.now()
    const WEEK = 7 * 24 * 60 * 60 * 1000
    const MONTH = 30 * 24 * 60 * 60 * 1000

    if (settings.weeklyClean && now - toNumber(settings.lastAutoCleanAt) > WEEK) {
      const result = await cleanSelected(['user-temp', 'browser-cache'], { useTrash: settings.recycleBin })
      if (result.released > 0) {
        await appendHistory({
          type: 'clean',
          action: '每周自动清理',
          detail: `自动释放 ${formatBytes(result.released)}（${result.mode === 'trash' ? '已移入回收站' : '已彻底删除'}）`,
          bytes: result.released,
        })
      }
      await setAppSettings({ lastAutoCleanAt: now })
      showNotification('CleanC 自动清理完成', `本次释放 ${formatBytes(result.released)}，失败 ${result.failed} 项`)
      await recordSpaceSnapshot()
    }

    if (settings.monthlyScanReminder && now - toNumber(settings.lastMonthlyReminderAt) > MONTH) {
      await setAppSettings({ lastMonthlyReminderAt: now })
      showNotification('CleanC 月度提醒', '建议进行一次深度扫描，检查大文件与重复文件')
    }
  } catch {
    // 调度任务失败静默，等待下次触发
  }
}

async function checkLowSpaceAlert() {
  try {
    const settings = await getAppSettings()
    const disks = await getFixedDisks()
    const cDrive = disks.find((d) => d.drive.toUpperCase().startsWith('C'))
    if (!cDrive || !cDrive.total) return

    const availablePct = (cDrive.available / cDrive.total) * 100
    const now = Date.now()
    const DAY_THROTTLE = 20 * 60 * 60 * 1000
    if (availablePct < toNumber(settings.alertThreshold) && now - toNumber(settings.lastLowSpaceAlertAt) > DAY_THROTTLE) {
      await setAppSettings({ lastLowSpaceAlertAt: now })
      showNotification(
        'C 盘空间不足',
        `可用空间仅剩 ${formatBytes(cDrive.available)}（${availablePct.toFixed(1)}%），建议使用 CleanC 清理`
      )
    }
  } catch {
    // 告警失败静默
  }
}

ipcMain.handle('cleanc:get-disks', async () => getFixedDisks())
ipcMain.handle('cleanc:scan-clean-items', async () => scanCleanItems())
ipcMain.handle('cleanc:clean-selected', async (_event, ids, options) => {
  const result = await cleanSelected(ids, options || {})
  if (result.released > 0) {
    await appendHistory({
      type: 'clean',
      action: '快速清理',
      detail: `释放 ${formatBytes(result.released)}（${result.mode === 'trash' ? '已移入回收站' : '已彻底删除'}）`,
      bytes: result.released,
    })
  }
  await recordSpaceSnapshot()
  return result
})
ipcMain.handle('cleanc:migrate-path', async (_event, source, target) => {
  const result = await moveAndSymlink(source, target)
  if (result.success) {
    await appendHistory({ type: 'migrate', action: '路径迁移', detail: `${path.basename(source)} → ${target}`, bytes: 0, source, target, undoable: true })
    await recordSpaceSnapshot()
  }
  return result
})
ipcMain.handle('cleanc:undo-migration', async (_event, source, target) => {
  const result = await undoMigration(source, target)
  if (result.success) {
    await appendHistory({ type: 'undo', action: '撤销迁移', detail: `${path.basename(source)} ← ${path.basename(target)}`, bytes: 0, undoable: false })
    await recordSpaceSnapshot()
  }
  return result
})
ipcMain.handle('cleanc:scan-large-files', async (_event, options) => scanLargeFiles(options))
ipcMain.handle('cleanc:reveal-path', async (_event, targetPath) => revealPath(targetPath))
ipcMain.handle('cleanc:get-software', async () => getRealSoftware())
ipcMain.handle('cleanc:get-system-folders', async () => getSystemFolders())
ipcMain.handle('cleanc:check-software-running', async (_event, installPath) => checkSoftwareRunning(installPath))
ipcMain.handle('cleanc:kill-processes', async (_event, processNames) => killProcesses(processNames))
ipcMain.handle('cleanc:analyze-occupancy', async () => analyzeOccupancy())
ipcMain.handle('cleanc:get-file-type-stats', async (_event, options) => getFileTypeStats(options))
ipcMain.handle('cleanc:get-history', async () => getHistory())
ipcMain.handle('cleanc:get-space-timeline', async () => getSpaceTimeline())
ipcMain.handle('cleanc:record-snapshot', async () => recordSpaceSnapshot())
ipcMain.handle('cleanc:scan-duplicate-files', async () => scanDuplicateFiles())
ipcMain.handle('cleanc:scan-residual-files', async () => scanResidualFiles())
ipcMain.handle('cleanc:get-settings', async () => getAppSettings())
ipcMain.handle('cleanc:set-settings', async (_event, patch) => setAppSettings(patch))
ipcMain.handle('cleanc:get-auto-start', async () => getAutoStartEnabled())
ipcMain.handle('cleanc:set-auto-start', async (_event, enabled) => setAutoStartEnabled(Boolean(enabled)))
ipcMain.handle('cleanc:delete-items', async (_event, paths, options) => {
  const result = await deleteItems(paths, options || {})
  if (result.released > 0) {
    await appendHistory({
      type: 'clean',
      action: '深度清理',
      detail: `删除 ${result.results.filter(r => r.success).length} 项，释放 ${formatBytes(result.released)}（${result.mode === 'trash' ? '已移入回收站' : '已彻底删除'}）`,
      bytes: result.released,
    })
    await recordSpaceSnapshot()
  }
  return result
})
ipcMain.handle('cleanc:select-directory', async (_event, title) => selectDirectory(title))
ipcMain.handle('cleanc:get-hidden-occupancy', async () => getHiddenOccupancy())
ipcMain.handle('cleanc:export-history', async () => exportHistory())
ipcMain.handle('cleanc:clear-app-cache', async () => clearAppCache())
ipcMain.handle('cleanc:ai-chat', async (_event, payload) => aiChat(payload))
ipcMain.handle('cleanc:set-titlebar-theme', async (_event, isDark) => {
  if (!mainWindow) return { ok: false }
  try {
    // 同步原生标题栏 overlay 配色，避免深色主题下出现白色标题栏
    mainWindow.setTitleBarOverlay({
      color: isDark ? '#0E1626' : '#FFFFFF',
      symbolColor: isDark ? '#F8FAFC' : '#212121',
      height: 32,
    })
    mainWindow.setBackgroundColor(isDark ? '#0B1220' : '#F6F8FB')
    return { ok: true }
  } catch {
    return { ok: false }
  }
})

let tray = null
let isQuitting = false

function trayIconPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'icon.png')
    : path.join(__dirname, '../public/icon.png')
}

function createTray() {
  if (tray) return
  try {
    tray = new Tray(trayIconPath())
    tray.setToolTip('CleanC - C盘清理助手')
    tray.setContextMenu(Menu.buildFromTemplate([
      {
        label: '打开 CleanC',
        click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus() } else { createWindow() } },
      },
      {
        label: '立即安全清理',
        click: async () => {
          const settings = await getAppSettings()
          const result = await cleanSelected(['user-temp', 'browser-cache'], { useTrash: settings.recycleBin })
          if (result.released > 0) {
            await appendHistory({
              type: 'clean',
              action: '托盘快速清理',
              detail: `释放 ${formatBytes(result.released)}（${result.mode === 'trash' ? '已移入回收站' : '已彻底删除'}）`,
              bytes: result.released,
            })
            await recordSpaceSnapshot()
          }
          showNotification('CleanC 清理完成', `本次释放 ${formatBytes(result.released)}，失败 ${result.failed} 项`)
        },
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => { isQuitting = true; app.quit() },
      },
    ]))
    tray.on('double-click', () => {
      if (mainWindow) { mainWindow.show(); mainWindow.focus() } else { createWindow() }
    })
  } catch {
    // 托盘创建失败（如图标缺失）不影响主功能
    tray = null
  }
}

function createWindow() {
  // 开机自启时携带 --hidden 参数：静默启动到托盘，不打扰用户
  const startHidden = process.argv.includes('--hidden')

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    title: 'CleanC - C盘清理助手',
    icon: path.join(__dirname, '../public/icon.png'),
    show: !startHidden,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#FAFAFA',
      symbolColor: '#212121',
      height: 32
    },
    backgroundColor: '#FAFAFA',
    autoHideMenuBar: true,
  })

  // 关闭按钮 → 最小化到托盘（可在设置中关闭该行为）
  mainWindow.on('close', (event) => {
    if (!isQuitting && cachedSettings.closeToTray && tray) {
      event.preventDefault()
      mainWindow.hide()
    }
  })

  // 标题栏 overlay 配色由渲染进程通过 cleanc:set-titlebar-theme 驱动，
  // 与应用内主题（浅色/深色/跟随系统）保持一致，避免双重来源冲突

  // 开发环境加载 dev server，生产环境加载打包文件
  const isDev = !app.isPackaged

  if (isDev) {
    // 尝试连接 Vite dev server
    mainWindow.loadURL('http://localhost:5173').catch(() => {
      mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
    })
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(async () => {
  await getAppSettings() // 预热设置缓存，供窗口 close 事件同步读取
  createWindow()
  createTray()
  recordSpaceSnapshot().then(() => checkLowSpaceAlert())

  // 后台调度：启动 3 分钟后执行一次，此后每小时检查一次（托盘常驻期间持续生效）
  setTimeout(() => runScheduledTasks(), 3 * 60 * 1000)
  setInterval(() => {
    runScheduledTasks()
    checkLowSpaceAlert()
  }, 60 * 60 * 1000)
})

app.on('before-quit', () => {
  isQuitting = true
})

app.on('window-all-closed', () => {
  // 托盘常驻模式下窗口关闭不退出应用，保证计划任务持续运行
  if (process.platform !== 'darwin' && !(cachedSettings.closeToTray && tray)) {
    app.quit()
  }
})

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow()
  }
})
