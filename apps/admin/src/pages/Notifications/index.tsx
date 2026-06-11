import { useState } from 'react'
import {
  Box, Typography, Paper, TextField, Button, ToggleButtonGroup,
  ToggleButton, Alert, CircularProgress,
} from '@mui/material'
import SendRoundedIcon from '@mui/icons-material/SendRounded'
import PeopleAltRoundedIcon from '@mui/icons-material/PeopleAltRounded'
import WorkspacePremiumRoundedIcon from '@mui/icons-material/WorkspacePremiumRounded'
import LockOpenRoundedIcon from '@mui/icons-material/LockOpenRounded'
import { PageHeader } from '../../components/PageHeader'
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
      setStatus({ type: 'success', msg: `Queued for ${result.queued} users` })
      setMessage('')
    } catch {
      setStatus({ type: 'error', msg: 'Failed to send notification' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box>
      <PageHeader title="Notifications" subtitle="Send broadcast messages to your users via the Telegram bot" />

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
              <ToggleButton value="all" sx={{ gap: 0.75, px: 1.5 }}>
                <PeopleAltRoundedIcon sx={{ fontSize: 16 }} /> All users
              </ToggleButton>
              <ToggleButton value="premium" sx={{ gap: 0.75, px: 1.5 }}>
                <WorkspacePremiumRoundedIcon sx={{ fontSize: 16 }} /> Premium only
              </ToggleButton>
              <ToggleButton value="free" sx={{ gap: 0.75, px: 1.5 }}>
                <LockOpenRoundedIcon sx={{ fontSize: 16 }} /> Free only
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>

          <TextField
            label="Message"
            multiline
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Don't forget to practice today!"
            inputProps={{ maxLength: 500 }}
            helperText={`${message.length}/500`}
          />

          <Button
            variant="contained"
            size="large"
            onClick={send}
            disabled={loading || !message.trim()}
            startIcon={loading ? <CircularProgress size={18} color="inherit" /> : <SendRoundedIcon />}
          >
            Send via Telegram Bot
          </Button>
        </Box>
      </Paper>
    </Box>
  )
}
