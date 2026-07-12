import { useEffect, useState } from 'react'
import {
  Box, Typography, Paper, Grid, TextField, Switch,
  Divider, Button, CircularProgress, Chip, alpha,
} from '@mui/material'
import SaveRoundedIcon from '@mui/icons-material/SaveRounded'
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded'
import LockOpenRoundedIcon from '@mui/icons-material/LockOpenRounded'
import ToggleOnRoundedIcon from '@mui/icons-material/ToggleOnRounded'
import FeedRoundedIcon from '@mui/icons-material/FeedRounded'
import WorkspacePremiumRoundedIcon from '@mui/icons-material/WorkspacePremiumRounded'
import { PageHeader } from '../../components/PageHeader'
import { settingsApi } from '../../api/settings.api'

interface Settings { [key: string]: number | boolean }

interface FieldDef {
  key: string
  label: string
  type: 'number' | 'boolean'
  unit?: string
  description?: string
}

const FREE_LIMITS: FieldDef[] = [
  { key: 'free_daily_swipe_limit', label: 'Daily swipe limit', type: 'number', unit: 'cards', description: 'Max cards free user can swipe per day' },
  { key: 'free_max_decks', label: 'Max custom decks', type: 'number', unit: 'decks', description: 'Max number of custom decks for free user' },
  { key: 'free_max_words_per_deck', label: 'Max words per deck', type: 'number', unit: 'words', description: 'Max words allowed in a free deck' },
  { key: 'free_ad_frequency', label: 'Ad frequency', type: 'number', unit: 'cards', description: 'Show ad after every N cards' },
]

const FEATURE_FLAGS: FieldDef[] = [
  { key: 'global_feed_enabled', label: 'Global word feed', type: 'boolean', description: 'Show admin-curated words in the swipe feed. Off = users only study their own words.' },
]

const FREE_FEATURES: FieldDef[] = [
  { key: 'free_audio_enabled', label: 'Audio pronunciation', type: 'boolean', description: 'Allow free users to hear word audio' },
  { key: 'free_offline_enabled', label: 'Offline mode', type: 'boolean', description: 'Allow free users to use offline mode' },
  { key: 'free_friends_leaderboard_enabled', label: 'Friends leaderboard', type: 'boolean', description: 'Allow free users to see friends ranking' },
]

const PRICES: FieldDef[] = [
  { key: 'premium_monthly_price_uzs', label: 'Monthly (UZS)', type: 'number', unit: 'UZS' },
  { key: 'premium_monthly_price_usd', label: 'Monthly (USD)', type: 'number', unit: '$' },
  { key: 'premium_annual_price_uzs', label: 'Annual (UZS)', type: 'number', unit: 'UZS' },
  { key: 'premium_annual_price_usd', label: 'Annual (USD)', type: 'number', unit: '$' },
  { key: 'premium_lifetime_price_uzs', label: 'Lifetime (UZS)', type: 'number', unit: 'UZS' },
  { key: 'premium_lifetime_price_usd', label: 'Lifetime (USD)', type: 'number', unit: '$' },
  { key: 'premium_discount_percent', label: 'Discount %', type: 'number', unit: '%', description: 'Shown as "X% OFF" on pricing page' },
  { key: 'premium_trial_days', label: 'Trial days', type: 'number', unit: 'days', description: 'Free trial duration (0 = no trial)' },
]

function SectionTitle({ icon, color, children }: { icon: React.ReactNode; color: string; children: React.ReactNode }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1 }}>
      <Box
        sx={{
          width: 32, height: 32, borderRadius: 2, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          bgcolor: alpha(color, 0.14), color,
          '& .MuiSvgIcon-root': { fontSize: 18 },
        }}
      >
        {icon}
      </Box>
      <Typography variant="h6">{children}</Typography>
    </Box>
  )
}

function SettingRow({ field, value, onChange }: { field: FieldDef; value: number | boolean; onChange: (key: string, v: number | boolean) => void }) {
  if (field.type === 'boolean') {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1 }}>
        <Box>
          <Typography variant="body2" fontWeight={600}>{field.label}</Typography>
          {field.description && <Typography variant="caption" color="text.secondary">{field.description}</Typography>}
        </Box>
        <Switch
          checked={value as boolean}
          onChange={(e) => onChange(field.key, e.target.checked)}
          color="primary"
        />
      </Box>
    )
  }
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1 }}>
      <Box>
        <Typography variant="body2" fontWeight={600}>{field.label}</Typography>
        {field.description && <Typography variant="caption" color="text.secondary">{field.description}</Typography>}
      </Box>
      <TextField
        size="small"
        type="number"
        value={value as number}
        onChange={(e) => onChange(field.key, parseFloat(e.target.value) || 0)}
        sx={{ width: 140 }}
        InputProps={{ endAdornment: field.unit ? <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5, whiteSpace: 'nowrap' }}>{field.unit}</Typography> : undefined }}
      />
    </Box>
  )
}

