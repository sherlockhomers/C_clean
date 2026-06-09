import { useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAIStore } from '../stores/useAIStore'
import { useDiskStore } from '../stores/useDiskStore'
import ChatBubble from '../components/ai/ChatBubble'
import QuickCommandPanel from '../components/ai/QuickCommandPanel'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Send, Bot, Trash2 } from 'lucide-react'

export default function AIAssistant() {
  const { messages, input, isTyping, setInput, sendMessage, clearMessages } = useAIStore()
  const refreshSystemData = useDiskStore((s) => s.refreshSystemData)
  const refreshOccupancy = useDiskStore((s) => s.refreshOccupancy)
  const navigate = useNavigate()
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    refreshSystemData()
    refreshOccupancy()
  }, [refreshSystemData, refreshOccupancy])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  const handleSend = () => {
    if (input.trim()) {
      sendMessage(input.trim())
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex gap-6 h-[calc(100vh-7rem)] max-w-6xl mx-auto">
      {/* Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 px-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(139, 92, 246, 0.1)', color: 'var(--color-ai-start)' }}>
              <Bot size={22} />
            </div>
            <div>
              <h1 className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>AI 智能助手</h1>
              <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>你的C盘管家，有问必答</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearMessages}
            className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"
          >
            <Trash2 size={16} /> 清空对话
          </Button>
        </div>

        {/* Messages */}
        <Card className="flex-1 p-6 overflow-y-auto flex flex-col gap-2">
          {messages.map((msg) => (
            <ChatBubble key={msg.id} message={msg} onAction={(cmd) => {
              if (cmd.startsWith('goto:')) {
                navigate(cmd.slice(5))
              } else {
                sendMessage(cmd)
              }
            }} />
          ))}
          {isTyping && (
            <div className="flex gap-3 mb-6">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(139, 92, 246, 0.1)', color: 'var(--color-ai-start)' }}>
                <Bot size={18} />
              </div>
              <div
                className="rounded-2xl rounded-tl-sm px-5 py-4 shadow-sm"
                style={{ backgroundColor: 'var(--color-card)', border: '1px solid var(--color-border)' }}
              >
                <div className="flex gap-1.5 items-center h-2">
                  <span className="typing-dot w-1.5 h-1.5 rounded-full bg-purple-400" />
                  <span className="typing-dot w-1.5 h-1.5 rounded-full bg-purple-400" />
                  <span className="typing-dot w-1.5 h-1.5 rounded-full bg-purple-400" />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </Card>

        {/* Input */}
        <div className="mt-4 flex gap-3">
          <Card className="flex-1 flex items-center px-4 py-1">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入你的问题或指令..."
              className="flex-1 py-3 text-[15px] bg-transparent outline-none"
              style={{ color: 'var(--color-text)' }}
            />
          </Card>
          <Button
            variant="ai"
            size="lg"
            onClick={handleSend}
            disabled={!input.trim() || isTyping}
            className="!px-6"
          >
            <Send size={18} /> 发送
          </Button>
        </div>
      </div>

      {/* Quick Commands Panel */}
      <div className="w-72 flex-shrink-0">
        <div className="card-base p-4 h-full overflow-y-auto">
          <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--color-text)' }}>快捷指令</h3>
          <QuickCommandPanel onCommand={(cmd) => sendMessage(cmd)} />
        </div>
      </div>
    </div>
  )
}
