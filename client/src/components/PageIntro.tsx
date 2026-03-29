import { ReactNode } from 'react';
import { Stack, Typography } from '@mui/material';

type PageIntroProps = {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
};

export function PageIntro({ eyebrow, title, description, actions }: PageIntroProps) {
  return (
    <Stack
      direction={{ xs: 'column', md: 'row' }}
      justifyContent="space-between"
      alignItems={{ xs: 'flex-start', md: 'flex-end' }}
      spacing={3}
      sx={{ animation: 'riseIn 420ms ease both' }}
    >
      <Stack spacing={1.2} sx={{ maxWidth: 760 }}>
        <Typography variant="overline">{eyebrow}</Typography>
        <Typography variant="h2">{title}</Typography>
        <Typography color="text.secondary" sx={{ maxWidth: 640 }}>
          {description}
        </Typography>
      </Stack>
      {actions ? <Stack direction="row" spacing={1.5}>{actions}</Stack> : null}
    </Stack>
  );
}
