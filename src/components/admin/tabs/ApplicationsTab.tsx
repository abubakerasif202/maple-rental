import React, { useMemo } from 'react';
import { Badge, Button, Input } from '@fluentui/react-components';
import { motion } from 'motion/react';
import { Download, FileText, Search, Users } from 'lucide-react';
import { Application } from '../../../types';
import DataTable, { type DataTableColumn } from '../DataTable';

interface ApplicationsTabProps {
  applicationSearch: string;
  setApplicationSearch: (val: string) => void;
  filteredApplications: Application[];
  setSelectedApplication: (app: Application) => void;
}

export default function ApplicationsTab({
  applicationSearch,
  setApplicationSearch,
  filteredApplications,
  setSelectedApplication,
}: ApplicationsTabProps) {
  const exportApplications = (applications: Application[]) => {
    const headers = ['Driver', 'Email', 'Phone', 'Status', 'Experience', 'Date'];
    const rows = applications.map((app) => [
      app.name,
      app.email,
      app.phone,
      app.status,
      app.experience,
      new Date(app.created_at).toLocaleDateString(),
    ]);
    const csv = [headers, ...rows]
      .map((row) =>
        row.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')
      )
      .join('\n');
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
    [setSelectedApplication]
  );

  return (
    <motion.div
      key="applications"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-12"
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
              contentBefore={<Search className="w-4 h-4 text-brand-grey" />}
              value={applicationSearch}
              onChange={(event) => setApplicationSearch(event.target.value)}
              placeholder="Search drivers..."
              className="w-full md:!w-64 [&_input]:!text-white [&_input]:placeholder:!text-brand-grey/60"
            />
          </div>
        </div>
      </div>

      <DataTable
        rows={filteredApplications}
        columns={columns}
        getRowId={(app) => app.id}
        minWidth="1040px"
        filters={[
          {
            id: 'status',
            label: 'Status',
            getValue: (app) => app.status,
            options: ['Pending', 'Payment Review', 'Approved', 'Paid', 'Rejected', 'Cancelled'].map(
              (status) => ({ label: status, value: status })
            ),
          },
        ]}
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
          actionLabel: applicationSearch ? 'Clear Search' : undefined,
          description: applicationSearch
            ? 'No driver applications match the current search and status filters.'
            : 'New driver applications will appear here as soon as renters submit the application form.',
          icon: Users,
          onAction: applicationSearch ? () => setApplicationSearch('') : undefined,
          title: applicationSearch ? 'No matching applications' : 'No real applications yet',
        }}
      />
    </motion.div>
  );
}
