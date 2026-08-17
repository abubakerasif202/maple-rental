import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { DashboardSummaryResponse } from '../../types';

type RevenueTrend = DashboardSummaryResponse['revenue_trend'];
type StatusDistribution = DashboardSummaryResponse['status_distribution'];

const tooltipStyle = {
  background: '#061425',
  border: '1px solid rgba(223,177,37,0.25)',
  borderRadius: '16px',
  color: '#fff',
};

const formatCurrency = (value: number) =>
  `$${Number(value ?? 0).toLocaleString('en-AU', { maximumFractionDigits: 2 })}`;

export const describeRevenueTrend = (data: RevenueTrend) => {
  if (!data || data.length === 0) {
    return 'Revenue trend chart. No revenue data available for this period.';
  }

  const first = data[0];
  const last = data[data.length - 1];
  const peak = data.reduce(
    (highest, point) => (point.revenue > highest.revenue ? point : highest),
    first
  );

  if (data.length === 1) {
    return `Revenue trend chart. ${first.label}: ${formatCurrency(first.revenue)}.`;
  }

  const direction =
    last.revenue > first.revenue
      ? 'rose'
      : last.revenue < first.revenue
        ? 'fell'
        : 'was unchanged';

  return (
    `Revenue trend chart covering ${data.length} periods from ${first.label} to ${last.label}. ` +
    `Revenue ${direction} from ${formatCurrency(first.revenue)} to ${formatCurrency(last.revenue)}. ` +
    `Highest was ${formatCurrency(peak.revenue)} in ${peak.label}.`
  );
};

export const describeStatusDistribution = (data: StatusDistribution) => {
  if (!data || data.length === 0) {
    return 'Status distribution chart. No status data available.';
  }

  const total = data.reduce((sum, entry) => sum + entry.value, 0);
  const breakdown = data.map((entry) => `${entry.label}: ${entry.value}`).join(', ');

  return `Status distribution chart. ${total} records in total. ${breakdown}.`;
};

export function RevenueTrendChart({ data }: { data: RevenueTrend }) {
  return (
    <div role="img" aria-label={describeRevenueTrend(data)} className="h-full w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id="dashboardRevenueFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="5%" stopColor="#dfb125" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#dfb125" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis dataKey="label" stroke="#94a3b8" tickLine={false} axisLine={false} />
          <YAxis
            stroke="#94a3b8"
            tickFormatter={(value) => `$${value}`}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip contentStyle={tooltipStyle} />
          <Area
            dataKey="revenue"
            fill="url(#dashboardRevenueFill)"
            stroke="#dfb125"
            strokeWidth={2}
            type="monotone"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function StatusDistributionChart({ data }: { data: StatusDistribution }) {
  return (
    <div role="img" aria-label={describeStatusDistribution(data)} className="h-full w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis dataKey="label" stroke="#94a3b8" tickLine={false} axisLine={false} />
          <YAxis
            stroke="#94a3b8"
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
          />
          <Tooltip contentStyle={tooltipStyle} />
          <Bar dataKey="value" radius={[12, 12, 0, 0]}>
            {data.map((entry, index) => (
              <Cell
                key={`${entry.label}-${index}`}
                fill={index === 0 ? '#dfb125' : '#7b8ca3'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
