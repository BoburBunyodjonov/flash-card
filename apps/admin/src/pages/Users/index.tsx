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
  avatarUrl: string | null
  telegramId: string; isPremium: boolean; premiumUntil: string | null
  streak: number; xp: number; isAdmin: boolean; createdAt: string; lastActive: string | null
  _count: { wordProgress: number }
}

const DAY_MS = 24 * 60 * 60 * 1000

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < DAY_MS) return `${Math.floor(diff / 3_600_000)}h ago`
  if (diff < 30 * DAY_MS) return `${Math.floor(diff / DAY_MS)}d ago`
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** green <24h, amber <7d, gray otherwise */
function activityColor(iso: string | null): string {
  if (!iso) return '#4b5563'
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < DAY_MS) return '#10b981'
  if (diff < 7 * DAY_MS) return '#f59e0b'
  return '#4b5563'
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

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
      field: 'name', headerName: 'User', flex: 1, minWidth: 230, sortable: false,
      renderCell: ({ row }) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, height: '100%' }}>
          <Avatar
            src={row.avatarUrl ?? undefined}
            sx={{
              width: 38, height: 38, fontSize: 15, fontWeight: 700,
              background: '#2D9B6F',
              border: '2px solid rgba(255,255,255,0.08)',
            }}
          >
            {row.firstName?.[0]?.toUpperCase()}
          </Avatar>
          <Box sx={{ minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Typography variant="body2" noWrap sx={{ fontWeight: 650 }}>
                {row.firstName} {row.lastName ?? ''}
              </Typography>
              {row.isAdmin && (
                <Chip label="admin" size="small" sx={{ height: 16, fontSize: 10, fontWeight: 700, bgcolor: 'rgba(239,68,68,0.15)', color: '#fca5a5' }} />
              )}
            </Box>
            <Typography variant="caption" noWrap sx={{ color: row.username ? '#4CB388' : 'text.disabled', display: 'block' }}>
              {row.username ? `@${row.username}` : `id ${row.telegramId}`}
            </Typography>
          </Box>
        </Box>
      ),
    },
    {
      field: 'isPremium', headerName: 'Plan', width: 128, sortable: false,
      renderCell: ({ value, row }) => (
        <Tooltip title={value && row.premiumUntil ? `Until ${formatDate(row.premiumUntil)}` : ''} arrow>
          <Chip
            icon={value ? <WorkspacePremiumRoundedIcon sx={{ fontSize: 14 }} /> : undefined}
            label={value ? 'Premium' : 'Free'}
            size="small"
            sx={value
              ? {
                  fontWeight: 700,
                  color: '#fbbf24',
                  bgcolor: 'rgba(245,158,11,0.14)',
                  border: '1px solid rgba(245,158,11,0.35)',
                  '& .MuiChip-icon': { color: '#fbbf24' },
                }
              : {
                  fontWeight: 600,
                  color: 'text.secondary',
                  bgcolor: 'transparent',
                  border: '1px solid rgba(255,255,255,0.12)',
                }}
          />
        </Tooltip>
      ),
    },
    {
      field: 'streak', headerName: 'Streak', width: 96, type: 'number',
      renderCell: ({ value }) => (
        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, opacity: value > 0 ? 1 : 0.35 }}>
          <LocalFireDepartmentRoundedIcon sx={{ fontSize: 16, color: value > 0 ? '#f59e0b' : '#6b7280' }} />
          <Typography variant="body2" sx={{ fontWeight: 650, fontVariantNumeric: 'tabular-nums' }}>{value}</Typography>
        </Box>
      ),
    },
    {
      field: 'xp', headerName: 'XP', width: 110, type: 'number',
      renderCell: ({ value }) => (
        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
          <BoltRoundedIcon sx={{ fontSize: 16, color: '#4CB388' }} />
          <Typography variant="body2" sx={{ fontWeight: 650, fontVariantNumeric: 'tabular-nums' }}>
            {value?.toLocaleString()}
          </Typography>
        </Box>
      ),
    },
    {
      field: '_count', headerName: 'Words', width: 92, type: 'number',
      valueGetter: (_, row) => row._count?.wordProgress ?? 0,
      renderCell: ({ value }) => (
        <Typography
          variant="body2"
          sx={{
            fontWeight: 650, fontVariantNumeric: 'tabular-nums',
            px: 1, py: 0.25, borderRadius: 1,
            bgcolor: value > 0 ? 'rgba(45,155,111,0.12)' : 'transparent',
            color: value > 0 ? '#2D9B6F' : 'text.disabled',
          }}
        >
          {value}
        </Typography>
      ),
    },
    {
      field: 'lastActive', headerName: 'Last Active', width: 130, sortable: false,
      renderCell: ({ row }) => (
        <Tooltip title={row.lastActive ? new Date(row.lastActive).toLocaleString() : 'Never'} arrow>
          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
            <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: activityColor(row.lastActive), flexShrink: 0 }} />
            <Typography variant="body2" color={row.lastActive ? 'text.primary' : 'text.disabled'}>
              {row.lastActive ? timeAgo(row.lastActive) : 'never'}
            </Typography>
          </Box>
        </Tooltip>
      ),
    },
    {
      field: 'createdAt', headerName: 'Joined', width: 120, sortable: false,
      renderCell: ({ row }) => (
        <Typography variant="body2" color="text.secondary">{formatDate(row.createdAt)}</Typography>
      ),
    },
    {
      field: 'actions', headerName: '', width: 56, sortable: false, resizable: false,
      renderCell: ({ row }) => (
        <Tooltip title="Manage" arrow>
          <IconButton size="small" onClick={() => openUser(row)} sx={{ color: 'text.secondary', '&:hover': { color: 'primary.light', bgcolor: 'rgba(45,155,111,0.12)' } }}>
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

      <Paper sx={{ height: 640 }}>
        <DataGrid
          rows={rows} columns={columns} loading={loading}
          rowCount={total} paginationMode="server"
          paginationModel={paginationModel} onPaginationModelChange={setPaginationModel}
          disableRowSelectionOnClick
          disableColumnMenu
          rowHeight={64}
        />
      </Paper>

      <Dialog open={!!selected} onClose={() => setSelected(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Manage User</DialogTitle>
        <DialogContent>
          {selected && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, pt: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Avatar sx={{ width: 48, height: 48, fontSize: 20, fontWeight: 700, background: '#2D9B6F' }}>
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
