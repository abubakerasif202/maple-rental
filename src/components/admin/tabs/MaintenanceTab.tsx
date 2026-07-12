import React, { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle, Database, Download, Loader2, Trash2 } from 'lucide-react';
import axios from 'axios';
import * as api from '../../../lib/api';
import { getApiErrorMessage } from '../../../lib/errorHandling';

const CONFIRMATION_PHRASE = 'RESET IMPORTED DATA AND FINANCIALS';

const downloadJsonBackup = (payload: Record<string, unknown>) => {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  link.href = url;
  link.download = `maple-imported-data-reset-backup-${timestamp}.json`;
  link.click();
  URL.revokeObjectURL(url);
};

export default function MaintenanceTab() {
  const [confirmText, setConfirmText] = useState('');
  const [dryRunToken, setDryRunToken] = useState<string | undefined>();
  const [dryRunResult, setDryRunResult] = useState<api.ImportedDataResetResponse | null>(null);
  const [lastDeletedCounts, setLastDeletedCounts] = useState<Record<string, number> | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const dryRunMutation = useMutation({
    mutationFn: () => api.resetImportedDataDryRun(),
    onSuccess: (data) => {
      setDryRunResult(data);
      setDryRunToken(data.dryRunToken);
      setStatusMessage('Dry run complete. Review the counts before resetting.');
    },
  });

  const resetMutation = useMutation({
    mutationFn: () =>
      api.resetImportedDataAndFinancials({
        confirm: CONFIRMATION_PHRASE,
        dryRunToken,
        reason: 'Admin maintenance reset',
      }),
    onSuccess: async (data) => {
      setLastDeletedCounts(data.deleted || null);
      setConfirmText('');
      setDryRunToken(undefined);
      setStatusMessage('Reset complete. Counts refreshed from the database.');
      const refreshed = await api.resetImportedDataDryRun();
      setDryRunResult(refreshed);
      setDryRunToken(refreshed.dryRunToken);
    },
  });

  const exportMutation = useMutation({
    mutationFn: () => api.exportImportedDataReset(),
    onSuccess: (data) => {
      downloadJsonBackup(data);
      setStatusMessage('Backup exported as JSON.');
    },
  });

  const isConfirmed = confirmText === CONFIRMATION_PHRASE;
  const counts = useMemo(
    () => dryRunResult?.counts || dryRunResult?.deleted || null,
    [dryRunResult],
  );
  const resetFailure = axios.isAxiosError(resetMutation.error)
    ? (resetMutation.error.response?.data as {
        code?: string;
        step?: string;
        message?: string;
      } | undefined)
    : undefined;
  const resetEnabled = dryRunResult?.resetEnabled === true;
  const resetDisabled = dryRunResult?.resetEnabled === false || resetFailure?.code === 'MAINTENANCE_RESET_DISABLED';
  const canReset = Boolean(resetEnabled && dryRunResult?.dryRun && isConfirmed && dryRunToken);

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white sm:text-3xl">Reset Imported Data & Financials</h2>
        <p className="mt-2 text-brand-grey">
          Reset imported/legacy customers, applications, linked rentals, and local invoice data.
        </p>
      </div>

      <div className="rounded-lg border border-red-500/25 bg-red-500/10 p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <AlertTriangle className="mt-1 h-5 w-5 text-red-400" />
          <div className="space-y-2">
            <p className="font-semibold text-white">Danger zone</p>
            <p className="text-sm text-brand-grey">
              This removes imported/legacy customers, imported applications, linked imported rentals,
              and local invoice/financial records. Cars, admin users, and Stripe records are preserved.
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => dryRunMutation.mutate()}
          disabled={dryRunMutation.isPending}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 sm:w-auto"
        >
          {dryRunMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
          Dry Run
        </button>
        <button
          type="button"
          onClick={() => exportMutation.mutate()}
          disabled={exportMutation.isPending}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 sm:w-auto"
        >
          {exportMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Export Backup
        </button>
      </div>

      {resetEnabled ? (
        <>
          <div className="space-y-3">
            <label className="block text-xs font-semibold uppercase tracking-widest text-brand-grey">
              Confirmation phrase
            </label>
            <input
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              className="min-h-11 w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 font-mono text-sm text-white outline-none focus:border-brand-gold"
              placeholder={CONFIRMATION_PHRASE}
            />
          </div>

          <button
            type="button"
            onClick={() => resetMutation.mutate()}
            disabled={!canReset || resetMutation.isPending}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 sm:w-auto"
          >
            {resetMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Reset Imported Data
          </button>
        </>
      ) : (
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-4 text-sm text-amber-100">
          Destructive imported-data reset is disabled by default. Dry Run and Export Backup remain available.
          {resetDisabled && (
            <div className="mt-2 text-amber-50">
              Enable the explicit server-side feature flag only if the destructive reset is intentionally re-approved.
            </div>
          )}
        </div>
      )}

      {statusMessage && (
        <div className="flex items-start gap-3 rounded-lg border border-green-500/25 bg-green-500/10 p-4 text-sm text-green-100">
          <CheckCircle className="mt-0.5 h-4 w-4 text-green-300" />
          <span>{statusMessage}</span>
        </div>
      )}

      {(dryRunMutation.isError || resetMutation.isError || exportMutation.isError) && (
        <div className="rounded-lg border border-red-500/25 bg-red-500/10 p-4 text-sm text-red-200">
          {getApiErrorMessage(
            dryRunMutation.error || resetMutation.error || exportMutation.error,
            'Request failed',
          )}
          {resetFailure?.step && resetFailure?.message && (
            <div className="mt-2 text-red-100">
              Reset failed while deleting {resetFailure.step.replace(/^delete_/, '').replace(/_/g, ' ')}. Check Render logs for [maintenance-reset].
            </div>
          )}
        </div>
      )}

      {counts && (
        <div className="grid grid-cols-1 gap-4 rounded-lg border border-white/10 bg-white/5 p-4 sm:grid-cols-2 md:grid-cols-4">
          {Object.entries(counts).map(([key, value]) => (
            <div key={key}>
              <p className="text-xs uppercase tracking-widest text-brand-grey">{key}</p>
              <p className="text-2xl font-bold text-white">{String(value)}</p>
            </div>
          ))}
        </div>
      )}

      {lastDeletedCounts && (
        <div className="grid grid-cols-1 gap-4 rounded-lg border border-brand-gold/20 bg-brand-gold/10 p-4 sm:grid-cols-2 md:grid-cols-4">
          {Object.entries(lastDeletedCounts).map(([key, value]) => (
            <div key={key}>
              <p className="text-xs uppercase tracking-widest text-brand-grey">Deleted {key}</p>
              <p className="text-2xl font-bold text-white">{String(value)}</p>
            </div>
          ))}
        </div>
      )}

      {dryRunResult?.criteria && (
        <pre className="max-h-80 overflow-auto rounded-lg border border-white/10 bg-black/20 p-4 text-xs text-brand-grey">
          {JSON.stringify(dryRunResult.criteria, null, 2)}
        </pre>
      )}
    </div>
  );
}
