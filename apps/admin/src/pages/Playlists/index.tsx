import { useEffect, useMemo, useState } from 'react'
import {
  Box, Button, Card, CardContent, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, FormControl, FormControlLabel, IconButton,
  InputLabel, MenuItem, Select, Stack, Switch, TextField, Typography, alpha,
} from '@mui/material'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import DeleteRoundedIcon from '@mui/icons-material/DeleteRounded'
import EditRoundedIcon from '@mui/icons-material/EditRounded'
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded'
import ArrowDownwardRoundedIcon from '@mui/icons-material/ArrowDownwardRounded'
import PlaylistPlayRoundedIcon from '@mui/icons-material/PlaylistPlayRounded'
import MovieRoundedIcon from '@mui/icons-material/MovieRounded'
import VideocamRoundedIcon from '@mui/icons-material/VideocamRounded'
import {
  playlistsApi,
  type Playlist,
  type PlaylistInput,
  type PlaylistItem,
  type PlaylistType,
  type CEFRLevel,
  type MediaKind,
} from '../../api/playlists.api'
import { cinemaApi, type CinemaClip } from '../../api/cinema.api'
import { shadowingApi, type Clip as ShadowingClip } from '../../api/shadowing.api'

const LEVELS: CEFRLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
const TYPES: PlaylistType[] = ['mixed', 'cinema', 'shadowing']

type EditableItem = { kind: MediaKind; clipId: string; title: string | null; level: CEFRLevel | null }

const emptyForm: PlaylistInput = {
  title: '',
  description: '',
  type: 'mixed',
  level: null,
  isPublished: true,
}

