import { useEffect, useState, useCallback } from 'react'
import {
  Box, Typography, Button, Paper, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, MenuItem, Chip, CircularProgress, Alert,
  IconButton, Tooltip, InputAdornment, Divider,
} from '@mui/material'
import { DataGrid, type GridColDef } from '@mui/x-data-grid'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import SearchRoundedIcon from '@mui/icons-material/SearchRounded'
import EditRoundedIcon from '@mui/icons-material/EditRounded'
import DeleteRoundedIcon from '@mui/icons-material/DeleteRounded'
import PeopleAltRoundedIcon from '@mui/icons-material/PeopleAltRounded'
import AutoFixHighRoundedIcon from '@mui/icons-material/AutoFixHighRounded'
import GraphicEqRoundedIcon from '@mui/icons-material/GraphicEqRounded'
import { PageHeader } from '../../components/PageHeader'
import { wordsApi } from '../../api/words.api'
import { categoriesApi } from '../../api/categories.api'

interface Word {
  id: string; word: string; pronunciation: string | null; partOfSpeech: string | null
  audioUrl: string | null; imageUrl: string | null
  difficulty: string; category: { id: string; nameEn: string }
  translations: { translation: string | null; definitionEn: string | null; exampleEn: string | null }[]
  _count: { userProgress: number }
}
interface Category { id: string; nameEn: string }

const DIFFICULTIES = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
const DIFFICULTY_COLORS: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
  A1: 'success', A2: 'success', B1: 'warning', B2: 'warning', C1: 'error', C2: 'error',
}

const emptyForm = { word: '', pronunciation: '', partOfSpeech: '', difficulty: 'A1', categoryId: '', translation: '', definitionEn: '', exampleEn: '', audioUrl: '', imageUrl: '' }

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Divider textAlign="left" sx={{ '&::before, &::after': { borderColor: 'divider' } }}>
      <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'text.secondary' }}>
        {children}
      </Typography>
    </Divider>
  )
}

