import { create } from 'zustand'
import { useDiskStore } from './useDiskStore'
import { formatSize } from '../utils/formatSize'

export interface AIAction {
  label: string
  command: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  actions?: AIAction[]
}

interface AIState {
  messages: ChatMessage[]
  input: string
  isTyping: boolean
  setInput: (input: string) => void
  sendMessage: (content: string) => void
  clearMessages: () => void
}

interface AIReply {
  content: string
  actions?: AIAction[]
}

const test = (text: string, words: string[]) => words.some((w) => text.includes(w))

// 基于真实磁盘数据动态生成回复，而非硬编码话术
function buildReply(content: string): AIReply {
  const disk = useDiskStore.getState()
  const cDrive = disk.disks[0]
  const usedPct = cDrive?.total ? Math.round((cDrive.used / cDrive.total) * 100) : 0
  const available = cDrive?.available || 0
  const cleanableSize = disk.suggestions.filter((s) => s.type === 'clean').reduce((a, s) => a + s.size, 0)
  const migratableSize = disk.suggestions.filter((s) => s.type === 'migrate').reduce((a, s) => a + s.size, 0)
  const topOccupancy = [...disk.occupancyRecords].sort((a, b) => b.size - a.size).slice(0, 3)
  const isReal = disk.dataSource === 'system'
  const dataNote = isReal ? '' : '\n\n_（当前为演示数据，桌面版可读取你的真实 C 盘数据）_'

  // 清理意图
  if (test(content, ['清理', '垃圾', '缓存', '临时', '清除', '清空', '瘦身'])) {
    const items = disk.cleanItems.filter((i) => i.size > 0).sort((a, b) => b.size - a.size).slice(0, 6)
    const lines = items.length
      ? items.map((i) => `- ${i.name} — **${formatSize(i.size)}**`).join('\n')
      : '- 暂未扫描到可清理项，建议先在快速清理页重新扫描'
    return {
      content: `我梳理了当前可清理的项目：\n\n${lines}\n\n预计可释放约 **${formatSize(cleanableSize)}**。清理会优先移入回收站，执行前会再次让你确认。${dataNote}`,
      actions: [
        { label: '前往快速清理', command: 'goto:/quick-clean' },
        { label: '看看占用排名', command: 'goto:/detective' },
      ],
    }
  }

  // 迁移意图
  if (test(content, ['迁移', '搬', '移动', '转移', '挪', '换盘'])) {
    const folders = disk.systemFolders.slice(0, 5)
    const lines = folders.length
      ? folders.map((f) => `- ${f.name} — **${formatSize(f.size)}** → ${f.targetPath}`).join('\n')
      : '- 暂未扫描到可迁移的系统文件夹'
    const total = migratableSize || folders.reduce((a, f) => a + f.size, 0)
    return {
      content: `迁移采用软链接（junction），程序仍按原路径访问，但文件实际移到其他盘，能真正释放 C 盘：\n\n${lines}\n\n预计可迁移约 **${formatSize(total)}**。${dataNote}`,
      actions: [
        { label: '系统文件夹迁移', command: 'goto:/path-migrate' },
        { label: '软件迁移', command: 'goto:/software-migrate' },
      ],
    }
  }

  // 历史意图
  if (test(content, ['历史', '记录', '做过', '操作过', '上次'])) {
    const h = disk.history.slice(0, 5)
    const lines = h.length
      ? h.map((x) => `- ${x.action}：${x.detail}`).join('\n')
      : '- 暂无操作记录，执行清理或迁移后会自动记录在这里'
    return {
      content: `这是你最近的操作记录：\n\n${lines}`,
      actions: [{ label: '查看空间监控', command: 'goto:/monitor' }],
    }
  }

  // 占用 / 扫描 / 分析意图
  if (test(content, ['占用', '谁', '满', '分析', '扫描', '大文件', '空间', '检查', '为什么', '体检'])) {
    const lines = topOccupancy.length
      ? topOccupancy.map((o, i) => `${i + 1}. **${o.name}** — ${formatSize(o.size)}（${o.percentage}%）`).join('\n')
      : '暂无占用数据，建议先重新扫描'
    return {
      content: `我分析了你的 C 盘：\n\n当前使用率 **${usedPct}%**，可用空间 **${formatSize(available)}**。\n\n占用最多的是：\n${lines}\n\n可清理约 **${formatSize(cleanableSize)}**，可迁移约 **${formatSize(migratableSize)}**。${dataNote}`,
      actions: [
        { label: '去清理', command: 'goto:/quick-clean' },
        { label: '占用侦探', command: 'goto:/detective' },
        { label: '去迁移', command: 'goto:/path-migrate' },
      ],
    }
  }

  // 默认 / 帮助
  return {
    content: `我是 CleanC 助手，会基于你的真实磁盘数据来分析。当前 C 盘使用率 **${usedPct}%**，可用 **${formatSize(available)}**。\n\n你可以问我：\n- 谁在占用我的 C 盘？\n- 帮我看看能清理多少\n- 有什么可以迁移的\n- 我最近做过哪些操作${dataNote}`,
    actions: [
      { label: '分析 C 盘占用', command: 'goto:/detective' },
      { label: '帮我清理', command: 'goto:/quick-clean' },
    ],
  }
}

const welcomeMessage: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content: '你好！我是 CleanC AI 助手 🤖\n\n我会基于你的**真实 C 盘数据**来分析并给出可执行建议。要不要先看看「谁在占用你的 C 盘」？',
  timestamp: Date.now(),
  actions: [
    { label: '分析 C 盘占用', command: 'goto:/detective' },
    { label: '帮我清理', command: 'goto:/quick-clean' },
  ],
}

export const useAIStore = create<AIState>((set) => ({
  messages: [welcomeMessage],
  input: '',
  isTyping: false,
  setInput: (input) => set({ input }),
  sendMessage: (content) => {
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
      timestamp: Date.now(),
    }
    set((s) => ({ messages: [...s.messages, userMsg], input: '', isTyping: true }))

    // 后台刷新真实数据，下一次回复会更准确
    void useDiskStore.getState().refreshSystemData()

    const delay = 400 + Math.random() * 500
    setTimeout(() => {
      const reply = buildReply(content)
      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content: reply.content,
        timestamp: Date.now(),
        actions: reply.actions,
      }
      set((s) => ({ messages: [...s.messages, aiMsg], isTyping: false }))
    }, delay)
  },
  clearMessages: () => set({ messages: [welcomeMessage] }),
}))
