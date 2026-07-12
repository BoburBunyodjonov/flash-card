import { createTheme, alpha } from '@mui/material'
import type {} from '@mui/x-data-grid/themeAugmentation'

const BORDER = 'rgba(28,42,36,0.08)'
const SURFACE = '#E4EBE7'
const PAPER = '#FFFFFF'
const BG = '#F3F6F4'
const PRIMARY = '#2D9B6F'
const PRIMARY_LIGHT = '#4CB388'
const PRIMARY_HOVER = '#248A61'
const ACCENT = '#F0A04B'
const TEXT = '#1C2A24'
const TEXT_SECONDARY = 'rgba(28,42,36,0.58)'

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: PRIMARY, dark: '#1F7A56', light: PRIMARY_LIGHT },
    secondary: { main: ACCENT },
    success: { main: '#2D9B6F' },
    error: { main: '#E07060' },
    warning: { main: '#E5A03C' },
    background: { default: BG, paper: PAPER },
    divider: BORDER,
    text: { primary: TEXT, secondary: TEXT_SECONDARY },
  },
  typography: {
    fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
    h3: { fontWeight: 700, letterSpacing: '-0.02em', fontFamily: 'Fraunces, Georgia, serif' },
    h4: { fontWeight: 700, letterSpacing: '-0.02em', fontFamily: 'Fraunces, Georgia, serif' },
    h5: { fontWeight: 700, letterSpacing: '-0.01em' },
    h6: { fontWeight: 700 },
    subtitle1: { fontWeight: 600 },
    button: { fontWeight: 600 },
  },
  shape: { borderRadius: 12 },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        '*::-webkit-scrollbar': { width: 8, height: 8 },
        '*::-webkit-scrollbar-track': { background: 'transparent' },
        '*::-webkit-scrollbar-thumb': {
          background: 'rgba(28,42,36,0.14)',
          borderRadius: 8,
          '&:hover': { background: 'rgba(28,42,36,0.22)' },
        },
        '*': { scrollbarWidth: 'thin', scrollbarColor: 'rgba(28,42,36,0.14) transparent' },
        body: { backgroundColor: BG, color: TEXT },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          border: `1px solid ${BORDER}`,
          boxShadow: '0 8px 24px rgba(28,42,36,0.04)',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          border: `1px solid ${BORDER}`,
          boxShadow: '0 8px 24px rgba(28,42,36,0.04)',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          borderRadius: 10,
          boxShadow: 'none',
          '&:hover': { boxShadow: 'none' },
        },
        containedPrimary: {
          background: PRIMARY,
          color: '#fff',
          '&:hover': { background: PRIMARY_HOVER },
          '&.Mui-disabled': { background: 'rgba(45,155,111,0.25)', color: 'rgba(255,255,255,0.7)' },
        },
        outlined: {
          borderColor: 'rgba(28,42,36,0.14)',
          '&:hover': { borderColor: 'rgba(28,42,36,0.28)', backgroundColor: 'rgba(28,42,36,0.04)' },
        },
      },
    },
    MuiTextField: {
      defaultProps: { variant: 'outlined' },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          backgroundColor: PAPER,
          '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(28,42,36,0.12)' },
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(28,42,36,0.22)' },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: PRIMARY, borderWidth: 1 },
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 16,
          border: `1px solid ${BORDER}`,
          backgroundColor: PAPER,
          backgroundImage: 'none',
        },
      },
    },
    MuiDialogTitle: {
      styleOverrides: { root: { fontWeight: 700, fontSize: '1.15rem' } },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 600, borderRadius: 8 },
        outlined: { borderColor: 'rgba(28,42,36,0.14)' },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: TEXT,
          color: '#fff',
          borderRadius: 8,
          fontSize: 12,
          fontWeight: 500,
          padding: '6px 10px',
        },
        arrow: { color: TEXT },
      },
    },
    MuiTableCell: {
      styleOverrides: { root: { borderColor: BORDER } },
    },
    MuiSwitch: {
      styleOverrides: {
        root: { padding: 8 },
        track: { borderRadius: 11, backgroundColor: 'rgba(28,42,36,0.2)' },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          borderColor: 'rgba(28,42,36,0.12)',
          '&.Mui-selected': {
            backgroundColor: alpha(PRIMARY, 0.14),
            color: PRIMARY,
            '&:hover': { backgroundColor: alpha(PRIMARY, 0.22) },
          },
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: { root: { borderRadius: 10 } },
    },
    MuiAlert: {
      styleOverrides: { root: { borderRadius: 10 } },
    },
    MuiDataGrid: {
      styleOverrides: {
        root: {
          border: 'none',
          '--DataGrid-rowBorderColor': BORDER,
          '--DataGrid-containerBackground': PAPER,
          '& .MuiDataGrid-columnHeaders': {
            backgroundColor: SURFACE,
            borderBottom: `1px solid ${BORDER}`,
          },
          '& .MuiDataGrid-columnHeaderTitle': {
            fontWeight: 700,
            fontSize: 12,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: TEXT_SECONDARY,
          },
          '& .MuiDataGrid-row:hover': { backgroundColor: alpha(PRIMARY, 0.06) },
          '& .MuiDataGrid-cell': {
            borderTopColor: BORDER,
            display: 'flex',
            alignItems: 'center',
          },
          '& .MuiDataGrid-cell:focus, & .MuiDataGrid-cell:focus-within': { outline: 'none' },
          '& .MuiDataGrid-columnHeader:focus, & .MuiDataGrid-columnHeader:focus-within': { outline: 'none' },
          '& .MuiDataGrid-footerContainer': { borderTopColor: BORDER },
          '& .MuiDataGrid-columnSeparator': { color: 'rgba(28,42,36,0.08)' },
        },
      },
    },
  },
})
