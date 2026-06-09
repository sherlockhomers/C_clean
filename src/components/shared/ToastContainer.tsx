import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from 'lucide-react'
import { useToastStore, type ToastType } from '../../stores/useToastStore'

const toastConfig: Record<ToastType, { icon: React.ElementType; color: string }> = {
  success: { icon: CheckCircle2, color: 'var(--color-risk-safe)' },
  error: { icon: XCircle, color: 'var(--color-risk-danger)' },
  warning: { icon: AlertTriangle, color: 'var(--color-risk-warning)' },
  info: { icon: Info, color: 'var(--color-primary)' },
}

export default function ToastContainer() {
  const { toasts, dismiss } = useToastStore()

  return (
    <div className="fixed top-12 right-6 z-[100] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map((t) => {
          const conf = toastConfig[t.type]
          const Icon = conf.icon
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, x: 48, scale: 0.92 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 48, scale: 0.92 }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              className="pointer-events-auto card-base px-4 py-3 flex items-center gap-3 min-w-[260px] max-w-[380px] shadow-lg"
              style={{ borderLeft: `3px solid ${conf.color}` }}
            >
              <Icon size={18} style={{ color: conf.color }} className="flex-shrink-0" />
              <span className="text-sm flex-1 leading-snug" style={{ color: 'var(--color-text)' }}>{t.message}</span>
              <button
                onClick={() => dismiss(t.id)}
                className="opacity-50 hover:opacity-100 transition-opacity flex-shrink-0"
                aria-label="关闭通知"
              >
                <X size={14} style={{ color: 'var(--color-text-secondary)' }} />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
