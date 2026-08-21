import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  AlertTriangle,
  Download,
  FileText,
  Loader2,
  Search,
  Car as CarIcon,
} from 'lucide-react';
import { PendingRentalActivation, Rental } from '../../../types';
import DataTable, { type DataTableColumn } from '../DataTable';
import type { CancelSubscriptionResponse } from '../../../lib/api';
import { encodeCsvRows } from '../../../lib/csv';
import AccessibleDialog from '../AccessibleDialog';
import { formatAustraliaDate, getAustraliaDateSortValue } from '../../../lib/australiaDate';

interface RentalsTabProps {
  isFetchingRentals: boolean;
  isLoadingRentals: boolean;
  onCancelSubscription?: (payload: {
    cancelAtPeriodEnd: boolean;
    confirm: 'CANCEL SUBSCRIPTION';
    reason?: string;
    rentalId: number;
  }) => Promise<CancelSubscriptionResponse>;
  activatingApplicationId?: string | null;
  onActivateRental?: (applicationId: string) => Promise<unknown>;
  onCreateTollNotice?: (rental: Rental) => void;
  onRentalPageChange: (page: number) => void;
  onRentalPageSizeChange: (pageSize: number) => void;
  pendingActivations: PendingRentalActivation[];
  rentalSearch: string;
  rentals: Rental[];
  rentalsError: string | null;
  rentalsPage: number;
  rentalsPageSize: number;
  rentalsTotalItems: number;
  rentalsTotalPages: number;
  setRentalSearch: (val: string) => void;
}

const renderLoadingPanel = (message: string) => (
  <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-brand-grey">
    <Loader2 className="h-5 w-5 animate-spin text-brand-gold" />
    <span>{message}</span>
  </div>
);

const renderErrorPanel = (message: string) => (
  <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-5 text-sm text-red-100">
    {message}
  </div>
);

