import { useEffect, useState } from 'react'
import {
  Box, Typography, Button, Paper, List, ListItem, ListItemText,
  Switch, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Chip, Tooltip, CircularProgress,
} from '@mui/material'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import EditRoundedIcon from '@mui/icons-material/EditRounded'
import DeleteRoundedIcon from '@mui/icons-material/DeleteRounded'
import WorkspacePremiumRoundedIcon from '@mui/icons-material/WorkspacePremiumRounded'
import { PageHeader } from '../../components/PageHeader'
import { categoriesApi } from '../../api/categories.api'

interface Category {
  id: string; nameUz: string; nameEn: string; nameRu: string
  icon: string | null; color: string; isPremium: boolean; order: number
  _count: { words: number }
}

const empty = { nameUz: '', nameEn: '', nameRu: '', icon: '', color: '#2D9B6F', isPremium: false, order: 0 }

export function CategoriesPage() {
  const [list, setList] = useState<Category[]>([])
  const [dialog, setDialog] = useState<'create' | 'edit' | null>(null)
  const [selected, setSelected] = useState<Category | null>(null)
  const [form, setForm] = useState(empty)
  const [saving, setSaving] = useState(false)

  const load = () => categoriesApi.list().then(setList).catch(console.error)
  useEffect(() => { load() }, [])

  const openCreate = () => { setForm(empty); setSelected(null); setDialog('create') }
  const openEdit = (cat: Category) => {
    setSelected(cat)
    setForm({ nameUz: cat.nameUz, nameEn: cat.nameEn, nameRu: cat.nameRu, icon: cat.icon ?? '', color: cat.color, isPremium: cat.isPremium, order: cat.order })
    setDialog('edit')
  }

  const togglePremium = async (cat: Category) => {
    await categoriesApi.update(cat.id, { isPremium: !cat.isPremium })
    load()
  }

  const deleteCategory = async (cat: Category) => {
    if (cat._count.words > 0) { alert(`Cannot delete: ${cat._count.words} words in this category`); return }
    if (!confirm(`Delete "${cat.nameEn}"?`)) return
    await categoriesApi.delete(cat.id); load()
  }

  const save = async () => {
    setSaving(true)
    try {
      if (dialog === 'create') await categoriesApi.create(form)
      else if (selected) await categoriesApi.update(selected.id, form)
      setDialog(null); load()
    } finally { setSaving(false) }
  }

  return (
    <Box>
      <PageHeader
        title="Categories"
        subtitle="Organize the vocabulary into themed groups"
        action={
          <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={openCreate}>
            Add Category
          </Button>
        }
      />

      <Paper>
        <List disablePadding>
          {list.map((cat, i) => (
            <ListItem
              key={cat.id}
              divider={i < list.length - 1}
              sx={{ py: 1.5, transition: 'background 0.15s ease', '&:hover': { bgcolor: 'rgba(255,255,255,0.025)' } }}
              secondaryAction={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Chip label={`${cat._count.words} words`} size="small" variant="outlined" />
                  <Tooltip title={cat.isPremium ? 'Premium (click to make free)' : 'Free (click to make premium)'} arrow>
                    <Switch checked={cat.isPremium} onChange={() => togglePremium(cat)} color="warning" size="small" />
                  </Tooltip>
                  <Tooltip title="Edit" arrow>
                    <IconButton size="small" onClick={() => openEdit(cat)} sx={{ color: 'text.secondary', '&:hover': { color: 'primary.light' } }}>
                      <EditRoundedIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Delete" arrow>
                    <IconButton size="small" onClick={() => deleteCategory(cat)} sx={{ color: 'text.secondary', '&:hover': { color: 'error.main' } }}>
                      <DeleteRoundedIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
              }
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mr: 2 }}>
                <Box sx={{ width: 4, height: 40, borderRadius: 2, bgcolor: cat.color }} />
                {cat.icon && <Typography sx={{ fontSize: 22 }}>{cat.icon}</Typography>}
                <ListItemText
                  primary={cat.nameEn}
                  secondary={`${cat.nameUz} / ${cat.nameRu}`}
                  primaryTypographyProps={{ fontWeight: 700 }}
                />
                {cat.isPremium && (
                  <Chip
                    icon={<WorkspacePremiumRoundedIcon sx={{ fontSize: 15 }} />}
                    label="Premium"
                    size="small"
                    color="warning"
                  />
                )}
              </Box>
            </ListItem>
          ))}
        </List>
      </Paper>

      <Dialog open={!!dialog} onClose={() => setDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{dialog === 'create' ? 'Add Category' : 'Edit Category'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField label="English name *" value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} fullWidth />
              <TextField label="Icon (emoji)" value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} sx={{ width: 140 }} />
            </Box>
            <TextField label="Uzbek name *" value={form.nameUz} onChange={(e) => setForm({ ...form, nameUz: e.target.value })} fullWidth />
            <TextField label="Russian name *" value={form.nameRu} onChange={(e) => setForm({ ...form, nameRu: e.target.value })} fullWidth />
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
              <TextField label="Color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} fullWidth />
              <Box sx={{ width: 40, height: 40, borderRadius: 2, bgcolor: form.color, flexShrink: 0, border: '1px solid', borderColor: 'divider' }} />
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box>
                <Typography variant="body2" fontWeight={600}>Premium only</Typography>
                <Typography variant="caption" color="text.secondary">Restrict this category to premium users</Typography>
              </Box>
              <Switch checked={form.isPremium} onChange={(e) => setForm({ ...form, isPremium: e.target.checked })} color="warning" />
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setDialog(null)} color="inherit">Cancel</Button>
          <Button variant="contained" onClick={save} disabled={saving || !form.nameEn}>
            {saving ? <CircularProgress size={18} color="inherit" /> : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
