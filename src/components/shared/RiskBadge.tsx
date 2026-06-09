import { RiskLevel, riskLevelConfig } from '../../utils/riskLevel'

interface RiskBadgeProps {
  level: RiskLevel
}

export default function RiskBadge({ level }: RiskBadgeProps) {
  const config = riskLevelConfig[level]
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
      style={{
        color: config.color,
        backgroundColor: config.bgColor,
      }}
    >
      {config.label}
    </span>
  )
}