export default function RentalsTab({
  activatingApplicationId,
  isFetchingRentals,
  isLoadingRentals,
  onCancelSubscription,
  onActivateRental,
  onCreateTollNotice,
  onRentalPageChange,
  onRentalPageSizeChange,
  pendingActivations,
  rentalSearch,
  rentals,
  rentalsError,
  rentalsPage,
  rentalsPageSize,
  rentalsTotalItems,
  rentalsTotalPages,
  setRentalSearch,
}: RentalsTabProps) {
  const [cancelTarget, setCancelTarget] = useState<Rental | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState(true);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelResult, setCancelResult] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [isCancellingSubscription, setIsCancellingSubscription] = useState(false);

  const closeCancelModal = () => {
    if (isCancellingSubscription) {
      return;
    }

    setCancelTarget(null);
    setConfirmText('');
    setCancelAtPeriodEnd(true);
    setCancelReason('');
    setCancelResult(null);
    setCancelError(null);
  };

  const submitCancelSubscription = async () => {
    if (!cancelTarget || !onCancelSubscription || confirmText !== 'CANCEL SUBSCRIPTION') {
      return;
    }

    setIsCancellingSubscription(true);
    setCancelError(null);
    setCancelResult(null);
    try {
      const response = await onCancelSubscription({
        cancelAtPeriodEnd,
        confirm: 'CANCEL SUBSCRIPTION',
        reason: cancelReason.trim() || undefined,
        rentalId: cancelTarget.id,
      });
      setCancelResult(`${response.message} Stripe status: ${response.stripeStatus}.`);
    } catch (error) {
      const message =
        error && typeof error === 'object' && 'response' in error
          ? String((error as { response?: { data?: { error?: string } } }).response?.data?.error || '')
          : '';
      setCancelError(message || 'Failed to cancel Stripe subscription.');
    } finally {
      setIsCancellingSubscription(false);
    }
  };

  const exportRentals = (rows: Rental[]) => {
    const headers = ['Driver', 'Vehicle', 'Start Date', 'Weekly Rate', 'Status', 'Subscription ID'];
    const csvRows = rows.map((rental) => [
      rental.applicant_name || '',
      rental.car_name || '',
      formatAustraliaDate(rental.start_date, ''),
      rental.weekly_price,
      rental.status,
      rental.stripe_subscription_id || '',
    ]);
    const csv = encodeCsvRows([headers, ...csvRows]);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = 'maple-rentals.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const columns = useMemo<Array<DataTableColumn<Rental>>>(
    () => [
      {
        header: 'Driver',
        id: 'driver',
        minWidth: '220px',
        sortValue: (rental) => rental.applicant_name || '',
        cell: (rental) => (
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#dfb125]/10 text-[#dfb125]">
              <CarIcon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">
                {rental.applicant_name || 'Unknown driver'}
              </p>
              <p className="text-[10px] uppercase tracking-widest text-slate-400">
                Rental #{rental.id}
              </p>
            </div>
          </div>
        ),
      },
      {
        header: 'Vehicle',
        id: 'vehicle',
        minWidth: '180px',
        sortValue: (rental) => rental.car_name || '',
        cell: (rental) => (
          <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
            {rental.car_name || 'No vehicle linked'}
          </span>
        ),
      },
      {
        header: 'Start Date',
        id: 'start_date',
        minWidth: '130px',
        sortValue: (rental) => getAustraliaDateSortValue(rental.start_date),
        cell: (rental) => (
          <span className="text-xs text-slate-400">
            {formatAustraliaDate(rental.start_date)}
          </span>
        ),
      },
      {
        align: 'right',
        header: 'Weekly Rate',
        id: 'weekly_price',
        minWidth: '140px',
        sortValue: (rental) => rental.weekly_price,
        cell: (rental) => (
          <div>
            <p className="text-sm font-bold text-white">${rental.weekly_price}/wk</p>
            <p className="text-[10px] uppercase tracking-widest text-slate-400">
              Incl. Insurance
            </p>
          </div>
        ),
      },
      {
        header: 'Status',
        id: 'status',
        minWidth: '140px',
        sortValue: (rental) => rental.status,
        cell: (rental) => (
          <span
            className={`rounded-full border px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest ${
              rental.status === 'Active'
                ? 'border-green-500/20 bg-green-500/10 text-green-400'
                : 'border-red-500/20 bg-red-500/10 text-red-300'
            }`}
          >
            {rental.status}
          </span>
        ),
      },
      {
        header: 'Stripe IDs',
        id: 'stripe',
        minWidth: '260px',
        sortable: false,
        cell: (rental) => (
          <div className="space-y-1">
            <p className="break-all font-mono text-[10px] text-slate-400">
              sub: {rental.stripe_subscription_id || 'Not linked'}
            </p>
            <p className="break-all font-mono text-[10px] text-slate-400">
              cus: {rental.stripe_customer_id || 'Not linked'}
            </p>
          </div>
        ),
      },
      {
        header: 'Actions',
        id: 'actions',
        minWidth: '220px',
        sortable: false,
        cell: (rental) => (
          <div className="flex flex-wrap gap-2">
            {onCreateTollNotice && (
              <button
                type="button"
                onClick={() => onCreateTollNotice(rental)}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#1e3a5f] bg-white/5 px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-white transition-all hover:border-[#dfb125]/50 hover:bg-white/10"
              >
                <FileText className="h-4 w-4 text-[#dfb125]" />
                Create Toll Notice
              </button>
            )}
            <button
              type="button"
              disabled={!onCancelSubscription || !rental.stripe_subscription_id}
              onClick={() => {
                setCancelTarget(rental);
                setConfirmText('');
                setCancelAtPeriodEnd(true);
                setCancelReason('');
                setCancelResult(null);
                setCancelError(null);
              }}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-red-200 transition-all hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <AlertTriangle className="h-4 w-4" />
              Cancel Stripe Subscription
            </button>
          </div>
        ),
      },
    ],
    [onCancelSubscription, onCreateTollNotice],
  );

  const pendingCount = pendingActivations.length;
  const emptyTitle = rentalSearch ? 'No matching rentals' : 'No activated rentals yet';
  const emptyDescription = rentalSearch
    ? 'No rental records match the current search.'
    : pendingCount > 0
      ? `${pendingCount} paid subscription${pendingCount === 1 ? '' : 's'} ${pendingCount === 1 ? 'is' : 'are'} waiting for activation below.`
      : 'Rentals appear here once a paid subscription has been activated.';

  return (
    <motion.div
      key="rentals"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-8"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="mb-2 text-3xl font-bold uppercase tracking-tighter text-white sm:text-4xl">
            Active <span className="text-brand-gold italic">Rentals</span>
          </h2>
          <p className="text-brand-grey font-light">
            Monitor current driver subscriptions and vehicle usage.
          </p>
        </div>
        <div className="flex w-full gap-4 md:w-auto">
          <div className="relative w-full md:w-auto">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-grey" />
            <input
              value={rentalSearch}
              onChange={(event) => setRentalSearch(event.target.value)}
              placeholder="Search rentals..."
              className="w-full rounded-xl border border-white/10 bg-white/5 py-4 pl-12 pr-6 text-sm text-white outline-none transition-all focus:border-brand-gold md:w-72"
            />
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-brand-grey">
            Activated Rentals
          </p>
          <p className="mt-2 text-3xl font-bold text-white">{rentalsTotalItems}</p>
        </div>
        <div className="rounded-2xl border border-brand-gold/20 bg-brand-gold/5 p-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-brand-gold">
            Paid Subscriptions Awaiting Activation
          </p>
          <p className="mt-2 text-3xl font-bold text-white">{pendingCount}</p>
        </div>
      </div>

      {pendingCount > 0 && (
        <section
          aria-labelledby="pending-activation-heading"
          className="rounded-2xl border border-brand-gold/20 bg-brand-gold/5 p-5"
        >
          <h3
            id="pending-activation-heading"
            className="text-sm font-bold uppercase tracking-widest text-brand-gold"
          >
            Paid — Awaiting Rental Activation
          </h3>
          <p className="mt-1 text-sm font-light text-brand-grey">
            These drivers have a verified Stripe subscription. They are not rentals
            yet, so activate each one to start operational tracking.
          </p>
          <ul className="mt-4 space-y-3">
            {pendingActivations.map((pending) => (
              <li
                key={pending.application_id}
                className="flex flex-col gap-3 rounded-xl border border-white/10 bg-black/20 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-white">
                    {pending.applicant_name || 'Applicant'}
                  </p>
                  <p className="mt-1 text-xs font-light text-brand-grey">
                    <span className="uppercase tracking-widest">
                      {pending.approved_vehicle || 'Registration not set'}
                    </span>
                    {' · '}
                    {pending.approved_weekly_price != null
                      ? `$${Number(pending.approved_weekly_price).toFixed(2)}/week`
                      : 'Weekly price not set'}
                    {' · '}
                    {pending.start_date ? `Starts ${pending.start_date}` : 'Start date not set'}
                  </p>
                  <p className="mt-1 truncate font-mono text-[10px] text-brand-grey">
                    {pending.stripe_subscription_id || 'No subscription id'}
                  </p>
                </div>
                {onActivateRental && (
                  <button
                    type="button"
                    disabled={activatingApplicationId === pending.application_id}
                    onClick={() => onActivateRental(pending.application_id)}
                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-brand-gold/40 bg-brand-gold/10 px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-brand-gold transition-colors hover:bg-brand-gold/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-gold disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {activatingApplicationId === pending.application_id && (
                      <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />
                    )}
                    {activatingApplicationId === pending.application_id
                      ? 'Activating…'
                      : 'Activate Rental'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {rentalsError ? (
        renderErrorPanel(rentalsError)
      ) : isLoadingRentals && rentals.length === 0 ? (
        renderLoadingPanel('Loading rental history...')
      ) : (
        <DataTable
          rows={rentals}
          columns={columns}
          getRowId={(rental) => String(rental.id)}
          minWidth="1120px"
          bulkActions={[
            {
              icon: Download,
              label: 'Export Selected',
              onClick: exportRentals,
            },
          ]}
          pagination={{
            isFetching: isFetchingRentals,
            mode: 'server',
            onPageChange: onRentalPageChange,
            onPageSizeChange: onRentalPageSizeChange,
            page: rentalsPage,
            pageSize: rentalsPageSize,
            pageSizeOptions: [10, 25, 50, 100],
            totalItems: rentalsTotalItems,
            totalPages: rentalsTotalPages,
          }}
          emptyState={{
            actionLabel: rentalSearch ? 'Clear Search' : undefined,
            description: emptyDescription,
            icon: FileText,
            onAction: rentalSearch ? () => setRentalSearch('') : undefined,
            title: emptyTitle,
          }}
        />
      )}

      {cancelTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <AccessibleDialog
            ariaLabelledBy="cancel-subscription-title"
            onClose={closeCancelModal}
            className="w-full max-w-2xl rounded-2xl border border-white/10 bg-brand-navy p-6 shadow-2xl"
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h3 id="cancel-subscription-title" className="text-xl font-bold text-white">Cancel Stripe subscription</h3>
                <p className="text-sm text-brand-grey">
                  {cancelTarget.applicant_name || 'Unknown driver'} • Rental #{cancelTarget.id}
                </p>
              </div>
              <button
                type="button"
                onClick={closeCancelModal}
                aria-label="Close subscription cancellation"
                disabled={isCancellingSubscription}
                className="text-sm text-brand-grey transition-colors hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="space-y-4">
              <label className="block space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-brand-grey">
                  Confirmation
                </span>
                <input
                  value={confirmText}
                  onChange={(event) => setConfirmText(event.target.value)}
                  placeholder="CANCEL SUBSCRIPTION"
                  className="w-full rounded-xl border border-white/40 bg-white/5 px-4 py-3 text-sm text-white outline-none"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-brand-grey">
                  Reason
                </span>
                <textarea
                  value={cancelReason}
                  onChange={(event) => setCancelReason(event.target.value)}
                  className="min-h-24 w-full rounded-xl border border-white/40 bg-white/5 px-4 py-3 text-sm text-white outline-none"
                />
              </label>

              <label className="flex items-center gap-3 text-sm text-white">
                <input
                  type="checkbox"
                  checked={cancelAtPeriodEnd}
                  onChange={(event) => setCancelAtPeriodEnd(event.target.checked)}
                />
                Cancel at period end
              </label>

              {cancelResult && (
                <div className="rounded-xl border border-green-400/20 bg-green-400/10 p-4 text-sm text-green-100">
                  {cancelResult}
                </div>
              )}
              {cancelError && (
                <div className="rounded-xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-100">
                  {cancelError}
                </div>
              )}

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={closeCancelModal}
                  disabled={isCancellingSubscription}
                  className="rounded-xl border border-white/40 px-4 py-3 text-xs font-bold uppercase tracking-widest text-white transition-all hover:bg-white/10"
                >
                  Close
                </button>
                <button
                  type="button"
                  disabled={confirmText !== 'CANCEL SUBSCRIPTION' || isCancellingSubscription}
                  onClick={submitCancelSubscription}
                  className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs font-bold uppercase tracking-widest text-red-100 transition-all hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isCancellingSubscription ? 'Cancelling...' : 'Cancel Subscription'}
                </button>
              </div>
            </div>
          </AccessibleDialog>
        </div>
      )}
    </motion.div>
  );
}
