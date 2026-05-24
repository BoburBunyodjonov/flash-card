import { useEffect, useState, useCallback } from 'react'
import {
  Box, Typography, Button, Paper, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, MenuItem, Chip, CircularProgress, Alert,
  IconButton, Tooltip,
} from '@mui/material'
import { DataGrid, type GridColDef } from '@mui/x-data-grid'
import { wordsApi } from '../../api/words.api'
import { categoriesApi } from '../../api/categories.api'

interface Word {
  id: string; word: string; pronunciation: string | null; partOfSpeech: string | null
  difficulty: string; category: { id: string; nameEn: string }
  translations: { translation: string | null }[]
  _count: { userProgress: number }
}
interface Category { id: string; nameEn: string }

const DIFFICULTIES = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
const DIFFICULTY_COLORS: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
  A1: 'success', A2: 'success', B1: 'warning', B2: 'warning', C1: 'error', C2: 'error',
}

const emptyForm = { word: '', pronunciation: '', partOfSpeech: '', difficulty: 'A1', categoryId: '', translation: '', definitionEn: '', exampleEn: '' }

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

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await wordsApi.list({ q: search, page: paginationModel.page + 1, limit: paginationModel.pageSize })
      setRows(data.words); setTotal(data.total)
    } finally { setLoading(false) }
  }, [search, paginationModel])

  useEffect(() => { load() }, [load])
  useEffect(() => { categoriesApi.list().then(setCategories).catch(console.error) }, [])

  const openCreate = () => { setForm(emptyForm); setSelected(null); setError(''); setDialog('create') }
  const openEdit = (word: Word) => {
    setSelected(word)
    setForm({
      word: word.word, pronunciation: word.pronunciation ?? '', partOfSpeech: word.partOfSpeech ?? '',
      difficulty: word.difficulty, categoryId: word.category.id,
      translation: word.translations[0]?.translation ?? '', definitionEn: '', exampleEn: '',
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
    { field: 'word', headerName: 'Word', flex: 1, minWidth: 120 },
    { field: 'pronunciation', headerName: 'Pronunciation', flex: 1, minWidth: 120, valueGetter: (_, row) => row.pronunciation ?? '—' },
    { field: 'partOfSpeech', headerName: 'POS', width: 100, valueGetter: (_, row) => row.partOfSpeech ?? '—' },
    {
      field: 'difficulty', headerName: 'Level', width: 90,
      renderCell: ({ value }) => <Chip label={value} size="small" color={DIFFICULTY_COLORS[value] ?? 'default'} />,
    },
    { field: 'category', headerName: 'Category', flex: 1, minWidth: 120, valueGetter: (_, row) => row.category?.nameEn ?? '—' },
    { field: 'translation', headerName: 'Translation (UZ)', flex: 1, minWidth: 130, valueGetter: (_, row) => row.translations?.[0]?.translation ?? '—' },
    { field: '_count', headerName: 'Learners', width: 90, valueGetter: (_, row) => row._count?.userProgress ?? 0 },
    {
      field: 'actions', headerName: '', width: 120, sortable: false,
      renderCell: ({ row }) => (
        <Box>
          <Tooltip title="Edit">
            <IconButton size="small" onClick={() => openEdit(row)}>✏️</IconButton>
          </Tooltip>
          <Tooltip title="Delete">
            <IconButton size="small" onClick={() => deleteWord(row.id)}>🗑</IconButton>
          </Tooltip>
        </Box>
      ),
    },
  ]

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">Words</Typography>
        <Button variant="contained" onClick={openCreate}>+ Add Word</Button>
      </Box>

      <Paper sx={{ mb: 2, p: 2 }}>
        <TextField size="small" placeholder="Search words…" value={search}
          onChange={(e) => setSearch(e.target.value)} sx={{ width: 300 }} />
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

            <Box sx={{ display: 'flex', gap: 1 }}>
              <TextField label="Word *" value={form.word} onChange={(e) => setForm({ ...form, word: e.target.value })} fullWidth />
              <Button variant="outlined" onClick={fetchDict} disabled={fetchingDict || !form.word} sx={{ minWidth: 120 }}>
                {fetchingDict ? <CircularProgress size={18} /> : '📖 Auto-fill'}
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

            <TextField label="Uzbek Translation" value={form.translation} onChange={(e) => setForm({ ...form, translation: e.target.value })} fullWidth />
            <TextField label="English Definition" value={form.definitionEn} onChange={(e) => setForm({ ...form, definitionEn: e.target.value })} multiline rows={2} fullWidth />
            <TextField label="Example sentence" value={form.exampleEn} onChange={(e) => setForm({ ...form, exampleEn: e.target.value })} fullWidth />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(null)}>Cancel</Button>
          <Button variant="contained" onClick={save} disabled={saving || !form.word || !form.categoryId}>
            {saving ? <CircularProgress size={18} /> : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
