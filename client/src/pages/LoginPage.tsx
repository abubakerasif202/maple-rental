import { FormEvent, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Divider,
  IconButton,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import ShieldRoundedIcon from '@mui/icons-material/ShieldRounded';
import BoltRoundedIcon from '@mui/icons-material/BoltRounded';
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded';
import DarkModeRoundedIcon from '@mui/icons-material/DarkModeRounded';
import LightModeRoundedIcon from '@mui/icons-material/LightModeRounded';
import { alpha } from '@mui/material/styles';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { useUiStore } from '@/store/uiStore';

const cues = [
  {
    icon: <ShieldRoundedIcon fontSize="small" />,
    title: 'Server-routed access',
    copy: 'Sessions are issued by the backend gateway so Stripe and Supabase privileges stay isolated.',
  },
  {
    icon: <BoltRoundedIcon fontSize="small" />,
    title: 'Operational latency',
    copy: 'Driver approvals, payment events, and reminders stay in one coordinated runtime.',
  },
  {
    icon: <ReceiptLongRoundedIcon fontSize="small" />,
    title: 'Billing control',
    copy: 'Contracts, subscription state, and portal access live behind the API layer.',
  },
];

export function LoginPage() {
  const navigate = useNavigate();
  const { setSession } = useAuthStore();
  const { themeMode, toggleThemeMode } = useUiStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await api.login(email, password);
      setSession(result.token, result.user);
      navigate(result.user.role === 'admin' ? '/admin' : '/dashboard');
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: 'calc(100vh - 32px)',
        display: 'grid',
        alignItems: 'center',
      }}
    >
      <Box
        sx={{
          display: 'grid',
          gap: 3,
          gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1.2fr) minmax(440px, 0.8fr)' },
        }}
      >
        <Paper
          sx={{
            p: { xs: 3.2, md: 5 },
            minHeight: { lg: 720 },
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            animation: 'riseIn 460ms ease both',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', position: 'relative', zIndex: 2 }}>
            <IconButton onClick={toggleThemeMode} sx={{ color: 'text.primary' }}>
              {themeMode === 'dark' ? <LightModeRoundedIcon /> : <DarkModeRoundedIcon />}
            </IconButton>
          </Box>
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              background: [
                `radial-gradient(circle at 18% 14%, ${alpha('#c6a76a', 0.18)}, transparent 26%)`,
                `radial-gradient(circle at 100% 0%, ${alpha('#8fb7ff', 0.14)}, transparent 30%)`,
              ].join(','),
              pointerEvents: 'none',
            }}
          />

          <Stack spacing={2.2} sx={{ position: 'relative', zIndex: 1, maxWidth: 620 }}>
            <Typography variant="overline">Maple Rentals / Fleet OS</Typography>
            <Typography variant="h1">
              Premium rental operations, without the usual admin clutter.
            </Typography>
            <Typography color="text.secondary" sx={{ fontSize: '1.05rem', maxWidth: 560 }}>
              A polished control surface for driver onboarding, contract issuance, and payment
              discipline across Render, Supabase, and Stripe.
            </Typography>
          </Stack>

          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={2}
            sx={{ position: 'relative', zIndex: 1, mt: 5 }}
          >
            {cues.map((cue, index) => (
              <Paper
                key={cue.title}
                sx={{
                  p: 2.4,
                  flex: 1,
                  backgroundColor: alpha('#ffffff', 0.03),
                  animation: `riseIn ${500 + index * 80}ms ease both`,
                }}
              >
                <Stack spacing={1.2}>
                  <Box sx={{ color: 'primary.main' }}>{cue.icon}</Box>
                  <Typography variant="subtitle1">{cue.title}</Typography>
                  <Typography color="text.secondary">{cue.copy}</Typography>
                </Stack>
              </Paper>
            ))}
          </Stack>
        </Paper>

        <Paper
          sx={{
            p: { xs: 3.2, md: 4 },
            display: 'flex',
            alignItems: 'center',
            animation: 'riseIn 520ms ease both',
          }}
        >
          <Stack spacing={3} sx={{ width: '100%' }}>
            <Stack spacing={1}>
              <Typography variant="overline">Secure access</Typography>
              <Typography variant="h3">Sign in to continue</Typography>
              <Typography color="text.secondary">
                Driver and admin sessions are issued by the API layer. No billing secrets ever
                reach the browser.
              </Typography>
            </Stack>

            <Divider />

            {error ? <Alert severity="error">{error}</Alert> : null}

            <Box component="form" onSubmit={handleSubmit}>
              <Stack spacing={2.2}>
                <TextField
                  label="Email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  fullWidth
                />
                <TextField
                  label="Password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  fullWidth
                />
                <Button type="submit" variant="contained" size="large" disabled={loading}>
                  {loading ? 'Signing in...' : 'Enter workspace'}
                </Button>
              </Stack>
            </Box>

            <Typography color="text.secondary">
              Need a driver account first? Submit an application from the fleet page and return once
              approval is underway.
            </Typography>
          </Stack>
        </Paper>
      </Box>
    </Box>
  );
}
