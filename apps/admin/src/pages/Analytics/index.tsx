import { useEffect, useState } from 'react'
import { Box, Typography, Paper, Grid, alpha } from '@mui/material'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts'
import MenuBookRoundedIcon from '@mui/icons-material/MenuBookRounded'
import SwipeRoundedIcon from '@mui/icons-material/SwipeRounded'
import { PageHeader } from '../../components/PageHeader'
import { analyticsApi } from '../../api/analytics.api'

const TOOLTIP_STYLE = {
  background: '#1e1e30',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 10,
  fontFamily: '"Inter", system-ui, sans-serif',
  fontSize: 13,
}

export function AnalyticsPage() {
  const [stats, setStats] = useState<any>(null)

  useEffect(() => { analyticsApi.get().then(setStats).catch(console.error) }, [])

  const conversionData = stats
    ? [
        { name: 'Free', value: stats.totalUsers - stats.premiumUsers, fill: 'url(#grayGradient)' },
        { name: 'Premium', value: stats.premiumUsers, fill: 'url(#indigoGradient)' },
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
                <defs>
                  <linearGradient id="indigoGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8b5cf6" />
                    <stop offset="100%" stopColor="#6366f1" />
                  </linearGradient>
                  <linearGradient id="grayGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#9ca3af" />
                    <stop offset="100%" stopColor="#6b7280" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#9ca3af', fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(99,102,241,0.08)' }} />
                <Bar dataKey="value" fill="url(#indigoGradient)" radius={[6, 6, 0, 0]} maxBarSize={56} />
              </BarChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>Free vs Premium</Typography>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={conversionData}>
                <defs>
                  <linearGradient id="indigoGradient2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8b5cf6" />
                    <stop offset="100%" stopColor="#6366f1" />
                  </linearGradient>
                  <linearGradient id="grayGradient2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#9ca3af" />
                    <stop offset="100%" stopColor="#6b7280" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#9ca3af', fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(99,102,241,0.08)' }} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={56}>
                  {conversionData.map((_, i) => (
                    <Cell key={i} fill={i === 0 ? 'url(#grayGradient2)' : 'url(#indigoGradient2)'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            {stats && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2, textAlign: 'center' }}>
                Conversion rate: <strong style={{ color: '#10b981' }}>{stats.conversionRate}%</strong>
              </Typography>
            )}
          </Paper>
        </Grid>

        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>Content Stats</Typography>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              {stats && [
                { label: 'Total Words', value: stats.totalWords, color: '#3b82f6', icon: <MenuBookRoundedIcon /> },
                { label: 'Total Swipes', value: stats.totalSwipes, color: '#8b5cf6', icon: <SwipeRoundedIcon /> },
              ].map((item) => (
                <Paper
                  key={item.label}
                  variant="outlined"
                  sx={{ p: 2.5, display: 'flex', alignItems: 'center', gap: 2, minWidth: 240, bgcolor: 'rgba(255,255,255,0.02)' }}
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
