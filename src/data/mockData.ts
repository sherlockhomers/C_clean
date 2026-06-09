export const appPathMigrations = [
  { id: 'wechat', name: '微信', currentPath: 'C:\\Users\\xxx\\Documents\\WeChat Files', targetPath: 'D:\\WeChatFiles', size: 12.3 * 1024 * 1024 * 1024, icon: 'message-circle', aiSuggestion: '建议只迁移文件而不迁移聊天记录本身', migrated: false },
  { id: 'qq', name: 'QQ', currentPath: 'C:\\Users\\xxx\\Documents\\Tencent Files', targetPath: 'D:\\QQFiles', size: 6.7 * 1024 * 1024 * 1024, icon: 'message-square', aiSuggestion: '检测到已开启云备份，本地文件可更激进地清理', migrated: false },
  { id: 'chrome', name: 'Chrome', currentPath: 'C:\\Users\\xxx\\AppData\\Local\\Google\\Chrome', targetPath: 'D:\\AppData\\Chrome', size: 2.1 * 1024 * 1024 * 1024, icon: 'globe', aiSuggestion: '建议只迁移Cache而保留UserData（含书签密码等）', migrated: false },
  { id: 'vscode', name: 'VS Code', currentPath: 'C:\\Users\\xxx\\.vscode\\extensions', targetPath: 'D:\\VSCode\\extensions', size: 4.7 * 1024 * 1024 * 1024, icon: 'code', aiSuggestion: '建议停用不常用的扩展后再迁移', migrated: false },
  { id: 'npm', name: 'npm', currentPath: 'C:\\Users\\xxx\\AppData\\Roaming\\npm', targetPath: 'D:\\npm', size: 1.8 * 1024 * 1024 * 1024, icon: 'package', aiSuggestion: '建议先清理无用全局包再迁移', migrated: false },
  { id: 'docker', name: 'Docker', currentPath: 'C:\\Users\\xxx\\AppData\\Local\\Docker', targetPath: 'D:\\Docker', size: 10 * 1024 * 1024 * 1024, icon: 'container', aiSuggestion: '建议清理 <none> 镜像再迁移', migrated: false },
]

export const quickCommands = [
  { category: '扫描类', items: ['帮我全面扫描C盘', '谁在偷偷占用我的C盘', '扫描一下大文件', '有没有重复文件'] },
  { category: '清理类', items: ['一键安全清理', '清理浏览器缓存', '清空回收站', '清理Windows临时文件'] },
  { category: '迁移类', items: ['帮我评估软件迁移', '查看微信文件迁移建议', '评估下载文件夹迁移', '生成全部迁移预案'] },
  { category: '分析类', items: ['为什么我的C盘这么满', '这个文件夹是什么', '给我一份空间分析报告'] },
]
