import { useEffect, useState } from 'react'
import { Box, Typography, Paper, Grid, alpha } from '@mui/material'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts'
import MenuBookRoundedIcon from '@mui/icons-material/MenuBookRounded'
import SwipeRoundedIcon from '@mui/icons-material/SwipeRounded'
import { PageHeader } from '../../components/PageHeader'
import { analyticsApi } from '../../api/analytics.api'

const TOOLTIP_STYLE = {
  background: '#FFFFFF',
  border: '1px solid rgba(28,42,36,0.10)',
  borderRadius: 10,
  color: '#1C2A24',
  fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
  fontSize: 13,
}

export function AnalyticsPage() {
  const [stats, setStats] = useState<any>(null)

  useEffect(() => { analyticsApi.get().then(setStats).catch(console.error) }, [])

  const conversionData = stats
    ? [
        { name: 'Free', value: stats.totalUsers - stats.premiumUsers, fill: '#9CA3AF' },
        { name: 'Premium', value: stats.premiumUsers, fill: '#2D9B6F' },
      ]
    : []

  const activityData = stats
    ? [
        { name: 'Total Users', value: stats.totalUsers },
        { name: 'New This Month', value: stats.newUsersThisMonth },
        { name: 'Active Today', value: stats.activeToday },
        { name: 'Premium', value: stats.premiumUsers },
      ]
    : []

  return (
    <Box>
      <PageHeader title="Analytics" subtitle="User growth, conversion and content metrics" />

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>User Overview</Typography>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={activityData}>
                <defs />
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(28,42,36,0.08)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: '#6b7280', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(45,155,111,0.08)' }} />
                <Bar dataKey="value" fill="#2D9B6F" radius={[6, 6, 0, 0]} maxBarSize={56} />
              </BarChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>Free vs Premium</Typography>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={conversionData}>
                <defs />
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(28,42,36,0.08)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: '#6b7280', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(45,155,111,0.08)' }} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={56}>
                  {conversionData.map((_, i) => (
                    <Cell key={i} fill={i === 0 ? '#9CA3AF' : '#2D9B6F'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            {stats && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2, textAlign: 'center' }}>
                Conversion rate: <strong style={{ color: '#2D9B6F' }}>{stats.conversionRate}%</strong>
              </Typography>
            )}
          </Paper>
        </Grid>

        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>Content Stats</Typography>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              {stats && [
                { label: 'Total Words', value: stats.totalWords, color: '#2D9B6F', icon: <MenuBookRoundedIcon /> },
                { label: 'Total Swipes', value: stats.totalSwipes, color: '#F0A04B', icon: <SwipeRoundedIcon /> },
              ].map((item) => (
                <Paper
                  key={item.label}
                  variant="outlined"
                  sx={{ p: 2.5, display: 'flex', alignItems: 'center', gap: 2, minWidth: 240, bgcolor: '#F7FAF8' }}
                >
                  <Box
                    sx={{
                      width: 44, height: 44, borderRadius: 2.5,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      bgcolor: alpha(item.color, 0.14), color: item.color,
                    }}
                  >
                    {item.icon}
                  </Box>
                  <Box>
                    <Typography variant="h5" sx={{ fontWeight: 800 }}>
                      {item.value?.toLocaleString()}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">{item.label}</Typography>
                  </Box>
                </Paper>
              ))}
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  )
}
