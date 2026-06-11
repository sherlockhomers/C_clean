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

// ---------- LLM 配置与上下文 ----------
export interface AIConfig {
  provider: string
  apiKey: string
  model: string
  offline: boolean
}

export function getAIConfig(): AIConfig {
  return {
    provider: localStorage.getItem('cleanc_ai_provider') || 'gemini',
    apiKey: localStorage.getItem('cleanc_ai_key') || '',
    model: localStorage.getItem('cleanc_ai_model') || '',
    offline: localStorage.getItem('cleanc_offline_mode') === 'true',
  }
}

// LLM 是否可用：配置了 Key，或选择了无需 Key 的本地 Ollama，且未开启离线模式
function llmAvailable(config: AIConfig): boolean {
  if (config.offline || !window.cleanC?.aiChat) return false
  return Boolean(config.apiKey) || config.provider === 'ollama'
}

// 把真实磁盘状态压缩成系统提示词，让大模型基于真实数据回答
function buildSystemPrompt(): string {
  const disk = useDiskStore.getState()
  const cDrive = disk.disks[0]
  const usedPct = cDrive?.total ? Math.round((cDrive.used / cDrive.total) * 100) : 0
  const cleanLines = disk.cleanItems
    .filter((i) => i.size > 0)
    .map((i) => `${i.name}=${formatSize(i.size)}`)
    .join(', ')
  const occLines = [...disk.occupancyRecords]
    .sort((a, b) => b.size - a.size)
    .slice(0, 8)
    .map((o) => `${o.name}=${formatSize(o.size)}`)
    .join(', ')
  const folderLines = disk.systemFolders
    .map((f) => `${f.name}=${formatSize(f.size)}→${f.targetPath || '无目标盘'}`)
    .join(', ')
  const historyLines = disk.history.slice(0, 5).map((h) => `${h.action}:${h.detail}`).join('; ')

  return [
    '你是 CleanC（Windows C 盘清理助手）的内置 AI 助手。请基于下面的真实磁盘数据，用简体中文简洁回答用户问题，可使用 Markdown。',
    '涉及删除/迁移操作时务必提醒用户在对应功能页确认后执行，不要编造数据。',
    `C盘状态: 总${formatSize(cDrive?.total || 0)}, 已用${formatSize(cDrive?.used || 0)}(${usedPct}%), 可用${formatSize(cDrive?.available || 0)}`,
    `可清理项: ${cleanLines || '暂无扫描数据'}`,
    `占用排名: ${occLines || '暂无扫描数据'}`,
    `可迁移系统文件夹: ${folderLines || '暂无扫描数据'}`,
    `最近操作: ${historyLines || '无'}`,
    '应用内功能页: 快速清理(/quick-clean)、深度扫描(/deep-scan)、占用侦探(/detective)、软件迁移(/software-migrate)、路径迁移(/path-migrate)、空间监控(/monitor)。',
  ].join('\n')
}

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
  content: '你好！我是 CleanC AI 助手 🤖\n\n我会基于你的**真实 C 盘数据**来分析并给出可执行建议。要不要先看看「谁在占用你的 C 盘」？\n\n_提示：在「设置 → AI 配置」中接入 Gemini / OpenAI / DeepSeek / 通义 / Ollama 后，我会变得更聪明；未配置时使用本地规则引擎。_',
  timestamp: Date.now(),
  actions: [
    { label: '分析 C 盘占用', command: 'goto:/detective' },
    { label: '帮我清理', command: 'goto:/quick-clean' },
  ],
}

export const useAIStore = create<AIState>((set, get) => ({
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

    // 后台刷新真实数据，回复时尽量基于最新状态
    void useDiskStore.getState().refreshSystemData()

    const pushAssistant = (reply: AIReply) => {
      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content: reply.content,
        timestamp: Date.now(),
        actions: reply.actions,
      }
      set((s) => ({ messages: [...s.messages, aiMsg], isTyping: false }))
    }

    const config = getAIConfig()

    if (llmAvailable(config)) {
      // 真实大模型对话：携带系统提示词（真实磁盘数据）+ 最近 8 条对话
      const historyMessages = get().messages
        .filter((m) => m.id !== 'welcome')
        .slice(-8)
        .map((m) => ({ role: m.role, content: m.content }))

      window.cleanC!.aiChat({
        provider: config.provider,
        apiKey: config.apiKey || undefined,
        model: config.model || undefined,
        messages: [
          { role: 'system', content: buildSystemPrompt() },
          ...historyMessages,
          { role: 'user', content },
        ],
      })
        .then((result) => {
          if (result.ok && result.content) {
            pushAssistant({ content: result.content })
          } else {
            const fallback = buildReply(content)
            pushAssistant({
              ...fallback,
              content: `${fallback.content}\n\n_（大模型调用失败，已切换本地规则引擎：${result.error || '未知错误'}）_`,
            })
          }
        })
        .catch((error: any) => {
          const fallback = buildReply(content)
          pushAssistant({
            ...fallback,
            content: `${fallback.content}\n\n_（大模型调用异常，已切换本地规则引擎：${error?.message || '未知错误'}）_`,
          })
        })
      return
    }

    // 未配置大模型 / 离线模式：使用本地规则引擎（真实磁盘数据）
    const delay = 400 + Math.random() * 500
    setTimeout(() => {
      pushAssistant(buildReply(content))
    }, delay)
  },
  clearMessages: () => set({ messages: [welcomeMessage] }),
}))
