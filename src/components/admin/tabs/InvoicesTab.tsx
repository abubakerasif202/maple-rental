import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Search, Loader2, AlertCircle, FileText, DollarSign, Download, Plus, Trash2 } from 'lucide-react';
import {
  ManualInvoice,
  ManualInvoiceItem,
  ManualInvoiceStatus,
  OperationalInvoice,
} from '../../../types';
import DataTable, { type DataTableColumn } from '../DataTable';
import MetricCard from '../MetricCard';
import * as api from '../../../lib/api';
import { encodeCsvRows } from '../../../lib/csv';
import { getTodayInAustralia } from '../../../../shared/applicationSubmission';

interface InvoicesTabProps {
  invoiceSearch: string;
  setInvoiceSearch: (val: string) => void;
  isLoadingInvoiceDataset: boolean;
  invoiceHistoryAvailable: boolean;
  deferredInvoiceSearch: string;
  invoiceTotalItems: number;
  invoiceTotals: {
    total_amount: number;
    outstanding_balance: number;
    open_count: number;
  };
  invoiceRecords: OperationalInvoice[];
  invoiceCurrentPage: number;
  invoiceTotalPages: number;
  invoicePageSize: number;
  isFetching: boolean;
  setInvoicePage: React.Dispatch<React.SetStateAction<number>>;
  setInvoicePageSize: React.Dispatch<React.SetStateAction<number>>;
  formatCurrency: (value?: number | string | null) => string;
  formatDate: (value?: string | null) => string;
  operationalHistoryMessage: string;
}

const renderLoadingPanel = (message: string) => (
  <div className="bg-white/5 border border-white/10 rounded-3xl p-10 flex items-center gap-4 text-sm text-brand-grey">
    <Loader2 className="w-5 h-5 animate-spin text-brand-gold" />
    <span>{message}</span>
  </div>
);

const renderOperationalUnavailable = (title: string, operationalHistoryMessage: string) => (
  <div className="bg-white/5 border border-white/10 rounded-3xl p-10 space-y-4">
    <div className="w-12 h-12 bg-brand-gold/10 rounded-2xl flex items-center justify-center border border-brand-gold/20">
      <AlertCircle className="w-5 h-5 text-brand-gold" />
    </div>
    <div>
      <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
      <p className="text-sm text-brand-grey leading-relaxed">
        {operationalHistoryMessage}
      </p>
    </div>
    <div className="break-words bg-brand-navy/60 border border-white/10 rounded-2xl px-5 py-4 text-[11px] text-brand-grey font-light">
      Run <span className="font-mono text-white">npm run migrate:operational-history</span>{' '}
      with <span className="font-mono text-white">DATABASE_URL</span> or{' '}
      <span className="font-mono text-white">SUPABASE_DB_URL</span>. Legacy workbook imports now require{' '}
      <span className="font-mono text-white">ALLOW_LEGACY_IMPORT=true</span> and should not be used for production data.
    </div>
  </div>
);

const createBlankManualInvoiceItem = (): ManualInvoiceItem => ({
  description: '',
  quantity: 1,
  unit_price: 0,
  gst: 0,
  amount: 0,
});

