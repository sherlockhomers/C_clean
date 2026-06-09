interface CompatibilityBadgeProps {
  compatibility: 'compatible' | 'incompatible'
}

export default function CompatibilityBadge({ compatibility }: CompatibilityBadgeProps) {
  const isCompatible = compatibility === 'compatible'
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
      style={{
        color: isCompatible ? '#4CAF50' : '#9E9E9E',
        backgroundColor: isCompatible ? 'rgba(76, 175, 80, 0.1)' : 'rgba(158, 158, 158, 0.1)',
      }}
    >
      {isCompatible ? '可迁移' : '不可迁移'}
    </span>
  )
}
