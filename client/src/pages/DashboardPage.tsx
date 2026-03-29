import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Divider,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import ArrowOutwardRoundedIcon from '@mui/icons-material/ArrowOutwardRounded';
import { Navigate, Link as RouterLink } from 'react-router-dom';
import { api } from '@/lib/api';
import { MetricCard } from '@/components/MetricCard';
import { PageIntro } from '@/components/PageIntro';
import { StatusPill } from '@/components/StatusPill';
import { TrendChart } from '@/components/TrendChart';
import { VehicleVisual } from '@/components/VehicleVisual';
import { useAuthStore } from '@/store/authStore';
import type { DriverDashboard } from '@/types';

const money = (value: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(value);

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Not scheduled';

export function DashboardPage() {
  const { user } = useAuthStore();
  const [dashboard, setDashboard] = useState<DriverDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || user.role === 'admin') {
      return;
    }

    api
      .getMe()
      .then((payload) => setDashboard(payload.dashboard))
      .catch((caughtError) =>
        setError(caughtError instanceof Error ? caughtError.message : 'Failed to load dashboard'),
      );
  }, [user]);

  const greetingName = useMemo(() => {
    const fullName = dashboard?.driver.full_name;
    return fullName ? fullName.split(' ')[0] : 'Driver';
  }, [dashboard?.driver.full_name]);

  const latestSubscription = dashboard?.subscriptions?.[0] || null;
  const signalPoints = [
    { label: 'Apps', value: dashboard?.applications.length || 0 },
    {
      label: 'Ready',
      value:
        dashboard?.applications.filter((application) =>
          ['approved', 'checkout_pending', 'subscribed'].includes(application.status),
        ).length || 0,
    },
    { label: 'Subs', value: dashboard?.subscriptions.length || 0 },
    { label: 'Alerts', value: dashboard?.notifications.length || 0 },
  ];

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role === 'admin') {
    return <Navigate to="/admin" replace />;
  }

  return (
    <Stack spacing={4}>
      <PageIntro
        eyebrow="Driver workspace"
        title={`Good to see you, ${greetingName}`}
        description="Track approvals, vehicle assignment, and payment posture from a single operating surface."
        actions={
          <Button
            variant="contained"
            component={RouterLink}
            to="/billing"
            endIcon={<ArrowOutwardRoundedIcon />}
          >
            Open billing
          </Button>
        }
      />

      {error ? <Alert severity="error">{error}</Alert> : null}

      <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' } }}>
        <MetricCard label="Account state" value={dashboard?.driver.status || user.status} helper="Controlled by approvals and subscription health." />
        <MetricCard label="Applications" value={dashboard?.applications.length || 0} helper="Every application becomes an approval workflow." />
        <MetricCard label="Subscriptions" value={dashboard?.subscriptions.length || 0} helper="Active, past due, and historical subscription records." />
      </Box>

      <Box
        sx={{
          display: 'grid',
          gap: 3,
          gridTemplateColumns: { xs: '1fr', xl: 'minmax(0, 1.4fr) minmax(360px, 0.8fr)' },
        }}
      >
        <Paper sx={{ p: { xs: 2.5, md: 3.4 }, animation: 'riseIn 520ms ease both' }}>
          <Stack spacing={3}>
            <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2}>
              <Stack spacing={0.8}>
                <Typography variant="overline">Current assignment</Typography>
                <Typography variant="h3">
                  {dashboard?.currentVehicle
                    ? `${dashboard.currentVehicle.year} ${dashboard.currentVehicle.make} ${dashboard.currentVehicle.model}`
                    : 'No vehicle assigned yet'}
                </Typography>
                <Typography color="text.secondary">
                  {dashboard?.currentVehicle
                    ? `Plate ${dashboard.currentVehicle.plate_number}`
                    : 'An approved application reserves a vehicle before checkout begins.'}
                </Typography>
              </Stack>
              <StatusPill value={dashboard?.driver.status || user.status} />
            </Stack>

            <VehicleVisual vehicle={dashboard?.currentVehicle || null} height={280} />

            <Divider />

            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' } }}>
              <Stack spacing={0.4}>
                <Typography variant="overline">Weekly rate</Typography>
                <Typography variant="h5">
                  {latestSubscription
                    ? money(latestSubscription.weekly_rate)
                    : dashboard?.currentVehicle
                      ? money(dashboard.currentVehicle.weekly_rate)
                      : 'Awaiting approval'}
                </Typography>
              </Stack>
              <Stack spacing={0.4}>
                <Typography variant="overline">Current period</Typography>
                <Typography variant="h5">
                  {latestSubscription?.current_period_end
                    ? formatDate(latestSubscription.current_period_end)
                    : 'Not active'}
                </Typography>
              </Stack>
              <Stack spacing={0.4}>
                <Typography variant="overline">Vehicle state</Typography>
                <Typography variant="h5">
                  {dashboard?.currentVehicle ? dashboard.currentVehicle.status : 'Unassigned'}
                </Typography>
              </Stack>
            </Box>

            <Divider />

            <Stack spacing={1.4}>
              <Typography variant="h5">Application pipeline</Typography>
              {(dashboard?.applications || []).map((application) => (
                <Box
                  key={application.id}
                  sx={{
                    display: 'grid',
                    gap: 1.5,
                    py: 1.4,
                    gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) auto auto' },
                    alignItems: 'center',
                  }}
                >
                  <Stack spacing={0.35}>
                    <Typography variant="subtitle1">
                      {application.vehicles?.year} {application.vehicles?.make} {application.vehicles?.model}
                    </Typography>
                    <Typography color="text.secondary">
                      Preferred start {formatDate(application.preferred_start_date)}
                    </Typography>
                  </Stack>
                  <StatusPill value={application.status} />
                  <Typography color="text.secondary">{application.notes || 'No onboarding notes supplied.'}</Typography>
                </Box>
              ))}
              {!dashboard?.applications?.length ? (
                <Typography color="text.secondary">No application history yet.</Typography>
              ) : null}
            </Stack>
          </Stack>
        </Paper>

        <Stack spacing={3}>
          <Paper sx={{ p: { xs: 2.5, md: 3.2 }, animation: 'riseIn 560ms ease both' }}>
            <TrendChart
              title="Account signal"
              caption="Application readiness, subscription activation, and current alert load."
              points={signalPoints}
            />
          </Paper>

          <Paper sx={{ p: { xs: 2.5, md: 3.2 }, animation: 'riseIn 600ms ease both' }}>
            <Stack spacing={2}>
              <Typography variant="h5">Live activity</Typography>
              {(dashboard?.subscriptions || []).slice(0, 3).map((subscription) => (
                <Stack key={subscription.id} spacing={0.5} sx={{ py: 0.8 }}>
                  <Stack direction="row" justifyContent="space-between" spacing={2} alignItems="center">
                    <Typography variant="subtitle2">
                      {subscription.vehicles?.make} {subscription.vehicles?.model}
                    </Typography>
                    <StatusPill value={subscription.status} />
                  </Stack>
                  <Typography color="text.secondary">
                    {subscription.current_period_end
                      ? `Renews ${formatDate(subscription.current_period_end)}`
                      : 'Billing schedule pending'}
                  </Typography>
                </Stack>
              ))}
              {(dashboard?.notifications || []).slice(0, 3).map((notification) => (
                <Stack key={notification.id} spacing={0.5} sx={{ py: 0.8 }}>
                  <Stack direction="row" justifyContent="space-between" spacing={2}>
                    <Typography variant="subtitle2">
                      {notification.template_key.replaceAll('_', ' ')}
                    </Typography>
                    <Typography color="text.secondary">
                      {new Date(notification.created_at).toLocaleDateString('en-AU', {
                        day: '2-digit',
                        month: 'short',
                      })}
                    </Typography>
                  </Stack>
                  <Typography color="text.secondary">{notification.body}</Typography>
                </Stack>
              ))}
              {!dashboard?.notifications?.length && !dashboard?.subscriptions?.length ? (
                <Typography color="text.secondary">No account activity has been recorded yet.</Typography>
              ) : null}
            </Stack>
          </Paper>
        </Stack>
      </Box>
    </Stack>
  );
}
