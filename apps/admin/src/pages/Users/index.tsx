import { useEffect, useState, useCallback } from 'react'
import {
  Box, Typography, Paper, Chip, IconButton, Dialog, DialogTitle,
  DialogContent, DialogActions, Button, TextField,
  Avatar, Tooltip, CircularProgress, InputAdornment,
} from '@mui/material'
import { DataGrid, type GridColDef } from '@mui/x-data-grid'
import SearchRoundedIcon from '@mui/icons-material/SearchRounded'
import ManageAccountsRoundedIcon from '@mui/icons-material/ManageAccountsRounded'
import LocalFireDepartmentRoundedIcon from '@mui/icons-material/LocalFireDepartmentRounded'
import BoltRoundedIcon from '@mui/icons-material/BoltRounded'
import WorkspacePremiumRoundedIcon from '@mui/icons-material/WorkspacePremiumRounded'
import { PageHeader } from '../../components/PageHeader'
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
      field: 'name', headerName: 'User', flex: 1, minWidth: 180,
      renderCell: ({ row }) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <Avatar sx={{ width: 30, height: 30, fontSize: 13, fontWeight: 700, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
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
      field: 'isPremium', headerName: 'Plan', width: 120,
      renderCell: ({ value }) => (
        <Chip
          icon={value ? <WorkspacePremiumRoundedIcon sx={{ fontSize: 14 }} /> : undefined}
          label={value ? 'Premium' : 'Free'}
          size="small"
          color={value ? 'warning' : 'default'}
          variant={value ? 'filled' : 'outlined'}
        />
      ),
    },
    {
      field: 'streak', headerName: 'Streak', width: 100, type: 'number',
      renderCell: ({ value }) => (
        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
          <LocalFireDepartmentRoundedIcon sx={{ fontSize: 15, color: '#f59e0b' }} />
          <Typography variant="body2">{value}</Typography>
        </Box>
      ),
    },
    {
      field: 'xp', headerName: 'XP', width: 100, type: 'number',
      renderCell: ({ value }) => (
        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
          <BoltRoundedIcon sx={{ fontSize: 15, color: '#818cf8' }} />
          <Typography variant="body2">{value?.toLocaleString()}</Typography>
        </Box>
      ),
    },
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
        <Tooltip title="Manage" arrow>
          <IconButton size="small" onClick={() => openUser(row)} sx={{ color: 'text.secondary', '&:hover': { color: 'primary.light' } }}>
            <ManageAccountsRoundedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      ),
    },
  ]

  return (
    <Box>
      <PageHeader title="Users" subtitle={`${total.toLocaleString()} registered learners`} />

      <Paper sx={{ mb: 2, p: 2 }}>
        <TextField
          size="small"
          placeholder="Search by name or username…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ width: 340 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchRoundedIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
              </InputAdornment>
            ),
          }}
        />
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
                <Avatar sx={{ width: 48, height: 48, fontSize: 20, fontWeight: 700, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
                  {selected.firstName?.[0]}
                </Avatar>
                <Box>
                  <Typography fontWeight={700}>{selected.firstName} {selected.lastName ?? ''}</Typography>
                  <Typography variant="body2" color="text.secondary">Telegram ID: {selected.telegramId}</Typography>
                </Box>
              </Box>

              <Box sx={{ display: 'flex', gap: 1.5 }}>
                {[
                  { label: 'Streak', value: selected.streak, color: 'warning.main' },
                  { label: 'XP', value: selected.xp.toLocaleString(), color: 'primary.light' },
                  { label: 'Words', value: selected._count.wordProgress, color: 'text.primary' },
                ].map((stat) => (
                  <Paper key={stat.label} variant="outlined" sx={{ flex: 1, p: 1.5, textAlign: 'center', bgcolor: 'rgba(255,255,255,0.02)' }}>
                    <Typography variant="h6" sx={{ color: stat.color, fontWeight: 800 }}>{stat.value}</Typography>
                    <Typography variant="caption" color="text.secondary">{stat.label}</Typography>
                  </Paper>
                ))}
              </Box>

              <Box>
                <Typography variant="body2" color="text.secondary" gutterBottom>Premium until (leave empty for no expiry)</Typography>
                <TextField type="date" value={premiumUntil} onChange={(e) => setPremiumUntil(e.target.value)} fullWidth size="small" />
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setSelected(null)} color="inherit">Cancel</Button>
          {selected?.isPremium
            ? <Button color="error" onClick={() => savePremium(false)} disabled={saving}>Revoke Premium</Button>
            : <Button variant="contained" color="warning" onClick={() => savePremium(true)} disabled={saving}>
                {saving ? <CircularProgress size={16} color="inherit" /> : 'Grant Premium'}
              </Button>
          }
        </DialogActions>
      </Dialog>
    </Box>
  )
}