export function PlaylistsPage() {
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [loading, setLoading] = useState(true)
  const [cinemaClips, setCinemaClips] = useState<CinemaClip[]>([])
  const [shadowingClips, setShadowingClips] = useState<ShadowingClip[]>([])

  const [editing, setEditing] = useState<Playlist | null>(null)
  const [form, setForm] = useState<PlaylistInput>(emptyForm)
  const [items, setItems] = useState<EditableItem[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const [addKind, setAddKind] = useState<MediaKind>('cinema')
  const [addClipId, setAddClipId] = useState('')

  const load = () => {
    setLoading(true)
    Promise.all([playlistsApi.list(), cinemaApi.clips(), shadowingApi.clips()])
      .then(([pls, cc, sc]) => {
        setPlaylists(pls)
        setCinemaClips(cc)
        setShadowingClips(sc)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const clipTitle = (kind: MediaKind, clipId: string): { title: string | null; level: CEFRLevel | null } => {
    if (kind === 'cinema') {
      const c = cinemaClips.find((x) => x.id === clipId)
      return { title: c?.title ?? null, level: c?.level ?? null }
    }
    const s = shadowingClips.find((x) => x.id === clipId)
    return { title: s?.title ?? null, level: s?.level ?? null }
  }

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setItems([])
    setAddKind('cinema')
    setAddClipId('')
    setDialogOpen(true)
  }

  const openEdit = async (p: Playlist) => {
    setEditing(p)
    setForm({
      title: p.title,
      description: p.description ?? '',
      coverUrl: p.coverUrl ?? '',
      type: p.type,
      level: p.level,
      isPublished: p.isPublished,
      order: p.order,
    })
    setDialogOpen(true)
    try {
      const full = await playlistsApi.get(p.id)
      setItems(
        (full.items ?? []).map((it: PlaylistItem) => ({
          kind: it.kind,
          clipId: it.clipId,
          title: it.title,
          level: it.level,
        })),
      )
    } catch {
      setItems([])
    }
  }

  const availableClips = useMemo(() => {
    const chosen = new Set(items.map((i) => `${i.kind}:${i.clipId}`))
    if (addKind === 'cinema') {
      return cinemaClips.filter((c) => !chosen.has(`cinema:${c.id}`))
    }
    return shadowingClips.filter((c) => !chosen.has(`shadowing:${c.id}`))
  }, [addKind, addClipId, items, cinemaClips, shadowingClips])

  const addItem = () => {
    if (!addClipId) return
    const meta = clipTitle(addKind, addClipId)
    setItems((prev) => [...prev, { kind: addKind, clipId: addClipId, ...meta }])
    setAddClipId('')
  }

  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx))

  const moveItem = (idx: number, dir: -1 | 1) => {
    setItems((prev) => {
      const next = [...prev]
      const target = idx + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return next
    })
  }

  const save = async () => {
    if (!form.title.trim()) return
    setSaving(true)
    try {
      const payload: PlaylistInput = {
        ...form,
        description: form.description || null,
        coverUrl: form.coverUrl || null,
      }
      const playlist = editing
        ? await playlistsApi.update(editing.id, payload)
        : await playlistsApi.create(payload)
      await playlistsApi.setItems(
        playlist.id,
        items.map((i) => ({ kind: i.kind, clipId: i.clipId })),
      )
      setDialogOpen(false)
      load()
    } catch {
      // keep dialog open on error
    } finally {
      setSaving(false)
    }
  }

  const remove = async (p: Playlist) => {
    if (!window.confirm(`Delete playlist "${p.title}"?`)) return
    await playlistsApi.delete(p.id)
    load()
  }

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={800}>Playlists / Series</Typography>
          <Typography variant="body2" color="text.secondary">
            Cinema va Shadowing kliplaridan ketma-ket seriyalar tuzing
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={openCreate}>
          New Playlist
        </Button>
      </Stack>

      {loading ? (
        <Box display="flex" justifyContent="center" py={8}><CircularProgress /></Box>
      ) : playlists.length === 0 ? (
        <Card><CardContent>
          <Typography color="text.secondary" textAlign="center" py={4}>
            Hali playlist yo'q. "New Playlist" tugmasi bilan yarating.
          </Typography>
        </CardContent></Card>
      ) : (
        <Stack spacing={1.5}>
          {playlists.map((p) => (
            <Card key={p.id} variant="outlined">
              <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Box sx={{ width: 44, height: 44, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: (t) => alpha(t.palette.primary.main, 0.14) }}>
                  <PlaylistPlayRoundedIcon color="primary" />
                </Box>
                <Box flexGrow={1} minWidth={0}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography fontWeight={700} noWrap>{p.title}</Typography>
                    <Chip size="small" label={p.type} />
                    {p.level && <Chip size="small" variant="outlined" label={p.level} />}
                    {!p.isPublished && <Chip size="small" color="warning" label="Draft" />}
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    {p.itemCount} ta video{p.description ? ` · ${p.description}` : ''}
                  </Typography>
                </Box>
                <IconButton onClick={() => openEdit(p)}><EditRoundedIcon /></IconButton>
                <IconButton color="error" onClick={() => remove(p)}><DeleteRoundedIcon /></IconButton>
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? 'Edit Playlist' : 'New Playlist'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} mt={1}>
            <TextField
              label="Title" fullWidth value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
            <TextField
              label="Description" fullWidth multiline minRows={2} value={form.description ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
            <TextField
              label="Cover URL (optional)" fullWidth value={form.coverUrl ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, coverUrl: e.target.value }))}
            />
            <Stack direction="row" spacing={2}>
              <FormControl fullWidth>
                <InputLabel>Type</InputLabel>
                <Select
                  label="Type" value={form.type ?? 'mixed'}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as PlaylistType }))}
                >
                  {TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                </Select>
              </FormControl>
              <FormControl fullWidth>
                <InputLabel>Level</InputLabel>
                <Select
                  label="Level" value={form.level ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, level: (e.target.value || null) as CEFRLevel | null }))}
                >
                  <MenuItem value="">—</MenuItem>
                  {LEVELS.map((l) => <MenuItem key={l} value={l}>{l}</MenuItem>)}
                </Select>
              </FormControl>
            </Stack>
            <FormControlLabel
              control={
                <Switch
                  checked={form.isPublished ?? true}
                  onChange={(e) => setForm((f) => ({ ...f, isPublished: e.target.checked }))}
                />
              }
              label="Published"
            />

            <Divider textAlign="left">Videos ({items.length})</Divider>

            <Stack spacing={1}>
              {items.map((it, idx) => (
                <Stack key={`${it.kind}:${it.clipId}`} direction="row" spacing={1} alignItems="center"
                  sx={{ p: 1, borderRadius: 1.5, bgcolor: 'action.hover' }}>
                  {it.kind === 'cinema'
                    ? <MovieRoundedIcon fontSize="small" color="action" />
                    : <VideocamRoundedIcon fontSize="small" color="action" />}
                  <Box flexGrow={1} minWidth={0}>
                    <Typography variant="body2" fontWeight={600} noWrap>
                      {it.title ?? '(missing clip)'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {it.kind}{it.level ? ` · ${it.level}` : ''}
                    </Typography>
                  </Box>
                  <IconButton size="small" disabled={idx === 0} onClick={() => moveItem(idx, -1)}>
                    <ArrowUpwardRoundedIcon fontSize="small" />
                  </IconButton>
                  <IconButton size="small" disabled={idx === items.length - 1} onClick={() => moveItem(idx, 1)}>
                    <ArrowDownwardRoundedIcon fontSize="small" />
                  </IconButton>
                  <IconButton size="small" color="error" onClick={() => removeItem(idx)}>
                    <DeleteRoundedIcon fontSize="small" />
                  </IconButton>
                </Stack>
              ))}
            </Stack>

            <Stack direction="row" spacing={1} alignItems="center">
              <FormControl sx={{ minWidth: 130 }}>
                <InputLabel>Kind</InputLabel>
                <Select
                  label="Kind" value={addKind}
                  onChange={(e) => { setAddKind(e.target.value as MediaKind); setAddClipId('') }}
                >
                  <MenuItem value="cinema">Cinema</MenuItem>
                  <MenuItem value="shadowing">Shadowing</MenuItem>
                </Select>
              </FormControl>
              <FormControl fullWidth>
                <InputLabel>Clip</InputLabel>
                <Select label="Clip" value={addClipId} onChange={(e) => setAddClipId(e.target.value)}>
                  {availableClips.map((c) => (
                    <MenuItem key={c.id} value={c.id}>{c.title} ({c.level})</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Button variant="outlined" onClick={addItem} disabled={!addClipId}>Add</Button>
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={save} disabled={saving || !form.title.trim()}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
