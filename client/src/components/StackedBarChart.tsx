import { useMemo, useState } from 'react';
import { Box, Stack, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';

type Segment = {
  label: string;
  value: number;
  color: string;
};

export function StackedBarChart({
  title,
  caption,
  segments,
}: {
  title: string;
  caption: string;
  segments: Segment[];
}) {
  const [activeLabel, setActiveLabel] = useState<string | null>(segments[0]?.label || null);
  const total = Math.max(
    segments.reduce((sum, segment) => sum + Math.max(segment.value, 0), 0),
    1,
  );
  const activeSegment = useMemo(
    () => segments.find((segment) => segment.label === activeLabel) || segments[0] || null,
    [activeLabel, segments],
  );

  return (
    <Stack spacing={2}>
      <Stack spacing={0.4}>
        <Typography variant="h5">{title}</Typography>
        <Typography color="text.secondary">{caption}</Typography>
      </Stack>

      <Box
        sx={{
          position: 'relative',
          borderRadius: 5,
          border: `1px solid ${alpha('#ffffff', 0.08)}`,
          backgroundColor: alpha('#ffffff', 0.02),
          overflow: 'hidden',
        }}
      >
        {activeSegment ? (
          <Box
            sx={{
              position: 'absolute',
              top: 10,
              right: 10,
              px: 1.2,
              py: 0.8,
              borderRadius: 3,
              border: `1px solid ${alpha('#ffffff', 0.08)}`,
              backgroundColor: alpha('#0a0e14', 0.86),
              backdropFilter: 'blur(10px)',
              zIndex: 1,
            }}
          >
            <Typography variant="subtitle2">{activeSegment.label}</Typography>
            <Typography color="text.secondary">
              {activeSegment.value} · {Math.round((activeSegment.value / total) * 100)}%
            </Typography>
          </Box>
        ) : null}
        <Stack direction="row" sx={{ height: 18, width: '100%' }}>
          {segments.map((segment) => (
            <Box
              key={segment.label}
              sx={{
                width: `${(segment.value / total) * 100}%`,
                backgroundColor: segment.color,
                opacity: activeSegment && activeSegment.label !== segment.label ? 0.62 : 1,
                transition: 'opacity 160ms ease',
              }}
              onMouseEnter={() => setActiveLabel(segment.label)}
            />
          ))}
        </Stack>
      </Box>

      <Stack spacing={1.1}>
        {segments.map((segment) => (
          <Stack
            key={segment.label}
            direction="row"
            justifyContent="space-between"
            alignItems="center"
            spacing={2}
          >
            <Stack direction="row" spacing={1.2} alignItems="center">
              <Box
                sx={{
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  backgroundColor: segment.color,
                }}
              />
              <Typography
                variant="subtitle2"
                sx={{
                  color: activeSegment?.label === segment.label ? 'text.primary' : 'inherit',
                }}
              >
                {segment.label}
              </Typography>
            </Stack>
            <Typography color="text.secondary">
              {segment.value} · {Math.round((segment.value / total) * 100)}%
            </Typography>
          </Stack>
        ))}
      </Stack>
    </Stack>
  );
}
