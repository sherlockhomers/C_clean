import { quickCommands } from '../../data/mockData'

interface QuickCommandPanelProps {
  onCommand: (command: string) => void
}

export default function QuickCommandPanel({ onCommand }: QuickCommandPanelProps) {
  return (
    <div className="space-y-3">
      {quickCommands.map((group) => (
        <div key={group.category}>
          <div className="text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
            {group.category}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {group.items.map((item) => (
              <button
                key={item}
                onClick={() => onCommand(item)}
                className="px-2.5 py-1 rounded-full text-xs transition-all border"
                style={{
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text-secondary)',
                  backgroundColor: 'transparent',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-primary)'
                  e.currentTarget.style.color = 'var(--color-primary)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-border)'
                  e.currentTarget.style.color = 'var(--color-text-secondary)'
                }}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
