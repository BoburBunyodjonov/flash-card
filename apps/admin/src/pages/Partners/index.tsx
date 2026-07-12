import { useCallback, useEffect, useState } from 'react'
import {
  Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, FormControl, FormControlLabel, IconButton, InputLabel,
  MenuItem, Paper, Select, Switch, TextField, Tooltip, Typography, Alert,
  Divider, alpha,
} from '@mui/material'
import { DataGrid, type GridColDef } from '@mui/x-data-grid'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import SyncRoundedIcon from '@mui/icons-material/SyncRounded'
import VpnKeyRoundedIcon from '@mui/icons-material/VpnKeyRounded'
import WebhookRoundedIcon from '@mui/icons-material/WebhookRounded'
import EditRoundedIcon from '@mui/icons-material/EditRounded'
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded'
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded'
import HubRoundedIcon from '@mui/icons-material/HubRounded'
import { PageHeader } from '../../components/PageHeader'
import { downloadPartnerIntegrationKit } from '../../lib/integrationKitDownload'
import {
  partnersApi,
  type ConnectorType,
  type Partner,
  type PartnerDetail,
  type PartnerAccessMode,
  type WebhookDelivery,
} from '../../api/partners.api'

const CONNECTORS: { value: ConnectorType; label: string; hint: string }[] = [
  { value: 'manual', label: 'Manual (ERP pushes API)', hint: 'Markaz o\'z ERP dan POST qiladi' },
  { value: 'generic_rest', label: 'Generic REST pull', hint: 'URL dan staff/groups/learners JSON' },
  { value: 'edupage', label: 'EduPage', hint: 'edupage.org login (telefon EduPage da bo\'lishi kerak)' },
]

const emptyForm = () => ({
  name: '',
  slug: '',
  accessMode: 'benefit_only' as PartnerAccessMode,
  premiumIncluded: true,
  webhookUrl: '',
  webhookSecret: '',
  connector: 'manual' as ConnectorType,
  genericBundleUrl: '',
  genericAuthHeader: '',
  edupageUsername: '',
  edupagePassword: '',
  edupageSchool: '',
  edupagePhoneField: 'phone',
})

function buildMetadata(form: ReturnType<typeof emptyForm>) {
  const metadata: Record<string, unknown> = { connector: form.connector }
  if (form.connector === 'generic_rest') {
    metadata.generic_rest = {
      bundle_url: form.genericBundleUrl || undefined,
      auth_header: form.genericAuthHeader || undefined,
    }
  }
  if (form.connector === 'edupage') {
    metadata.edupage = {
      username: form.edupageUsername,
      password: form.edupagePassword,
      school_subdomain: form.edupageSchool,
      student_phone_field: form.edupagePhoneField || undefined,
    }
  }
  return metadata
}

function metaHasEdupagePassword(detail: PartnerDetail) {
  const ed = (detail.metadata?.edupage ?? {}) as Record<string, unknown>
  return Boolean(ed.password_set)
}

function metaHasAuthHeader(detail: PartnerDetail) {
  const gr = (detail.metadata?.generic_rest ?? {}) as Record<string, unknown>
  return Boolean(gr.auth_header_set)
}

