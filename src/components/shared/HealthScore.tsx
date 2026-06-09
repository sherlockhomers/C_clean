interface HealthScoreProps {
  score: number
  size?: number
}

export default function HealthScore({ score, size = 160 }: HealthScoreProps) {
  const radius = (size - 20) / 2
  const circumference = 2 * Math.PI * radius
  const progress = (score / 100) * circumference

  const getColor = (s: number) => {
    if (s >= 90) return 'var(--color-risk-safe)'
    if (s >= 70) return '#84CC16' // Tailwind Lime 500
    if (s >= 50) return 'var(--color-risk-warning)'
    if (s >= 30) return 'var(--color-risk-danger)'
    return '#B91C1C' // Tailwind Red 700
  }

  const getLabel = (s: number) => {
    if (s >= 90) return '优秀'
    if (s >= 70) return '良好'
    if (s >= 50) return '一般'
    if (s >= 30) return '较差'
    return '危急'
  }

  const color = getColor(score)

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth="10"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          style={{ transition: 'stroke-dashoffset 700ms ease-out' }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-3xl font-bold" style={{ color }}>{score}</span>
        <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>{getLabel(score)}</span>
      </div>
    </div>
  )
}
