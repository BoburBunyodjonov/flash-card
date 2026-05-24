import { useEffect, useState } from 'react'
import { Box, Typography, Paper, Grid } from '@mui/material'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line } from 'recharts'
import { analyticsApi } from '../../api/analytics.api'

export function AnalyticsPage() {
  const [stats, setStats] = useState<any>(null)

  useEffect(() => { analyticsApi.get().then(setStats).catch(console.error) }, [])

  const conversionData = stats
    ? [
        { name: 'Free', value: stats.totalUsers - stats.premiumUsers, fill: '#6b7280' },
        { name: 'Premium', value: stats.premiumUsers, fill: '#6366f1' },
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
      <Typography variant="h4" gutterBottom>Analytics</Typography>

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>User Overview</Typography>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={activityData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 12 }} />
                <YAxis tick={{ fill: '#9ca3af', fontSize: 12 }} />
                <Tooltip contentStyle={{ background: '#1e1e30', border: 'none', borderRadius: 8 }} />
                <Bar dataKey="value" fill="#6366f1" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>Free vs Premium</Typography>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={conversionData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 12 }} />
                <YAxis tick={{ fill: '#9ca3af', fontSize: 12 }} />
                <Tooltip contentStyle={{ background: '#1e1e30', border: 'none', borderRadius: 8 }} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {conversionData.map((entry, i) => (
                    <rect key={i} fill={entry.fill} />
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
            <Box sx={{ display: 'flex', gap: 4 }}>
              {stats && [
                { label: 'Total Words', value: stats.totalWords, color: '#3b82f6' },
                { label: 'Total Swipes', value: stats.totalSwipes, color: '#8b5cf6' },
              ].map((item) => (
                <Box key={item.label}>
                  <Typography variant="h3" sx={{ fontWeight: 800, color: item.color }}>
                    {item.value?.toLocaleString()}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">{item.label}</Typography>
                </Box>
              ))}
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  )
}
