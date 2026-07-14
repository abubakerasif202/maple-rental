import React from 'react';
import { motion } from 'motion/react';
import {
  AlertCircle,
  ArrowRight,
  Building2,
  CalendarClock,
  CheckCircle2,
  Clock3,
  CreditCard,
  FileText,
  RefreshCw,
  ShieldAlert,
  TrendingUp,
  Users,
} from 'lucide-react';
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

import { Application, DashboardSummaryResponse } from '../../../types';
import EmptyState from '../EmptyState';

interface OverviewTabProps {
  applications: Application[];
  isError: boolean;
  isLoading: boolean;
  lastUpdated?: string | null;
  onRefresh: () => void;
  setActiveTab: (tab: string) => void;
  summary?: DashboardSummaryResponse;
}

const currency = new Intl.NumberFormat('en-AU', {
  currency: 'AUD',
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
  style: 'currency',
});

const formatCurrency = (value?: number | null) => currency.format(Number(value || 0));

const MetricTile = ({
  icon: Icon,
  label,
  onClick,
  subtitle,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick?: () => void;
  subtitle: string;
  value: React.ReactNode;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`group w-full rounded-3xl border border-white/10 bg-white/5 p-5 text-left transition-all hover:-translate-y-0.5 hover:border-brand-gold/40 hover:bg-white/[0.08] ${onClick ? 'cursor-pointer' : 'cursor-default'}`}
  >
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-brand-grey">
          {label}
        </p>
        <div className="mt-3 text-3xl font-bold tracking-tight text-white">{value}</div>
        <p className="mt-3 max-w-sm text-sm leading-6 text-brand-grey">{subtitle}</p>
      </div>
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-brand-gold/20 bg-brand-gold/10 text-brand-gold transition-transform group-hover:scale-105">
        <Icon className="h-5 w-5" />
      </div>
    </div>
  </button>
);

const SectionCard = ({
  children,
  className = '',
  title,
  action,
}: {
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  title: string;
}) => (
  <section className={`rounded-3xl border border-white/10 bg-[#0b1f36] ${className}`}>
    <div className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-4 sm:px-6">
      <h3 className="text-xs font-bold uppercase tracking-[0.28em] text-brand-grey">{title}</h3>
      {action}
    </div>
    <div className="p-5 sm:p-6">{children}</div>
  </section>
);

