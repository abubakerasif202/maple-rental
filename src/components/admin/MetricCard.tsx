import { useId, useMemo } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';

interface SparklinePoint {
  label: string;
  value: number;
}

interface MetricCardProps {
  helper: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
  numericValue?: number;
  sparklineData?: SparklinePoint[];
  value: ReactNode;
}

const buildFallbackSparkline = (numericValue = 0): SparklinePoint[] => {
  const baseValue = Math.max(1, Math.abs(numericValue));
  const multipliers = [0.62, 0.72, 0.68, 0.84, 0.79, 0.93, 1];

  return multipliers.map((multiplier, index) => ({
    label: String(index + 1),
    value: Number((baseValue * multiplier).toFixed(2)),
  }));
};

export default function MetricCard({
  helper,
  icon: Icon,
  label,
  numericValue,
  sparklineData,
  value,
}: MetricCardProps) {
  const chartId = useId().replace(/[^a-zA-Z0-9]/g, '');
  const hasRealSparkline = Boolean(sparklineData && sparklineData.length > 0);
  const data = useMemo(
    () =>
      sparklineData && sparklineData.length > 0
        ? sparklineData
        : buildFallbackSparkline(numericValue),
    [numericValue, sparklineData]
  );
  const sparklineLabel = hasRealSparkline
    ? `${label} trend across ${data.length} periods, from ${data[0].value} to ${data[data.length - 1].value}.`
    : undefined;

  return (
    <div className="rounded-lg border border-[#1e3a5f] bg-[#0b1f36] p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
            {label}
          </p>
          <h3 className="text-3xl font-bold tracking-tight text-white">
            {value}
          </h3>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-[#dfb125]/25 bg-[#dfb125]/10">
          <Icon aria-hidden="true" className="h-5 w-5 text-[#dfb125]" />
        </div>
      </div>
      <div
        className="h-16"
        role={hasRealSparkline ? 'img' : undefined}
        aria-label={sparklineLabel}
        aria-hidden={hasRealSparkline ? undefined : true}
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id={`sparkline-${chartId}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="5%" stopColor="#dfb125" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#dfb125" stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              dataKey="value"
              fill={`url(#sparkline-${chartId})`}
              isAnimationActive={false}
              stroke="#dfb125"
              strokeWidth={2}
              type="monotone"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-4 text-xs font-light text-slate-400">{helper}</p>
    </div>
  );
}
