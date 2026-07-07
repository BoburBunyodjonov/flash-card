import { useNavigate, useLocation } from 'react-router-dom'
import {
  Box, Drawer, List, ListItemButton, ListItemIcon, ListItemText,
  Toolbar, AppBar, Typography, IconButton, Avatar, Tooltip,
  alpha,
} from '@mui/material'
import DashboardRoundedIcon from '@mui/icons-material/DashboardRounded'
import MenuBookRoundedIcon from '@mui/icons-material/MenuBookRounded'
import CategoryRoundedIcon from '@mui/icons-material/CategoryRounded'
import PeopleAltRoundedIcon from '@mui/icons-material/PeopleAltRounded'
import TuneRoundedIcon from '@mui/icons-material/TuneRounded'
import InsightsRoundedIcon from '@mui/icons-material/InsightsRounded'
import NotificationsRoundedIcon from '@mui/icons-material/NotificationsRounded'
import RecordVoiceOverRoundedIcon from '@mui/icons-material/RecordVoiceOverRounded'
import VideocamRoundedIcon from '@mui/icons-material/VideocamRounded'
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded'
import BoltRoundedIcon from '@mui/icons-material/BoltRounded'
import { useAuthStore } from '../../store/auth.store'

const DRAWER_WIDTH = 240
const GRADIENT = 'linear-gradient(135deg, #6366f1, #8b5cf6)'

const NAV_ITEMS = [
  { label: 'Dashboard', icon: <DashboardRoundedIcon />, path: '/' },
  { label: 'Words', icon: <MenuBookRoundedIcon />, path: '/words' },
  { label: 'Categories', icon: <CategoryRoundedIcon />, path: '/categories' },
  { label: 'Users', icon: <PeopleAltRoundedIcon />, path: '/users' },
  { label: 'Plan Settings', icon: <TuneRoundedIcon />, path: '/settings' },
  { label: 'Analytics', icon: <InsightsRoundedIcon />, path: '/analytics' },
  { label: 'Notifications', icon: <NotificationsRoundedIcon />, path: '/notifications' },
  { label: 'Speaking Reports', icon: <RecordVoiceOverRoundedIcon />, path: '/speaking' },
  { label: 'Shadowing', icon: <VideocamRoundedIcon />, path: '/shadowing' },
]

export function Layout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { user, logout } = useAuthStore()

  const currentPage = NAV_ITEMS.find((item) => item.path === pathname)?.label ?? 'Dashboard'

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar
        position="fixed"
        sx={{
          zIndex: (t) => t.zIndex.drawer + 1,
          bgcolor: 'rgba(20,20,32,0.85)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid',
          borderColor: 'divider',
          boxShadow: 'none',
        }}
      >
        <Toolbar sx={{ justifyContent: 'space-between' }}>
          {/* Brand (sits above the drawer) */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, width: DRAWER_WIDTH - 24 }}>
            <Box
              sx={{
                width: 32, height: 32, borderRadius: 2, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: GRADIENT,
                boxShadow: '0 0 16px rgba(99,102,241,0.4)',
              }}
            >
              <BoltRoundedIcon sx={{ fontSize: 20, color: '#fff' }} />
            </Box>
            <Typography
              variant="h6"
              sx={{
                fontWeight: 800,
                letterSpacing: '-0.02em',
                background: GRADIENT,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              WordSwipe
            </Typography>
          </Box>

          {/* Page context */}
          <Typography variant="subtitle1" sx={{ flexGrow: 1, color: 'text.secondary', fontWeight: 600 }}>
            {currentPage}
          </Typography>

          {/* User + logout */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Avatar sx={{ width: 32, height: 32, fontSize: 14, fontWeight: 700, background: GRADIENT }}>
                {user?.firstName?.[0]}
              </Avatar>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>{user?.firstName}</Typography>
            </Box>
            <Tooltip title="Logout" arrow>
              <IconButton size="small" onClick={logout} sx={{ color: 'text.secondary', '&:hover': { color: 'error.main' } }}>
                <LogoutRoundedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        </Toolbar>
      </AppBar>

      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER_WIDTH,
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
            bgcolor: 'background.paper',
            borderRight: '1px solid',
            borderColor: 'divider',
          },
        }}
      >
        <Toolbar />
        <Box sx={{ overflow: 'auto', py: 1.5, px: 1.5 }}>
          <Typography
            variant="caption"
            sx={{ px: 1.5, mb: 1, display: 'block', color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 10 }}
          >
            Menu
          </Typography>
          <List disablePadding>
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.path
              return (
                <ListItemButton
                  key={item.path}
                  selected={active}
                  onClick={() => navigate(item.path)}
                  sx={{
                    borderRadius: 2.5,
                    mb: 0.5,
                    px: 1.5,
                    py: 1,
                    color: 'text.secondary',
                    transition: 'all 0.15s ease',
                    '&.Mui-selected': {
                      bgcolor: (t) => alpha(t.palette.primary.main, 0.14),
                      color: '#a5b4fc',
                      '&:hover': { bgcolor: (t) => alpha(t.palette.primary.main, 0.2) },
                      '& .MuiListItemIcon-root': { color: 'primary.light' },
                    },
                    '&:hover': { bgcolor: 'rgba(255,255,255,0.04)' },
                  }}
                >
                  <ListItemIcon
                    sx={{ minWidth: 36, color: active ? 'primary.light' : 'text.secondary', '& .MuiSvgIcon-root': { fontSize: 20 } }}
                  >
                    {item.icon}
                  </ListItemIcon>
                  <ListItemText
                    primary={item.label}
                    primaryTypographyProps={{ fontSize: 14, fontWeight: active ? 700 : 600 }}
                  />
                </ListItemButton>
              )
            })}
          </List>
        </Box>
      </Drawer>

      <Box component="main" sx={{ flexGrow: 1, p: 3 }}>
        <Toolbar />
        {children}
      </Box>
    </Box>
  )
}
