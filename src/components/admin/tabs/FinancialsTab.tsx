import React from 'react';
import { motion } from 'motion/react';
import { RefreshCw, DollarSign, TrendingUp, AlertCircle, ShieldCheck, Loader2 } from 'lucide-react';
import { WeeklyFinancials } from '../../../lib/api';
import DateRangePicker, { type DateRangeValue } from '../DateRangePicker';
import EmptyState from '../EmptyState';
import MetricCard from '../MetricCard';

interface FinancialsTabProps {
  dateRange: DateRangeValue;
  isLoadingWeeklyFinancials: boolean;
  weeklyFinancialsError?: string | null;
  weeklyFinancials?: WeeklyFinancials;
  onDateRangeChange: (value: DateRangeValue) => void;
  onRefresh: () => void;
  formatCurrency: (value?: number | string | null) => string;
}

const renderLoadingPanel = (message: string) => (
  <div className="bg-white/5 border border-white/10 rounded-3xl p-10 flex items-center gap-4 text-sm text-brand-grey">
    <Loader2 className="w-5 h-5 animate-spin text-brand-gold" />
    <span>{message}</span>
  </div>
);

const renderErrorPanel = (message: string) => (
  <div className="rounded-3xl border border-red-500/20 bg-red-500/10 p-10 text-sm text-red-50">
    <div className="flex items-start gap-4">
      <AlertCircle className="mt-0.5 h-5 w-5 text-red-300" />
      <div>
        <h3 className="text-base font-bold text-white">Unable to load financials</h3>
        <p className="mt-2 leading-relaxed text-red-100">{message}</p>
      </div>
    </div>
  </div>
);

