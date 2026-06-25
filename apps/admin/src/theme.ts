import { createTheme, alpha } from '@mui/material'
import type {} from '@mui/x-data-grid/themeAugmentation'

const GRADIENT = 'linear-gradient(135deg, #6366f1, #8b5cf6)'
const GRADIENT_HOVER = 'linear-gradient(135deg, #4f46e5, #7c3aed)'
const BORDER = 'rgba(255,255,255,0.07)'
const SURFACE = '#1e1e30'

export const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#6366f1', dark: '#4f46e5', light: '#818cf8' },
    secondary: { main: '#8b5cf6' },
    success: { main: '#10b981' },
    error: { main: '#ef4444' },
    warning: { main: '#f59e0b' },
    background: { default: '#0a0a0a', paper: '#141420' },
    divider: BORDER,
    text: { primary: '#f4f4f5', secondary: '#9ca3af' },
  },
  typography: {
    fontFamily: '"Inter", system-ui, sans-serif',
    h3: { fontWeight: 800, letterSpacing: '-0.02em' },
    h4: { fontWeight: 800, letterSpacing: '-0.02em' },
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
          background: 'rgba(255,255,255,0.12)',
          borderRadius: 8,
          '&:hover': { background: 'rgba(255,255,255,0.2)' },
        },
        '*': { scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.12) transparent' },
        body: { backgroundColor: '#0a0a0a' },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          border: `1px solid ${BORDER}`,
          boxShadow: 'none',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: { backgroundImage: 'none', border: `1px solid ${BORDER}`, boxShadow: 'none' },
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
          background: GRADIENT,
          color: '#fff',
          '&:hover': { background: GRADIENT_HOVER },
          '&.Mui-disabled': { background: 'rgba(99,102,241,0.25)', color: 'rgba(255,255,255,0.4)' },
        },
        outlined: {
          borderColor: 'rgba(255,255,255,0.14)',
          '&:hover': { borderColor: 'rgba(255,255,255,0.28)', backgroundColor: 'rgba(255,255,255,0.04)' },
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
          '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' },
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#6366f1', borderWidth: 1 },
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 16,
          border: `1px solid rgba(255,255,255,0.08)`,
          backgroundColor: '#141420',
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
        outlined: { borderColor: 'rgba(255,255,255,0.14)' },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: SURFACE,
          border: `1px solid rgba(255,255,255,0.08)`,
          borderRadius: 8,
          fontSize: 12,
          fontWeight: 500,
          padding: '6px 10px',
        },
        arrow: { color: SURFACE },
      },
    },
    MuiTableCell: {
      styleOverrides: { root: { borderColor: BORDER } },
    },
    MuiSwitch: {
      styleOverrides: {
        root: { padding: 8 },
        track: { borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.2)' },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          borderColor: 'rgba(255,255,255,0.12)',
          '&.Mui-selected': {
            backgroundColor: alpha('#6366f1', 0.18),
            color: '#a5b4fc',
            '&:hover': { backgroundColor: alpha('#6366f1', 0.26) },
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
          '--DataGrid-containerBackground': SURFACE,
          '& .MuiDataGrid-columnHeaders': {
            backgroundColor: SURFACE,
            borderBottom: `1px solid ${BORDER}`,
          },
          '& .MuiDataGrid-columnHeaderTitle': {
            fontWeight: 700,
            fontSize: 12,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: '#9ca3af',
          },
          '& .MuiDataGrid-row:hover': { backgroundColor: 'rgba(99,102,241,0.06)' },
          // v7 cells aren't flex by default — custom renderCell content
          // (chips, boxes) sticks to the top/bottom without this
          '& .MuiDataGrid-cell': {
            borderTopColor: BORDER,
            display: 'flex',
            alignItems: 'center',
          },
          '& .MuiDataGrid-cell:focus, & .MuiDataGrid-cell:focus-within': { outline: 'none' },
          '& .MuiDataGrid-columnHeader:focus, & .MuiDataGrid-columnHeader:focus-within': { outline: 'none' },
          '& .MuiDataGrid-footerContainer': { borderTopColor: BORDER },
          '& .MuiDataGrid-columnSeparator': { color: 'rgba(255,255,255,0.08)' },
        },
      },
    },
  },
})
