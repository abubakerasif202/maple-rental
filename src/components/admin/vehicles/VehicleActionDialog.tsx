import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  Archive,
  Loader2,
  RotateCcw,
  Trash2,
  XCircle,
} from 'lucide-react';
import type { Car } from '../../../types';
import type { VehicleDialogMode } from './types';

interface VehicleActionDialogProps {
  isLoading?: boolean;
  mode: VehicleDialogMode | null;
  onClose: () => void;
  onConfirm: () => void;
  vehicle: Car | null;
}

const DELETE_CONFIRMATION_PHRASE = 'DELETE';

const contentByMode: Record<
  VehicleDialogMode,
  {
    description: string;
    helper: string;
    title: string;
  }
> = {
  archive: {
    title: 'Archive Vehicle',
    description:
      'Archive removes this vehicle from the active fleet so staff stop selecting it by mistake, while keeping its history available for later restore.',
    helper: 'Use archive when the vehicle is temporarily retired or off the road.',
  },
  restore: {
    title: 'Restore Vehicle',
    description:
      'Restore returns this vehicle to the active fleet so it can be edited, assigned, and shown in staff workflows again.',
    helper: 'The vehicle returns to the visible fleet list immediately after restore.',
  },
  delete: {
    title: 'Delete Vehicle',
    description:
      'Delete permanently removes this vehicle record. This cannot be undone, and the stored image is cleaned up if Gala Rentals manages it in Supabase Storage.',
    helper:
      'Permanent delete is only allowed when no rentals, bookings, agreements, or assigned applications still reference the vehicle.',
  },
  discard: {
    title: 'Discard Changes',
    description:
      'Discard closes the editor without saving the updates made in this session.',
    helper: 'Use discard only when you are comfortable losing the unsaved changes in the form.',
  },
};

export default function VehicleActionDialog({
  isLoading = false,
  mode,
  onClose,
  onConfirm,
  vehicle,
}: VehicleActionDialogProps) {
  const [deleteInput, setDeleteInput] = useState('');

  useEffect(() => {
    setDeleteInput('');
  }, [mode, vehicle?.id]);

  if (!mode || (mode !== 'discard' && !vehicle)) {
    return null;
  }

  const isDelete = mode === 'delete';
  const content = contentByMode[mode];
  const canConfirm =
    !isDelete || deleteInput.trim().toUpperCase() === DELETE_CONFIRMATION_PHRASE;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[70] flex items-end justify-center bg-brand-navy/70 backdrop-blur-xl sm:items-center sm:p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          className="w-full max-w-xl rounded-t-[28px] border border-white/10 bg-brand-navy shadow-2xl sm:rounded-[32px]"
        >
          <div className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-5 sm:px-8">
            <div className="flex items-start gap-4">
              <div
                className={`rounded-2xl border p-3 ${
                  isDelete
                    ? 'border-red-500/30 bg-red-500/10 text-red-300'
                    : 'border-brand-gold/30 bg-brand-gold/10 text-brand-gold'
                }`}
              >
                {mode === 'archive' && <Archive className="h-5 w-5" />}
                {mode === 'restore' && <RotateCcw className="h-5 w-5" />}
                {(mode === 'delete' || mode === 'discard') && <Trash2 className="h-5 w-5" />}
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-brand-grey">
                  Fleet Action
                </p>
                <h3 className="mt-2 text-2xl font-bold text-white">{content.title}</h3>
                {vehicle && <p className="mt-2 text-sm text-brand-grey">{vehicle.name}</p>}
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-brand-grey transition-all hover:bg-white/5 hover:text-white"
            >
              <XCircle className="h-6 w-6" />
            </button>
          </div>

          <div className="space-y-5 px-6 py-6 sm:px-8">
            <p className="text-sm leading-7 text-brand-grey">{content.description}</p>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 text-brand-gold" />
                <p className="text-xs leading-6 text-brand-grey">{content.helper}</p>
              </div>
            </div>

            {isDelete && (
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-[0.22em] text-brand-grey">
                  Type DELETE to confirm
                </label>
                <input
                  value={deleteInput}
                  onChange={(event) => setDeleteInput(event.target.value)}
                  placeholder="DELETE"
                  className="w-full rounded-2xl border border-red-500/20 bg-red-500/5 px-4 py-4 text-sm text-white outline-none transition-all focus:border-red-400"
                />
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 border-t border-white/10 px-6 py-5 sm:flex-row sm:justify-end sm:px-8">
            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-[10px] font-bold uppercase tracking-[0.22em] text-brand-grey transition-all hover:bg-white/10 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={!canConfirm || isLoading}
              className={`flex items-center justify-center gap-3 rounded-2xl px-5 py-4 text-[10px] font-bold uppercase tracking-[0.22em] transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                isDelete
                  ? 'border border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20'
                  : 'border border-brand-gold/30 bg-brand-gold text-brand-navy hover:bg-brand-gold-light'
              }`}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : mode === 'archive' ? (
                <Archive className="h-4 w-4" />
              ) : mode === 'restore' ? (
                <RotateCcw className="h-4 w-4" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              {mode === 'archive' && 'Archive Vehicle'}
              {mode === 'restore' && 'Restore Vehicle'}
              {mode === 'delete' && 'Delete Permanently'}
              {mode === 'discard' && 'Discard Changes'}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
