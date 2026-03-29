import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Divider,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import { Navigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { MetricCard } from '@/components/MetricCard';
import { PageIntro } from '@/components/PageIntro';
import { StatusPill } from '@/components/StatusPill';
import { TrendChart } from '@/components/TrendChart';
import { useAuthStore } from '@/store/authStore';
import type { BillingSummary, DriverDashboard } from '@/types';

const money = (value: number, currency = 'AUD') =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency }).format(value);

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Pending';

export function BillingPage() {
  const { user } = useAuthStore();
  const [billing, setBilling] = useState<BillingSummary | null>(null);
  const [dashboard, setDashboard] = useState<DriverDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingCheckout, setLoadingCheckout] = useState(false);

  useEffect(() => {
    if (!user || user.role === 'admin') {
      return;
    }

    Promise.all([api.getBilling(), api.getMe()])
      .then(([billingSummary, dashboardPayload]) => {
        setBilling(billingSummary);
        setDashboard(dashboardPayload.dashboard);
      })
      .catch((caughtError) =>
        setError(caughtError instanceof Error ? caughtError.message : 'Failed to load billing'),
      );
  }, [user]);

  const checkoutApplication = useMemo(
    () => dashboard?.applications.find((application) => application.status === 'approved') || null,
    [dashboard],
  );

  const latestPayment = billing?.payments?.[0] || null;
  const paymentTrend = (billing?.payments || [])
    .slice(0, 6)
    .reverse()
    .map((payment, index) => ({
      label: payment.paid_at
        ? new Date(payment.paid_at).toLocaleDateString('en-AU', { day: '2-digit', month: 'short' })
        : `P${index + 1}`,
      value: Number(payment.amount),
    }));

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role === 'admin') {
    return <Navigate to="/admin" replace />;
  }

  const startCheckout = async () => {
    if (!checkoutApplication) {
      return;
    }

    setLoadingCheckout(true);
    setError(null);

    try {
      const result = await api.subscribe({
        intent: 'checkout',
        applicationId: checkoutApplication.id,
      });
      if (result.url) {
        window.location.href = result.url;
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Checkout failed');
    } finally {
      setLoadingCheckout(false);
    }
  };

  const openPortal = async () => {
    try {
      const result = await api.subscribe({
        intent: 'portal',
      });
      if (result.url) {
        window.location.href = result.url;
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Portal failed');
    }
  };

  return (
    <Stack spacing={4}>
      <PageIntro
        eyebrow="Billing operations"
        title="Subscription control and payment health"
        description="All checkout, subscription, and portal actions are created server-side so the browser never handles Stripe secrets."
        actions={
          <>
            <Button variant="outlined" onClick={openPortal}>
              Open portal
            </Button>
            <Button
              variant="contained"
              onClick={startCheckout}
              disabled={!checkoutApplication || loadingCheckout}
            >
              {loadingCheckout ? 'Opening checkout...' : 'Start checkout'}
            </Button>
          </>
        }
      />

      {error ? <Alert severity="error">{error}</Alert> : null}

      <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' } }}>
        <MetricCard label="Subscriptions" value={billing?.subscriptions.length || 0} helper="Every live or historical subscription linked to your driver profile." />
        <MetricCard label="Contracts" value={billing?.contracts.length || 0} helper="Issued contracts stay accessible through signed storage URLs." />
        <MetricCard
          label="Latest payment"
          value={latestPayment ? money(latestPayment.amount, latestPayment.currency.toUpperCase()) : 'No activity'}
          helper={latestPayment ? `Status: ${latestPayment.status}` : 'No invoices recorded yet.'}
        />
      </Box>

      <Box
        sx={{
          display: 'grid',
          gap: 3,
          gridTemplateColumns: { xs: '1fr', xl: 'minmax(0, 1.25fr) minmax(360px, 0.75fr)' },
        }}
      >
        <Paper sx={{ p: { xs: 2.6, md: 3.4 }, animation: 'riseIn 520ms ease both' }}>
          <Stack spacing={2.2}>
            <Typography variant="h4">Subscription ledger</Typography>
            <Divider />
            {(billing?.subscriptions || []).map((subscription) => (
              <Box
                key={subscription.id}
                sx={{
                  py: 1.5,
                  display: 'grid',
                  gap: 1.5,
                  alignItems: 'center',
                  gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) auto auto' },
                }}
              >
                <Stack spacing={0.35}>
                  <Typography variant="subtitle1">
                    {subscription.vehicles?.year} {subscription.vehicles?.make} {subscription.vehicles?.model}
                  </Typography>
                  <Typography color="text.secondary">
                    Current period ends {formatDate(subscription.current_period_end)}
                  </Typography>
                </Stack>
                <Typography variant="subtitle1">{money(subscription.weekly_rate)}</Typography>
                <StatusPill value={subscription.status} />
              </Box>
            ))}
            {!billing?.subscriptions.length ? (
              <Typography color="text.secondary">
                No subscription records yet. Once approval is complete, checkout can create the first one.
              </Typography>
            ) : null}
          </Stack>
        </Paper>

        <Stack spacing={3}>
          <Paper sx={{ p: { xs: 2.6, md: 3.2 }, animation: 'riseIn 560ms ease both' }}>
            <TrendChart
              title="Payment trend"
              caption="Recent invoice amounts passing through the current billing profile."
              points={paymentTrend.length ? paymentTrend : [{ label: 'N/A', value: 0 }]}
              accent="#8fb7ff"
            />
          </Paper>

          <Paper sx={{ p: { xs: 2.6, md: 3.2 }, animation: 'riseIn 600ms ease both' }}>
            <Stack spacing={2}>
              <Typography variant="h5">Contract vault</Typography>
              {(billing?.contracts || [])
                .filter((contract) => Boolean(contract.signed_url))
                .map((contract) => (
                  <Button
                    key={contract.id}
                    variant="outlined"
                    component="a"
                    href={contract.signed_url || '#'}
                    target="_blank"
                    rel="noreferrer"
                    endIcon={<OpenInNewRoundedIcon />}
                    sx={{ justifyContent: 'space-between' }}
                  >
                    {contract.file_name}
                  </Button>
                ))}
              {!billing?.contracts.length ? (
                <Typography color="text.secondary">
                  Your contract is added here immediately after admin approval.
                </Typography>
              ) : null}
            </Stack>
          </Paper>
        </Stack>
      </Box>

      <Paper sx={{ p: { xs: 2.6, md: 3.2 }, animation: 'riseIn 640ms ease both' }}>
        <Stack spacing={2}>
          <Typography variant="h4">Payment queue</Typography>
          <Typography color="text.secondary">
            Dense ledger view for settlement status, failures, and recent invoice behavior.
          </Typography>
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
                {(billing?.payments || []).slice(0, 8).map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell>{money(payment.amount, payment.currency.toUpperCase())}</TableCell>
                    <TableCell>
                      <StatusPill value={payment.status} />
                    </TableCell>
                    <TableCell>{payment.paid_at ? formatDate(payment.paid_at) : 'Awaiting settlement'}</TableCell>
                    <TableCell sx={{ color: 'text.secondary' }}>
                      {payment.failure_message || 'No exceptions recorded.'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          {!billing?.payments.length ? (
            <Typography color="text.secondary">
              Payment activity will appear here after billing starts.
            </Typography>
          ) : null}
        </Stack>
      </Paper>
    </Stack>
  );
}
