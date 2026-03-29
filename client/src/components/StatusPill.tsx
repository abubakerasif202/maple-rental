import { alpha } from '@mui/material/styles';
import { Chip } from '@mui/material';

const paletteByStatus: Record<string, { fg: string; bg: string; border: string }> = {
  active: { fg: '#80ffd2', bg: alpha('#2f8f73', 0.18), border: alpha('#80ffd2', 0.22) },
  approved: { fg: '#80ffd2', bg: alpha('#2f8f73', 0.18), border: alpha('#80ffd2', 0.22) },
  available: { fg: '#80ffd2', bg: alpha('#2f8f73', 0.18), border: alpha('#80ffd2', 0.22) },
  subscribed: { fg: '#80ffd2', bg: alpha('#2f8f73', 0.18), border: alpha('#80ffd2', 0.22) },
  pending: { fg: '#f8d38b', bg: alpha('#8f7236', 0.22), border: alpha('#f8d38b', 0.22) },
  reserved: { fg: '#f8d38b', bg: alpha('#8f7236', 0.22), border: alpha('#f8d38b', 0.22) },
  checkout_pending: { fg: '#f8d38b', bg: alpha('#8f7236', 0.22), border: alpha('#f8d38b', 0.22) },
  suspended: { fg: '#ffbe7a', bg: alpha('#9a5928', 0.22), border: alpha('#ffbe7a', 0.24) },
  past_due: { fg: '#ffbe7a', bg: alpha('#9a5928', 0.22), border: alpha('#ffbe7a', 0.24) },
  unpaid: { fg: '#ffbe7a', bg: alpha('#9a5928', 0.22), border: alpha('#ffbe7a', 0.24) },
  failed: { fg: '#ff9999', bg: alpha('#8f2d3a', 0.22), border: alpha('#ff9999', 0.24) },
  rejected: { fg: '#ff9999', bg: alpha('#8f2d3a', 0.22), border: alpha('#ff9999', 0.24) },
  disabled: { fg: '#ff9999', bg: alpha('#8f2d3a', 0.22), border: alpha('#ff9999', 0.24) },
  canceled: { fg: '#b9c3d4', bg: alpha('#4b5563', 0.22), border: alpha('#b9c3d4', 0.18) },
  maintenance: { fg: '#b9c3d4', bg: alpha('#4b5563', 0.22), border: alpha('#b9c3d4', 0.18) },
  inactive: { fg: '#b9c3d4', bg: alpha('#4b5563', 0.22), border: alpha('#b9c3d4', 0.18) },
};

const formatLabel = (value: string) =>
  value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());

export function StatusPill({ value }: { value: string }) {
  const tone = paletteByStatus[value] || paletteByStatus.inactive;

  return (
    <Chip
      label={formatLabel(value)}
      size="small"
      sx={{
        color: tone.fg,
        backgroundColor: tone.bg,
        borderColor: tone.border,
      }}
    />
  );
}
