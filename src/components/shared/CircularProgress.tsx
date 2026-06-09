interface CircularProgressProps {
  percentage: number
  size?: number
  label?: string
  sublabel?: string
}

export default function CircularProgress({ percentage, size = 140, label, sublabel }: CircularProgressProps) {
  const radius = (size - 16) / 2
  const circumference = 2 * Math.PI * radius
  const progress = (percentage / 100) * circumference

  const getColor = (p: number) => {
    if (p < 50) return 'var(--color-risk-safe)'
    if (p < 70) return 'var(--color-risk-warning)'
    if (p < 85) return 'var(--color-primary)'
    return 'var(--color-risk-danger)'
  }

  const color = getColor(percentage)

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth="12"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          style={{ transition: 'stroke-dashoffset 700ms ease-out' }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-2xl font-bold" style={{ color }}>{percentage}%</span>
        {label && <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{label}</span>}
        {sublabel && <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{sublabel}</span>}
      </div>
    </div>
  )
}
