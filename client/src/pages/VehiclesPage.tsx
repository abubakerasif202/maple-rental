import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Divider,
  InputAdornment,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import ArrowOutwardRoundedIcon from '@mui/icons-material/ArrowOutwardRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import { api } from '@/lib/api';
import { MetricCard } from '@/components/MetricCard';
import { PageIntro } from '@/components/PageIntro';
import { StatusPill } from '@/components/StatusPill';
import { TrendChart } from '@/components/TrendChart';
import { VehicleVisual } from '@/components/VehicleVisual';
import { useViewStateStore } from '@/store/viewStateStore';
import type { Vehicle } from '@/types';

const money = (value: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(value);

export function VehiclesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [error, setError] = useState<string | null>(null);
  const {
    fleetQuery,
    fleetStatusFilter,
    fleetSort,
    setFleetState,
  } = useViewStateStore();
  const [query, setQuery] = useState(searchParams.get('q') ?? fleetQuery);
  const [statusFilter, setStatusFilter] = useState<'all' | Vehicle['status']>(
    (searchParams.get('status') as 'all' | Vehicle['status'] | null) ?? fleetStatusFilter,
  );
  const [sortBy, setSortBy] = useState<'featured' | 'rate_desc' | 'rate_asc' | 'year_desc'>(
    (searchParams.get('sort') as 'featured' | 'rate_desc' | 'rate_asc' | 'year_desc' | null) ??
      fleetSort,
  );

  useEffect(() => {
    setFleetState({ query, statusFilter, sortBy });

    const nextParams = new URLSearchParams();
    if (query) {
      nextParams.set('q', query);
    }
    if (statusFilter !== 'all') {
      nextParams.set('status', statusFilter);
    }
    if (sortBy !== 'featured') {
      nextParams.set('sort', sortBy);
    }

    if (nextParams.toString() !== searchParams.toString()) {
      setSearchParams(nextParams, { replace: true });
    }
  }, [query, searchParams, setFleetState, setSearchParams, sortBy, statusFilter]);

  useEffect(() => {
    api
      .getVehicles()
      .then((payload) => setVehicles(payload.vehicles))
      .catch((caughtError) =>
        setError(caughtError instanceof Error ? caughtError.message : 'Failed to load vehicles'),
      );
  }, []);

  const stats = useMemo(() => {
    const available = vehicles.filter((vehicle) => vehicle.status === 'available').length;
    const active = vehicles.filter((vehicle) => vehicle.status === 'active').length;
    const reserveReady = vehicles.filter((vehicle) =>
      ['available', 'reserved'].includes(vehicle.status),
    ).length;

    return {
      available,
      active,
      reserveReady,
    };
  }, [vehicles]);

  const filteredVehicles = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    const matched = vehicles.filter((vehicle) => {
      const matchesQuery =
        !normalizedQuery ||
        `${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.plate_number}`
          .toLowerCase()
          .includes(normalizedQuery);
      const matchesStatus = statusFilter === 'all' || vehicle.status === statusFilter;
      return matchesQuery && matchesStatus;
    });

    switch (sortBy) {
      case 'rate_desc':
        return [...matched].sort((left, right) => right.weekly_rate - left.weekly_rate);
      case 'rate_asc':
        return [...matched].sort((left, right) => left.weekly_rate - right.weekly_rate);
      case 'year_desc':
        return [...matched].sort((left, right) => right.year - left.year);
      default:
        return matched;
    }
  }, [query, sortBy, statusFilter, vehicles]);

  const featuredVehicle = useMemo(
    () =>
      filteredVehicles.find((vehicle) => vehicle.status === 'available') ||
      filteredVehicles[0] ||
      null,
    [filteredVehicles],
  );

  const comparisonVehicles = useMemo(
    () => filteredVehicles.filter((vehicle) => vehicle.id !== featuredVehicle?.id).slice(0, 3),
    [featuredVehicle?.id, filteredVehicles],
  );

  const rateTrend = useMemo(
    () =>
      vehicles.slice(0, 6).map((vehicle) => ({
        label: vehicle.make.slice(0, 3).toUpperCase(),
        value: Number(vehicle.weekly_rate),
      })),
    [vehicles],
  );

  return (
    <Stack spacing={4}>
      <PageIntro
        eyebrow="Fleet market"
        title="Operational fleet inventory"
        description="Review live vehicle availability, pricing posture, and assignment readiness before creating a driver application."
        actions={
          <Button
            variant="contained"
            component={RouterLink}
            to="/apply"
            endIcon={<ArrowOutwardRoundedIcon />}
          >
            Start application
          </Button>
        }
      />

      {error ? <Alert severity="error">{error}</Alert> : null}

      <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' } }}>
        <MetricCard label="Available now" value={stats.available} helper="Vehicles ready for immediate review." />
        <MetricCard label="On road" value={stats.active} helper="Assigned units with an active subscription." />
        <MetricCard label="Reserve ready" value={stats.reserveReady} helper="Approvals can reserve these vehicles without ops intervention." />
      </Box>

      <Box
        sx={{
          display: 'grid',
          gap: 3,
          gridTemplateColumns: { xs: '1fr', xl: 'minmax(0, 1.25fr) minmax(380px, 0.75fr)' },
        }}
      >
        <Paper sx={{ p: { xs: 2.4, md: 3.2 }, animation: 'riseIn 520ms ease both' }}>
          <Stack spacing={2.2}>
            <Typography variant="overline">Featured vehicle</Typography>
            <VehicleVisual vehicle={featuredVehicle} height={360} />
            {featuredVehicle ? (
              <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2}>
                <Stack spacing={0.6}>
                  <Typography variant="h4">
                    {featuredVehicle.year} {featuredVehicle.make} {featuredVehicle.model}
                  </Typography>
                  <Typography color="text.secondary">
                    Plate {featuredVehicle.plate_number}  •  Bond {money(featuredVehicle.bond_amount)}
                  </Typography>
                </Stack>
                <Stack spacing={1} alignItems={{ xs: 'flex-start', md: 'flex-end' }}>
                  <StatusPill value={featuredVehicle.status} />
                  <Typography variant="h4">{money(featuredVehicle.weekly_rate)}/week</Typography>
                </Stack>
              </Stack>
            ) : (
              <Typography color="text.secondary">No featured vehicle is available yet.</Typography>
            )}
          </Stack>
        </Paper>

        <Stack spacing={3}>
          <Paper sx={{ p: { xs: 2.4, md: 3.2 }, animation: 'riseIn 560ms ease both' }}>
            <TrendChart
              title="Rate posture"
              caption="A quick read on the current weekly pricing spread."
              points={rateTrend.length ? rateTrend : [{ label: 'N/A', value: 0 }]}
            />
          </Paper>

          <Paper sx={{ p: { xs: 2.4, md: 3.2 }, animation: 'riseIn 600ms ease both' }}>
            <Stack spacing={2}>
              <Typography variant="h5">Secondary units</Typography>
              {comparisonVehicles.map((vehicle) => (
                <Stack key={vehicle.id} direction="row" spacing={1.5} alignItems="center">
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="subtitle1">
                      {vehicle.year} {vehicle.make} {vehicle.model}
                    </Typography>
                    <Typography color="text.secondary">
                      {money(vehicle.weekly_rate)} / week
                    </Typography>
                  </Box>
                  <StatusPill value={vehicle.status} />
                </Stack>
              ))}
              {!comparisonVehicles.length ? (
                <Typography color="text.secondary">
                  Additional vehicles will appear here as inventory expands.
                </Typography>
              ) : null}
            </Stack>
          </Paper>
        </Stack>
      </Box>

      <Paper
        sx={{
          p: { xs: 2.4, md: 3 },
          animation: 'riseIn 640ms ease both',
        }}
      >
        <Stack spacing={2.2}>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            justifyContent="space-between"
            spacing={2}
          >
            <Stack spacing={0.6}>
              <Typography variant="h4">Fleet ledger</Typography>
              <Typography color="text.secondary">
                A denser, decision-first inventory view built for operators.
              </Typography>
            </Stack>
            <Typography color="text.secondary">{filteredVehicles.length} vehicles listed</Typography>
          </Stack>

          <Box
            sx={{
              display: 'grid',
              gap: 1.5,
              gridTemplateColumns: { xs: '1fr', md: 'minmax(260px, 1.3fr) 180px 180px' },
            }}
          >
            <TextField
              placeholder="Search by make, model, plate, or year"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
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
              label="Status"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
            >
              <MenuItem value="all">All statuses</MenuItem>
              <MenuItem value="available">Available</MenuItem>
              <MenuItem value="reserved">Reserved</MenuItem>
              <MenuItem value="active">Active</MenuItem>
              <MenuItem value="maintenance">Maintenance</MenuItem>
              <MenuItem value="inactive">Inactive</MenuItem>
            </TextField>
            <TextField
              select
              label="Sort"
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as typeof sortBy)}
            >
              <MenuItem value="featured">Operational order</MenuItem>
              <MenuItem value="rate_desc">Rate high to low</MenuItem>
              <MenuItem value="rate_asc">Rate low to high</MenuItem>
              <MenuItem value="year_desc">Newest first</MenuItem>
            </TextField>
          </Box>

          <Divider />

          <Stack divider={<Divider flexItem />}>
            {filteredVehicles.map((vehicle, index) => (
              <Box
                key={vehicle.id}
                sx={{
                  py: 2.2,
                  display: 'grid',
                  gap: 2,
                  alignItems: 'center',
                  gridTemplateColumns: {
                    xs: '1fr',
                    lg: 'minmax(0, 1.4fr) minmax(0, 0.8fr) auto',
                  },
                  animation: `riseIn ${700 + index * 32}ms ease both`,
                }}
              >
                <Stack spacing={0.5}>
                  <Stack direction="row" spacing={1.2} alignItems="center" flexWrap="wrap">
                    <Typography variant="h5">
                      {vehicle.year} {vehicle.make} {vehicle.model}
                    </Typography>
                    <StatusPill value={vehicle.status} />
                  </Stack>
                  <Typography color="text.secondary">
                    Plate {vehicle.plate_number}
                    {vehicle.features?.length ? `  •  ${vehicle.features.slice(0, 3).join(' • ')}` : ''}
                  </Typography>
                </Stack>

                <Box
                  sx={{
                    display: 'grid',
                    gap: 1.2,
                    gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(2, auto)' },
                    justifyContent: { lg: 'start' },
                  }}
                >
                  <Stack spacing={0.2}>
                    <Typography variant="overline">Weekly rate</Typography>
                    <Typography variant="h5">{money(vehicle.weekly_rate)}</Typography>
                  </Stack>
                  <Stack spacing={0.2}>
                    <Typography variant="overline">Bond</Typography>
                    <Typography variant="h5">{money(vehicle.bond_amount)}</Typography>
                  </Stack>
                </Box>

                <Stack direction="row" spacing={1.4} justifyContent={{ xs: 'flex-start', lg: 'flex-end' }}>
                  <Button
                    variant="outlined"
                    component={RouterLink}
                    to={`/apply?vehicleId=${vehicle.id}`}
                    disabled={vehicle.status !== 'available'}
                  >
                    Review fit
                  </Button>
                  <Button
                    variant="contained"
                    component={RouterLink}
                    to={`/apply?vehicleId=${vehicle.id}`}
                    endIcon={<ArrowOutwardRoundedIcon />}
                    disabled={vehicle.status !== 'available'}
                  >
                    Apply
                  </Button>
                </Stack>
              </Box>
            ))}

            {!filteredVehicles.length ? (
              <Typography color="text.secondary" sx={{ py: 3 }}>
                No vehicles match the current filters.
              </Typography>
            ) : null}
          </Stack>
        </Stack>
      </Paper>
    </Stack>
  );
}
