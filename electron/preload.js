const { contextBridge, ipcRenderer } = require('electron')

const channels = {
  getDisks: 'cleanc:get-disks',
  scanCleanItems: 'cleanc:scan-clean-items',
  cleanSelected: 'cleanc:clean-selected',
  scanLargeFiles: 'cleanc:scan-large-files',
  revealPath: 'cleanc:reveal-path',
  migratePath: 'cleanc:migrate-path',
  getSoftware: 'cleanc:get-software',
  getSystemFolders: 'cleanc:get-system-folders',
  checkSoftwareRunning: 'cleanc:check-software-running',
  killProcesses: 'cleanc:kill-processes',
  analyzeOccupancy: 'cleanc:analyze-occupancy',
  getFileTypeStats: 'cleanc:get-file-type-stats',
  getHistory: 'cleanc:get-history',
  getSpaceTimeline: 'cleanc:get-space-timeline',
  recordSnapshot: 'cleanc:record-snapshot',
  undoMigration: 'cleanc:undo-migration',
  scanDuplicateFiles: 'cleanc:scan-duplicate-files',
  scanResidualFiles: 'cleanc:scan-residual-files',
  getSettings: 'cleanc:get-settings',
  setSettings: 'cleanc:set-settings',
  deleteItems: 'cleanc:delete-items',
  selectDirectory: 'cleanc:select-directory',
  getAutoStart: 'cleanc:get-auto-start',
  setAutoStart: 'cleanc:set-auto-start',
  getHiddenOccupancy: 'cleanc:get-hidden-occupancy',
  exportHistory: 'cleanc:export-history',
  clearAppCache: 'cleanc:clear-app-cache',
  aiChat: 'cleanc:ai-chat',
  setTitleBarTheme: 'cleanc:set-titlebar-theme',
}

contextBridge.exposeInMainWorld('cleanC', {
  getDisks: () => ipcRenderer.invoke(channels.getDisks),
  scanCleanItems: () => ipcRenderer.invoke(channels.scanCleanItems),
  cleanSelected: (ids, options) => ipcRenderer.invoke(channels.cleanSelected, ids, options),
  scanLargeFiles: (options) => ipcRenderer.invoke(channels.scanLargeFiles, options),
  revealPath: (targetPath) => ipcRenderer.invoke(channels.revealPath, targetPath),
  migratePath: (source, target) => ipcRenderer.invoke(channels.migratePath, source, target),
  getSoftware: () => ipcRenderer.invoke(channels.getSoftware),
  getSystemFolders: () => ipcRenderer.invoke(channels.getSystemFolders),
  checkSoftwareRunning: (installPath) => ipcRenderer.invoke(channels.checkSoftwareRunning, installPath),
  killProcesses: (processNames) => ipcRenderer.invoke(channels.killProcesses, processNames),
  analyzeOccupancy: () => ipcRenderer.invoke(channels.analyzeOccupancy),
  getFileTypeStats: (options) => ipcRenderer.invoke(channels.getFileTypeStats, options),
  getHistory: () => ipcRenderer.invoke(channels.getHistory),
  getSpaceTimeline: () => ipcRenderer.invoke(channels.getSpaceTimeline),
  recordSnapshot: () => ipcRenderer.invoke(channels.recordSnapshot),
  undoMigration: (source, target) => ipcRenderer.invoke(channels.undoMigration, source, target),
  scanDuplicateFiles: () => ipcRenderer.invoke(channels.scanDuplicateFiles),
  scanResidualFiles: () => ipcRenderer.invoke(channels.scanResidualFiles),
  getSettings: () => ipcRenderer.invoke(channels.getSettings),
  setSettings: (patch) => ipcRenderer.invoke(channels.setSettings, patch),
  deleteItems: (paths, options) => ipcRenderer.invoke(channels.deleteItems, paths, options),
  selectDirectory: (title) => ipcRenderer.invoke(channels.selectDirectory, title),
  getAutoStart: () => ipcRenderer.invoke(channels.getAutoStart),
  setAutoStart: (enabled) => ipcRenderer.invoke(channels.setAutoStart, enabled),
  getHiddenOccupancy: () => ipcRenderer.invoke(channels.getHiddenOccupancy),
  exportHistory: () => ipcRenderer.invoke(channels.exportHistory),
  clearAppCache: () => ipcRenderer.invoke(channels.clearAppCache),
  aiChat: (payload) => ipcRenderer.invoke(channels.aiChat, payload),
  setTitleBarTheme: (isDark) => ipcRenderer.invoke(channels.setTitleBarTheme, isDark),
  onScanProgress: (callback) => {
    const subscription = (_event, value) => callback(value)
    ipcRenderer.on('cleanc:scan-progress', subscription)
    return () => ipcRenderer.removeListener('cleanc:scan-progress', subscription)
  },
  onLargeFileFound: (callback) => {
    const subscription = (_event, value) => callback(value)
    ipcRenderer.on('cleanc:large-file-found', subscription)
    return () => ipcRenderer.removeListener('cleanc:large-file-found', subscription)
  },
})
