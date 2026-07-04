import React from 'react';
import { motion } from 'motion/react';
import { Archive, Edit2, Plus, RotateCcw, Trash2 } from 'lucide-react';
import type { Car } from '../../../types';
import VehicleFilters from '../vehicles/VehicleFilters';

type VehicleFilter = 'active' | 'all' | 'archived';

interface FleetTabProps {
  cars: Car[];
  filter: VehicleFilter;
  isLoading: boolean;
  onAddVehicle: () => void;
  onArchiveVehicle: (car: Car) => void;
  onDeleteVehicle: (car: Car) => void;
  onEditVehicle: (car: Car) => void;
  onFilterChange: (value: VehicleFilter) => void;
  onRestoreVehicle: (car: Car) => void;
  onSearchChange: (value: string) => void;
  searchTerm: string;
  visibleCars: Car[];
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const getStatusBadgeClasses = (car: Car) => {
  if (car.archived_at) {
    return 'bg-white/10 text-brand-grey border-white/10';
  }

  if (car.status === 'Available') {
    return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25';
  }

  if (car.status === 'Rented') {
    return 'bg-brand-gold/15 text-brand-gold border-brand-gold/30';
  }

  return 'bg-orange-500/15 text-orange-300 border-orange-500/25';
};

const FleetSkeleton = () => (
  <div className="overflow-hidden rounded-[30px] border border-white/10 bg-white/[0.04]">
    <div className="hidden grid-cols-[minmax(0,2.5fr)_120px_140px_140px_150px_190px] gap-4 border-b border-white/10 px-6 py-4 lg:grid">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="h-3 rounded bg-white/10" />
      ))}
    </div>
    <div className="divide-y divide-white/10">
      {Array.from({ length: 5 }).map((_, rowIndex) => (
        <div
          key={rowIndex}
          className="grid gap-5 px-5 py-5 lg:grid-cols-[minmax(0,2.5fr)_120px_140px_140px_150px_190px] lg:items-center lg:px-6"
        >
          <div className="flex items-center gap-4">
            <div className="h-20 w-28 rounded-2xl bg-white/10" />
            <div className="flex-1 space-y-3">
              <div className="h-4 w-40 rounded bg-white/10" />
              <div className="h-3 w-24 rounded bg-white/10" />
            </div>
          </div>
          {Array.from({ length: 5 }).map((__, cellIndex) => (
            <div key={cellIndex} className="h-10 rounded-2xl bg-white/10" />
          ))}
        </div>
      ))}
    </div>
  </div>
);

const EmptyState = ({
  body,
  ctaLabel,
  onCta,
  title,
}: {
  body: string;
  ctaLabel?: string;
  onCta?: () => void;
  title: string;
}) => (
  <div className="rounded-[30px] border border-white/10 bg-white/[0.04] px-6 py-16 text-center">
    <div className="mx-auto max-w-xl">
      <h3 className="text-2xl font-bold text-white">{title}</h3>
      <p className="mt-3 text-sm leading-7 text-brand-grey">{body}</p>
      {ctaLabel && onCta && (
        <button
          type="button"
          onClick={onCta}
          className="mt-8 inline-flex items-center gap-3 rounded-2xl bg-brand-gold px-6 py-4 text-[10px] font-bold uppercase tracking-[0.22em] text-brand-navy transition-all hover:bg-brand-gold-light"
        >
          <Plus className="h-4 w-4" />
          {ctaLabel}
        </button>
      )}
    </div>
  </div>
);

