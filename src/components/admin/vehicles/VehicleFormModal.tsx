import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, Archive, CheckCircle2, Loader2, RotateCcw, Trash2, XCircle } from 'lucide-react';
import type { Car } from '../../../types';
import type { VehicleFormValues } from './types';

type VehicleFieldErrors = Partial<Record<keyof VehicleFormValues, string>>;

interface VehicleFormModalProps {
  form: VehicleFormValues;
  formErrors: VehicleFieldErrors;
  hasUnsavedChanges: boolean;
  isOpen: boolean;
  isSubmitting: boolean;
  onArchiveOrRestore: () => void;
  onDelete: () => void;
  onFieldChange: <K extends keyof VehicleFormValues>(field: K, value: VehicleFormValues[K]) => void;
  onRequestClose: () => void;
  onSave: () => void;
  vehicle: Car | null;
}

const Field = ({
  children,
  error,
  label,
}: {
  children: React.ReactNode;
  error?: string;
  label: string;
}) => (
  <div className="space-y-2">
    <label className="text-[10px] font-bold uppercase tracking-[0.22em] text-brand-grey">
      {label}
    </label>
    {children}
    <p className={`min-h-[1.25rem] text-xs ${error ? 'text-red-300' : 'text-transparent'}`}>
      {error || 'placeholder'}
    </p>
  </div>
);

export default function VehicleFormModal({
  form,
  formErrors,
  hasUnsavedChanges,
  isOpen,
  isSubmitting,
  onArchiveOrRestore,
  onDelete,
  onFieldChange,
  onRequestClose,
  onSave,
  vehicle,
}: VehicleFormModalProps) {
  if (!isOpen) {
    return null;
  }

  const isEditing = Boolean(vehicle);
  const isArchived = Boolean(vehicle?.archived_at);
  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[60] flex items-end justify-center bg-brand-navy/70 backdrop-blur-xl sm:items-center sm:p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.97, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 16 }}
          className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-t-[30px] border border-white/10 bg-brand-navy shadow-2xl sm:rounded-[34px]"
        >
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-5 sm:px-8">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-brand-gold">
                Fleet Editor
              </p>
              <h3 className="mt-2 text-2xl font-bold text-white">
                {isEditing ? 'Edit Vehicle' : 'Add Vehicle'}
              </h3>
              <p className="mt-2 max-w-2xl text-sm text-brand-grey">
                Keep the fleet current with one clean editor for vehicle details, rego, and status
                management.
              </p>
            </div>
            <button
              type="button"
              onClick={onRequestClose}
              className="rounded-full p-2 text-brand-grey transition-all hover:bg-white/5 hover:text-white"
            >
              <XCircle className="h-6 w-6" />
            </button>
          </div>

          <div className="grid flex-1 gap-8 overflow-y-auto p-5 lg:grid-cols-1 lg:p-8">
            <div className="space-y-6">
              <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 sm:p-6">
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Model Name" error={formErrors.name}>
                    <input
                      value={form.name}
                      onChange={(event) => onFieldChange('name', event.target.value)}
                      placeholder="Toyota Camry Hybrid"
                      className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-white outline-none transition-all focus:border-brand-gold"
                    />
                  </Field>

                  <Field label="Model Year" error={formErrors.model_year}>
                    <input
                      type="number"
                      min="1900"
                      value={form.model_year}
                      onChange={(event) => onFieldChange('model_year', Number(event.target.value))}
                      className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-white outline-none transition-all focus:border-brand-gold"
                    />
                  </Field>

                  <Field label="Weekly Rental" error={formErrors.weekly_price}>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.weekly_price}
                      onChange={(event) => onFieldChange('weekly_price', Number(event.target.value))}
                      className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-white outline-none transition-all focus:border-brand-gold"
                    />
                  </Field>

                  <Field label="Security Bond" error={formErrors.bond}>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.bond}
                      onChange={(event) => onFieldChange('bond', Number(event.target.value))}
                      className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-white outline-none transition-all focus:border-brand-gold"
                    />
                  </Field>

                  <div className="sm:col-span-2">
                    <Field label="Availability Status" error={formErrors.status}>
                      <select
                        value={form.status}
                        onChange={(event) => onFieldChange('status', event.target.value as Car['status'])}
                        className="w-full appearance-none rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-white outline-none transition-all focus:border-brand-gold"
                      >
                        <option value="Available">Available</option>
                        <option value="Maintenance">Maintenance</option>
                        <option value="Rented">Rented</option>
                      </select>
                    </Field>
                  </div>
                </div>
              </div>

              <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 sm:p-6">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 text-brand-gold" />
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-brand-grey">
                      Staff Guidance
                    </p>
                <p className="mt-2 text-sm leading-7 text-brand-grey">
                      Save keeps the vehicle live and up to date. Archive is safer than delete when
                      you want to take a vehicle out of rotation without losing its history.
                    </p>
                    {hasUnsavedChanges && (
                      <p className="mt-3 text-sm text-brand-gold">
                        You have unsaved changes in this vehicle editor.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-white/10 bg-white/[0.03] px-5 py-5 sm:px-8">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <button
                  type="button"
                  onClick={onSave}
                  disabled={isSubmitting}
                  className="flex items-center justify-center gap-3 rounded-2xl bg-brand-gold px-6 py-4 text-sm font-bold uppercase tracking-[0.22em] text-brand-navy transition-all hover:bg-brand-gold-light disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-5 w-5" />
                  )}
                  {isEditing ? 'Save Vehicle' : 'Create Vehicle'}
                </button>

                <button
                  type="button"
                  onClick={onRequestClose}
                  className="rounded-2xl border border-white/10 bg-white/5 px-6 py-4 text-[10px] font-bold uppercase tracking-[0.22em] text-brand-grey transition-all hover:bg-white/10 hover:text-white"
                >
                  Cancel
                </button>
              </div>

              {isEditing && vehicle && (
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap xl:justify-end">
                  <button
                    type="button"
                    onClick={onArchiveOrRestore}
                    className={`inline-flex items-center justify-center gap-3 rounded-2xl px-6 py-4 text-[10px] font-bold uppercase tracking-[0.22em] transition-all ${
                      isArchived
                        ? 'border border-brand-gold/30 bg-brand-gold/10 text-brand-gold hover:bg-brand-gold/15'
                        : 'border border-white/10 bg-white/5 text-white hover:bg-white/10'
                    }`}
                  >
                    {isArchived ? <RotateCcw className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                    {isArchived ? 'Restore Vehicle' : 'Archive Vehicle'}
                  </button>

                  <button
                    type="button"
                    onClick={onDelete}
                    className="inline-flex items-center justify-center gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-6 py-4 text-[10px] font-bold uppercase tracking-[0.22em] text-red-300 transition-all hover:bg-red-500/20"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete Vehicle
                  </button>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
