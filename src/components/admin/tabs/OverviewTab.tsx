import React from 'react';
import { motion } from 'motion/react';
import {
  Users,
  Car as CarIcon,
  DollarSign,
  Clock,
  ChevronRight,
  TrendingUp,
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
      className="space-y-12"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="mb-2 text-3xl font-bold uppercase tracking-tighter text-white sm:text-4xl">
            Dashboard <span className="text-brand-gold italic">Overview</span>
          </h2>
          <p className="text-brand-grey font-light">
            Performance metrics and recent activities.
          </p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <button
            type="button"
            onClick={() => setActiveTab('financials')}
            className="flex w-full items-center justify-center gap-3 border border-white/10 bg-white/5 px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-white transition-all hover:bg-white/10 sm:w-auto"
          >
            <TrendingUp className="w-4 h-4 text-brand-gold" /> View Detailed
            Financials
          </button>
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
        <div className="bg-white/5 border border-white/10 p-8 rounded-3xl">
          <h3 className="text-white font-bold uppercase tracking-widest text-xs mb-8 flex items-center gap-3">
            <Clock className="w-4 h-4 text-brand-gold" /> Pending Applications
          </h3>
          <div className="space-y-4">
            {applications
              .filter((a) => a.status === 'Pending')
              .slice(0, 5)
              .map((app) => (
                <div
                  key={app.id}
                  className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5 hover:border-white/10 transition-all"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-brand-gold/10 rounded-full flex items-center justify-center text-brand-gold font-bold text-xs">
                      {app.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white">{app.name}</p>
                      <p className="text-[10px] text-brand-grey uppercase tracking-widest">
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

        <div className="bg-white/5 border border-white/10 p-8 rounded-3xl">
          <h3 className="text-white font-bold uppercase tracking-widest text-xs mb-8 flex items-center gap-3">
            <CarIcon className="w-4 h-4 text-brand-gold" /> Fleet Availability
          </h3>
          <div className="space-y-4">
            {cars.slice(0, 5).map((car) => (
              <div
                key={car.id}
                className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5 hover:border-white/10 transition-all"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-8 w-12 items-center justify-center rounded-lg border border-white/10 bg-brand-navy/70 text-[7px] font-bold uppercase tracking-[0.2em] text-brand-grey">
                    N/A
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">{car.name}</p>
                    <p className="text-[10px] text-brand-grey uppercase tracking-widest">
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
