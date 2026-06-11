import { useEffect, useState } from 'react'
import { Grid, Paper, Typography, Box, Chip, Skeleton, alpha } from '@mui/material'
import PeopleAltRoundedIcon from '@mui/icons-material/PeopleAltRounded'
import StarRoundedIcon from '@mui/icons-material/StarRounded'
import LocalFireDepartmentRoundedIcon from '@mui/icons-material/LocalFireDepartmentRounded'
import MenuBookRoundedIcon from '@mui/icons-material/MenuBookRounded'
import SwipeRoundedIcon from '@mui/icons-material/SwipeRounded'
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded'
import PaidRoundedIcon from '@mui/icons-material/PaidRounded'
import WhatshotRoundedIcon from '@mui/icons-material/WhatshotRounded'
import { PageHeader } from '../../components/PageHeader'
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
  { label: 'Total Users', value: s.totalUsers.toLocaleString(), icon: <PeopleAltRoundedIcon />, color: '#6366f1' },
  { label: 'Premium Users', value: s.premiumUsers.toLocaleString(), icon: <StarRoundedIcon />, color: '#f59e0b' },
  { label: 'Active Today', value: s.activeToday.toLocaleString(), icon: <LocalFireDepartmentRoundedIcon />, color: '#10b981' },
  { label: 'Total Words', value: s.totalWords.toLocaleString(), icon: <MenuBookRoundedIcon />, color: '#3b82f6' },
  { label: 'Total Swipes', value: s.totalSwipes.toLocaleString(), icon: <SwipeRoundedIcon />, color: '#8b5cf6' },
  { label: 'New This Month', value: s.newUsersThisMonth.toLocaleString(), icon: <TrendingUpRoundedIcon />, color: '#ec4899' },
  { label: 'Conversion Rate', value: `${s.conversionRate}%`, icon: <PaidRoundedIcon />, color: '#f59e0b' },
]

export function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => { analyticsApi.get().then(setStats).catch(console.error) }, [])

  return (
    <Box>
      <PageHeader title="Dashboard" subtitle="Overview of your app's key metrics" />

      <Grid container spacing={2} sx={{ mb: 4 }}>
        {stats
          ? STAT_CARDS(stats).map((card) => (
              <Grid item xs={12} sm={6} md={3} key={card.label}>
                <Paper
                  sx={{
                    p: 2.5,
                    height: '100%',
                    transition: 'transform 0.2s ease, border-color 0.2s ease',
                    '&:hover': {
                      transform: 'translateY(-3px)',
                      borderColor: alpha(card.color, 0.4),
                    },
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                    <Box
                      sx={{
                        width: 44, height: 44, borderRadius: 2.5, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        bgcolor: alpha(card.color, 0.14),
                        color: card.color,
                        '& .MuiSvgIcon-root': { fontSize: 24 },
                      }}
                    >
                      {card.icon}
                    </Box>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="h5" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
                        {card.value}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" noWrap>
                        {card.label}
                      </Typography>
                    </Box>
                  </Box>
                </Paper>
              </Grid>
            ))
          : Array.from({ length: 7 }).map((_, i) => (
              <Grid item xs={12} sm={6} md={3} key={i}>
                <Paper sx={{ p: 2.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                    <Skeleton variant="rounded" width={44} height={44} />
                    <Box sx={{ flexGrow: 1 }}>
                      <Skeleton variant="text" width="50%" height={32} />
                      <Skeleton variant="text" width="70%" />
                    </Box>
                  </Box>
                </Paper>
              </Grid>
            ))}
      </Grid>

      {stats?.topHardWords && stats.topHardWords.length > 0 && (
        <Paper sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <WhatshotRoundedIcon sx={{ color: 'error.main', fontSize: 20 }} />
            <Typography variant="h6">Top Hardest Words</Typography>
          </Box>
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
