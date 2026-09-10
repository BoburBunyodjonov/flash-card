import { useEffect, useState, useCallback } from 'react'
import {
  Box, Typography, Button, Paper, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, MenuItem, Chip, CircularProgress, Alert,
  AlertTitle, IconButton, Tooltip, Switch, Tabs, Tab, Divider, Snackbar,
} from '@mui/material'
import { DataGrid, type GridColDef } from '@mui/x-data-grid'
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded'
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded'
import EditRoundedIcon from '@mui/icons-material/EditRounded'
import DeleteRoundedIcon from '@mui/icons-material/DeleteRounded'
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded'
import MovieRoundedIcon from '@mui/icons-material/MovieRounded'
import PublicRoundedIcon from '@mui/icons-material/PublicRounded'
import LockRoundedIcon from '@mui/icons-material/LockRounded'
import AccessTimeRoundedIcon from '@mui/icons-material/AccessTimeRounded'
import DoneAllRoundedIcon from '@mui/icons-material/DoneAllRounded'
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded'
import { PageHeader } from '../../components/PageHeader'
import { categoriesApi } from '../../api/categories.api'
import {
  cinemaApi, type CinemaClip, type ChannelVideoDTO, type CEFRLevel,
  type CinemaSegment, type CinemaVisibility,
} from '../../api/cinema.api'

interface Category { id: string; nameUz: string; nameEn: string }

const LEVELS: CEFRLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
const LEVEL_COLORS: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
  A1: 'success', A2: 'success', B1: 'warning', B2: 'warning', C1: 'error', C2: 'error',
}

const emptyForm = {
  tgMessageId: 0,
  title: '',
  level: 'A1' as CEFRLevel,
  categoryId: '',
  transcript: '',
  translationUz: '',
  durationSec: '' as string,
  order: '0' as string,
  isPublished: true,
  visibility: 'global' as CinemaVisibility,
  hasEmbeddedSubtitles: false,
}

