import { useNavigate, useLocation } from 'react-router-dom'
import { Bot } from 'lucide-react'

export default function AIFloatingButton() {
  const navigate = useNavigate()
  const location = useLocation()

  // 如果已经在 AI 助手页面，则隐藏悬浮按钮
  if (location.pathname === '/ai-assistant') return null

  return (
    <button
      onClick={() => navigate('/ai-assistant')}
      className="fixed bottom-12 right-8 w-14 h-14 rounded-2xl bg-white dark:bg-slate-800 text-[var(--color-ai-start)] flex items-center justify-center shadow-[0_8px_30px_rgb(0,0,0,0.12)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.3)] z-50 border border-slate-100 dark:border-slate-700 group transition-transform hover:scale-105 active:scale-95"
      title="AI 助手"
      aria-label="打开 AI 助手"
    >
      <div className="absolute inset-0 rounded-2xl bg-[var(--color-ai-start)] opacity-0 group-hover:opacity-10 transition-opacity" />
      <Bot size={26} strokeWidth={2.5} />
      <span className="absolute top-3 right-3 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white dark:border-slate-800" />
    </button>
  )
}
