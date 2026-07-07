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
import VideocamRoundedIcon from '@mui/icons-material/VideocamRounded'
import AccessTimeRoundedIcon from '@mui/icons-material/AccessTimeRounded'
import DoneAllRoundedIcon from '@mui/icons-material/DoneAllRounded'
import { PageHeader } from '../../components/PageHeader'
import { categoriesApi } from '../../api/categories.api'
import {
  shadowingApi, type Clip, type ChannelVideoDTO, type CEFRLevel, type ShadowingSegment,
} from '../../api/shadowing.api'

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
  isPublished: false,
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

export function ShadowingPage() {
  const [ready, setReady] = useState<boolean | null>(null)
  const [tab, setTab] = useState(0)

  const [videos, setVideos] = useState<ChannelVideoDTO[]>([])
  const [videosLoading, setVideosLoading] = useState(false)
  const [videosError, setVideosError] = useState<'' | 'mtproto' | 'generic'>('')

  const [clips, setClips] = useState<Clip[]>([])
  const [clipsLoading, setClipsLoading] = useState(false)

  const [categories, setCategories] = useState<Category[]>([])

  const [dialog, setDialog] = useState<'create' | 'edit' | null>(null)
  const [selected, setSelected] = useState<Clip | null>(null)
  const [segments, setSegments] = useState<ShadowingSegment[] | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  const loadStatus = useCallback(async () => {
    try {
      const s = await shadowingApi.status()
      setReady(s.ready)
      return s.ready
    } catch {
      setReady(false)
      return false
    }
  }, [])

  const loadVideos = useCallback(async () => {
    setVideosLoading(true)
    setVideosError('')
    try {
      setVideos(await shadowingApi.channelVideos())
    } catch (e: any) {
      setVideosError(e?.response?.status === 503 ? 'mtproto' : 'generic')
    } finally {
      setVideosLoading(false)
    }
  }, [])

  const loadClips = useCallback(async () => {
    setClipsLoading(true)
    try {
      setClips(await shadowingApi.clips())
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
      title: firstLine ? firstLine.slice(0, 80) : `Klip #${v.messageId}`,
      transcript: v.caption || '',
      durationSec: v.durationSec != null ? String(v.durationSec) : '',
    })
    setDialog('create')
  }

  const openEdit = (clip: Clip) => {
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
      }
      if (dialog === 'create') {
        await shadowingApi.create({ tgMessageId: form.tgMessageId, ...base })
        setToast({ type: 'success', msg: 'Klip import qilindi' })
        if (ready) loadVideos()
      } else if (selected) {
        await shadowingApi.update(selected.id, base)
        setToast({ type: 'success', msg: 'Klip saqlandi' })
      }
      setDialog(null)
      loadClips()
    } catch (e: any) {
      if (e?.response?.status === 409) {
        setError('Bu video allaqachon import qilingan.')
      } else {
        setError(e?.response?.data?.error ?? 'Saqlashda xatolik yuz berdi')
      }
    } finally {
      setSaving(false)
    }
  }

  const togglePublish = async (clip: Clip) => {
    try {
      await shadowingApi.update(clip.id, { isPublished: !clip.isPublished })
      setClips((prev) => prev.map((c) => (c.id === clip.id ? { ...c, isPublished: !c.isPublished } : c)))
    } catch {
      setToast({ type: 'error', msg: 'Holatni oʻzgartirib boʻlmadi' })
    }
  }

  const remove = async (clip: Clip) => {
    if (!confirm(`"${clip.title}" oʻchirilsinmi?`)) return
    try {
      await shadowingApi.delete(clip.id)
      setToast({ type: 'success', msg: 'Klip oʻchirildi' })
      loadClips()
      if (ready) loadVideos()
    } catch {
      setToast({ type: 'error', msg: 'Oʻchirib boʻlmadi' })
    }
  }

  const columns: GridColDef<Clip>[] = [
    {
      field: 'title', headerName: 'Sarlavha', flex: 1.4, minWidth: 200,
      renderCell: ({ value }) => (
        <Tooltip title={value} arrow>
          <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>{value}</Typography>
        </Tooltip>
      ),
    },
    {
      field: 'level', headerName: 'Daraja', width: 90,
      renderCell: ({ value }) => <Chip label={value} size="small" color={LEVEL_COLORS[value] ?? 'default'} />,
    },
    {
      field: 'category', headerName: 'Kategoriya', flex: 1, minWidth: 130,
      valueGetter: (_, row) => row.category?.nameUz ?? '—',
    },
    {
      field: 'durationSec', headerName: 'Davomiyligi', width: 120,
      renderCell: ({ row }) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: 'text.secondary' }}>
          <AccessTimeRoundedIcon sx={{ fontSize: 15 }} />
          <Typography variant="body2">{fmtDuration(row.durationSec)}</Typography>
        </Box>
      ),
    },
    {
      field: '_count', headerName: 'Bajarganlar', width: 120,
      valueGetter: (_, row) => row._count?.completions ?? 0,
      renderCell: ({ value }) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: 'text.secondary' }}>
          <DoneAllRoundedIcon sx={{ fontSize: 15 }} />
          <Typography variant="body2">{value}</Typography>
        </Box>
      ),
    },
    {
      field: 'isPublished', headerName: 'Chop etilgan', width: 130, sortable: false,
      renderCell: ({ row }) => (
        <Tooltip title={row.isPublished ? 'Chop etilgan (yashirish uchun bosing)' : 'Yashirin (chop etish uchun bosing)'} arrow>
          <Switch checked={row.isPublished} onChange={() => togglePublish(row)} color="success" size="small" />
        </Tooltip>
      ),
    },
    {
      field: 'actions', headerName: '', width: 100, sortable: false,
      renderCell: ({ row }) => (
        <Box>
          <Tooltip title="Tahrirlash" arrow>
            <IconButton size="small" onClick={() => openEdit(row)} sx={{ color: 'text.secondary', '&:hover': { color: 'primary.light' } }}>
              <EditRoundedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Oʻchirish" arrow>
            <IconButton size="small" onClick={() => remove(row)} sx={{ color: 'text.secondary', '&:hover': { color: 'error.main' } }}>
              <DeleteRoundedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      ),
    },
  ]

  const canSave = Boolean(form.title.trim() && form.transcript.trim() && form.translationUz.trim())

  return (
    <Box>
      <PageHeader
        title="Shadowing"
        subtitle={`${clips.length} ta klip • kanal videolarini import qiling`}
        action={
          <Button variant="outlined" startIcon={<RefreshRoundedIcon />} onClick={refresh}>
            Yangilash
          </Button>
        }
      />

      {ready === false && (
        <Alert severity="info" sx={{ mb: 2 }}>
          <AlertTitle>Telegram MTProto sozlanmagan</AlertTitle>
          Kanal videolari yuklanishi uchun server <code>.env</code> faylida quyidagilarni sozlang:{' '}
          <code>TELEGRAM_API_ID</code>, <code>TELEGRAM_API_HASH</code>, <code>TELEGRAM_SESSION</code>{' '}
          (<code>pnpm --filter api tg:login</code> orqali oling) va <code>SHADOWING_CHANNEL_ID</code>.
          Ular sozlanmaguncha kanal videolari koʻrinmaydi. Mavjud kliplarni baribir tahrirlashingiz mumkin.
        </Alert>
      )}

      <Paper sx={{ mb: 2 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ px: 1 }}>
          <Tab label="Kanaldagi videolar" />
          <Tab label={`Kliplar (${clips.length})`} />
        </Tabs>
      </Paper>

      {tab === 0 && (
        <Box>
          {videosLoading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
              <CircularProgress />
            </Box>
          )}

          {!videosLoading && videosError === 'mtproto' && (
            <Alert severity="warning">
              Telegram MTProto sozlanmagani uchun kanal videolari yuklanmadi.
            </Alert>
          )}
          {!videosLoading && videosError === 'generic' && (
            <Alert severity="error" action={<Button color="inherit" size="small" onClick={loadVideos}>Qayta urinish</Button>}>
              Kanal videolarini yuklab boʻlmadi.
            </Alert>
          )}

          {!videosLoading && !videosError && videos.length === 0 && (
            <Paper sx={{ py: 8, textAlign: 'center' }}>
              <VideocamRoundedIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
              <Typography color="text.secondary">Kanalda video topilmadi.</Typography>
            </Paper>
          )}

          {!videosLoading && !videosError && videos.length > 0 && (
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 2 }}>
              {videos.map((v) => {
                const imported = v.importedClipId != null
                return (
                  <Paper key={v.messageId} sx={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    <Box sx={{ position: 'relative', aspectRatio: '16 / 9', bgcolor: 'background.default' }}>
                      {v.thumb ? (
                        <Box component="img" src={v.thumb} alt={v.caption}
                          sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      ) : (
                        <Box sx={{
                          width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: 'linear-gradient(135deg, rgba(99,102,241,0.18), rgba(139,92,246,0.18))',
                        }}>
                          <VideocamRoundedIcon sx={{ fontSize: 40, color: 'primary.light' }} />
                        </Box>
                      )}
                      <Chip
                        label={fmtDuration(v.durationSec)}
                        size="small"
                        sx={{ position: 'absolute', bottom: 8, right: 8, bgcolor: 'rgba(0,0,0,0.7)', color: '#fff', fontWeight: 700, height: 22 }}
                      />
                      {imported && (
                        <Chip
                          icon={<CheckCircleRoundedIcon sx={{ fontSize: 15, color: '#6ee7b7 !important' }} />}
                          label="Import qilingan"
                          size="small"
                          sx={{ position: 'absolute', top: 8, left: 8, bgcolor: 'rgba(16,185,129,0.9)', color: '#fff', fontWeight: 700, height: 22 }}
                        />
                      )}
                    </Box>
                    <Box sx={{ p: 1.75, display: 'flex', flexDirection: 'column', gap: 1, flexGrow: 1 }}>
                      <Typography
                        variant="body2"
                        sx={{ fontWeight: 600, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: 40 }}
                      >
                        {v.caption || <span style={{ opacity: 0.5 }}>(izohsiz)</span>}
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 1.5, color: 'text.secondary', fontSize: 12, flexWrap: 'wrap' }}>
                        <span>{fmtSize(v.size)}</span>
                        <span>•</span>
                        <span>{fmtDate(v.date)}</span>
                      </Box>
                      <Box sx={{ mt: 'auto', pt: 0.5 }}>
                        {imported ? (
                          <Chip icon={<CheckCircleRoundedIcon sx={{ fontSize: 16 }} />} label="Imported ✓" size="small" color="success" variant="outlined" />
                        ) : (
                          <Button fullWidth variant="contained" size="small" startIcon={<DownloadRoundedIcon />} onClick={() => openImport(v)}>
                            Import qilish
                          </Button>
                        )}
                      </Box>
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
            rows={clips} columns={columns} loading={clipsLoading}
            disableRowSelectionOnClick
            initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
            pageSizeOptions={[25, 50, 100]}
          />
        </Paper>
      )}

      <Dialog open={!!dialog} onClose={() => !saving && setDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{dialog === 'create' ? 'Klipni import qilish' : 'Klipni tahrirlash'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}

            <SectionLabel>Asosiy</SectionLabel>

            {form.tgMessageId > 0 && (
              <TextField label="Telegram xabar ID" value={form.tgMessageId} InputProps={{ readOnly: true }} fullWidth
                helperText="Kanaldagi videoning xabar raqami (oʻzgartirib boʻlmaydi)" />
            )}

            <TextField label="Sarlavha *" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} fullWidth />

            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField select label="Daraja *" value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value as CEFRLevel })} fullWidth>
                {LEVELS.map((l) => <MenuItem key={l} value={l}>{l}</MenuItem>)}
              </TextField>
              <TextField select label="Kategoriya" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} fullWidth
                helperText="Ixtiyoriy">
                <MenuItem value=""><em>— Yoʻq —</em></MenuItem>
                {categories.map((c) => <MenuItem key={c.id} value={c.id}>{c.nameUz || c.nameEn}</MenuItem>)}
              </TextField>
            </Box>

            <SectionLabel>Matn</SectionLabel>

            <TextField label="Transkript (inglizcha) *" value={form.transcript} onChange={(e) => setForm({ ...form, transcript: e.target.value })} multiline rows={4} fullWidth />
            <TextField label="Oʻzbekcha tarjima *" value={form.translationUz} onChange={(e) => setForm({ ...form, translationUz: e.target.value })} multiline rows={4} fullWidth />

            <SectionLabel>Qoʻshimcha</SectionLabel>

            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField label="Davomiyligi (sekund)" type="number" value={form.durationSec} onChange={(e) => setForm({ ...form, durationSec: e.target.value })} fullWidth
                helperText="Ixtiyoriy" />
              <TextField label="Tartib" type="number" value={form.order} onChange={(e) => setForm({ ...form, order: e.target.value })} fullWidth
                helperText="Roʻyxatdagi tartibi" />
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box>
                <Typography variant="body2" fontWeight={600}>Chop etilgan</Typography>
                <Typography variant="caption" color="text.secondary">Foydalanuvchilarga koʻrsatilsinmi</Typography>
              </Box>
              <Switch checked={form.isPublished} onChange={(e) => setForm({ ...form, isPublished: e.target.checked })} color="success" />
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setDialog(null)} color="inherit" disabled={saving}>Bekor qilish</Button>
          <Button variant="contained" onClick={save} disabled={saving || !canSave}>
            {saving ? <CircularProgress size={18} color="inherit" /> : dialog === 'create' ? 'Import qilish' : 'Saqlash'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={!!toast}
        autoHideDuration={3500}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        {toast ? (
          <Alert severity={toast.type} variant="filled" onClose={() => setToast(null)}>{toast.msg}</Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  )
}