const fmtDuration = (sec: number | null | undefined) => {
  if (sec == null) return '—'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
const fmtSize = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`
const fmtDate = (unix: number) =>
  new Date(unix * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Divider textAlign="left" sx={{ '&::before, &::after': { borderColor: 'divider' } }}>
      <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'text.secondary' }}>
        {children}
      </Typography>
    </Divider>
  )
}

export function CinemaPage() {
  const [ready, setReady] = useState<boolean | null>(null)
  const [transcribeReady, setTranscribeReady] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [tab, setTab] = useState(0)

  const [videos, setVideos] = useState<ChannelVideoDTO[]>([])
  const [videosLoading, setVideosLoading] = useState(false)
  const [videosError, setVideosError] = useState<'' | 'mtproto' | 'generic'>('')

  const [clips, setClips] = useState<CinemaClip[]>([])
  const [clipsLoading, setClipsLoading] = useState(false)
  const [categories, setCategories] = useState<Category[]>([])

  const [dialog, setDialog] = useState<'create' | 'edit' | null>(null)
  const [selected, setSelected] = useState<CinemaClip | null>(null)
  const [segments, setSegments] = useState<CinemaSegment[] | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  const loadStatus = useCallback(async () => {
    try {
      const s = await cinemaApi.status()
      setReady(s.ready)
      setTranscribeReady(s.transcribeReady)
      return s.ready
    } catch {
      setReady(false)
      return false
    }
  }, [])

  const runTranscribe = async () => {
    if (!form.tgMessageId) return
    setTranscribing(true)
    setError('')
    try {
      const r = await cinemaApi.transcribe(form.tgMessageId, true)
      setForm((f) => ({
        ...f,
        transcript: r.transcript || f.transcript,
        translationUz: r.translationUz || f.translationUz,
      }))
      setSegments(r.segments && r.segments.length ? r.segments : null)
      setToast({
        type: 'success',
        msg: `Transkript tayyor${r.segments?.length ? ` • ${r.segments.length} segment` : ''}`,
      })
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Transkript qilishda xatolik')
    } finally {
      setTranscribing(false)
    }
  }

  const loadVideos = useCallback(async () => {
    setVideosLoading(true)
    setVideosError('')
    try {
      setVideos(await cinemaApi.channelVideos())
    } catch (e: any) {
      setVideosError(e?.response?.status === 503 ? 'mtproto' : 'generic')
    } finally {
      setVideosLoading(false)
    }
  }, [])

  const loadClips = useCallback(async () => {
    setClipsLoading(true)
    try {
      setClips(await cinemaApi.clips())
    } finally {
      setClipsLoading(false)
    }
  }, [])

  useEffect(() => {
    ;(async () => {
      const r = await loadStatus()
      if (r) loadVideos()
    })()
    loadClips()
    categoriesApi.list().then(setCategories).catch(console.error)
  }, [loadStatus, loadVideos, loadClips])

  const refresh = () => {
    if (ready) loadVideos()
    loadClips()
  }

  const openImport = (v: ChannelVideoDTO) => {
    const firstLine = (v.caption || '').split('\n')[0].trim()
    setSelected(null)
    setSegments(null)
    setError('')
    setForm({
      ...emptyForm,
      tgMessageId: v.messageId,
      title: firstLine ? firstLine.slice(0, 80) : `Cinema #${v.messageId}`,
      transcript: v.caption || '',
      durationSec: v.durationSec != null ? String(v.durationSec) : '',
      visibility: 'global',
    })
    setDialog('create')
  }

  const openEdit = (clip: CinemaClip) => {
    setSelected(clip)
    setSegments(clip.segments ?? null)
    setError('')
    setForm({
      tgMessageId: clip.tgMessageId,
      title: clip.title,
      level: clip.level,
      categoryId: clip.categoryId ?? '',
      transcript: clip.transcript,
      translationUz: clip.translationUz,
      durationSec: clip.durationSec != null ? String(clip.durationSec) : '',
      order: String(clip.order ?? 0),
      isPublished: clip.isPublished,
      visibility: clip.visibility,
      hasEmbeddedSubtitles: clip.hasEmbeddedSubtitles,
    })
    setDialog('edit')
  }

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      const durationSec = form.durationSec.trim() === '' ? null : Number(form.durationSec)
      const order = form.order.trim() === '' ? 0 : Number(form.order)
      const base = {
        title: form.title.trim(),
        transcript: form.transcript,
        translationUz: form.translationUz,
        level: form.level,
        categoryId: form.categoryId || null,
        durationSec,
        segments,
        order,
        isPublished: form.isPublished,
        visibility: form.visibility,
        hasEmbeddedSubtitles: form.hasEmbeddedSubtitles,
      }
      if (dialog === 'create') {
        await cinemaApi.create({
          tgMessageId: form.tgMessageId,
          ...base,
          autoTranscribe: !form.hasEmbeddedSubtitles && !form.transcript.trim(),
        })
        setToast({ type: 'success', msg: 'Cinema klip import qilindi' })
        if (ready) loadVideos()
      } else if (selected) {
        await cinemaApi.update(selected.id, base)
        setToast({ type: 'success', msg: 'Saqlandi' })
      }
      setDialog(null)
      loadClips()
    } catch (e: any) {
      if (e?.response?.status === 409) setError('Bu video allaqachon import qilingan.')
      else setError(e?.response?.data?.error ?? 'Saqlashda xatolik')
    } finally {
      setSaving(false)
    }
  }

  const toggleVisibility = async (clip: CinemaClip) => {
    const next: CinemaVisibility = clip.visibility === 'global' ? 'private' : 'global'
    try {
      await cinemaApi.setVisibility(clip.id, next)
      setClips((prev) =>
        prev.map((c) =>
          c.id === clip.id
            ? { ...c, visibility: next, isPublished: next === 'global' ? true : c.isPublished }
            : c,
        ),
      )
      setToast({
        type: 'success',
        msg: next === 'global' ? 'Global qilindi — hammaga koʻrinadi' : 'Private qilindi',
      })
    } catch {
      setToast({ type: 'error', msg: 'Visibility oʻzgarmadi' })
    }
  }

  const remove = async (clip: CinemaClip) => {
    if (!confirm(`"${clip.title}" oʻchirilsinmi?`)) return
    try {
      await cinemaApi.delete(clip.id)
      setToast({ type: 'success', msg: 'Oʻchirildi' })
      loadClips()
      if (ready) loadVideos()
    } catch {
      setToast({ type: 'error', msg: 'Oʻchirib boʻlmadi' })
    }
  }

  const columns: GridColDef<CinemaClip>[] = [
    {
      field: 'title', headerName: 'Sarlavha', flex: 1.4, minWidth: 180,
      renderCell: ({ value }) => (
        <Tooltip title={value} arrow>
          <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>{value}</Typography>
        </Tooltip>
      ),
    },
    {
      field: 'uploadedBy', headerName: 'Muallif', width: 140,
      valueGetter: (_, row) =>
        row.uploadedBy
          ? [row.uploadedBy.firstName, row.uploadedBy.lastName].filter(Boolean).join(' ') ||
            row.uploadedBy.username ||
            'User'
          : 'Admin',
    },
    {
      field: 'level', headerName: 'Daraja', width: 80,
      renderCell: ({ value }) => <Chip label={value} size="small" color={LEVEL_COLORS[value] ?? 'default'} />,
    },
    {
      field: 'visibility', headerName: 'Visibility', width: 130, sortable: false,
      renderCell: ({ row }) => (
        <Tooltip
          title={row.visibility === 'global' ? 'Global (private qilish)' : 'Private (global qilish)'}
          arrow
        >
          <Chip
            size="small"
            icon={row.visibility === 'global' ? <PublicRoundedIcon /> : <LockRoundedIcon />}
            label={row.visibility === 'global' ? 'Global' : 'Private'}
            color={row.visibility === 'global' ? 'success' : 'default'}
            onClick={() => toggleVisibility(row)}
            sx={{ cursor: 'pointer', fontWeight: 700 }}
          />
        </Tooltip>
      ),
    },
    {
      field: 'hasEmbeddedSubtitles', headerName: 'Sub', width: 70,
      renderCell: ({ value }) => (
        <Chip label={value ? 'Ha' : 'Yoʻq'} size="small" variant="outlined" />
      ),
    },
    {
      field: 'durationSec', headerName: 'Vaqt', width: 90,
      renderCell: ({ row }) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'text.secondary' }}>
          <AccessTimeRoundedIcon sx={{ fontSize: 15 }} />
          <Typography variant="body2">{fmtDuration(row.durationSec)}</Typography>
        </Box>
      ),
    },
    {
      field: '_count', headerName: 'Watch', width: 90,
      valueGetter: (_, row) => row._count?.completions ?? 0,
      renderCell: ({ value }) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'text.secondary' }}>
          <DoneAllRoundedIcon sx={{ fontSize: 15 }} />
          <Typography variant="body2">{value}</Typography>
        </Box>
      ),
    },
    {
      field: 'actions', headerName: '', width: 100, sortable: false,
      renderCell: ({ row }) => (
        <Box>
          <Tooltip title="Tahrirlash" arrow>
            <IconButton size="small" onClick={() => openEdit(row)}>
              <EditRoundedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Oʻchirish" arrow>
            <IconButton size="small" onClick={() => remove(row)}>
              <DeleteRoundedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      ),
    },
  ]

  const canSave = Boolean(
    form.title.trim() &&
      (form.hasEmbeddedSubtitles
        ? form.translationUz.trim() || form.transcript.trim()
        : form.transcript.trim()),
  )

  return (
    <Box>
      <PageHeader
        title="Cinema"
        subtitle={`${clips.length} ta video • smart subtitle • private → global`}
        action={
          <Button variant="outlined" startIcon={<RefreshRoundedIcon />} onClick={refresh}>
            Yangilash
          </Button>
        }
      />

      {ready === false && (
        <Alert severity="info" sx={{ mb: 2 }}>
          <AlertTitle>Telegram MTProto / Cinema kanal sozlanmagan</AlertTitle>
          <code>TELEGRAM_API_ID</code>, <code>TELEGRAM_API_HASH</code>, <code>TELEGRAM_SESSION</code> va{' '}
          <code>CINEMA_CHANNEL_ID</code> ni `.env` ga qoʻying.
        </Alert>
      )}

      <Paper sx={{ mb: 2 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ px: 1 }}>
          <Tab label="Kanaldagi videolar" />
          <Tab label={`Barcha kliplar (${clips.length})`} />
        </Tabs>
      </Paper>

      {tab === 0 && (
        <Box>
          {videosLoading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
              <CircularProgress />
            </Box>
          )}
          {!videosLoading && videosError && (
            <Alert severity={videosError === 'mtproto' ? 'warning' : 'error'}>
              Kanal videolari yuklanmadi.
            </Alert>
          )}
          {!videosLoading && !videosError && videos.length === 0 && (
            <Paper sx={{ py: 8, textAlign: 'center' }}>
              <MovieRoundedIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
              <Typography color="text.secondary">Cinema kanalida video topilmadi.</Typography>
            </Paper>
          )}
          {!videosLoading && !videosError && videos.length > 0 && (
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 2 }}>
              {videos.map((v) => {
                const imported = v.importedClipId != null
                return (
                  <Paper key={v.messageId} sx={{ overflow: 'hidden' }}>
                    <Box sx={{ position: 'relative', aspectRatio: '16 / 9', bgcolor: 'background.default' }}>
                      {v.thumb ? (
                        <Box component="img" src={v.thumb} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'rgba(45,155,111,0.12)' }}>
                          <MovieRoundedIcon sx={{ fontSize: 40, color: 'primary.light' }} />
                        </Box>
                      )}
                      <Chip label={fmtDuration(v.durationSec)} size="small"
                        sx={{ position: 'absolute', bottom: 8, right: 8, bgcolor: 'rgba(0,0,0,0.7)', color: '#fff', fontWeight: 700 }} />
                      {imported && (
                        <Chip icon={<CheckCircleRoundedIcon />} label="Import" size="small"
                          sx={{ position: 'absolute', top: 8, left: 8, bgcolor: 'rgba(16,185,129,0.9)', color: '#fff' }} />
                      )}
                    </Box>
                    <Box sx={{ p: 1.75 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600, mb: 1, minHeight: 40 }}>
                        {v.caption || <span style={{ opacity: 0.5 }}>(izohsiz)</span>}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" display="block" mb={1}>
                        {fmtSize(v.size)} • {fmtDate(v.date)}
                      </Typography>
                      {imported ? (
                        <Chip label="Imported ✓" size="small" color="success" variant="outlined" />
                      ) : (
                        <Button fullWidth variant="contained" size="small" startIcon={<DownloadRoundedIcon />} onClick={() => openImport(v)}>
                          Import
                        </Button>
                      )}
                    </Box>
                  </Paper>
                )
              })}
            </Box>
          )}
        </Box>
      )}

      {tab === 1 && (
        <Paper sx={{ height: 600 }}>
          <DataGrid
            rows={clips}
            columns={columns}
            loading={clipsLoading}
            disableRowSelectionOnClick
            initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
            pageSizeOptions={[25, 50, 100]}
          />
        </Paper>
      )}

      <Dialog open={!!dialog} onClose={() => !saving && !transcribing && setDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{dialog === 'create' ? 'Cinema import' : 'Tahrirlash'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <SectionLabel>Asosiy</SectionLabel>
            <TextField label="Sarlavha *" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} fullWidth />
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField select label="Daraja" value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value as CEFRLevel })} fullWidth>
                {LEVELS.map((l) => <MenuItem key={l} value={l}>{l}</MenuItem>)}
              </TextField>
              <TextField select label="Kategoriya" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} fullWidth>
                <MenuItem value=""><em>— Yoʻq —</em></MenuItem>
                {categories.map((c) => <MenuItem key={c.id} value={c.id}>{c.nameUz || c.nameEn}</MenuItem>)}
              </TextField>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box>
                <Typography variant="body2" fontWeight={600}>Videoda subtitle bor</Typography>
                <Typography variant="caption" color="text.secondary">
                  Yoqilsa STT shart emas — tarjima yetarli
                </Typography>
              </Box>
              <Switch
                checked={form.hasEmbeddedSubtitles}
                onChange={(e) => setForm({ ...form, hasEmbeddedSubtitles: e.target.checked })}
                color="success"
              />
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box>
                <Typography variant="body2" fontWeight={600}>Global</Typography>
                <Typography variant="caption" color="text.secondary">
                  Barcha userlarga koʻrinsin
                </Typography>
              </Box>
              <Switch
                checked={form.visibility === 'global'}
                onChange={(e) => setForm({ ...form, visibility: e.target.checked ? 'global' : 'private' })}
                color="success"
              />
            </Box>

            <SectionLabel>Matn / tarjima</SectionLabel>
            {form.tgMessageId > 0 && !form.hasEmbeddedSubtitles && (
              <Button
                size="small"
                variant="outlined"
                startIcon={transcribing ? <CircularProgress size={16} /> : <AutoAwesomeRoundedIcon />}
                onClick={runTranscribe}
                disabled={transcribing || !transcribeReady}
              >
                Avto-transkript
              </Button>
            )}
            <TextField
              label={form.hasEmbeddedSubtitles ? 'Transkript (ixtiyoriy)' : 'Transkript *'}
              value={form.transcript}
              onChange={(e) => setForm({ ...form, transcript: e.target.value })}
              multiline rows={3} fullWidth
            />
            <TextField
              label="Oʻzbekcha tarjima"
              value={form.translationUz}
              onChange={(e) => setForm({ ...form, translationUz: e.target.value })}
              multiline rows={3} fullWidth
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setDialog(null)} disabled={saving || transcribing}>Bekor</Button>
          <Button variant="contained" onClick={save} disabled={saving || transcribing || !canSave}>
            {saving ? <CircularProgress size={18} color="inherit" /> : 'Saqlash'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!toast} autoHideDuration={3500} onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        {toast ? (
          <Alert severity={toast.type} variant="filled" onClose={() => setToast(null)}>{toast.msg}</Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  )
}
