import { useEffect, useState, useCallback } from 'react'
import {
  Box, Typography, Paper, Chip, Button, ToggleButtonGroup, ToggleButton,
  Dialog, DialogTitle, DialogContent, DialogActions, Tooltip, CircularProgress, Alert,
} from '@mui/material'
import { DataGrid, type GridColDef } from '@mui/x-data-grid'
import GavelRoundedIcon from '@mui/icons-material/GavelRounded'
import BlockRoundedIcon from '@mui/icons-material/BlockRounded'
import DoneRoundedIcon from '@mui/icons-material/DoneRounded'
import { PageHeader } from '../../components/PageHeader'
import { speakingApi, type SpeakingReport, type ReportUser } from '../../api/speaking.api'

const name = (u: ReportUser) =>
  `${u.firstName}${u.lastName ? ' ' + u.lastName : ''}${u.username ? ` (@${u.username})` : ''}`

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

const BAN_OPTIONS = [
  { label: '1 day', days: 1 },
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: 'Permanent', days: 3650 },
]

export function SpeakingPage() {
  const [rows, setRows] = useState<SpeakingReport[]>([])
  const [total, setTotal] = useState(0)
  const [openCount, setOpenCount] = useState(0)
  const [status, setStatus] = useState<'open' | 'resolved' | 'all'>('open')
  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 20 })
  const [loading, setLoading] = useState(false)
  const [banTarget, setBanTarget] = useState<SpeakingReport | null>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await speakingApi.reports({ status, page: paginationModel.page + 1, limit: paginationModel.pageSize })
      setRows(data.reports); setTotal(data.total); setOpenCount(data.openCount)
    } finally { setLoading(false) }
  }, [status, paginationModel])

  useEffect(() => { load() }, [load])

  const resolve = async (id: string) => {
    setBusy(true)
    try {
      await speakingApi.resolve(id)
      setToast({ type: 'success', msg: 'Report yopildi' })
      load()
    } catch {
      setToast({ type: 'error', msg: 'Xatolik yuz berdi' })
    } finally { setBusy(false) }
  }

  const ban = async (days: number) => {
    if (!banTarget) return
    setBusy(true)
    try {
      await speakingApi.banUser(banTarget.accused.id, days)
      await speakingApi.resolve(banTarget.id, `banned ${days >= 3650 ? 'permanent' : days + 'd'}`)
      setToast({ type: 'success', msg: `${name(banTarget.accused)} bloklandi` })
      setBanTarget(null)
      load()
    } catch {
      setToast({ type: 'error', msg: 'Bloklab boʻlmadi' })
    } finally { setBusy(false) }
  }

  const columns: GridColDef<SpeakingReport>[] = [
    {
      field: 'accused', headerName: 'Reported user', flex: 1, minWidth: 200, sortable: false,
      renderCell: ({ row }) => {
        const banned = row.accused.speakingBannedUntil && new Date(row.accused.speakingBannedUntil) > new Date()
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, height: '100%' }}>
            <Typography variant="body2" sx={{ fontWeight: 650 }} noWrap>{name(row.accused)}</Typography>
            {banned && <Chip label="banned" size="small" sx={{ height: 18, fontSize: 10, fontWeight: 700, bgcolor: 'rgba(239,68,68,0.15)', color: '#fca5a5' }} />}
          </Box>
        )
      },
    },
    {
      field: 'reporter', headerName: 'Reported by', flex: 1, minWidth: 170, sortable: false,
      renderCell: ({ row }) => <Typography variant="body2" color="text.secondary" noWrap>{name(row.reporter)}</Typography>,
    },
    {
      field: 'reason', headerName: 'Reason', flex: 1.4, minWidth: 220, sortable: false,
      renderCell: ({ value }) => <Tooltip title={value} arrow><Typography variant="body2" noWrap>{value}</Typography></Tooltip>,
    },
    {
      field: 'createdAt', headerName: 'When', width: 140, sortable: false,
      renderCell: ({ value }) => <Typography variant="body2" color="text.secondary">{formatDate(value)}</Typography>,
    },
    {
      field: 'actions', headerName: 'Action', width: 210, sortable: false, resizable: false,
      renderCell: ({ row }) => row.resolvedAt
        ? <Chip icon={<DoneRoundedIcon sx={{ fontSize: 14 }} />} label={row.resolution ?? 'resolved'} size="small" sx={{ bgcolor: 'rgba(16,185,129,0.14)', color: '#6ee7b7' }} />
        : (
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button size="small" color="error" variant="outlined" startIcon={<BlockRoundedIcon sx={{ fontSize: 16 }} />} onClick={() => setBanTarget(row)}>Ban</Button>
            <Button size="small" color="inherit" onClick={() => resolve(row.id)} disabled={busy}>Dismiss</Button>
          </Box>
        ),
    },
  ]

  return (
    <Box>
      <PageHeader title="Speaking Reports" subtitle={`${openCount} open report${openCount === 1 ? '' : 's'} need review`} />

      {toast && <Alert severity={toast.type} sx={{ mb: 2 }} onClose={() => setToast(null)}>{toast.msg}</Alert>}

      <Paper sx={{ mb: 2, p: 1.5 }}>
        <ToggleButtonGroup
          value={status}
          exclusive
          size="small"
          onChange={(_, v) => { if (v) { setStatus(v); setPaginationModel((m) => ({ ...m, page: 0 })) } }}
        >
          <ToggleButton value="open" sx={{ px: 2 }}>Open{openCount > 0 ? ` (${openCount})` : ''}</ToggleButton>
          <ToggleButton value="resolved" sx={{ px: 2 }}>Resolved</ToggleButton>
          <ToggleButton value="all" sx={{ px: 2 }}>All</ToggleButton>
        </ToggleButtonGroup>
      </Paper>

      <Paper sx={{ height: 620 }}>
        <DataGrid
          rows={rows} columns={columns} loading={loading}
          rowCount={total} paginationMode="server"
          paginationModel={paginationModel} onPaginationModelChange={setPaginationModel}
          disableRowSelectionOnClick disableColumnMenu rowHeight={56}
        />
      </Paper>

      <Dialog open={!!banTarget} onClose={() => !busy && setBanTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <GavelRoundedIcon color="error" /> Ban from Speaking
        </DialogTitle>
        <DialogContent>
          {banTarget && (
            <Typography variant="body2" color="text.secondary">
              <b>{name(banTarget.accused)}</b> Speaking funksiyasidan qancha muddatga bloklansin? Bu reportni ham yopadi.
            </Typography>
          )}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 2 }}>
            {BAN_OPTIONS.map((o) => (
              <Button key={o.days} variant="outlined" color="error" disabled={busy} onClick={() => ban(o.days)}>
                {busy ? <CircularProgress size={16} color="inherit" /> : o.label}
              </Button>
            ))}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setBanTarget(null)} color="inherit" disabled={busy}>Cancel</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
