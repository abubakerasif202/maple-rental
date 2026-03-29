import { Box, Stack, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import DirectionsCarFilledRoundedIcon from '@mui/icons-material/DirectionsCarFilledRounded';
import type { Vehicle } from '@/types';
import editorialOne from '@/assets/vehicle-editorial-01.svg';
import editorialTwo from '@/assets/vehicle-editorial-02.svg';
import editorialThree from '@/assets/vehicle-editorial-03.svg';

const fallbackAssets = [editorialOne, editorialTwo, editorialThree];

const pickFallbackAsset = (vehicle: Vehicle) => {
  const seed = `${vehicle.make}-${vehicle.model}-${vehicle.year}`;
  const hash = [...seed].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return fallbackAssets[hash % fallbackAssets.length];
};

export function VehicleVisual({
  vehicle,
  height = 320,
}: {
  vehicle: Vehicle | null;
  height?: number;
}) {
  if (!vehicle) {
    return (
      <Box
        sx={{
          height,
          borderRadius: 6,
          border: `1px solid ${alpha('#ffffff', 0.08)}`,
          backgroundColor: alpha('#ffffff', 0.03),
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <Stack spacing={1} alignItems="center">
          <DirectionsCarFilledRoundedIcon sx={{ fontSize: 42, color: 'primary.main' }} />
          <Typography color="text.secondary">Vehicle preview unavailable</Typography>
        </Stack>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        position: 'relative',
        height,
        borderRadius: 6,
        overflow: 'hidden',
        border: `1px solid ${alpha('#ffffff', 0.08)}`,
        background: `linear-gradient(180deg, ${alpha('#05070d', vehicle.image_url ? 0.08 : 0.2)} 0%, ${alpha('#05070d', 0.58)} 100%), url(${vehicle.image_url || pickFallbackAsset(vehicle)}) center/cover`,
      }}
    >
      <Stack
        spacing={1}
        sx={{
          position: 'absolute',
          inset: 'auto 24px 24px 24px',
          zIndex: 1,
        }}
      >
        <Typography variant="overline">{vehicle.plate_number}</Typography>
        <Typography variant="h3" sx={{ maxWidth: 420 }}>
          {vehicle.year} {vehicle.make} {vehicle.model}
        </Typography>
      </Stack>
    </Box>
  );
}
