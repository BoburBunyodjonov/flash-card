import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box, Paper, Typography, TextField, Button,
  Alert, CircularProgress, InputAdornment, IconButton,
} from '@mui/material'
import { useAuthStore } from '../../store/auth.store'

export function LoginPage() {
  const navigate = useNavigate()
  const { loginWithPassword, user, token, logout } = useAuthStore()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const storedToken = token ?? localStorage.getItem('admin_token')
    if (user?.isAdmin && storedToken) {
      navigate('/', { replace: true })
      return
    }
    if (user?.isAdmin && !storedToken) {
      logout()
    }
  }, [user, token, navigate, logout])

  if (user?.isAdmin && (token ?? localStorage.getItem('admin_token'))) {
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username || !password) return
    setLoading(true)
    setError('')
    try {
      await loginWithPassword(username, password)
      navigate('/')
    } catch {
      setError('Invalid username or password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box sx={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      bgcolor: 'background.default',
      backgroundImage: 'radial-gradient(ellipse at 50% 0%, rgba(99,102,241,0.12) 0%, transparent 60%)',
    }}>
      <Paper
        component="form"
        onSubmit={handleSubmit}
        sx={{ p: 5, width: 380, display: 'flex', flexDirection: 'column', gap: 3 }}
      >
        {/* Logo */}
        <Box sx={{ textAlign: 'center', mb: 1 }}>
          <Box sx={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 64,
            height: 64,
            borderRadius: 3,
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            fontSize: 32,
            mb: 2,
            boxShadow: '0 0 40px rgba(99,102,241,0.35)',
          }}>
            ⚡
          </Box>
          <Typography variant="h5" fontWeight={800}>WordSwipe</Typography>
          <Typography variant="body2" color="text.secondary" mt={0.5}>
            Admin Panel
          </Typography>
        </Box>

        {error && <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>}

        <TextField
          label="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoFocus
          fullWidth
          disabled={loading}
        />

        <TextField
          label="Password"
          type={showPwd ? 'text' : 'password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          fullWidth
          disabled={loading}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => setShowPwd((v) => !v)} edge="end">
                  {showPwd ? '🙈' : '👁'}
                </IconButton>
              </InputAdornment>
            ),
          }}
        />

        <Button
          type="submit"
          variant="contained"
          size="large"
          disabled={loading || !username || !password}
          sx={{
            py: 1.5,
            fontWeight: 700,
            fontSize: '1rem',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            '&:hover': { background: 'linear-gradient(135deg, #4f46e5, #7c3aed)' },
          }}
        >
          {loading ? <CircularProgress size={22} color="inherit" /> : 'Sign In'}
        </Button>
      </Paper>
    </Box>
  )
}
