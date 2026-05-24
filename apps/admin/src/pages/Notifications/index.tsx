import { useState } from 'react'
import {
  Box, Typography, Paper, TextField, Button, ToggleButtonGroup,
  ToggleButton, Alert, CircularProgress,
} from '@mui/material'
import { settingsApi } from '../../api/settings.api'

export function NotificationsPage() {
  const [message, setMessage] = useState('')
  const [target, setTarget] = useState<'all' | 'premium' | 'free'>('all')
  const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [loading, setLoading] = useState(false)

  const send = async () => {
    if (!message.trim()) return
    setLoading(true)
    setStatus(null)
    try {
      const result = await settingsApi.sendNotification(message, target)
      setStatus({ type: 'success', msg: `✅ Queued for ${result.queued} users` })
      setMessage('')
    } catch {
      setStatus({ type: 'error', msg: 'Failed to send notification' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>Notifications</Typography>

      <Paper sx={{ p: 4, maxWidth: 600 }}>
        <Typography variant="h6" gutterBottom>Send Message</Typography>

        {status && <Alert severity={status.type} sx={{ mb: 3 }}>{status.msg}</Alert>}

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Box>
            <Typography variant="body2" color="text.secondary" gutterBottom>Target audience</Typography>
            <ToggleButtonGroup
              value={target}
              exclusive
              onChange={(_, v) => v && setTarget(v)}
              size="small"
            >
              <ToggleButton value="all">👥 All users</ToggleButton>
              <ToggleButton value="premium">⭐ Premium only</ToggleButton>
              <ToggleButton value="free">🆓 Free only</ToggleButton>
            </ToggleButtonGroup>
          </Box>

          <TextField
            label="Message"
            multiline
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="📚 Don't forget to practice today!"
            inputProps={{ maxLength: 500 }}
            helperText={`${message.length}/500`}
          />

          <Button
            variant="contained"
            size="large"
            onClick={send}
            disabled={loading || !message.trim()}
            startIcon={loading ? <CircularProgress size={18} /> : undefined}
          >
            Send via Telegram Bot
          </Button>
        </Box>
      </Paper>
    </Box>
  )
}