export default function OverviewTab({
  applications,
  isError,
  isLoading,
  lastUpdated,
  onRefresh,
  setActiveTab,
  summary,
}: OverviewTabProps) {
  const recentApplications = summary?.recent_applications || applications.slice(0, 5);
  const trend = summary?.revenue_trend || [];
  const statusDistribution = summary?.status_distribution || [];
  const operationalAlerts = [
    summary && summary.agreements_awaiting_attention > 0
      ? {
          label: 'Agreements awaiting attention',
          value: summary.agreements_awaiting_attention,
          tab: 'agreements',
        }
      : null,
    summary && summary.overdue_invoices > 0
      ? {
          label: 'Overdue invoices',
          value: summary.overdue_invoices,
          tab: 'invoices',
        }
      : null,
    summary && summary.pending_applications > 0
      ? {
          label: 'Pending reviews',
          value: summary.pending_applications,
          tab: 'applications',
        }
      : null,
  ].filter(Boolean) as Array<{ label: string; value: number; tab: string }>;

  if (isLoading && !summary) {
    return (
      <div className="space-y-6">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-brand-grey">
          <RefreshCw className="mr-3 inline-block h-4 w-4 animate-spin text-brand-gold" />
          Loading live dashboard data...
        </div>
      </div>
    );
  }

  if (isError && !summary) {
    return (
      <div className="rounded-3xl border border-red-500/20 bg-red-500/10 p-6 text-sm text-red-100">
        The dashboard summary could not be loaded. Refresh after checking the admin API and database connection.
      </div>
    );
  }

  return (
    <motion.div
      key="dashboard"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-6"
    >
      <div className="rounded-[2rem] border border-white/10 bg-[linear-gradient(135deg,rgba(6,20,37,0.92),rgba(11,31,54,0.96))] p-5 shadow-[0_28px_90px_rgba(0,0,0,0.2)] sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-brand-gold/20 bg-brand-gold/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.28em] text-brand-gold">
              <ShieldAlert className="h-3.5 w-3.5" />
              Dashboard Overview
            </div>
            <div>
              <h2 className="text-3xl font-bold tracking-tighter text-white sm:text-4xl">
                Dashboard <span className="text-brand-gold italic">Overview</span>
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-brand-grey sm:text-base">
                Live operational view of applications, rentals, invoices, agreements, payments, and audit events.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-brand-grey">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                Current date: {new Date().toLocaleDateString('en-AU', { timeZone: 'Australia/Sydney' })}
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                Last updated: {lastUpdated ? new Date(lastUpdated).toLocaleString('en-AU', { timeZone: 'Australia/Sydney' }) : 'Not loaded yet'}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onRefresh}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-3 text-xs font-bold uppercase tracking-[0.22em] text-white transition-all hover:bg-white/10"
            >
              <RefreshCw className="h-4 w-4 text-brand-gold" />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('financials')}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-brand-gold px-5 py-3 text-xs font-bold uppercase tracking-[0.22em] text-brand-navy transition-all hover:bg-brand-gold-light"
            >
              Detailed Financials
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-4">
        <MetricTile
          icon={Users}
          label="Applications"
          onClick={() => setActiveTab('applications')}
          subtitle={`${summary?.pending_applications || 0} pending reviews, ${summary?.paid_applications || 0} paid applications`}
          value={summary?.total_applications ?? 0}
        />
        <MetricTile
          icon={Building2}
          label="Active Rentals"
          onClick={() => setActiveTab('rentals')}
          subtitle="Backend-confirmed operational rentals only"
          value={summary?.active_rentals ?? 0}
        />
        <MetricTile
          icon={TrendingUp}
          label="Weekly Revenue"
          onClick={() => setActiveTab('financials')}
          subtitle="Authoritative recurring weekly rental revenue"
          value={formatCurrency(summary?.weekly_recurring_revenue)}
        />
        <MetricTile
          icon={CreditCard}
          label="Outstanding Invoices"
          onClick={() => setActiveTab('invoices')}
          subtitle={`${summary?.overdue_invoices || 0} overdue invoices need attention`}
          value={formatCurrency(summary?.outstanding_invoices)}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-4">
        <MetricTile
          icon={Clock3}
          label="Pending Reviews"
          onClick={() => setActiveTab('applications')}
          subtitle="Applications still waiting for admin action"
          value={summary?.pending_applications ?? 0}
        />
        <MetricTile
          icon={CheckCircle2}
          label="Paid Applications"
          onClick={() => setActiveTab('applications')}
          subtitle="Applications where payment has cleared"
          value={summary?.paid_applications ?? 0}
        />
        <MetricTile
          icon={FileText}
          label="Agreements"
          onClick={() => setActiveTab('agreements')}
          subtitle={`${summary?.agreements_awaiting_attention || 0} still require review or completion`}
          value={summary?.agreements_generated ?? 0}
        />
        <MetricTile
          icon={CalendarClock}
          label="Overdue Invoices"
          onClick={() => setActiveTab('invoices')}
          subtitle="Invoices past due with a positive balance"
          value={summary?.overdue_invoices ?? 0}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <SectionCard
          title="Revenue trend"
          action={<span className="text-[10px] uppercase tracking-[0.24em] text-brand-grey">Australia/Sydney</span>}
        >
          {trend.length === 0 ? (
            <EmptyState
              description="A seven-day revenue trend will appear once the backend returns real application, rental, or audit activity."
              icon={TrendingUp}
              title="No trend data"
            />
          ) : (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend}>
                  <defs>
                    <linearGradient id="dashboardRevenueFill" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="5%" stopColor="#dfb125" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#dfb125" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="label" stroke="#94a3b8" tickLine={false} axisLine={false} />
                  <YAxis stroke="#94a3b8" tickFormatter={(value) => `$${value}`} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{
                      background: '#061425',
                      border: '1px solid rgba(223,177,37,0.25)',
                      borderRadius: '16px',
                      color: '#fff',
                    }}
                  />
                  <Area dataKey="revenue" fill="url(#dashboardRevenueFill)" stroke="#dfb125" strokeWidth={2} type="monotone" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Operational alerts">
          {operationalAlerts.length === 0 ? (
            <EmptyState
              description="No open operational alerts were found in the current snapshot."
              icon={CheckCircle2}
              title="All clear"
            />
          ) : (
            <div className="space-y-3">
              {operationalAlerts.map((alert) => (
                <button
                  key={alert.label}
                  type="button"
                  onClick={() => setActiveTab(alert.tab)}
                  className="flex w-full items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-left transition-all hover:border-brand-gold/30 hover:bg-white/[0.08]"
                >
                  <div>
                    <p className="text-sm font-semibold text-white">{alert.label}</p>
                    <p className="mt-1 text-xs text-brand-grey">Open the relevant operational screen</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="rounded-full bg-brand-gold px-3 py-1 text-xs font-bold text-brand-navy">
                      {alert.value}
                    </span>
                    <ArrowRight className="h-4 w-4 text-brand-gold" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <SectionCard title="Application status distribution">
          {statusDistribution.length === 0 ? (
            <EmptyState
              description="Status distribution will appear once real application data is available."
              icon={AlertCircle}
              title="No application data"
            />
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={statusDistribution}>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="label" stroke="#94a3b8" tickLine={false} axisLine={false} />
                  <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      background: '#061425',
                      border: '1px solid rgba(223,177,37,0.25)',
                      borderRadius: '16px',
                      color: '#fff',
                    }}
                  />
                  <Bar dataKey="value" radius={[12, 12, 0, 0]}>
                    {statusDistribution.map((entry, index) => (
                      <Cell key={`${entry.label}-${index}`} fill={index === 0 ? '#dfb125' : '#7b8ca3'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Quick actions">
          <div className="grid gap-3">
            {[
              { label: 'Review applications', icon: Users, tab: 'applications' },
              { label: 'Manage rentals', icon: Building2, tab: 'rentals' },
              { label: 'View invoices', icon: CreditCard, tab: 'invoices' },
              { label: 'Open agreements', icon: FileText, tab: 'agreements' },
              { label: 'Open financials', icon: TrendingUp, tab: 'financials' },
            ].map((action) => (
              <button
                key={action.label}
                type="button"
                onClick={() => setActiveTab(action.tab)}
                className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-left transition-all hover:border-brand-gold/30 hover:bg-white/[0.08]"
              >
                <div className="flex items-center gap-3">
                  <action.icon className="h-5 w-5 text-brand-gold" />
                  <span className="text-sm font-semibold text-white">{action.label}</span>
                </div>
                <ArrowRight className="h-4 w-4 text-brand-grey" />
              </button>
            ))}
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard title="Recent applications">
          {recentApplications.length === 0 ? (
            <EmptyState
              actionLabel="Applications"
              description="New applications will appear here when the backend returns real customer submissions."
              icon={Users}
              onAction={() => setActiveTab('applications')}
              title="No recent applications"
            />
          ) : (
            <div className="space-y-3">
              {recentApplications.slice(0, 5).map((application) => (
                <button
                  key={application.id}
                  type="button"
                  onClick={() => setActiveTab('applications')}
                  className="flex w-full items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-left transition-all hover:border-brand-gold/30 hover:bg-white/[0.08]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{application.name}</p>
                    <p className="mt-1 text-xs text-brand-grey">
                      {application.status} • {new Date(application.created_at).toLocaleDateString('en-AU')}
                    </p>
                  </div>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-brand-grey">
                    {application.approved_vehicle?.trim() || application.license_number || 'Pending review'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Recent activity">
          <div className="space-y-3">
            {[
              ...(summary?.recent_payments || []),
              ...(summary?.recent_rental_activity || []),
              ...(summary?.recent_admin_actions || []),
            ]
              .slice(0, 6)
              .map((item) => (
                <div
                  key={`${item.type}-${item.id}`}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white">{item.title}</p>
                      <p className="mt-1 text-xs text-brand-grey">{item.subtitle || 'Operational event'}</p>
                    </div>
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-brand-grey">
                      {item.type}
                    </span>
                  </div>
                </div>
              ))}
            {(summary?.recent_payments || []).length === 0 &&
              (summary?.recent_rental_activity || []).length === 0 &&
              (summary?.recent_admin_actions || []).length === 0 && (
                <EmptyState
                  description="Recent payment, rental, and audit activity will appear here once the backend has live records."
                  icon={Clock3}
                  title="No recent activity"
                />
              )}
          </div>
        </SectionCard>
      </div>
    </motion.div>
  );
}
