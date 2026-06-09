interface LeaderboardMedalProps {
  rank: number
}

export default function LeaderboardMedal({ rank }: LeaderboardMedalProps) {
  if (rank === 1) return <span className="text-2xl">🥇</span>
  if (rank === 2) return <span className="text-2xl">🥈</span>
  if (rank === 3) return <span className="text-2xl">🥉</span>
  return (
    <span
      className="inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold"
      style={{ backgroundColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
    >
      {rank}
    </span>
  )
}
