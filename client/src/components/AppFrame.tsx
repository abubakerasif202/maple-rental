import { PropsWithChildren, ReactNode, useMemo, useState } from 'react';
import {
  Avatar,
  Box,
  Button,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import DirectionsCarRoundedIcon from '@mui/icons-material/DirectionsCarRounded';
import AssignmentTurnedInRoundedIcon from '@mui/icons-material/AssignmentTurnedInRounded';
import SpaceDashboardRoundedIcon from '@mui/icons-material/SpaceDashboardRounded';
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded';
import ShieldRoundedIcon from '@mui/icons-material/ShieldRounded';
import MenuRoundedIcon from '@mui/icons-material/MenuRounded';
import LoginRoundedIcon from '@mui/icons-material/LoginRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import DarkModeRoundedIcon from '@mui/icons-material/DarkModeRounded';
import LightModeRoundedIcon from '@mui/icons-material/LightModeRounded';
import { alpha } from '@mui/material/styles';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { useUiStore } from '@/store/uiStore';

type NavItem = {
  label: string;
  to: string;
  icon: ReactNode;
  roles: Array<'guest' | 'driver' | 'admin'>;
};

const navItems: NavItem[] = [
  {
    label: 'Fleet',
    to: '/vehicles',
    icon: <DirectionsCarRoundedIcon />,
    roles: ['guest', 'driver', 'admin'],
  },
  {
    label: 'Apply',
    to: '/apply',
    icon: <AssignmentTurnedInRoundedIcon />,
    roles: ['guest', 'driver', 'admin'],
  },
  {
    label: 'Dashboard',
    to: '/dashboard',
    icon: <SpaceDashboardRoundedIcon />,
    roles: ['driver'],
  },
  {
    label: 'Billing',
    to: '/billing',
    icon: <ReceiptLongRoundedIcon />,
    roles: ['driver'],
  },
  {
    label: 'Admin',
    to: '/admin',
    icon: <ShieldRoundedIcon />,
    roles: ['admin'],
  },
];

const routeMeta: Record<string, { title: string; note: string }> = {
  '/vehicles': {
    title: 'Fleet workspace',
    note: 'Live inventory, assignment readiness, and weekly rate clarity.',
  },
  '/apply': {
    title: 'Driver onboarding',
    note: 'One intake flow wired directly into approvals, contracts, and billing.',
  },
  '/dashboard': {
    title: 'Driver operations',
    note: 'Current assignment, approvals, and account state in one working surface.',
  },
  '/billing': {
    title: 'Billing operations',
    note: 'Stripe checkout, payment health, and contract access under server control.',
  },
  '/admin': {
    title: 'Control room',
    note: 'Approval queue, fleet posture, and payment enforcement.',
  },
};

export function AppFrame({ children }: PropsWithChildren) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, clearSession } = useAuthStore();
  const { themeMode, toggleThemeMode } = useUiStore();
  const [mobileOpen, setMobileOpen] = useState(false);
  const role = user?.role || 'guest';
  const meta = routeMeta[location.pathname];
  const visibleItems = useMemo(
    () => navItems.filter((item) => item.roles.includes(role)),
    [role],
  );

  const signOut = () => {
    clearSession();
    navigate('/login');
  };

  const sidebar = (
    <Paper
      sx={{
        height: '100%',
        p: 2.2,
        borderRadius: 8,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: (theme) => alpha(theme.palette.background.paper, 0.88),
      }}
    >
      <Stack spacing={2.5} sx={{ flexGrow: 1 }}>
        <Stack spacing={1}>
          <Typography variant="overline">Maple Rentals</Typography>
          <Typography variant="h4" sx={{ maxWidth: 180 }}>
            Fleet OS
          </Typography>
          <Typography color="text.secondary">
            Premium rental operations for approvals, billing, and dispatch control.
          </Typography>
        </Stack>

        <Button
          variant="outlined"
          onClick={toggleThemeMode}
          startIcon={themeMode === 'dark' ? <LightModeRoundedIcon /> : <DarkModeRoundedIcon />}
          sx={{ alignSelf: 'flex-start' }}
        >
          {themeMode === 'dark' ? 'Editorial light' : 'Executive dark'}
        </Button>

        <Divider />

        <List disablePadding sx={{ display: 'grid', gap: 1 }}>
          {visibleItems.map((item) => {
            const active = location.pathname === item.to;
            return (
              <ListItemButton
                key={item.to}
                component={RouterLink}
                to={item.to}
                onClick={() => setMobileOpen(false)}
                sx={{
                  minHeight: 52,
                  borderRadius: 3,
                  color: active ? 'text.primary' : 'text.secondary',
                  backgroundColor: active ? alpha('#ffffff', 0.06) : 'transparent',
                  border: `1px solid ${active ? alpha('#c6a76a', 0.3) : 'transparent'}`,
                  '&:hover': {
                    backgroundColor: alpha('#ffffff', 0.04),
                    color: 'text.primary',
                  },
                }}
              >
                <ListItemIcon sx={{ minWidth: 40, color: 'inherit' }}>{item.icon}</ListItemIcon>
                <ListItemText primary={item.label} />
              </ListItemButton>
            );
          })}
        </List>
      </Stack>

      <Paper
        sx={{
          p: 2.2,
          borderRadius: 4,
          backgroundColor: alpha('#ffffff', 0.03),
        }}
      >
        <Stack spacing={1}>
          <Typography variant="overline">Deployment profile</Typography>
          <Typography variant="subtitle1">Render + Supabase + Stripe</Typography>
          <Typography color="text.secondary">
            Static client, isolated API, and scheduled enforcement jobs.
          </Typography>
        </Stack>
      </Paper>
    </Paper>
  );

  if (location.pathname === '/login') {
    return (
      <Box sx={{ minHeight: '100vh', px: { xs: 2, md: 4 }, py: { xs: 3, md: 4 } }}>
        {children}
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex' }}>
      <Box
        component="aside"
        sx={{
          width: 304,
          p: 2,
          display: { xs: 'none', lg: 'block' },
          position: 'sticky',
          top: 0,
          alignSelf: 'flex-start',
          height: '100vh',
        }}
      >
        {sidebar}
      </Box>

      <Drawer
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        PaperProps={{
          sx: {
            width: 320,
            p: 2,
            backgroundColor: (theme) => theme.palette.background.default,
          },
        }}
      >
        {sidebar}
      </Drawer>

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box
          sx={{
            position: 'sticky',
            top: 0,
            zIndex: 20,
            px: { xs: 2, md: 4 },
            py: 2,
            borderBottom: (theme) => `1px solid ${alpha(theme.palette.text.primary, 0.08)}`,
            backdropFilter: 'blur(18px)',
            backgroundColor: (theme) => alpha(theme.palette.background.default, 0.72),
          }}
        >
          <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
            <Stack direction="row" spacing={1.5} alignItems="center">
              <IconButton
                onClick={() => setMobileOpen(true)}
                sx={{ display: { lg: 'none' }, color: 'text.primary' }}
              >
                <MenuRoundedIcon />
              </IconButton>
              <Stack spacing={0.2}>
                <Typography variant="overline">Workspace</Typography>
                <Typography variant="h6">{meta?.title || 'Maple Rentals V4'}</Typography>
                <Typography color="text.secondary" sx={{ display: { xs: 'none', md: 'block' } }}>
                  {meta?.note || 'Operational control for the rental fleet.'}
                </Typography>
              </Stack>
            </Stack>

            <Stack direction="row" spacing={1.2} alignItems="center">
              <Button
                variant="outlined"
                onClick={toggleThemeMode}
                startIcon={themeMode === 'dark' ? <LightModeRoundedIcon /> : <DarkModeRoundedIcon />}
                sx={{ display: { xs: 'none', md: 'inline-flex' } }}
              >
                {themeMode === 'dark' ? 'Light' : 'Dark'}
              </Button>
              <Avatar
                sx={{
                  width: 38,
                  height: 38,
                  bgcolor: alpha('#c6a76a', 0.18),
                  color: 'primary.main',
                  fontWeight: 700,
                }}
              >
                {(user?.email || 'M').slice(0, 1).toUpperCase()}
              </Avatar>
              <Stack spacing={0.2} sx={{ display: { xs: 'none', sm: 'flex' } }}>
                <Typography variant="subtitle2">
                  {user?.email || 'Guest session'}
                </Typography>
                <Typography color="text.secondary">
                  {user ? `${user.role} access` : 'Public browsing'}
                </Typography>
              </Stack>
              {user ? (
                <Button variant="outlined" startIcon={<LogoutRoundedIcon />} onClick={signOut}>
                  Sign out
                </Button>
              ) : (
                <Button
                  variant="contained"
                  startIcon={<LoginRoundedIcon />}
                  component={RouterLink}
                  to="/login"
                >
                  Log in
                </Button>
              )}
            </Stack>
          </Stack>
        </Box>

        <Box
          component="main"
          sx={{
            width: '100%',
            maxWidth: 1440,
            mx: 'auto',
            px: { xs: 2, md: 4 },
            py: { xs: 3, md: 4 },
          }}
        >
          {children}
        </Box>
      </Box>
    </Box>
  );
}