export function PartnersPage() {
  const [rows, setRows] = useState<Partner[]>([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<PartnerDetail | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [apiKeyDialog, setApiKeyDialog] = useState<{
    apiKey: string
    partner: Pick<Partner, 'id' | 'name' | 'slug'>
  } | null>(null)
  const [kitDownloading, setKitDownloading] = useState<string | null>(null)
  const [webhookRows, setWebhookRows] = useState<WebhookDelivery[]>([])
  const [webhookPartner, setWebhookPartner] = useState<Partner | null>(null)
  const [syncing, setSyncing] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await partnersApi.list())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm())
    setFormOpen(true)
  }

  const openEdit = async (row: Partner) => {
    const detail = await partnersApi.get(row.id)
    setEditing(detail)
    const meta = detail.metadata ?? {}
    const gr = (meta.generic_rest ?? {}) as Record<string, string>
    const ed = (meta.edupage ?? {}) as Record<string, string>
    setForm({
      name: detail.name,
      slug: detail.slug,
      accessMode: detail.accessMode,
      premiumIncluded: detail.premiumIncluded,
      webhookUrl: detail.webhookUrl ?? '',
      webhookSecret: '',
      connector: (detail.connector as ConnectorType) ?? 'manual',
      genericBundleUrl: gr.bundle_url ?? '',
      genericAuthHeader: '',
      edupageUsername: ed.username ?? '',
      edupagePassword: '',
      edupageSchool: ed.school_subdomain ?? '',
      edupagePhoneField: ed.student_phone_field ?? 'phone',
    })
    setFormOpen(true)
  }

  const save = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const payload = {
        name: form.name,
        slug: form.slug || undefined,
        accessMode: form.accessMode,
        premiumIncluded: form.premiumIncluded,
        webhookUrl: form.webhookUrl || null,
        webhookSecret: form.webhookSecret || (editing ? undefined : null),
        metadata: buildMetadata(form),
      }
      if (editing) {
        await partnersApi.update(editing.id, payload)
      } else {
        const res = await partnersApi.create(payload)
        setApiKeyDialog({
          apiKey: res.data.apiKey,
          partner: { id: res.data.id, name: res.data.name, slug: res.data.slug },
        })
      }
      setFormOpen(false)
      load()
    } catch (e: unknown) {
      setMessage((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const rotateKey = async (row: Partner) => {
    const res = await partnersApi.rotateKey(row.id)
    setApiKeyDialog({
      apiKey: res.data.apiKey,
      partner: { id: row.id, name: row.name, slug: row.slug },
    })
  }

  const downloadKit = async (partner: Pick<Partner, 'id' | 'name' | 'slug'>, apiKey?: string) => {
    setKitDownloading(partner.id)
    setMessage(null)
    try {
      await downloadPartnerIntegrationKit(partner, apiKey)
      setMessage(`Integratsiya paketi yuklandi: ${partner.slug}`)
    } catch (e: unknown) {
      setMessage((e as Error).message)
    } finally {
      setKitDownloading(null)
    }
  }

  const runSync = async (id: string) => {
    setSyncing(id)
    setMessage(null)
    try {
      const result = await partnersApi.sync(id)
      setMessage(
        `Sync: +${result.learners.created} learners, +${result.staff.created} staff, +${result.groups.created} groups` +
        (result.warnings?.length ? ` | ${result.warnings.join('; ')}` : ''),
      )
      load()
    } catch (e: unknown) {
      setMessage((e as Error).message)
    } finally {
      setSyncing(null)
    }
  }

  const showWebhooks = async (row: Partner) => {
    setWebhookPartner(row)
    setWebhookRows(await partnersApi.webhooks(row.id))
  }

  const columns: GridColDef[] = [
    { field: 'name', headerName: 'Markaz', flex: 1, minWidth: 160 },
    { field: 'slug', headerName: 'Slug', width: 140 },
    {
      field: 'status', headerName: 'Status', width: 110,
      renderCell: ({ value }) => (
        <Chip size="small" label={value} color={value === 'active' ? 'success' : 'default'} />
      ),
    },
    {
      field: 'connector', headerName: 'Connector', width: 130,
      renderCell: ({ value }) => <Chip size="small" variant="outlined" label={value} />,
    },
    { field: 'enrollmentsCount', headerName: 'O\'quvchilar', width: 100 },
    { field: 'apiKeyPrefix', headerName: 'API key', width: 120 },
    {
      field: 'actions', headerName: '', width: 240, sortable: false,
      renderCell: ({ row }) => (
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <Tooltip title="Integratsiya paketi (ZIP)">
            <IconButton size="small" disabled={kitDownloading === row.id}
              onClick={() => downloadKit(row)}>
              {kitDownloading === row.id
                ? <CircularProgress size={18} />
                : <DownloadRoundedIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
          <Tooltip title="Edit">
            <IconButton size="small" onClick={() => openEdit(row)}><EditRoundedIcon fontSize="small" /></IconButton>
          </Tooltip>
          <Tooltip title="ERP sync">
            <IconButton size="small" disabled={row.connector === 'manual' || syncing === row.id}
              onClick={() => runSync(row.id)}>
              {syncing === row.id ? <CircularProgress size={18} /> : <SyncRoundedIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
          <Tooltip title="Webhooks">
            <IconButton size="small" onClick={() => showWebhooks(row)}><WebhookRoundedIcon fontSize="small" /></IconButton>
          </Tooltip>
          <Tooltip title="Rotate API key">
            <IconButton size="small" onClick={() => rotateKey(row)}><VpnKeyRoundedIcon fontSize="small" /></IconButton>
          </Tooltip>
        </Box>
      ),
    },
  ]

  return (
    <Box>
      <PageHeader
        title="ERP Partners"
        subtitle="O'quv markazlar integratsiyasi — API kalit, webhook, connector"
        action={
          <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={openCreate}>
            Yangi markaz
          </Button>
        }
      />

      {message && (
        <Alert severity="info" sx={{ mb: 2 }} onClose={() => setMessage(null)}>{message}</Alert>
      )}

      <Paper sx={{ height: 520 }}>
        <DataGrid
          rows={rows}
          columns={columns}
          loading={loading}
          getRowId={(r) => r.id}
          disableRowSelectionOnClick
          pageSizeOptions={[10, 20]}
          initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
        />
      </Paper>

      <Dialog open={formOpen} onClose={() => setFormOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? 'Markazni tahrirlash' : 'Yangi markaz'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <TextField label="Nomi" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} fullWidth />
          <TextField label="Slug (ixtiyoriy)" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} fullWidth />
          <FormControl fullWidth>
            <InputLabel>Access mode</InputLabel>
            <Select label="Access mode" value={form.accessMode}
              onChange={(e) => setForm({ ...form, accessMode: e.target.value as PartnerAccessMode })}>
              <MenuItem value="benefit_only">Benefit only</MenuItem>
              <MenuItem value="whitelist">Whitelist</MenuItem>
            </Select>
          </FormControl>
          <FormControlLabel control={<Switch checked={form.premiumIncluded}
            onChange={(e) => setForm({ ...form, premiumIncluded: e.target.checked })} />}
            label="Premium included" />

          <Divider />
          <Typography variant="subtitle2" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <WebhookRoundedIcon fontSize="small" /> Outbound webhook
          </Typography>
          <TextField label="Webhook URL" value={form.webhookUrl} onChange={(e) => setForm({ ...form, webhookUrl: e.target.value })} fullWidth />
          <TextField label="Webhook secret (HMAC)" type="password" value={form.webhookSecret}
            placeholder={editing?.hasWebhookSecret ? '•••• (o\'zgartirish uchun yozing)' : ''}
            onChange={(e) => setForm({ ...form, webhookSecret: e.target.value })} fullWidth />

          <Divider />
          <Typography variant="subtitle2" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <HubRoundedIcon fontSize="small" /> ERP Connector
          </Typography>
          <FormControl fullWidth>
            <InputLabel>Connector</InputLabel>
            <Select label="Connector" value={form.connector}
              onChange={(e) => setForm({ ...form, connector: e.target.value as ConnectorType })}>
              {CONNECTORS.map((c) => (
                <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <Typography variant="caption" color="text.secondary">
            {CONNECTORS.find((c) => c.value === form.connector)?.hint}
          </Typography>

          {form.connector === 'generic_rest' && (
            <>
              <TextField label="Bundle URL (JSON: staff, groups, learners)" value={form.genericBundleUrl}
                onChange={(e) => setForm({ ...form, genericBundleUrl: e.target.value })} fullWidth />
              <TextField label="Auth header (Bearer …)" value={form.genericAuthHeader}
                type="password"
                placeholder={editing && metaHasAuthHeader(editing) ? '•••• (o\'zgartirish uchun yozing)' : undefined}
                onChange={(e) => setForm({ ...form, genericAuthHeader: e.target.value })} fullWidth />
            </>
          )}

          {form.connector === 'edupage' && (
            <>
              <TextField label="EduPage username" value={form.edupageUsername}
                onChange={(e) => setForm({ ...form, edupageUsername: e.target.value })} fullWidth />
              <TextField label="EduPage password" type="password" value={form.edupagePassword}
                placeholder={editing && metaHasEdupagePassword(editing) ? '•••• (o\'zgartirish uchun yozing)' : undefined}
                onChange={(e) => setForm({ ...form, edupagePassword: e.target.value })} fullWidth />
              <TextField label="School subdomain" placeholder="maktab"
                value={form.edupageSchool} onChange={(e) => setForm({ ...form, edupageSchool: e.target.value })} fullWidth />
              <TextField label="Student phone field" value={form.edupagePhoneField}
                onChange={(e) => setForm({ ...form, edupagePhoneField: e.target.value })} fullWidth />
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFormOpen(false)}>Bekor</Button>
          <Button variant="contained" onClick={save} disabled={saving || !form.name.trim()}>
            {saving ? <CircularProgress size={20} /> : 'Saqlash'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!apiKeyDialog} onClose={() => setApiKeyDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle>API kalit — bir marta ko'rsatiladi</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            Kalitni saqlang va markazga <strong>Integratsiya paketi (ZIP)</strong> ni yuboring — ichida API kalit va to'liq hujjat bor.
          </Alert>
          <Paper sx={{ p: 2, bgcolor: alpha('#6366f1', 0.1), fontFamily: 'monospace', wordBreak: 'break-all' }}>
            {apiKeyDialog?.apiKey}
          </Paper>
        </DialogContent>
        <DialogActions sx={{ flexWrap: 'wrap', gap: 1, px: 3, pb: 2 }}>
          <Button startIcon={<ContentCopyRoundedIcon />}
            onClick={() => apiKeyDialog && navigator.clipboard.writeText(apiKeyDialog.apiKey)}>
            Nusxalash
          </Button>
          <Button
            variant="outlined"
            startIcon={kitDownloading ? <CircularProgress size={16} /> : <DownloadRoundedIcon />}
            disabled={!apiKeyDialog || kitDownloading === apiKeyDialog.partner.id}
            onClick={() => apiKeyDialog && downloadKit(apiKeyDialog.partner, apiKeyDialog.apiKey)}
          >
            Integratsiya paketi (ZIP)
          </Button>
          <Button variant="contained" onClick={() => setApiKeyDialog(null)}>Tushundim</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!webhookPartner} onClose={() => setWebhookPartner(null)} maxWidth="md" fullWidth>
        <DialogTitle>Webhook tarixi — {webhookPartner?.name}</DialogTitle>
        <DialogContent>
          <Button size="small" sx={{ mb: 2 }} onClick={async () => {
            if (!webhookPartner) return
            await partnersApi.testWebhook(webhookPartner.id)
            setWebhookRows(await partnersApi.webhooks(webhookPartner.id))
          }}>Test webhook yuborish</Button>
          {webhookRows.length === 0 ? (
            <Typography color="text.secondary">Hali webhook yuborilmagan</Typography>
          ) : (
            webhookRows.map((w) => (
              <Box key={w.id} sx={{ py: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" fontWeight={600}>{w.event}</Typography>
                  <Chip size="small" color={w.success ? 'success' : 'error'} label={w.success ? 'OK' : 'FAIL'} />
                </Box>
                <Typography variant="caption" color="text.secondary">
                  {new Date(w.createdAt).toLocaleString()} · HTTP {w.statusCode ?? '—'} · {w.durationMs ?? 0}ms
                  {w.error ? ` · ${w.error}` : ''}
                </Typography>
              </Box>
            ))
          )}
        </DialogContent>
        <DialogActions><Button onClick={() => setWebhookPartner(null)}>Yopish</Button></DialogActions>
      </Dialog>
    </Box>
  )
}
