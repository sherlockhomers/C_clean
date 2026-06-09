export type RiskLevel = 'safe' | 'warning' | 'danger'

export const riskLevelConfig: Record<RiskLevel, { label: string; color: string; bgColor: string }> = {
  safe: { label: '安全', color: '#4CAF50', bgColor: 'rgba(76, 175, 80, 0.1)' },
  warning: { label: '需确认', color: '#FF9800', bgColor: 'rgba(255, 152, 0, 0.1)' },
  danger: { label: '危险', color: '#F44336', bgColor: 'rgba(244, 67, 54, 0.1)' },
}