export function WordsPage() {
  const [rows, setRows] = useState<Word[]>([])
  const [total, setTotal] = useState(0)
  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 20 })
  const [search, setSearch] = useState('')
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(false)
  const [dialog, setDialog] = useState<'create' | 'edit' | null>(null)
  const [selected, setSelected] = useState<Word | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [fetchingDict, setFetchingDict] = useState(false)
  const [error, setError] = useState('')
  const [enriching, setEnriching] = useState(false)
  const [audioStats, setAudioStats] = useState<{
    total: number; with_audio: number; missing_audio: number; tts_configured: boolean
  } | null>(null)
  const [enrichMsg, setEnrichMsg] = useState<string | null>(null)

  const loadAudioStats = useCallback(() => {
    wordsApi.audioStats().then(setAudioStats).catch(console.error)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await wordsApi.list({ q: search, page: paginationModel.page + 1, limit: paginationModel.pageSize })
      setRows(data.words); setTotal(data.total)
    } finally { setLoading(false) }
  }, [search, paginationModel])

  useEffect(() => { load() }, [load])
  useEffect(() => { categoriesApi.list().then(setCategories).catch(console.error) }, [])
  useEffect(() => { loadAudioStats() }, [loadAudioStats])

  const runEnrichAudio = async () => {
    setEnriching(true)
    setEnrichMsg(null)
    try {
      const result = await wordsApi.enrichAudio({ limit: 100, useTts: true })
      setEnrichMsg(
        `Enrich: dict ${result.dictionaryAudio}, TTS ${result.ttsAudio}, defs ${result.definitionsUpdated}, qoldi ${result.remaining}`,
      )
      load()
      loadAudioStats()
    } catch (e: unknown) {
      setEnrichMsg((e as Error).message)
    } finally {
      setEnriching(false)
    }
  }
  const openCreate = () => { setForm(emptyForm); setSelected(null); setError(''); setDialog('create') }
  const openEdit = (word: Word) => {
    setSelected(word)
    setForm({
      word: word.word, pronunciation: word.pronunciation ?? '', partOfSpeech: word.partOfSpeech ?? '',
      difficulty: word.difficulty, categoryId: word.category.id,
      translation: word.translations[0]?.translation ?? '',
      definitionEn: word.translations[0]?.definitionEn ?? '',
      exampleEn: word.translations[0]?.exampleEn ?? '',
      audioUrl: word.audioUrl ?? '', imageUrl: word.imageUrl ?? '',
    })
    setError(''); setDialog('edit')
  }

  const fetchDict = async () => {
    if (!form.word) return
    setFetchingDict(true)
    try {
      const data = await wordsApi.fetchDictionary(form.word)
      if (data) {
        setForm((f) => ({
          ...f,
          pronunciation: data.phonetic ?? f.pronunciation,
          partOfSpeech: data.partOfSpeech ?? f.partOfSpeech,
          definitionEn: data.definition ?? f.definitionEn,
          exampleEn: data.example ?? f.exampleEn,
          audioUrl: data.audioUrl ?? f.audioUrl,
        }))
      }
    } finally { setFetchingDict(false) }
  }

  const save = async () => {
    setSaving(true); setError('')
    try {
      const payload = {
        word: form.word, pronunciation: form.pronunciation || undefined,
        partOfSpeech: form.partOfSpeech || undefined, difficulty: form.difficulty,
        categoryId: form.categoryId,
        audioUrl: form.audioUrl || undefined, imageUrl: form.imageUrl || undefined,
        translation: form.translation || form.definitionEn ? {
          language: 'uz', translation: form.translation || undefined,
          definitionEn: form.definitionEn || undefined, exampleEn: form.exampleEn || undefined,
        } : undefined,
      }
      if (dialog === 'create') await wordsApi.create(payload)
      else if (selected) await wordsApi.update(selected.id, payload)
      setDialog(null); load()
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'Failed to save')
    } finally { setSaving(false) }
  }

  const deleteWord = async (id: string) => {
    if (!confirm('Delete this word?')) return
    await wordsApi.delete(id); load()
  }

  const columns: GridColDef[] = [
    {
      field: 'word', headerName: 'Word', flex: 1, minWidth: 120,
      renderCell: ({ value }) => (
        <Typography variant="body2" sx={{ fontWeight: 700 }}>{value}</Typography>
      ),
    },
    { field: 'pronunciation', headerName: 'Pronunciation', flex: 1, minWidth: 120, valueGetter: (_, row) => row.pronunciation ?? '—' },
    { field: 'partOfSpeech', headerName: 'POS', width: 100, valueGetter: (_, row) => row.partOfSpeech ?? '—' },
    {
      field: 'difficulty', headerName: 'Level', width: 90,
      renderCell: ({ value }) => <Chip label={value} size="small" color={DIFFICULTY_COLORS[value] ?? 'default'} />,
    },
    { field: 'category', headerName: 'Category', flex: 1, minWidth: 120, valueGetter: (_, row) => row.category?.nameEn ?? '—' },
    { field: 'translation', headerName: 'Translation (UZ)', flex: 1, minWidth: 130, valueGetter: (_, row) => row.translations?.[0]?.translation ?? '—' },
    {
      field: '_count', headerName: 'Learners', width: 110,
      valueGetter: (_, row) => row._count?.userProgress ?? 0,
      renderCell: ({ value }) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: 'text.secondary' }}>
          <PeopleAltRoundedIcon sx={{ fontSize: 15 }} />
          <Typography variant="body2">{value}</Typography>
        </Box>
      ),
    },
    {
      field: 'actions', headerName: '', width: 100, sortable: false,
      renderCell: ({ row }) => (
        <Box>
          <Tooltip title="Edit" arrow>
            <IconButton size="small" onClick={() => openEdit(row)} sx={{ color: 'text.secondary', '&:hover': { color: 'primary.light' } }}>
              <EditRoundedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete" arrow>
            <IconButton size="small" onClick={() => deleteWord(row.id)} sx={{ color: 'text.secondary', '&:hover': { color: 'error.main' } }}>
              <DeleteRoundedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      ),
    },
  ]

  return (
    <Box>
      <PageHeader
        title="Words"
        subtitle={
          audioStats
            ? `${total.toLocaleString()} words · audio ${audioStats.with_audio}/${audioStats.total}` +
              (audioStats.missing_audio ? ` · ${audioStats.missing_audio} missing` : '')
            : `${total.toLocaleString()} words in the vocabulary database`
        }
        action={
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="outlined"
              startIcon={enriching ? <CircularProgress size={16} /> : <GraphicEqRoundedIcon />}
              disabled={enriching || (audioStats?.missing_audio === 0)}
              onClick={runEnrichAudio}
            >
              Enrich audio
            </Button>
            <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={openCreate}>
              Add Word
            </Button>
          </Box>
        }
      />

      {enrichMsg && (
        <Alert severity="info" sx={{ mb: 2 }} onClose={() => setEnrichMsg(null)}>{enrichMsg}</Alert>
      )}

      <Paper sx={{ mb: 2, p: 2 }}>
        <TextField
          size="small"
          placeholder="Search words…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ width: 320 }}
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

      <Dialog open={!!dialog} onClose={() => setDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{dialog === 'create' ? 'Add Word' : 'Edit Word'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}

            <SectionLabel>Word info</SectionLabel>

            <Box sx={{ display: 'flex', gap: 1 }}>
              <TextField label="Word *" value={form.word} onChange={(e) => setForm({ ...form, word: e.target.value })} fullWidth />
              <Button
                variant="outlined"
                onClick={fetchDict}
                disabled={fetchingDict || !form.word}
                startIcon={fetchingDict ? <CircularProgress size={16} /> : <AutoFixHighRoundedIcon />}
                sx={{ minWidth: 130, flexShrink: 0 }}
              >
                Auto-fill
              </Button>
            </Box>

            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField label="Pronunciation" value={form.pronunciation} onChange={(e) => setForm({ ...form, pronunciation: e.target.value })} fullWidth />
              <TextField label="Part of speech" value={form.partOfSpeech} onChange={(e) => setForm({ ...form, partOfSpeech: e.target.value })} fullWidth />
            </Box>

            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField select label="Difficulty *" value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })} fullWidth>
                {DIFFICULTIES.map((d) => <MenuItem key={d} value={d}>{d}</MenuItem>)}
              </TextField>
              <TextField select label="Category *" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} fullWidth>
                {categories.map((c) => <MenuItem key={c.id} value={c.id}>{c.nameEn}</MenuItem>)}
              </TextField>
            </Box>

            <SectionLabel>Translation</SectionLabel>

            <TextField label="Uzbek Translation" value={form.translation} onChange={(e) => setForm({ ...form, translation: e.target.value })} fullWidth />
            <TextField label="English Definition" value={form.definitionEn} onChange={(e) => setForm({ ...form, definitionEn: e.target.value })} multiline rows={2} fullWidth />
            <TextField label="Example sentence" value={form.exampleEn} onChange={(e) => setForm({ ...form, exampleEn: e.target.value })} fullWidth />

            <SectionLabel>Media</SectionLabel>

            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField label="Audio URL" value={form.audioUrl} onChange={(e) => setForm({ ...form, audioUrl: e.target.value })} fullWidth
                helperText="Auto-filled from dictionary when available" />
              <TextField label="Image URL" value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} fullWidth
                helperText="Shown on the flashcard" />
            </Box>
            {form.imageUrl && (
              <Box component="img" src={form.imageUrl} alt="preview"
                sx={{ maxHeight: 120, borderRadius: 2, objectFit: 'cover', alignSelf: 'flex-start', border: '1px solid', borderColor: 'divider' }}
                onError={(e: any) => { e.currentTarget.style.display = 'none' }} />
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setDialog(null)} color="inherit">Cancel</Button>
          <Button variant="contained" onClick={save} disabled={saving || !form.word || !form.categoryId}>
            {saving ? <CircularProgress size={18} color="inherit" /> : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
