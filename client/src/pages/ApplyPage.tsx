import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Divider,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import LockRoundedIcon from '@mui/icons-material/LockRounded';
import AssignmentRoundedIcon from '@mui/icons-material/AssignmentRounded';
import TaskAltRoundedIcon from '@mui/icons-material/TaskAltRounded';
import { useSearchParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { PageIntro } from '@/components/PageIntro';
import { StatusPill } from '@/components/StatusPill';
import { VehicleVisual } from '@/components/VehicleVisual';
import type { Vehicle } from '@/types';

const money = (value: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(value);

const workflow = [
  {
    icon: <AssignmentRoundedIcon fontSize="small" />,
    title: 'Apply once',
    copy: 'The frontend submits a single application payload to the API and creates the driver account server-side.',
  },
  {
    icon: <TaskAltRoundedIcon fontSize="small" />,
    title: 'Ops approval',
    copy: 'Admin approval reserves the vehicle and issues the contract PDF into Supabase Storage.',
  },
  {
    icon: <LockRoundedIcon fontSize="small" />,
    title: 'Billing activation',
    copy: 'Stripe checkout only opens after approval, keeping subscription control behind the backend.',
  },
];

export function ApplyPage() {
  const [searchParams] = useSearchParams();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const defaultVehicleId = searchParams.get('vehicleId') || '';
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    password: '',
    licenseNumber: '',
    vehicleId: defaultVehicleId,
    experienceYears: 0,
    preferredStartDate: '',
    notes: '',
  });

  useEffect(() => {
    api.getVehicles().then((payload) => setVehicles(payload.vehicles)).catch(() => undefined);
  }, []);

  const selectedVehicle = useMemo(
    () => vehicles.find((vehicle) => vehicle.id === form.vehicleId) || null,
    [form.vehicleId, vehicles],
  );

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      await api.submitApplication(form);
      setMessage('Application submitted. Log in after approval begins to track the contract and billing state.');
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Submission failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack spacing={4}>
      <PageIntro
        eyebrow="Driver onboarding"
        title="Submit a premium onboarding package"
        description="One intake flow creates the driver account, links a preferred vehicle, and prepares the approval-to-billing pipeline."
      />

      <Box
        sx={{
          display: 'grid',
          gap: 3,
          gridTemplateColumns: {
            xs: '1fr',
            xl: 'minmax(0, 1.1fr) minmax(360px, 0.7fr)',
          },
        }}
      >
        <Paper sx={{ p: { xs: 2.6, md: 3.4 }, animation: 'riseIn 520ms ease both' }}>
          <Stack spacing={3}>
            <Stack spacing={1}>
              <Typography variant="h4">Application details</Typography>
              <Typography color="text.secondary">
                Keep the form disciplined. Everything here feeds approvals, contracts, and billing exactly once.
              </Typography>
            </Stack>

            {message ? <Alert severity="success">{message}</Alert> : null}
            {error ? <Alert severity="error">{error}</Alert> : null}

            <Stack component="form" spacing={2.2} onSubmit={handleSubmit}>
              <TextField
                label="Full name"
                value={form.fullName}
                onChange={(event) => setForm({ ...form, fullName: event.target.value })}
                required
              />
              <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
                <TextField
                  label="Email"
                  type="email"
                  fullWidth
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                  required
                />
                <TextField
                  label="Phone"
                  fullWidth
                  value={form.phone}
                  onChange={(event) => setForm({ ...form, phone: event.target.value })}
                  required
                />
              </Box>
              <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
                <TextField
                  label="Password"
                  type="password"
                  fullWidth
                  value={form.password}
                  onChange={(event) => setForm({ ...form, password: event.target.value })}
                  required
                />
                <TextField
                  label="Licence number"
                  fullWidth
                  value={form.licenseNumber}
                  onChange={(event) => setForm({ ...form, licenseNumber: event.target.value })}
                  required
                />
              </Box>
              <TextField
                label="Preferred vehicle"
                select
                value={form.vehicleId}
                onChange={(event) => setForm({ ...form, vehicleId: event.target.value })}
                required
              >
                {vehicles.map((vehicle) => (
                  <MenuItem key={vehicle.id} value={vehicle.id}>
                    {vehicle.year} {vehicle.make} {vehicle.model}
                  </MenuItem>
                ))}
              </TextField>
              <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
                <TextField
                  label="Experience years"
                  type="number"
                  fullWidth
                  value={form.experienceYears}
                  onChange={(event) =>
                    setForm({ ...form, experienceYears: Number(event.target.value) })
                  }
                  required
                />
                <TextField
                  label="Preferred start date"
                  type="date"
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  value={form.preferredStartDate}
                  onChange={(event) => setForm({ ...form, preferredStartDate: event.target.value })}
                />
              </Box>
              <TextField
                label="Operational notes"
                multiline
                minRows={5}
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
              />
              <Button type="submit" variant="contained" size="large" disabled={loading}>
                {loading ? 'Submitting...' : 'Submit application'}
              </Button>
            </Stack>
          </Stack>
        </Paper>

        <Stack spacing={3}>
          <Paper sx={{ p: { xs: 2.6, md: 3.2 }, animation: 'riseIn 560ms ease both' }}>
            <Stack spacing={2}>
              <Typography variant="h5">Selected vehicle</Typography>
              {selectedVehicle ? (
                <>
                  <VehicleVisual vehicle={selectedVehicle} height={220} />
                  <Stack direction="row" justifyContent="space-between" spacing={2} alignItems="flex-start">
                    <Stack spacing={0.6}>
                      <Typography variant="h4">
                        {selectedVehicle.year} {selectedVehicle.make} {selectedVehicle.model}
                      </Typography>
                      <Typography color="text.secondary">
                        Plate {selectedVehicle.plate_number}
                      </Typography>
                    </Stack>
                    <StatusPill value={selectedVehicle.status} />
                  </Stack>
                  <Divider />
                  <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                    <Stack spacing={0.35}>
                      <Typography variant="overline">Weekly rate</Typography>
                      <Typography variant="h5">{money(selectedVehicle.weekly_rate)}</Typography>
                    </Stack>
                    <Stack spacing={0.35}>
                      <Typography variant="overline">Bond</Typography>
                      <Typography variant="h5">{money(selectedVehicle.bond_amount)}</Typography>
                    </Stack>
                  </Box>
                </>
              ) : (
                <Typography color="text.secondary">
                  Choose a vehicle to surface pricing and assignment context.
                </Typography>
              )}
            </Stack>
          </Paper>

          <Paper sx={{ p: { xs: 2.6, md: 3.2 }, animation: 'riseIn 600ms ease both' }}>
            <Stack spacing={2}>
              <Typography variant="h5">What happens next</Typography>
              {workflow.map((step) => (
                <Stack key={step.title} direction="row" spacing={1.5} alignItems="flex-start">
                  <Box sx={{ mt: 0.2, color: 'primary.main' }}>{step.icon}</Box>
                  <Stack spacing={0.4}>
                    <Typography variant="subtitle1">{step.title}</Typography>
                    <Typography color="text.secondary">{step.copy}</Typography>
                  </Stack>
                </Stack>
              ))}
            </Stack>
          </Paper>
        </Stack>
      </Box>
    </Stack>
  );
}
