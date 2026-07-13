import React, { useMemo } from 'react';
import { Badge, Button, Input } from '@fluentui/react-components';
import { motion } from 'motion/react';
import { Download, FileText, Loader2, Search, Users } from 'lucide-react';
import { Application } from '../../../types';
import { encodeCsvRows } from '../../../lib/csv';
import DataTable, { type DataTableColumn } from '../DataTable';

interface ApplicationsTabProps {
  applicationSearch: string;
  applications: Application[];
  applicationsError: string | null;
  applicationsPage: number;
  applicationsPageSize: number;
  applicationsTotalItems: number;
  applicationsTotalPages: number;
  clearApplicationStatuses: () => void;
  isFetchingApplications: boolean;
  isLoadingApplications: boolean;
  onApplicationPageChange: (page: number) => void;
  onApplicationPageSizeChange: (pageSize: number) => void;
  setApplicationSearch: (val: string) => void;
  setSelectedApplication: (app: Application) => void;
  statusFilters: string[];
  toggleApplicationStatus: (status: string) => void;
}

const APPLICATION_STATUS_OPTIONS = [
  'Pending',
  'Payment Review',
  'Approved',
  'Paid',
  'Rejected',
  'Cancelled',
];

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

export default function ApplicationsTab({
  applicationSearch,
  applications,
  applicationsError,
  applicationsPage,
  applicationsPageSize,
  applicationsTotalItems,
  applicationsTotalPages,
  clearApplicationStatuses,
  isFetchingApplications,
  isLoadingApplications,
  onApplicationPageChange,
  onApplicationPageSizeChange,
  setApplicationSearch,
  setSelectedApplication,
  statusFilters,
  toggleApplicationStatus,
}: ApplicationsTabProps) {
  const exportApplications = (rows: Application[]) => {
    const headers = ['Driver', 'Email', 'Phone', 'Status', 'Experience', 'Date'];
    const csvRows = rows.map((app) => [
      app.name,
      app.email,
      app.phone,
      app.status,
      app.experience,
      new Date(app.created_at).toLocaleDateString(),
    ]);
    const csv = encodeCsvRows([headers, ...csvRows]);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = 'maple-applications.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const columns = useMemo<Array<DataTableColumn<Application>>>(
    () => [
      {
        header: 'Driver',
        id: 'driver',
        minWidth: '240px',
        sortValue: (app) => app.name,
        cell: (app) => (
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#dfb125]/10 text-sm font-bold text-[#dfb125]">
              {app.name.charAt(0)}
            </div>
            <div>
              <p className="text-sm font-bold text-white">{app.name}</p>
              <p className="text-[10px] text-slate-400">{app.email}</p>
            </div>
          </div>
        ),
      },
      {
        header: 'Phone',
        id: 'phone',
        minWidth: '140px',
        sortValue: (app) => app.phone,
        cell: (app) => <span className="text-xs text-slate-400">{app.phone}</span>,
      },
      {
        header: 'Experience',
        id: 'experience',
        minWidth: '180px',
        sortValue: (app) => app.experience,
        cell: (app) => <span className="text-xs text-white">{app.experience}</span>,
      },
      {
        header: 'Uber Status',
        id: 'uber_status',
        minWidth: '180px',
        sortValue: (app) => app.uber_status,
        cell: (app) => (
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            {app.uber_status}
          </span>
        ),
      },
      {
        header: 'Status',
        id: 'status',
        minWidth: '160px',
        sortValue: (app) => app.status,
        cell: (app) => (
          <Badge
            appearance="filled"
            color={
              app.status === 'Paid' || app.status === 'Approved'
                ? 'success'
                : app.status === 'Payment Review'
                  ? 'warning'
                  : app.status === 'Cancelled' || app.status === 'Rejected'
                    ? 'danger'
                    : 'brand'
            }
            shape="rounded"
            className="!font-bold !uppercase !tracking-widest"
          >
            {app.status}
          </Badge>
        ),
      },
      {
        header: 'Date',
        id: 'date',
        minWidth: '130px',
        sortValue: (app) => new Date(app.created_at),
        cell: (app) => (
          <span className="text-xs text-slate-400">
            {new Date(app.created_at).toLocaleDateString()}
          </span>
        ),
      },
      {
        align: 'right',
        header: 'Actions',
        id: 'actions',
        sortable: false,
        cell: (app) => (
          <Button
            appearance="secondary"
            icon={<FileText className="h-4 w-4" />}
            className="!h-11 !w-11"
            title="Review Application"
            onClick={() => setSelectedApplication(app)}
          />
        ),
      },
    ],
    [setSelectedApplication],
  );

  const hasActiveStatusFilter = statusFilters.length > 0;
  const emptyTitle = applicationSearch
    ? 'No matching applications'
    : hasActiveStatusFilter
      ? 'No applications for the selected statuses'
      : 'No real applications yet';
  const emptyDescription = applicationSearch
    ? 'No driver applications match the current search and status filters.'
    : hasActiveStatusFilter
      ? 'No driver applications match the selected status filters.'
      : 'New driver applications will appear here as soon as renters submit the application form.';

  return (
    <motion.div
      key="applications"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-8"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="mb-2 text-3xl font-bold uppercase tracking-tighter text-white sm:text-4xl">
            Driver <span className="text-brand-gold italic">Applications</span>
          </h2>
          <p className="text-brand-grey font-light">
            Manage and review incoming driver requests.
          </p>
        </div>
        <div className="flex w-full gap-4 md:w-auto">
          <div className="w-full md:w-auto">
            <Input
              appearance="filled-darker"
              contentBefore={<Search className="h-4 w-4 text-brand-grey" />}
              value={applicationSearch}
              onChange={(event) => setApplicationSearch(event.target.value)}
              placeholder="Search drivers..."
              className="w-full md:!w-64 [&_input]:!text-white [&_input]:placeholder:!text-brand-grey/60"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          appearance={statusFilters.length === 0 ? 'primary' : 'secondary'}
          onClick={clearApplicationStatuses}
          size="small"
        >
          All
        </Button>
        {APPLICATION_STATUS_OPTIONS.map((status) => {
          const selected = statusFilters.includes(status);
          return (
            <Button
              key={status}
              appearance={selected ? 'primary' : 'secondary'}
              onClick={() => toggleApplicationStatus(status)}
              size="small"
            >
              {status}
            </Button>
          );
        })}
      </div>

      {applicationsError ? (
        renderErrorPanel(applicationsError)
      ) : isLoadingApplications && applications.length === 0 ? (
        renderLoadingPanel('Loading driver applications...')
      ) : (
        <DataTable
          rows={applications}
          columns={columns}
          getRowId={(app) => app.id}
          minWidth="1040px"
          bulkActions={[
            {
              icon: FileText,
              label: 'Review Selected',
              onClick: (rows) => rows[0] && setSelectedApplication(rows[0]),
            },
            {
              icon: Download,
              label: 'Export Selected',
              onClick: exportApplications,
            },
          ]}
          emptyState={{
            actionLabel: applicationSearch || hasActiveStatusFilter ? 'Clear Filters' : undefined,
            description: emptyDescription,
            icon: Users,
            onAction:
              applicationSearch || hasActiveStatusFilter
                ? () => {
                    setApplicationSearch('');
                    clearApplicationStatuses();
                  }
                : undefined,
            title: emptyTitle,
          }}
          pagination={{
            isFetching: isFetchingApplications,
            mode: 'server',
            onPageChange: onApplicationPageChange,
            onPageSizeChange: onApplicationPageSizeChange,
            page: applicationsPage,
            pageSize: applicationsPageSize,
            pageSizeOptions: [10, 25, 50, 100],
            totalItems: applicationsTotalItems,
            totalPages: applicationsTotalPages,
          }}
        />
      )}
    </motion.div>
  );
}
