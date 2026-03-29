import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Divider,
  InputAdornment,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { Navigate, useSearchParams } from 'react-router-dom';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import { api } from '@/lib/api';
import { MetricCard } from '@/components/MetricCard';
import { PageIntro } from '@/components/PageIntro';
import { StatusPill } from '@/components/StatusPill';
import { StackedBarChart } from '@/components/StackedBarChart';
import { TrendChart } from '@/components/TrendChart';
import { useAuthStore } from '@/store/authStore';
import { useViewStateStore } from '@/store/viewStateStore';
import type { AdminSnapshot } from '@/types';

const money = (value: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(value);

export function AdminPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuthStore();
  const [snapshot, setSnapshot] = useState<AdminSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const {
    adminApplicationQuery,
    adminVehicleFilter,
    adminPaymentFilter,
    setAdminState,
  } = useViewStateStore();
  const [applicationQuery, setApplicationQuery] = useState(
    searchParams.get('q') ?? adminApplicationQuery,
  );
  const [vehicleFilter, setVehicleFilter] = useState<'all' | string>(
    searchParams.get('vehicle') ?? adminVehicleFilter,
  );
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'paid' | 'failed'>(
    (searchParams.get('payment') as 'all' | 'paid' | 'failed' | null) ?? adminPaymentFilter,
  );

  const load = () => {
    api
      .getAdmin()
      .then(setSnapshot)
      .catch((caughtError) =>
        setError(caughtError instanceof Error ? caughtError.message : 'Failed to load admin data'),
      );
  };

  useEffect(() => {
    if (user?.role === 'admin') {
      load();
    }
  }, [user]);

  useEffect(() => {
    setAdminState({ applicationQuery, vehicleFilter, paymentFilter });

    const nextParams = new URLSearchParams();
    if (applicationQuery) {
      nextParams.set('q', applicationQuery);
    }
    if (vehicleFilter !== 'all') {
      nextParams.set('vehicle', vehicleFilter);
    }
    if (paymentFilter !== 'all') {
      nextParams.set('payment', paymentFilter);
    }

    if (nextParams.toString() !== searchParams.toString()) {
      setSearchParams(nextParams, { replace: true });
    }
  }, [
    adminApplicationQuery,
    applicationQuery,
    paymentFilter,
    searchParams,
    setAdminState,
    setSearchParams,
    vehicleFilter,
  ]);

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  const approve = async (applicationId: string) => {
    try {
      await api.approveApplication(applicationId);
      load();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Approval failed');
    }
  };

  const reject = async (applicationId: string) => {
    const reason = window.prompt('Reason for rejection');
    if (!reason) {
      return;
    }

    try {
      await api.rejectApplication(applicationId, reason);
      load();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Rejection failed');
    }
  };

  const paymentTrend = (snapshot?.recentPayments || [])
    .slice(0, 6)
    .reverse()
    .map((payment, index) => ({
      label: payment.paid_at
        ? new Date(payment.paid_at).toLocaleDateString('en-AU', { day: '2-digit', month: 'short' })
        : `I${index + 1}`,
      value: Number(payment.amount),
    }));

  const filteredApplications = (snapshot?.pendingApplications || []).filter((application) => {
    const haystack = [
      application.drivers?.full_name,
      application.drivers?.email,
      application.vehicles?.make,
      application.vehicles?.model,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    const matchesQuery =
      !applicationQuery.trim() || haystack.includes(applicationQuery.trim().toLowerCase());
    const matchesVehicle =
      vehicleFilter === 'all' ||
      `${application.vehicles?.make || ''} ${application.vehicles?.model || ''}` === vehicleFilter;

    return matchesQuery && matchesVehicle;
  });

  const filteredPayments = (snapshot?.recentPayments || []).filter((payment) =>
    paymentFilter === 'all' ? true : payment.status === paymentFilter,
  );

  const fleetDistribution = [
    {
      label: 'Available',
      value: snapshot?.vehicles.filter((vehicle) => vehicle.status === 'available').length || 0,
      color: '#4dd4a5',
    },
    {
      label: 'Reserved',
      value: snapshot?.vehicles.filter((vehicle) => vehicle.status === 'reserved').length || 0,
      color: '#f6b56b',
    },
    {
      label: 'Active',
      value: snapshot?.vehicles.filter((vehicle) => vehicle.status === 'active').length || 0,
      color: '#8fb7ff',
    },
    {
      label: 'Other',
      value:
        snapshot?.vehicles.filter((vehicle) =>
          !['available', 'reserved', 'active'].includes(vehicle.status),
        ).length || 0,
      color: '#7f8da3',
    },
  ];

  const subscriptionDistribution = [
    {
      label: 'Active',
      value:
        snapshot?.recentSubscriptions.filter((subscription) => subscription.status === 'active').length ||
        0,
      color: '#4dd4a5',
    },
    {
      label: 'Past due',
      value:
        snapshot?.recentSubscriptions.filter((subscription) => subscription.status === 'past_due').length ||
        0,
      color: '#f6b56b',
    },
    {
      label: 'Unpaid',
      value:
        snapshot?.recentSubscriptions.filter((subscription) => subscription.status === 'unpaid').length ||
        0,
      color: '#ff7a7a',
    },
    {
      label: 'Other',
      value:
        snapshot?.recentSubscriptions.filter((subscription) =>
          !['active', 'past_due', 'unpaid'].includes(subscription.status),
        ).length || 0,
      color: '#7f8da3',
    },
  ];

  const vehicleOptions = Array.from(
    new Set(
      (snapshot?.pendingApplications || [])
        .map((application) => `${application.vehicles?.make || ''} ${application.vehicles?.model || ''}`.trim())
        .filter(Boolean),
    ),
  );

  return (
    <Stack spacing={4}>
      <PageIntro
        eyebrow="Control room"
        title="Approvals, fleet posture, and payment enforcement"
        description="The admin surface stays focused on decisions: approve drivers, watch subscription health, and monitor operational signals without dashboard clutter."
      />

      {error ? <Alert severity="error">{error}</Alert> : null}

      <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', md: 'repeat(4, 1fr)' } }}>
        <MetricCard label="Pending" value={snapshot?.summary.pendingApplications || 0} helper="Applications awaiting approval decisions." />
        <MetricCard label="Active subs" value={snapshot?.summary.activeSubscriptions || 0} helper="Live subscriptions currently keeping drivers on road." />
        <MetricCard label="Overdue" value={snapshot?.summary.overduePayments || 0} helper="Failed or unpaid invoices needing follow-up." />
        <MetricCard label="Fleet units" value={snapshot?.summary.vehicleInventory || 0} helper="Vehicles visible to the operational ledger." />
      </Box>

      <Box
        sx={{
          display: 'grid',
          gap: 3,
          gridTemplateColumns: { xs: '1fr', xl: 'minmax(0, 1.35fr) minmax(360px, 0.75fr)' },
        }}
      >
        <Paper sx={{ p: { xs: 2.6, md: 3.4 }, animation: 'riseIn 520ms ease both' }}>
          <Stack spacing={2.2}>
            <Stack spacing={0.6}>
              <Typography variant="h4">Approval queue</Typography>
              <Typography color="text.secondary">
                Every approval issues a contract, reserves a vehicle, and opens the billing path.
              </Typography>
            </Stack>
            <Box
              sx={{
                display: 'grid',
                gap: 1.5,
                gridTemplateColumns: { xs: '1fr', md: 'minmax(260px, 1.2fr) 240px' },
              }}
            >
              <TextField
                placeholder="Search driver, email, or vehicle"
                value={applicationQuery}
                onChange={(event) => setApplicationQuery(event.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchRoundedIcon fontSize="small" />
                    </InputAdornment>
                  ),
                }}
              />
              <TextField
                select
                label="Vehicle filter"
                value={vehicleFilter}
                onChange={(event) => setVehicleFilter(event.target.value)}
              >
                <MenuItem value="all">All vehicles</MenuItem>
                {vehicleOptions.map((option) => (
                  <MenuItem key={option} value={option}>
                    {option}
                  </MenuItem>
                ))}
              </TextField>
            </Box>
            <Divider />
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Driver</TableCell>
                    <TableCell>Vehicle</TableCell>
                    <TableCell>Economics</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="right">Action</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredApplications.map((application) => (
                    <TableRow key={application.id}>
                      <TableCell>
                        <Stack spacing={0.2}>
                          <Typography variant="subtitle2">{application.drivers?.full_name}</Typography>
                          <Typography color="text.secondary">{application.drivers?.email}</Typography>
                        </Stack>
                      </TableCell>
                      <TableCell>
                        {application.vehicles?.year} {application.vehicles?.make} {application.vehicles?.model}
                      </TableCell>
                      <TableCell>
                        <Stack spacing={0.2}>
                          <Typography variant="subtitle2">
                            {application.vehicles ? money(application.vehicles.weekly_rate) : 'N/A'}
                          </Typography>
                          <Typography color="text.secondary">
                            Bond {application.vehicles ? money(application.vehicles.bond_amount) : 'N/A'}
                          </Typography>
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <StatusPill value={application.status} />
                      </TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={1.1} justifyContent="flex-end">
                          <Button variant="outlined" color="error" onClick={() => reject(application.id)}>
                            Reject
                          </Button>
                          <Button variant="contained" onClick={() => approve(application.id)}>
                            Approve
                          </Button>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            {!filteredApplications.length ? (
              <Typography color="text.secondary">No applications match the current filters.</Typography>
            ) : null}
          </Stack>
        </Paper>

        <Stack spacing={3}>
          <Paper sx={{ p: { xs: 2.6, md: 3.2 }, animation: 'riseIn 560ms ease both' }}>
            <TrendChart
              title="Revenue pulse"
              caption="Recent invoice amounts recorded by the current admin snapshot."
              points={paymentTrend.length ? paymentTrend : [{ label: 'N/A', value: 0 }]}
              accent="#8fb7ff"
            />
          </Paper>

          <Paper sx={{ p: { xs: 2.6, md: 3.2 }, animation: 'riseIn 600ms ease both' }}>
            <StackedBarChart
              title="Fleet distribution"
              caption="Current balance between available, reserved, and active vehicles."
              segments={fleetDistribution}
            />
          </Paper>

          <Paper sx={{ p: { xs: 2.6, md: 3.2 }, animation: 'riseIn 620ms ease both' }}>
            <StackedBarChart
              title="Subscription health"
              caption="Snapshot of active and stressed subscriptions in the current feed."
              segments={subscriptionDistribution}
            />
          </Paper>

          <Paper sx={{ p: { xs: 2.6, md: 3.2 }, animation: 'riseIn 640ms ease both' }}>
            <Stack spacing={2}>
              <Typography variant="h5">Notification feed</Typography>
              {(snapshot?.notifications || []).slice(0, 6).map((notification) => (
                <Stack key={notification.id} spacing={0.5} sx={{ py: 1 }}>
                  <Stack direction="row" justifyContent="space-between" spacing={2}>
                    <Typography variant="subtitle2">
                      {notification.template_key.replaceAll('_', ' ')}
                    </Typography>
                    <Typography color="text.secondary">{notification.channel}</Typography>
                  </Stack>
                  <Typography color="text.secondary">{notification.body}</Typography>
                </Stack>
              ))}
              {!snapshot?.notifications.length ? (
                <Typography color="text.secondary">No notification activity recorded yet.</Typography>
              ) : null}
            </Stack>
          </Paper>
        </Stack>
      </Box>

      <Paper sx={{ p: { xs: 2.6, md: 3.2 }, animation: 'riseIn 660ms ease both' }}>
        <Stack spacing={2}>
          <Typography variant="h4">Recent payment exceptions</Typography>
          <Typography color="text.secondary">
            Dense ledger for invoice failures and settlement follow-up.
          </Typography>
          <Box
            sx={{
              display: 'grid',
              gap: 1.5,
              gridTemplateColumns: { xs: '1fr', md: 'minmax(220px, 0.8fr) 220px' },
            }}
          >
            <TextField
              select
              label="Payment state"
              value={paymentFilter}
              onChange={(event) => setPaymentFilter(event.target.value as typeof paymentFilter)}
            >
              <MenuItem value="all">All payments</MenuItem>
              <MenuItem value="failed">Failed only</MenuItem>
              <MenuItem value="paid">Paid only</MenuItem>
            </TextField>
          </Box>
          <Divider />
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Amount</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Date</TableCell>
                  <TableCell>Notes</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredPayments.slice(0, 8).map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell>{money(payment.amount)}</TableCell>
                    <TableCell>
                      <StatusPill value={payment.status} />
                    </TableCell>
                    <TableCell>
                      {payment.paid_at
                        ? new Date(payment.paid_at).toLocaleDateString('en-AU', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })
                        : 'Pending'}
                    </TableCell>
                    <TableCell sx={{ color: 'text.secondary' }}>
                      {payment.failure_message || 'No exception recorded.'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          {!filteredPayments.length ? (
            <Typography color="text.secondary">
              No payments match the current filter.
            </Typography>
          ) : null}
        </Stack>
      </Paper>
    </Stack>
  );
}