export function PlanSettingsPage() {
  const [settings, setSettings] = useState<Settings>({})
  const [dirty, setDirty] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    settingsApi.getAll().then((data) => { setSettings(data); setLoading(false) }).catch(console.error)
  }, [])

  const handleChange = (key: string, value: number | boolean) => {
    setSettings((s) => ({ ...s, [key]: value }))
    setDirty((d) => new Set(d).add(key))
    setSaved(false)
  }

  const saveAll = async () => {
    setSaving(true)
    try {
      await Promise.all(Array.from(dirty).map((key) => settingsApi.update(key, settings[key])))
      setDirty(new Set())
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } finally { setSaving(false) }
  }

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', pt: 8 }}><CircularProgress /></Box>

  return (
    <Box>
      <PageHeader
        title="Plan Settings"
        subtitle="Changes take effect immediately for all users"
        action={
          <>
            {saved && <Chip icon={<CheckCircleRoundedIcon />} label="Saved" color="success" size="small" />}
            {dirty.size > 0 && <Chip label={`${dirty.size} unsaved`} color="warning" size="small" />}
            <Button
              variant="contained"
              onClick={saveAll}
              disabled={saving || dirty.size === 0}
              startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveRoundedIcon />}
              size="large"
            >
              Save Changes
            </Button>
          </>
        }
      />

      <Grid container spacing={3}>
        {/* Free plan limits */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <SectionTitle icon={<LockOpenRoundedIcon />} color="#10b981">Free Plan — Limits</SectionTitle>
            <Divider sx={{ mb: 2 }} />
            {FREE_LIMITS.map((f) => (
              <SettingRow key={f.key} field={f} value={settings[f.key] ?? 0} onChange={handleChange} />
            ))}
          </Paper>
        </Grid>

        {/* Feature flags */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <SectionTitle icon={<FeedRoundedIcon />} color="#F0A04B">Feed</SectionTitle>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
              Control what appears in the main swipe feed
            </Typography>
            <Divider sx={{ mb: 2 }} />
            {FEATURE_FLAGS.map((f) => (
              <Box key={f.key}>
                <SettingRow field={f} value={settings[f.key] ?? false} onChange={handleChange} />
              </Box>
            ))}
          </Paper>
        </Grid>

        {/* Free plan features */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <SectionTitle icon={<ToggleOnRoundedIcon />} color="#2D9B6F">Free Plan — Features</SectionTitle>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
              Toggle which features are available without Premium
            </Typography>
            <Divider sx={{ mb: 2 }} />
            {FREE_FEATURES.map((f) => (
              <Box key={f.key}>
                <SettingRow field={f} value={settings[f.key] ?? false} onChange={handleChange} />
                <Divider sx={{ my: 0.5 }} />
              </Box>
            ))}
          </Paper>
        </Grid>

        {/* Premium pricing */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <SectionTitle icon={<WorkspacePremiumRoundedIcon />} color="#f59e0b">Premium Pricing</SectionTitle>
            <Divider sx={{ mb: 2 }} />
            <Grid container spacing={2}>
              {PRICES.map((f) => (
                <Grid item xs={12} sm={6} md={3} key={f.key}>
                  <Paper variant="outlined" sx={{ p: 2, height: '100%', bgcolor: 'rgba(255,255,255,0.02)' }}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1, fontWeight: 600 }}>
                      {f.label}
                    </Typography>
                    <TextField
                      size="small"
                      type="number"
                      fullWidth
                      value={settings[f.key] ?? 0}
                      onChange={(e) => handleChange(f.key, parseFloat(e.target.value) || 0)}
                      InputProps={{
                        startAdornment: f.unit && ['$', '%'].includes(f.unit)
                          ? <Typography variant="body2" color="text.secondary" sx={{ mr: 0.5 }}>{f.unit}</Typography>
                          : undefined,
                        endAdornment: f.unit && !['$', '%'].includes(f.unit)
                          ? <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>{f.unit}</Typography>
                          : undefined,
                      }}
                    />
                    {f.description && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                        {f.description}
                      </Typography>
                    )}
                  </Paper>
                </Grid>
              ))}
            </Grid>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  )
}
