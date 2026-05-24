import { useEffect, useState } from 'react'
import { Grid, Paper, Typography, Box, Chip, Skeleton } from '@mui/material'
import { analyticsApi } from '../../api/analytics.api'

interface Stats {
  totalUsers: number
  premiumUsers: number
  activeToday: number
  totalWords: number
  totalSwipes: number
  newUsersThisMonth: number
  conversionRate: string
  topHardWords: { word: string; count: number }[]
}

const STAT_CARDS = (s: Stats) => [
  { label: 'Total Users', value: s.totalUsers.toLocaleString(), icon: '👥', color: '#6366f1' },
  { label: 'Premium Users', value: s.premiumUsers.toLocaleString(), icon: '⭐', color: '#f59e0b' },
  { label: 'Active Today', value: s.activeToday.toLocaleString(), icon: '🔥', color: '#10b981' },
  { label: 'Total Words', value: s.totalWords.toLocaleString(), icon: '📚', color: '#3b82f6' },
  { label: 'Total Swipes', value: s.totalSwipes.toLocaleString(), icon: '👆', color: '#8b5cf6' },
  { label: 'New This Month', value: s.newUsersThisMonth.toLocaleString(), icon: '📈', color: '#ec4899' },
  { label: 'Conversion Rate', value: `${s.conversionRate}%`, icon: '💰', color: '#f59e0b' },
]

export function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => { analyticsApi.get().then(setStats).catch(console.error) }, [])

  return (
    <Box>
      <Typography variant="h4" gutterBottom>Dashboard</Typography>

      <Grid container spacing={2} sx={{ mb: 4 }}>
        {stats
          ? STAT_CARDS(stats).map((card) => (
              <Grid item xs={12} sm={6} md={3} key={card.label}>
                <Paper sx={{ p: 3 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Box>
                      <Typography variant="body2" color="text.secondary" gutterBottom>{card.label}</Typography>
                      <Typography variant="h4" sx={{ fontWeight: 800, color: card.color }}>{card.value}</Typography>
                    </Box>
                    <Typography sx={{ fontSize: 32 }}>{card.icon}</Typography>
                  </Box>
                </Paper>
              </Grid>
            ))
          : Array.from({ length: 7 }).map((_, i) => (
              <Grid item xs={12} sm={6} md={3} key={i}>
                <Paper sx={{ p: 3 }}>
                  <Skeleton variant="text" width="60%" />
                  <Skeleton variant="text" width="40%" height={48} />
                </Paper>
              </Grid>
            ))}
      </Grid>

      {stats?.topHardWords && stats.topHardWords.length > 0 && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>Top Hardest Words</Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {stats.topHardWords.map((w, i) => (
              <Chip
                key={w.word}
                label={`${i + 1}. ${w.word} (${w.count})`}
                color={i < 3 ? 'error' : 'default'}
                variant={i < 3 ? 'filled' : 'outlined'}
              />
            ))}
          </Box>
        </Paper>
      )}
    </Box>
  )
}