export default function FinancialsTab({
  dateRange,
  isLoadingWeeklyFinancials,
  weeklyFinancialsError,
  weeklyFinancials,
  onDateRangeChange,
  onRefresh,
  formatCurrency,
}: FinancialsTabProps) {
  const payoutSparkline = (weeklyFinancials?.recent_payouts || [])
    .slice()
    .reverse()
    .map((payout) => ({
      label: payout.arrival_date,
      value: payout.amount,
    }));
  const hasRevenue = Boolean(
    Number(weeklyFinancials?.projected_gross_weekly || 0) ||
      Number(weeklyFinancials?.actual_payouts_weekly || 0)
  );

  return (
    <motion.div
      key="financials"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-12"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="mb-2 text-3xl font-bold uppercase tracking-tighter text-white sm:text-4xl">
            Weekly <span className="text-brand-gold italic">Financials</span>
          </h2>
          <p className="text-brand-grey font-light">
            Projected revenue, payout performance, and recent transfers.
          </p>
        </div>
        <div className="flex w-full flex-col gap-3 md:w-auto md:items-end">
          <DateRangePicker value={dateRange} onChange={onDateRangeChange} />
          <button
            type="button"
            onClick={onRefresh}
            className="flex w-full items-center justify-center gap-3 rounded-lg border border-[#1e3a5f] bg-[#061425] px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-white transition-all hover:border-[#dfb125]/60 md:w-auto"
          >
            <RefreshCw className="w-4 h-4 text-[#dfb125]" /> Refresh Data
          </button>
        </div>
      </div>

      {isLoadingWeeklyFinancials ? (
        renderLoadingPanel('Loading weekly financials...')
      ) : weeklyFinancialsError ? (
        renderErrorPanel(weeklyFinancialsError)
      ) : (
        <>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              helper="Total billed weekly"
              icon={DollarSign}
              label="Projected Gross"
              numericValue={weeklyFinancials?.projected_gross_weekly}
              value={formatCurrency(weeklyFinancials?.projected_gross_weekly)}
            />
            <MetricCard
              helper="After estimated fees"
              icon={TrendingUp}
              label="Projected Net"
              numericValue={weeklyFinancials?.projected_net_weekly}
              value={formatCurrency(weeklyFinancials?.projected_net_weekly)}
            />
            <MetricCard
              helper="Estimated weekly costs"
              icon={AlertCircle}
              label="Platform Fees"
              numericValue={weeklyFinancials?.estimated_platform_fees}
              value={formatCurrency(weeklyFinancials?.estimated_platform_fees)}
            />
            <MetricCard
              helper="Paid out for the selected payout range"
              icon={ShieldCheck}
              label="Recent Payouts"
              numericValue={weeklyFinancials?.actual_payouts_weekly}
              sparklineData={payoutSparkline}
              value={formatCurrency(weeklyFinancials?.actual_payouts_weekly)}
            />
          </div>

          {weeklyFinancials?.recent_payouts_truncated && (
            <p className="text-xs uppercase tracking-widest text-brand-grey">
              Showing the 10 most recent Stripe payouts for the selected period.
            </p>
          )}

          {!hasRevenue && (
            <EmptyState
              description="Projected rental revenue and Stripe payouts are zero for the selected period."
              icon={DollarSign}
              title="No revenue for selected period"
            />
          )}

          <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-5 sm:px-8 sm:py-6">
              <div>
                <h3 className="text-white font-bold uppercase tracking-widest text-xs">
                  Recent Stripe Payouts
                </h3>
                <p className="text-brand-grey text-xs font-light mt-2">
                  Latest payout activity reported by the financials API.
                </p>
              </div>
            </div>

            <div className="space-y-3 p-4 md:hidden">
              {(weeklyFinancials?.recent_payouts || []).map((payout) => (
                <article
                  key={payout.id}
                  className="rounded-lg border border-white/10 bg-brand-navy/60 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-all text-xs font-bold text-brand-gold">{payout.id}</p>
                      <p className="mt-1 text-xs text-brand-grey">
                        {new Date(payout.arrival_date).toLocaleDateString()}
                      </p>
                    </div>
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-brand-grey">
                      {payout.status}
                    </span>
                  </div>
                  <p className="mt-4 text-lg font-bold text-white">
                    {formatCurrency(payout.amount)}
                  </p>
                </article>
              ))}
              {(!weeklyFinancials?.recent_payouts ||
                weeklyFinancials.recent_payouts.length === 0) && (
                <EmptyState
                  description="Stripe has not returned any payouts for the selected date range."
                  icon={ShieldCheck}
                  title="No payout data"
                />
              )}
            </div>

            <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[720px] text-left">
              <thead>
                <tr className="bg-white/5 border-b border-white/10">
                  <th className="px-8 py-6 text-[10px] font-bold text-brand-grey uppercase tracking-widest">
                    Payout ID
                  </th>
                  <th className="px-8 py-6 text-[10px] font-bold text-brand-grey uppercase tracking-widest">
                    Arrival Date
                  </th>
                  <th className="px-8 py-6 text-[10px] font-bold text-brand-grey uppercase tracking-widest">
                    Amount
                  </th>
                  <th className="px-8 py-6 text-[10px] font-bold text-brand-grey uppercase tracking-widest">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {(weeklyFinancials?.recent_payouts || []).map((payout) => (
                  <tr
                    key={payout.id}
                    className="hover:bg-white/5 transition-all"
                  >
                    <td className="px-8 py-6 text-xs text-brand-gold font-bold">
                      {payout.id}
                    </td>
                    <td className="px-8 py-6 text-xs text-brand-grey">
                      {new Date(payout.arrival_date).toLocaleDateString()}
                    </td>
                    <td className="px-8 py-6 text-sm text-white font-bold">
                      {formatCurrency(payout.amount)}
                    </td>
                    <td className="px-8 py-6">
                      <span className="px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest border bg-white/5 text-brand-grey border-white/10">
                        {payout.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {(!weeklyFinancials?.recent_payouts ||
                  weeklyFinancials.recent_payouts.length === 0) && (
                  <tr>
                    <td colSpan={4}>
                      <EmptyState
                        description="Stripe has not returned any payouts for the selected date range."
                        icon={ShieldCheck}
                        title="No payout data"
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>
          </div>
        </>
      )}
    </motion.div>
  );
}
