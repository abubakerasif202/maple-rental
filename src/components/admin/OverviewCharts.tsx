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

export function RevenueTrendChart({ data }: { data: RevenueTrend }) {
  return (
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
  );
}

export function StatusDistributionChart({ data }: { data: StatusDistribution }) {
  return (
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
  );
}
