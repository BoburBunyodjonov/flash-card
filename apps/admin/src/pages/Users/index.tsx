import { useEffect, useState, useCallback } from 'react'
import {
  Box, Typography, Paper, Chip, IconButton, Dialog, DialogTitle,
  DialogContent, DialogActions, Button, TextField, Switch, FormControlLabel,
  Avatar, Tooltip, CircularProgress,
} from '@mui/material'
import { DataGrid, type GridColDef } from '@mui/x-data-grid'
import { usersApi } from '../../api/users.api'

interface User {
  id: string; firstName: string; lastName: string | null; username: string | null
  telegramId: string; isPremium: boolean; premiumUntil: string | null
  streak: number; xp: number; isAdmin: boolean; createdAt: string; lastActive: string | null
  _count: { wordProgress: number }
}

export function UsersPage() {
  const [rows, setRows] = useState<User[]>([])
  const [total, setTotal] = useState(0)
  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 20 })
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<User | null>(null)
  const [premiumUntil, setPremiumUntil] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await usersApi.list({ q: search, page: paginationModel.page + 1, limit: paginationModel.pageSize })
      setRows(data.users); setTotal(data.total)
    } finally { setLoading(false) }
  }, [search, paginationModel])

  useEffect(() => { load() }, [load])

  const openUser = (user: User) => {
    setSelected(user)
    setPremiumUntil(user.premiumUntil ? user.premiumUntil.split('T')[0] : '')
  }

  const savePremium = async (isPremium: boolean) => {
    if (!selected) return
    setSaving(true)
    try {
      await usersApi.update(selected.id, {
        isPremium,
        premiumUntil: isPremium && premiumUntil ? new Date(premiumUntil).toISOString() : undefined,
      })
      setSelected(null); load()
    } finally { setSaving(false) }
  }

  const columns: GridColDef[] = [
    {
      field: 'name', headerName: 'User', flex: 1, minWidth: 160,
      renderCell: ({ row }) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Avatar sx={{ width: 28, height: 28, fontSize: 12, bgcolor: 'primary.main' }}>
            {row.firstName?.[0]}
          </Avatar>
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.2 }}>{row.firstName} {row.lastName ?? ''}</Typography>
            {row.username && <Typography variant="caption" color="text.secondary">@{row.username}</Typography>}
          </Box>
        </Box>
      ),
    },
    {
      field: 'isPremium', headerName: 'Plan', width: 110,
      renderCell: ({ value, row }) => (
        <Chip
          label={value ? 'Premium' : 'Free'}
          size="small"
          color={value ? 'warning' : 'default'}
          variant={value ? 'filled' : 'outlined'}
        />
      ),
    },
    { field: 'streak', headerName: '🔥 Streak', width: 90, type: 'number' },
    { field: 'xp', headerName: '⚡ XP', width: 90, type: 'number' },
    { field: '_count', headerName: 'Words', width: 80, valueGetter: (_, row) => row._count?.wordProgress ?? 0 },
    {
      field: 'lastActive', headerName: 'Last Active', width: 120,
      valueGetter: (_, row) => row.lastActive ? new Date(row.lastActive).toLocaleDateString() : '—',
    },
    {
      field: 'createdAt', headerName: 'Joined', width: 110,
      valueGetter: (_, row) => new Date(row.createdAt).toLocaleDateString(),
    },
    {
      field: 'actions', headerName: '', width: 60, sortable: false,
      renderCell: ({ row }) => (
        <Tooltip title="Manage">
          <IconButton size="small" onClick={() => openUser(row)}>⚙️</IconButton>
        </Tooltip>
      ),
    },
  ]

  return (
    <Box>
      <Typography variant="h4" gutterBottom>Users</Typography>

      <Paper sx={{ mb: 2, p: 2 }}>
        <TextField size="small" placeholder="Search by name or username…" value={search}
          onChange={(e) => setSearch(e.target.value)} sx={{ width: 320 }} />
      </Paper>

      <Paper sx={{ height: 600 }}>
        <DataGrid
          rows={rows} columns={columns} loading={loading}
          rowCount={total} paginationMode="server"
          paginationModel={paginationModel} onPaginationModelChange={setPaginationModel}
          disableRowSelectionOnClick
        />
      </Paper>

      <Dialog open={!!selected} onClose={() => setSelected(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Manage User</DialogTitle>
        <DialogContent>
          {selected && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, pt: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Avatar sx={{ width: 48, height: 48, bgcolor: 'primary.main', fontSize: 20 }}>
                  {selected.firstName?.[0]}
                </Avatar>
                <Box>
                  <Typography fontWeight={700}>{selected.firstName} {selected.lastName ?? ''}</Typography>
                  <Typography variant="body2" color="text.secondary">Telegram ID: {selected.telegramId}</Typography>
                </Box>
              </Box>

              <Box sx={{ display: 'flex', gap: 3 }}>
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="h5" color="warning.main">{selected.streak}</Typography>
                  <Typography variant="caption" color="text.secondary">Streak</Typography>
                </Box>
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="h5" color="primary.main">{selected.xp.toLocaleString()}</Typography>
                  <Typography variant="caption" color="text.secondary">XP</Typography>
                </Box>
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="h5">{selected._count.wordProgress}</Typography>
                  <Typography variant="caption" color="text.secondary">Words</Typography>
                </Box>
              </Box>

              <Box>
                <Typography variant="body2" color="text.secondary" gutterBottom>Premium until (leave empty for no expiry)</Typography>
                <TextField type="date" value={premiumUntil} onChange={(e) => setPremiumUntil(e.target.value)} fullWidth size="small" />
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelected(null)}>Cancel</Button>
          {selected?.isPremium
            ? <Button color="error" onClick={() => savePremium(false)} disabled={saving}>Revoke Premium</Button>
            : <Button variant="contained" color="warning" onClick={() => savePremium(true)} disabled={saving}>
                {saving ? <CircularProgress size={16} /> : 'Grant Premium'}
              </Button>
          }
        </DialogActions>
      </Dialog>
    </Box>
  )
}
