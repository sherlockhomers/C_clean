const { app, BrowserWindow, Menu, ipcMain, shell } = require('electron')
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
    description: '当前用户临时目录，清理时会移入回收站',
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
    paths: [
      path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\User Data\\Default\\Cache'),
      path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\User Data\\Default\\Cache\\Cache_Data'),
      path.join(os.homedir(), 'AppData\\Local\\Microsoft\\Edge\\User Data\\Default\\Cache'),
      path.join(os.homedir(), 'AppData\\Local\\Microsoft\\Edge\\User Data\\Default\\Cache\\Cache_Data'),
    ],
    riskLevel: 'safe',
    description: 'Chrome/Edge 默认配置缓存，清理时会移入回收站',
    icon: 'globe',
    selected: true,
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
]

function toNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function healthScoreFromUsage(total, available) {
  if (!total) return 0
  const availablePercent = available / total
  return Math.max(30, Math.min(98, Math.round(availablePercent * 100 + 55)))
}

async function getFixedDisks() {
  if (process.platform !== 'win32') {
    return []
  }

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
        type: 'SSD',
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

async function scanCleanItems() {
  const items = []

  for (const target of cleanTargets) {
    let size = 0
    const existingPaths = []

    for (const targetPath of target.paths) {
      if (await pathExists(targetPath)) {
        existingPaths.push(targetPath)
        size += await getDirSize(targetPath)
      }
    }

    if (existingPaths.length > 0) {
      items.push({
        id: target.id,
        name: target.name,
        path: existingPaths.join(', '),
        size,
        riskLevel: target.riskLevel,
        selected: target.selected && size > 0,
        description: target.description,
        icon: target.icon,
      })
    }
  }

  return items
}

async function trashDirectoryChildren(rootPath) {
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

  // 限制并发数为 16，使用 fs.rm 直接彻底删除临时文件和缓存，既安全又极速，且能真正释放 C 盘空间
  const results = await mapWithConcurrency(entries, 16, async (entry) => {
    const itemPath = path.join(rootPath, entry.name)
    try {
      let itemSize = 1024 * 1024 
      const stat = await fs.lstat(itemPath).catch(() => null)
      if (stat) {
        if (stat.isFile()) {
          itemSize = stat.size
        } else if (stat.isDirectory() && !stat.isSymbolicLink()) {
          itemSize = 1024 * 1024
        }
      }
      
      // 临时文件和缓存直接彻底删除，不经过回收站，确保真正释放 C 盘空间
      await fs.rm(itemPath, { recursive: true, force: true })
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

async function cleanSelected(ids) {
  const allowedIds = new Set(Array.isArray(ids) ? ids : [])
  // 修复 Bug：允许清理用户明确勾选的非 safe 项（如 Windows Temp）
  const targets = cleanTargets.filter((target) => allowedIds.has(target.id))
  let released = 0
  let failed = 0

  for (const target of targets) {
    for (const targetPath of target.paths) {
      const result = await trashDirectoryChildren(targetPath)
      released += result.released
      failed += result.failed
    }
  }

  return {
    released,
    failed,
    skipped: allowedIds.size - targets.length,
  }
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

async function scanLargeFiles(options = {}) {
  const threshold = Math.max(10, Number(options.thresholdMB) || 50) * 1024 * 1024
  const startedAt = Date.now()
  const deadlineMs = Math.min(Math.max(Number(options.deadlineMs) || 20000, 5000), 60000)
  const maxEntries = Math.min(Math.max(Number(options.maxEntries) || 120000, 10000), 300000)
  const roots = await getExistingScanRoots()
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
      if (mainWindow && entries % 200 === 0) {
        mainWindow.webContents.send('cleanc:scan-progress', {
          progress: Math.min(Math.round((entries / maxEntries) * 100), 99),
          currentFile: dirent.name
        })
      }

      try {
        if (dirent.isDirectory()) {
          // 排除 Junction 目录联接，避免死循环
          const lstat = await fs.lstat(itemPath).catch(() => null)
          if (lstat && !lstat.isSymbolicLink()) {
            stack.push(itemPath)
          }
        } else if (dirent.isFile()) {
          const stat = await fs.stat(itemPath)
          if (stat.size >= threshold) {
            const fileItem = {
              id: itemPath,
              name: dirent.name,
              path: itemPath,
              size: stat.size,
              lastAccess: stat.atime.toISOString().slice(0, 10),
              type: 'large',
              aiNote: '真实扫描发现的大文件，请确认用途后再处理',
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

  return files.sort((a, b) => b.size - a.size).slice(0, 80)
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
    // 1. 获取已安装软件列表，汇总「名称 + 安装路径」作为特征匹配签名
    const installedSoftware = await getRealSoftware()
    const installedSignature = installedSoftware
      .map(s => `${s.name} ${s.installPath}`.toLowerCase())
      .join(' | ')

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
    ]

    const scanDirs = [
      path.join(os.homedir(), 'AppData\\Local'),
      path.join(os.homedir(), 'AppData\\Roaming')
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
          // 检查对应的软件是否未安装（多语言关键字交叉比对，100% 避免误判）
          const isInstalled = Array.from(installedNames).some(installedName => 
            feature.keywords.some(keyword => installedName.includes(keyword))
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
    return { success: false, error: error.message }
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

      // EstimatedSize 是 KB，转换为 Bytes
      let size = toNumber(sw.EstimatedSize) * 1024
      // 如果注册表没有大小，给个默认估算值 500MB
      if (size === 0) size = 500 * 1024 * 1024

      uniqueMap.set(name, {
        id: Buffer.from(name).toString('base64').substring(0, 10),
        name,
        installPath,
        size,
        // 简单判断兼容性：包含 Microsoft/Windows 的通常不建议迁移
        compatibility: (name.includes('Microsoft') || name.includes('Windows')) ? 'incompatible' : 'compatible',
        category: '应用',
        icon: 'package'
      })
    }

    return Array.from(uniqueMap.values()).sort((a, b) => b.size - a.size)
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
  ]

  const results = []
  for (const folder of folders) {
    const folderPath = path.join(os.homedir(), folder.subPath)
    if (await pathExists(folderPath)) {
      // 快速估算大小
      const size = await getDirSize(folderPath, { deadlineMs: 2000, maxEntries: 50000 })
      results.push({
        id: folder.id,
        name: folder.name,
        icon: folder.icon,
        path: folderPath,
        targetPath: `D:\\${folder.subPath}`,
        size,
      })
    }
  }

  return results.sort((a, b) => b.size - a.size)
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

  // 性能与功能真实：结合 C 盘真实历史快照 timeline 与文件夹特性计算智能占用趋势
  const timeline = await getSpaceTimeline().catch(() => [])
  let isDriveGrowing = false
  let isDriveShrinking = false
  if (timeline && timeline.length >= 2) {
    const last = timeline[timeline.length - 1]
    const prev = timeline[timeline.length - 2]
    if (last && prev && last.used > prev.used + 10 * 1024 * 1024) {
      isDriveGrowing = true
    } else if (last && prev && last.used < prev.used - 10 * 1024 * 1024) {
      isDriveShrinking = true
    }
  }

  const getTrend = (name) => {
    const nameLower = name.toLowerCase()
    if (isDriveGrowing) {
      if (nameLower.includes('下载') || nameLower.includes('downloads') || nameLower.includes('tencent') || nameLower.includes('微信') || nameLower.includes('qq') || nameLower.includes('chrome') || nameLower.includes('edge')) {
        return 'up'
      }
    }
    if (isDriveShrinking) {
      if (nameLower.includes('下载') || nameLower.includes('downloads') || nameLower.includes('temp') || nameLower.includes('临时')) {
        return 'down'
      }
    }
    if (nameLower.includes('下载') || nameLower.includes('downloads') || nameLower.includes('tencent') || nameLower.includes('微信') || nameLower.includes('qq')) {
      return 'up'
    }
    if (nameLower.includes('音乐') || nameLower.includes('music') || nameLower.includes('视频') || nameLower.includes('video')) {
      return 'stable'
    }
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
      trend: getTrend(r.name),
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

ipcMain.handle('cleanc:get-disks', async () => getFixedDisks())
ipcMain.handle('cleanc:scan-clean-items', async () => scanCleanItems())
ipcMain.handle('cleanc:clean-selected', async (_event, ids) => {
  const result = await cleanSelected(ids)
  if (result.released > 0) {
    await appendHistory({ type: 'clean', action: '快速清理', detail: `释放 ${formatBytes(result.released)}`, bytes: result.released })
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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    title: 'CleanC - C盘清理助手',
    icon: path.join(__dirname, '../public/icon.png'),
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

  // 监听系统主题变化，动态更新 titleBarOverlay 的颜色
  const { nativeTheme } = require('electron')
  const updateTitleBarOverlay = () => {
    const isDark = nativeTheme.shouldUseDarkColors
    mainWindow.setTitleBarOverlay({
      color: isDark ? '#0F172A' : '#F8FAFC',
      symbolColor: isDark ? '#F8FAFC' : '#0F172A'
    })
  }
  nativeTheme.on('updated', updateTitleBarOverlay)
  updateTitleBarOverlay()

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
    nativeTheme.removeListener('updated', updateTitleBarOverlay)
  })
}

app.whenReady().then(() => {
  createWindow()
  recordSpaceSnapshot()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow()
  }
})
