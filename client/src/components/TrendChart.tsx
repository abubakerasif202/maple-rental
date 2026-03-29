import { useMemo, useState } from 'react';
import { Box, Stack, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';

type TrendPoint = {
  label: string;
  value: number;
};

type TrendChartProps = {
  title: string;
  caption: string;
  points: TrendPoint[];
  accent?: string;
};

export function TrendChart({
  title,
  caption,
  points,
  accent = '#c6a76a',
}: TrendChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(points.length ? points.length - 1 : null);
  const gradientId = `trend-${title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
  const values = points.map((point) => point.value);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(max - min, 1);
  const height = 160;
  const width = 520;

  const positions = useMemo(
    () =>
      points.map((point, index) => ({
        ...point,
        x: (index / Math.max(points.length - 1, 1)) * width,
        y: height - ((point.value - min) / range) * (height - 18) - 9,
      })),
    [height, min, points, range, width],
  );

  const path = positions
    .map((point, index) => {
      return `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`;
    })
    .join(' ');

  const area = `${path} L ${width} ${height} L 0 ${height} Z`;
  const activePoint =
    activeIndex !== null && positions[activeIndex] ? positions[activeIndex] : null;

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
          px: 2,
          py: 1.8,
        }}
        onMouseLeave={() => setActiveIndex(null)}
      >
        {activePoint ? (
          <Box
            sx={{
              position: 'absolute',
              top: 12,
              left: `calc(${(activePoint.x / width) * 100}% + 16px)`,
              transform: 'translateX(-50%)',
              px: 1.4,
              py: 1,
              borderRadius: 3,
              border: `1px solid ${alpha('#ffffff', 0.08)}`,
              backgroundColor: alpha('#0a0e14', 0.88),
              backdropFilter: 'blur(10px)',
              pointerEvents: 'none',
              minWidth: 108,
            }}
          >
            <Typography variant="subtitle2">{activePoint.label}</Typography>
            <Typography color="text.secondary">{activePoint.value}</Typography>
          </Box>
        ) : null}
        <svg viewBox={`0 0 ${width} ${height + 32}`} width="100%" height="220" role="img">
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={alpha(accent, 0.34)} />
              <stop offset="100%" stopColor={alpha(accent, 0)} />
            </linearGradient>
          </defs>

          {[0.25, 0.5, 0.75].map((ratio) => {
            const y = height * ratio;
            return (
              <line
                key={ratio}
                x1="0"
                x2={width}
                y1={y}
                y2={y}
                stroke={alpha('#ffffff', 0.08)}
                strokeDasharray="4 8"
              />
            );
          })}

          <path d={area} fill={`url(#${gradientId})`} />
          <path d={path} fill="none" stroke={accent} strokeWidth="3" strokeLinecap="round" />
          {activePoint ? (
            <line
              x1={activePoint.x}
              x2={activePoint.x}
              y1="0"
              y2={height}
              stroke={alpha(accent, 0.4)}
              strokeDasharray="4 6"
            />
          ) : null}

          {positions.map((point, index) => {
            return (
              <g key={point.label}>
                <circle cx={point.x} cy={point.y} r={activeIndex === index ? '7' : '4.5'} fill={accent} />
                <circle
                  cx={point.x}
                  cy={point.y}
                  r="14"
                  fill="transparent"
                  onMouseEnter={() => setActiveIndex(index)}
                  onFocus={() => setActiveIndex(index)}
                  tabIndex={0}
                />
                <text
                  x={point.x}
                  y={height + 22}
                  textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'}
                  fontSize="11"
                  fill={alpha('#f6f0e3', 0.64)}
                >
                  {point.label}
                </text>
              </g>
            );
          })}
        </svg>
      </Box>
    </Stack>
  );
}
