import React from 'react';
import { motion } from 'motion/react';
import {
  Users,
  Car as CarIcon,
  DollarSign,
  Clock,
  ChevronRight,
  TrendingUp,
  CreditCard,
  ShieldCheck,
} from 'lucide-react';
import { Application, Car, DashboardStats } from '../../../types';
import EmptyState from '../EmptyState';
import MetricCard from '../MetricCard';

interface OverviewTabProps {
  stats?: DashboardStats;
  applications: Application[];
  cars: Car[];
  setActiveTab: (tab: string) => void;
}

export default function OverviewTab({
  stats,
  applications,
  cars,
  setActiveTab,
}: OverviewTabProps) {
  return (
    <motion.div
      key="dashboard"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-10"
    >
      <div className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#0b1f36] shadow-[0_30px_100px_rgba(0,0,0,0.24)]">
        <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.1fr_0.9fr] lg:p-10">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.36em] text-brand-gold">
              Gala Operations
            </p>
            <h2 className="mt-4 max-w-2xl text-4xl font-serif font-bold leading-tight text-white sm:text-5xl">
              Premium rental control room for applications, fleet, and revenue.
            </h2>
            <p className="mt-5 max-w-xl text-sm leading-7 text-slate-300">
              Review drivers, manage approved vehicles, issue secure payment links, and keep operational rental status visible from one dashboard.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => setActiveTab('applications')}
                className="inline-flex items-center justify-center gap-3 rounded-xl bg-brand-gold px-6 py-4 text-[10px] font-black uppercase tracking-[0.22em] text-brand-navy transition-all hover:bg-brand-gold-light"
              >
                Review Applications <ChevronRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('financials')}
                className="inline-flex items-center justify-center gap-3 rounded-xl border border-white/15 bg-white/5 px-6 py-4 text-[10px] font-bold uppercase tracking-[0.22em] text-white transition-all hover:border-brand-gold hover:text-brand-gold"
              >
                <TrendingUp className="h-4 w-4" /> Financials
              </button>
            </div>
          </div>
          <div className="rounded-2xl bg-white p-5 text-brand-navy">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-brand-gold-dark">
                Today Snapshot
              </p>
              <ShieldCheck className="h-5 w-5 text-brand-gold-dark" />
            </div>
            <div className="mt-5 grid gap-3">
              {[
                ['Pending review', applications.filter((app) => app.status === 'Pending').length],
                ['Active rentals', stats?.active_rentals || 0],
                ['Available fleet', cars.filter((car) => car.status === 'Available').length],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{label}</span>
                  <span className="text-lg font-black text-brand-navy">{value}</span>
                </div>
              ))}
            </div>
            <div className="mt-5 rounded-xl bg-brand-navy px-4 py-4 text-white">
              <div className="flex items-center gap-3">
                <CreditCard className="h-5 w-5 text-brand-gold" />
                <p className="text-xs font-bold uppercase tracking-[0.18em]">Stripe checkout protected</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          helper="Submitted renter applications"
          icon={Users}
          label="Total Applications"
          numericValue={stats?.total_applications || 0}
          value={stats?.total_applications || 0}
        />
        <MetricCard
          helper="Drivers currently in a rental"
          icon={CarIcon}
          label="Active Rentals"
          numericValue={stats?.active_rentals || 0}
          value={stats?.active_rentals || 0}
        />
        <MetricCard
          helper="Projected weekly rental revenue"
          icon={DollarSign}
          label="Weekly Revenue"
          numericValue={stats?.total_weekly_income || 0}
          value={`$${stats?.total_weekly_income || 0}`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white border border-slate-200 p-6 sm:p-8 rounded-2xl text-brand-navy shadow-[0_20px_70px_rgba(2,8,23,0.16)]">
          <h3 className="text-white font-bold uppercase tracking-widest text-xs mb-8 flex items-center gap-3">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-brand-gold/15">
              <Clock className="w-4 h-4 text-brand-gold-dark" />
            </span>
            <span className="text-brand-navy">Pending Applications</span>
          </h3>
          <div className="space-y-4">
            {applications
              .filter((a) => a.status === 'Pending')
              .slice(0, 5)
              .map((app) => (
                <div
                  key={app.id}
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-4 transition-all hover:border-brand-gold/40 hover:bg-white"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-brand-gold rounded-full flex items-center justify-center text-brand-navy font-bold text-xs">
                      {app.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-brand-navy">{app.name}</p>
                      <p className="text-[10px] text-slate-500 uppercase tracking-widest">
                        {app.uber_status}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setActiveTab('applications')}
                    className="text-brand-gold hover:text-white transition-colors"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              ))}
            {applications.filter((a) => a.status === 'Pending').length === 0 && (
              <EmptyState
                actionLabel="View Applications"
                description="There are no pending driver applications waiting for review."
                icon={Clock}
                onAction={() => setActiveTab('applications')}
                title="No real applications yet"
              />
            )}
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-6 sm:p-8 rounded-2xl text-brand-navy shadow-[0_20px_70px_rgba(2,8,23,0.16)]">
          <h3 className="text-white font-bold uppercase tracking-widest text-xs mb-8 flex items-center gap-3">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-brand-gold/15">
              <CarIcon className="w-4 h-4 text-brand-gold-dark" />
            </span>
            <span className="text-brand-navy">Fleet Availability</span>
          </h3>
          <div className="space-y-4">
            {cars.slice(0, 5).map((car) => (
              <div
                key={car.id}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-4 transition-all hover:border-brand-gold/40 hover:bg-white"
              >
                <div className="flex items-center gap-4">
                  <img
                    src={car.image}
                    alt=""
                    className="w-14 h-10 object-cover rounded-lg"
                  />
                  <div>
                    <p className="text-sm font-bold text-brand-navy">{car.name}</p>
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest">
                      {car.model_year} Model
                    </p>
                  </div>
                </div>
                <span
                  className={`px-3 py-1 rounded-full text-[8px] font-bold uppercase tracking-widest border ${
                    car.status === 'Available'
                      ? 'bg-green-500/10 text-green-500 border-green-500/20'
                      : 'bg-brand-navy text-brand-grey border-white/10'
                  }`}
                >
                  {car.status}
                </span>
              </div>
            ))}
            {cars.length === 0 && (
              <EmptyState
                actionLabel="Open Fleet"
                description="Fleet availability appears here after vehicles are added."
                icon={CarIcon}
                onAction={() => setActiveTab('cars')}
                title="No fleet vehicles"
              />
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
