import { alpha } from '@mui/material/styles';
import { Paper, Stack, Typography } from '@mui/material';

type MetricCardProps = {
  label: string;
  value: string | number;
  helper?: string;
};

export function MetricCard({ label, value, helper }: MetricCardProps) {
  return (
    <Paper
      sx={{
        p: 3,
        height: '100%',
        minHeight: 148,
        backgroundColor: alpha('#ffffff', 0.02),
        transition: 'transform 180ms ease, border-color 180ms ease',
        '&:hover': {
          transform: 'translateY(-2px)',
          borderColor: alpha('#c6a76a', 0.28),
        },
      }}
    >
      <Stack spacing={1}>
        <Typography variant="overline">
          {label}
        </Typography>
        <Typography variant="h3" sx={{ lineHeight: 1 }}>
          {value}
        </Typography>
        {helper ? (
          <Typography color="text.secondary" sx={{ maxWidth: 240 }}>
            {helper}
          </Typography>
        ) : null}
      </Stack>
    </Paper>
  );
}