export default function InvoicesTab({
  invoiceSearch,
  setInvoiceSearch,
  isLoadingInvoiceDataset,
  invoiceHistoryAvailable,
  deferredInvoiceSearch,
  invoiceTotalItems,
  invoiceTotals,
  invoiceRecords,
  invoiceCurrentPage,
  invoiceTotalPages,
  invoicePageSize,
  isFetching,
  setInvoicePage,
  setInvoicePageSize,
  formatCurrency,
  formatDate,
  operationalHistoryMessage,
}: InvoicesTabProps) {
  const [manualInvoiceForm, setManualInvoiceForm] = useState({
    additional_details: '',
    bill_to_abn_mobile: '',
    bill_to_name: '',
    due_date: '',
    invoice_number: '',
    issue_date: getTodayInAustralia(),
    notes: '',
    rental_period_reference: '',
    status: 'draft' as ManualInvoiceStatus,
    vehicle_reference: '',
  });
  const [manualInvoiceItems, setManualInvoiceItems] = useState<ManualInvoiceItem[]>([
    createBlankManualInvoiceItem(),
  ]);
  const [manualInvoiceError, setManualInvoiceError] = useState('');
  const [manualInvoiceSuccess, setManualInvoiceSuccess] = useState('');
  const [isCreatingManualInvoice, setIsCreatingManualInvoice] = useState(false);
  const [isDownloadingManualInvoice, setIsDownloadingManualInvoice] = useState(false);
  const [createdManualInvoice, setCreatedManualInvoice] = useState<ManualInvoice | null>(null);

  const manualInvoiceTotals = useMemo(() => {
    const subtotal = manualInvoiceItems.reduce(
      (sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_price || 0),
      0
    );
    const gst = manualInvoiceItems.reduce((sum, item) => sum + Number(item.gst || 0), 0);
    const total = manualInvoiceItems.reduce((sum, item) => {
      const computed =
        Number(item.amount || 0) ||
        Number(item.quantity || 0) * Number(item.unit_price || 0) + Number(item.gst || 0);
      return sum + computed;
    }, 0);

    return {
      gst,
      subtotal,
      total,
    };
  }, [manualInvoiceItems]);

  const updateManualInvoiceItem = (
    index: number,
    field: keyof ManualInvoiceItem,
    value: string
  ) => {
    setManualInvoiceItems((current) =>
      current.map((item, itemIndex) => {
        if (itemIndex !== index) {
          return item;
        }

        if (field === 'description') {
          return { ...item, description: value };
        }

        const numericValue = Number(value || 0);
        const nextItem = { ...item, [field]: numericValue };
        const computedAmount =
          Number(nextItem.quantity || 0) * Number(nextItem.unit_price || 0) +
          Number(nextItem.gst || 0);
        return { ...nextItem, amount: field === 'amount' ? numericValue : computedAmount };
      })
    );
  };

  const downloadManualInvoicePdf = async (invoice: ManualInvoice) => {
    setIsDownloadingManualInvoice(true);
    setManualInvoiceError('');
    try {
      const pdf = await api.fetchManualInvoicePdf(invoice.id);
      const url = URL.createObjectURL(pdf);
      window.open(url, '_blank', 'noopener,noreferrer');
      const link = document.createElement('a');
      link.href = url;
      link.download = `maple-rentals-invoice-${invoice.invoice_number}.pdf`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setManualInvoiceSuccess('Manual invoice PDF generated.');
    } catch (error) {
      setManualInvoiceError('Failed to generate manual invoice PDF.');
    } finally {
      setIsDownloadingManualInvoice(false);
    }
  };

  const createManualInvoice = async () => {
    setManualInvoiceError('');
    setManualInvoiceSuccess('');

    if (!manualInvoiceForm.bill_to_name.trim()) {
      setManualInvoiceError('Customer / company is required.');
      return;
    }

    if (!manualInvoiceItems.some((item) => item.description.trim())) {
      setManualInvoiceError('At least one line item description is required.');
      return;
    }

    setIsCreatingManualInvoice(true);
    try {
      const invoice = await api.createManualInvoice({
        ...manualInvoiceForm,
        due_date: manualInvoiceForm.due_date || null,
        invoice_number: manualInvoiceForm.invoice_number || undefined,
        items: manualInvoiceItems.map((item) => ({
          description: item.description.trim(),
          quantity: Number(item.quantity || 0),
          unit_price: Number(item.unit_price || 0),
          gst: Number(item.gst || 0),
          amount:
            Number(item.amount || 0) ||
            Number(item.quantity || 0) * Number(item.unit_price || 0) + Number(item.gst || 0),
        })),
      });
      setCreatedManualInvoice(invoice);
      setManualInvoiceSuccess(`Manual invoice ${invoice.invoice_number} created.`);
    } catch (error) {
      setManualInvoiceError('Failed to create manual invoice.');
    } finally {
      setIsCreatingManualInvoice(false);
    }
  };

  const exportInvoices = (invoices: OperationalInvoice[]) => {
    const headers = [
      'Invoice Number',
      'Customer',
      'Email',
      'Vehicle',
      'Amount',
      'Balance',
      'Invoice Date',
      'Status',
    ];
    const rows = invoices.map((invoice) => [
      invoice.external_invoice_number,
      invoice.customer_name,
      invoice.customer_email || '',
      invoice.car_registration || '',
      invoice.amount,
      invoice.balance,
      invoice.invoice_date,
      invoice.status,
    ]);
    const csv = encodeCsvRows([headers, ...rows]);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = 'maple-invoices.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const columns = useMemo<Array<DataTableColumn<OperationalInvoice>>>(
    () => [
      {
        header: 'Invoice',
        id: 'invoice',
        minWidth: '170px',
        sortValue: (invoice) => invoice.external_invoice_number,
        cell: (invoice) => (
          <div>
            <p className="text-sm font-bold text-white">
              #{invoice.external_invoice_number}
            </p>
            <p className="text-[10px] uppercase tracking-widest text-slate-400">
              {invoice.due_label || 'No due label'}
            </p>
          </div>
        ),
      },
      {
        header: 'Customer',
        id: 'customer',
        minWidth: '240px',
        sortValue: (invoice) => invoice.customer_name,
        cell: (invoice) => (
          <div>
            <p className="text-sm font-bold text-white">{invoice.customer_name}</p>
            <p className="text-[10px] text-slate-400">
              {invoice.customer_email || 'No linked email'}
            </p>
          </div>
        ),
      },
      {
        header: 'Vehicle',
        id: 'vehicle',
        minWidth: '130px',
        sortValue: (invoice) => invoice.car_registration || '',
        cell: (invoice) => (
          <span className="text-xs text-slate-400">
            {invoice.car_registration || 'N/A'}
          </span>
        ),
      },
      {
        align: 'right',
        header: 'Amount',
        id: 'amount',
        minWidth: '130px',
        sortValue: (invoice) => invoice.amount,
        cell: (invoice) => (
          <span className="text-sm font-bold text-white">
            {formatCurrency(invoice.amount)}
          </span>
        ),
      },
      {
        align: 'right',
        header: 'Balance',
        id: 'balance',
        minWidth: '130px',
        sortValue: (invoice) => invoice.balance,
        cell: (invoice) => (
          <span className="text-sm font-bold text-slate-300">
            {formatCurrency(invoice.balance)}
          </span>
        ),
      },
      {
        header: 'Invoice Date',
        id: 'date',
        minWidth: '150px',
        sortValue: (invoice) => new Date(invoice.invoice_date),
        cell: (invoice) => (
          <span className="text-xs text-slate-400">
            {formatDate(invoice.invoice_date)}
          </span>
        ),
      },
      {
        header: 'Status',
        id: 'status',
        minWidth: '130px',
        sortValue: (invoice) => invoice.status,
        cell: (invoice) => (
          <span
            className={`rounded-full border px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest ${
              invoice.status === 'Paid'
                ? 'border-green-500/20 bg-green-500/10 text-green-400'
                : 'border-[#dfb125]/20 bg-[#dfb125]/10 text-[#dfb125]'
            }`}
          >
            {invoice.status}
          </span>
        ),
      },
    ],
    [formatCurrency, formatDate]
  );

  return (
    <motion.div
      key="invoices"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-12"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="mb-2 text-3xl font-bold uppercase tracking-tighter text-white sm:text-4xl">
            Invoice <span className="text-brand-gold italic">History</span>
          </h2>
          <p className="text-brand-grey font-light">
            Production invoice history for operational review and reconciliation.
          </p>
        </div>
        <div className="flex w-full gap-4 md:w-auto">
          <div className="relative w-full md:w-auto">
            <Search className="w-4 h-4 text-brand-grey absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              value={invoiceSearch}
              onChange={(event) => setInvoiceSearch(event.target.value)}
              placeholder="Search invoices..."
              className="w-full rounded-xl border border-white/10 bg-white/5 py-4 pl-12 pr-6 text-sm text-white outline-none transition-all focus:border-brand-gold md:w-72"
            />
          </div>
        </div>
      </div>

      {isLoadingInvoiceDataset ? (
        renderLoadingPanel('Loading invoice history...')
      ) : !invoiceHistoryAvailable ? (
        renderOperationalUnavailable(
          'Invoice history schema is not installed',
          operationalHistoryMessage
        )
      ) : (
        <>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            <MetricCard
              helper={
                deferredInvoiceSearch
                  ? 'Invoices matching the current search'
                  : 'Rows in production invoice history'
              }
              icon={FileText}
              label={deferredInvoiceSearch ? 'Matching Invoices' : 'Invoices'}
              numericValue={invoiceTotalItems}
              value={invoiceTotalItems}
            />
            <MetricCard
              helper="Outstanding balance on the current page"
              icon={AlertCircle}
              label="Visible Balance"
              numericValue={invoiceTotals.outstanding_balance}
              value={formatCurrency(invoiceTotals.outstanding_balance)}
            />
            <MetricCard
              helper="Invoices with remaining balance on this page"
              icon={DollarSign}
              label="Open on Page"
              numericValue={invoiceTotals.open_count}
              value={invoiceTotals.open_count}
            />
          </div>

          <DataTable
            rows={invoiceRecords}
            columns={columns}
            getRowId={(invoice) => invoice.id}
            minWidth="1120px"
            filters={[
              {
                id: 'status',
                label: 'Status',
                getValue: (invoice) => invoice.status,
                options: ['Open', 'Paid'].map((status) => ({ label: status, value: status })),
              },
            ]}
            bulkActions={[
              {
                icon: Download,
                label: 'Export Selected',
                onClick: exportInvoices,
              },
            ]}
            pagination={{
              isFetching,
              mode: 'server',
              onPageChange: setInvoicePage,
              onPageSizeChange: (pageSize) => {
                setInvoicePageSize(pageSize);
                setInvoicePage(1);
              },
              page: invoiceCurrentPage,
              pageSize: invoicePageSize,
              pageSizeOptions: [10, 25, 50, 100],
              totalItems: invoiceTotalItems,
              totalPages: invoiceTotalPages,
            }}
            emptyState={{
              actionLabel: invoiceSearch ? 'Clear Search' : undefined,
              description: invoiceSearch
                ? 'No invoice records match the current search and status filters.'
                : 'Invoice history will appear here after production invoices are created.',
              icon: FileText,
              onAction: invoiceSearch ? () => setInvoiceSearch('') : undefined,
              title: invoiceSearch ? 'No matching invoices' : 'No invoices yet',
            }}
          />
        </>
      )}

      <div className="space-y-6 rounded-3xl border border-white/10 bg-white/[0.03] p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h3 className="text-2xl font-bold tracking-tight text-white">
              Manual Invoices
            </h3>
            <p className="mt-1 text-sm text-brand-grey">
              Create Maple Rentals tax invoices for manual admin billing, including
              bond tracking outside Stripe.
            </p>
          </div>
          <div className="text-right text-sm text-brand-grey">
            <p>Subtotal: <span className="font-bold text-white">{formatCurrency(manualInvoiceTotals.subtotal)}</span></p>
            <p>GST: <span className="font-bold text-white">{formatCurrency(manualInvoiceTotals.gst)}</span></p>
            <p>Total Inc GST: <span className="font-bold text-brand-gold">{formatCurrency(manualInvoiceTotals.total)}</span></p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          {[
            ['invoice_number', 'Invoice no'],
            ['issue_date', 'Date'],
            ['due_date', 'Due date'],
            ['bill_to_name', 'Customer / company'],
            ['bill_to_abn_mobile', 'ABN / mobile'],
            ['vehicle_reference', 'Vehicle / rego / rental ID'],
            ['rental_period_reference', 'Rental period / reference'],
            ['additional_details', 'Additional details'],
          ].map(([field, label]) => (
            <label key={field} className="space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-brand-grey">
                {label}
              </span>
              <input
                type={field.includes('date') ? 'date' : 'text'}
                value={manualInvoiceForm[field as keyof typeof manualInvoiceForm]}
                onChange={(event) =>
                  setManualInvoiceForm((current) => ({
                    ...current,
                    [field]: event.target.value,
                  }))
                }
                className="w-full rounded-xl border border-white/40 bg-brand-navy px-4 py-3 text-sm text-white outline-none focus:border-brand-gold"
              />
            </label>
          ))}
          <label className="space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-brand-grey">
              Status
            </span>
            <select
              value={manualInvoiceForm.status}
              onChange={(event) =>
                setManualInvoiceForm((current) => ({
                  ...current,
                  status: event.target.value as ManualInvoiceStatus,
                }))
              }
              className="w-full rounded-xl border border-white/40 bg-brand-navy px-4 py-3 text-sm text-white outline-none focus:border-brand-gold"
            >
              {['draft', 'issued', 'paid', 'overdue', 'cancelled'].map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="space-y-3">
          {manualInvoiceItems.map((item, index) => (
            <div key={index} className="grid gap-3 md:grid-cols-[1fr_90px_130px_110px_130px_44px]">
              <input
                value={item.description}
                onChange={(event) => updateManualInvoiceItem(index, 'description', event.target.value)}
                placeholder="Description"
                className="rounded-xl border border-white/40 bg-brand-navy px-4 py-3 text-sm text-white outline-none focus:border-brand-gold"
              />
              <input
                type="number"
                min="0"
                step="0.01"
                value={item.quantity}
                onChange={(event) => updateManualInvoiceItem(index, 'quantity', event.target.value)}
                className="rounded-xl border border-white/40 bg-brand-navy px-4 py-3 text-sm text-white outline-none focus:border-brand-gold"
              />
              <input
                type="number"
                min="0"
                step="0.01"
                value={item.unit_price}
                onChange={(event) => updateManualInvoiceItem(index, 'unit_price', event.target.value)}
                className="rounded-xl border border-white/40 bg-brand-navy px-4 py-3 text-sm text-white outline-none focus:border-brand-gold"
              />
              <input
                type="number"
                min="0"
                step="0.01"
                value={item.gst}
                onChange={(event) => updateManualInvoiceItem(index, 'gst', event.target.value)}
                className="rounded-xl border border-white/40 bg-brand-navy px-4 py-3 text-sm text-white outline-none focus:border-brand-gold"
              />
              <input
                type="number"
                min="0"
                step="0.01"
                value={item.amount || 0}
                onChange={(event) => updateManualInvoiceItem(index, 'amount', event.target.value)}
                className="rounded-xl border border-white/40 bg-brand-navy px-4 py-3 text-sm text-white outline-none focus:border-brand-gold"
              />
              <button
                type="button"
                onClick={() =>
                  setManualInvoiceItems((current) =>
                    current.length === 1 ? current : current.filter((_, itemIndex) => itemIndex !== index)
                  )
                }
                className="flex h-11 items-center justify-center rounded-xl border border-red-500/30 text-red-300 hover:bg-red-500/10"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setManualInvoiceItems((current) => [...current, createBlankManualInvoiceItem()])}
            className="inline-flex items-center gap-2 rounded-xl border border-white/40 px-4 py-3 text-xs font-bold uppercase tracking-widest text-white hover:bg-white/5"
          >
            <Plus className="h-4 w-4 text-brand-gold" />
            Add line item
          </button>
        </div>

        <textarea
          value={manualInvoiceForm.notes}
          onChange={(event) =>
            setManualInvoiceForm((current) => ({ ...current, notes: event.target.value }))
          }
          rows={3}
          placeholder="Notes / terms"
          className="w-full resize-none rounded-xl border border-white/40 bg-brand-navy px-4 py-3 text-sm text-white outline-none focus:border-brand-gold"
        />

        {manualInvoiceError && <p className="text-sm text-red-300">{manualInvoiceError}</p>}
        {manualInvoiceSuccess && <p className="text-sm text-green-300">{manualInvoiceSuccess}</p>}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={createManualInvoice}
            disabled={isCreatingManualInvoice}
            className="inline-flex items-center gap-2 rounded-full bg-brand-gold px-6 py-4 text-xs font-bold uppercase tracking-widest text-brand-navy disabled:opacity-50"
          >
            {isCreatingManualInvoice ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            Create Invoice
          </button>
          <button
            type="button"
            onClick={() => createdManualInvoice && downloadManualInvoicePdf(createdManualInvoice)}
            disabled={!createdManualInvoice || isDownloadingManualInvoice}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 px-6 py-4 text-xs font-bold uppercase tracking-widest text-white hover:bg-white/5 disabled:opacity-50"
          >
            {isDownloadingManualInvoice ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Preview / Download PDF
          </button>
        </div>
      </div>
    </motion.div>
  );
}
