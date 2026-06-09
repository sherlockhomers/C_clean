import { ChatMessage } from '../../stores/useAIStore'
import { Bot, User } from 'lucide-react'

interface ChatBubbleProps {
  message: ChatMessage
  onAction?: (command: string) => void
}

function InlineText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)

  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={index}>{part.slice(2, -2)}</strong>
        }

        return <span key={index}>{part}</span>
      })}
    </>
  )
}

function MessageText({ content }: { content: string }) {
  return (
    <div className="space-y-1.5 whitespace-pre-wrap">
      {content.split('\n').map((line, index) => {
        const trimmed = line.trim()
        const isBullet = trimmed.startsWith('- ')
        const isNumbered = /^\d+\.\s/.test(trimmed)
        const text = isBullet ? trimmed.slice(2) : isNumbered ? trimmed.replace(/^\d+\.\s/, '') : line

        return (
          <div key={index} className={isBullet || isNumbered ? 'pl-3' : ''}>
            {isBullet && <span className="mr-1">-</span>}
            {isNumbered && <span className="mr-1">{trimmed.match(/^\d+/)?.[0]}.</span>}
            <InlineText text={text} />
          </div>
        )
      })}
    </div>
  )
}

export default function ChatBubble({ message, onAction }: ChatBubbleProps) {
  const isAI = message.role === 'assistant'

  return (
    <div className={`flex gap-3 ${isAI ? 'flex-row' : 'flex-row-reverse'} mb-6`}>
      <div
        className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{
          backgroundColor: isAI ? 'rgba(139, 92, 246, 0.1)' : 'rgba(249, 115, 22, 0.1)',
          color: isAI ? 'var(--color-ai-start)' : 'var(--color-primary)',
        }}
      >
        {isAI ? <Bot size={18} /> : <User size={18} />}
      </div>
      <div
        className={`max-w-[75%] rounded-2xl px-5 py-3.5 shadow-sm ${isAI ? 'rounded-tl-sm bg-[var(--color-card)] border border-[var(--color-border)]' : 'rounded-tr-sm bg-[var(--color-primary)] text-white'}`}
      >
        <div className="text-[15px] leading-relaxed" style={{ color: isAI ? 'var(--color-text)' : 'white' }}>
          <MessageText content={message.content} />
        </div>
        {message.actions && message.actions.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-black/5 dark:border-white/5">
            {message.actions.map((action, i) => (
              <button
                key={i}
                onClick={() => onAction?.(action.command)}
                className={`text-sm px-4 py-2 rounded-xl transition-all active:scale-95 ${
                  i === 0 
                    ? 'bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-500/20 dark:text-purple-300 dark:hover:bg-purple-500/30' 
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