export default function FleetTab({
  cars,
  filter,
  isLoading,
  onAddVehicle,
  onArchiveVehicle,
  onDeleteVehicle,
  onEditVehicle,
  onFilterChange,
  onRestoreVehicle,
  onSearchChange,
  searchTerm,
  visibleCars,
}: FleetTabProps) {
  const activeCars = cars.filter((car) => !car.archived_at);
  const archivedCars = cars.filter((car) => car.archived_at);
  const hasSearch = searchTerm.trim().length > 0;

  return (
    <motion.div
      key="cars"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-8"
    >
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h2 className="mb-2 text-3xl font-bold uppercase tracking-tighter text-white sm:text-4xl">
            Fleet <span className="italic text-brand-gold">Management</span>
          </h2>
          <p className="max-w-3xl text-sm leading-7 text-brand-grey">
            A simple, safe workspace for non-technical staff to manage vehicle images, pricing,
            fleet status, and archive or delete actions with confidence.
          </p>
        </div>
        <button
          onClick={onAddVehicle}
          className="flex w-full items-center justify-center gap-3 rounded-2xl bg-brand-gold px-8 py-4 text-[10px] font-bold uppercase tracking-[0.22em] text-brand-navy shadow-lg transition-all hover:bg-brand-gold-light xl:w-auto"
        >
          <Plus className="h-4 w-4" />
          Add Vehicle
        </button>
      </div>

      <VehicleFilters
        activeCount={activeCars.length}
        activeFilter={filter}
        allCount={cars.length}
        archivedCount={archivedCars.length}
        onFilterChange={onFilterChange}
        onSearchChange={onSearchChange}
        searchTerm={searchTerm}
      />

      {isLoading ? (
        <FleetSkeleton />
      ) : cars.length === 0 ? (
        <EmptyState
          title="No vehicles yet"
          body="Add the first fleet vehicle to start managing pricing, images, and availability from one premium admin workflow."
          ctaLabel="Add First Vehicle"
          onCta={onAddVehicle}
        />
      ) : visibleCars.length === 0 ? (
        <EmptyState
          title={hasSearch ? 'No vehicles match that search' : `No ${filter} vehicles right now`}
          body={
            hasSearch
              ? 'Try a different vehicle name or switch the fleet filter to see more results.'
              : filter === 'archived'
                ? 'Archived vehicles will appear here after they are removed from the active fleet.'
                : 'Switch to a different fleet filter or add a new vehicle to continue.'
          }
        />
      ) : (
        <div className="overflow-hidden rounded-[30px] border border-white/10 bg-white/[0.04]">
          <div className="hidden grid-cols-[minmax(0,2.5fr)_120px_140px_140px_150px_190px] gap-4 border-b border-white/10 px-6 py-4 text-[10px] font-bold uppercase tracking-[0.24em] text-brand-grey lg:grid">
            <span>Vehicle</span>
            <span>Status</span>
            <span>Weekly</span>
            <span>Bond</span>
            <span>Visibility</span>
            <span className="text-right">Actions</span>
          </div>

          <div className="divide-y divide-white/10">
            {visibleCars.map((car) => {
              const isArchived = Boolean(car.archived_at);

              return (
                <div
                  key={car.id}
                  className="grid gap-5 px-5 py-5 transition-colors hover:bg-white/[0.04] lg:grid-cols-[minmax(0,2.5fr)_120px_140px_140px_150px_190px] lg:items-center lg:px-6"
                >
                  <div className="flex min-w-0 items-center gap-4">
                    <div className="flex h-20 w-28 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-brand-navy/70 text-[9px] font-bold uppercase tracking-[0.22em] text-brand-grey">
                      No image
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-lg font-semibold text-white">{car.name}</h3>
                        {isArchived && (
                          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[9px] font-bold uppercase tracking-[0.22em] text-brand-grey">
                            Archived
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs uppercase tracking-[0.22em] text-brand-grey">
                        {car.model_year} model
                      </p>
                    </div>
                  </div>

                  <div className="lg:text-center">
                    <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.24em] text-brand-grey lg:hidden">
                      Status
                    </div>
                    <span
                      className={`inline-flex rounded-full border px-4 py-2 text-[10px] font-bold uppercase tracking-[0.22em] ${getStatusBadgeClasses(
                        car
                      )}`}
                    >
                      {car.status}
                    </span>
                  </div>

                  <div className="lg:text-center">
                    <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.24em] text-brand-grey lg:hidden">
                      Weekly
                    </div>
                    <p className="text-sm font-semibold text-white">
                      {formatCurrency(car.weekly_price)}
                    </p>
                  </div>

                  <div className="lg:text-center">
                    <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.24em] text-brand-grey lg:hidden">
                      Bond
                    </div>
                    <p className="text-sm font-semibold text-white">{formatCurrency(car.bond)}</p>
                  </div>

                  <div className="lg:text-center">
                    <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.24em] text-brand-grey lg:hidden">
                      Visibility
                    </div>
                    <span className="text-sm text-brand-grey">
                      {isArchived ? 'Hidden from active fleet' : 'Visible to staff'}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    <button
                      onClick={() => onEditVehicle(car)}
                      className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-[10px] font-bold uppercase tracking-[0.22em] text-white transition-all hover:border-brand-gold hover:bg-brand-gold hover:text-brand-navy"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                      Edit
                    </button>

                    {isArchived ? (
                      <>
                        <button
                          onClick={() => onRestoreVehicle(car)}
                          className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-[10px] font-bold uppercase tracking-[0.22em] text-brand-gold transition-all hover:border-brand-gold hover:bg-brand-gold/10"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Restore
                        </button>
                        <button
                          onClick={() => onDeleteVehicle(car)}
                          className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-[10px] font-bold uppercase tracking-[0.22em] text-red-300 transition-all hover:bg-red-500/20"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => onArchiveVehicle(car)}
                        className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-[10px] font-bold uppercase tracking-[0.22em] text-brand-grey transition-all hover:border-white/20 hover:bg-white/10 hover:text-white"
                      >
                        <Archive className="h-3.5 w-3.5" />
                        Archive
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </motion.div>
  );
}
