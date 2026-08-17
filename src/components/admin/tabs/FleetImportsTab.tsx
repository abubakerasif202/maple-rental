import { useMemo, useState } from "react";
import { Button, Input, Select } from "@fluentui/react-components";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Link2,
  Loader2,
  Pencil,
  RefreshCw,
  Unlink,
  Upload,
} from "lucide-react";

import * as fleetImportApi from "../../../lib/fleetImportApi";
import { fetchRentals } from "../../../lib/api";
import { getApiErrorMessage } from "../../../lib/errorHandling";
import AccessibleDialog from "../AccessibleDialog";

const currency = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
});
const filters = [
  "",
  "ready",
  "needs_review",
  "matched",
  "unmatched",
  "applied",
  "rejected",
];

export default function FleetImportsTab() {
  const queryClient = useQueryClient();
  const [selectedImportId, setSelectedImportId] = useState<string | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [historySearch, setHistorySearch] = useState("");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dryRun, setDryRun] = useState<{
    canApply: boolean;
    rows: Array<Record<string, unknown> & { conflict: string | null }>;
  } | null>(null);
  const [confirmApply, setConfirmApply] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );
  const [message, setMessage] = useState<{
    type: "error" | "success";
    text: string;
  } | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [editingRow, setEditingRow] = useState<fleetImportApi.FleetImportRow | null>(null);
  const [matchingRow, setMatchingRow] = useState<fleetImportApi.FleetImportRow | null>(null);
  const [editDriverName, setEditDriverName] = useState("");
  const [editWeeklyRate, setEditWeeklyRate] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [rentalSearch, setRentalSearch] = useState("");
  const [rentalPage, setRentalPage] = useState(1);
  const [rejectReason, setRejectReason] = useState("");
  const [confirmReject, setConfirmReject] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [auditPage, setAuditPage] = useState(1);

  const history = useQuery({
    queryKey: ["fleet-imports", historyPage, historySearch],
    queryFn: ({ signal }) =>
      fleetImportApi.fetchFleetImports(
        { page: historyPage, pageSize: 25, search: historySearch },
        signal,
      ),
    placeholderData: (previous) => previous,
  });
  const summary = useQuery({
    queryKey: ["fleet-import", selectedImportId],
    queryFn: ({ signal }) => fleetImportApi.fetchFleetImport(selectedImportId!, signal),
    enabled: Boolean(selectedImportId),
  });
  const rows = useQuery({
    queryKey: ["fleet-import-rows", selectedImportId, page, search, status],
    queryFn: ({ signal }) =>
      fleetImportApi.fetchFleetImportRows(
        selectedImportId!,
        { page, pageSize: 25, search, status: status || undefined },
        signal,
      ),
    enabled: Boolean(selectedImportId),
    placeholderData: (previous) => previous,
  });
  const audit = useQuery({
    queryKey: ["fleet-import-audit", selectedImportId, auditPage],
    queryFn: ({ signal }) => fleetImportApi.fetchFleetImportAudit(selectedImportId!, auditPage, signal),
    enabled: Boolean(selectedImportId),
  });
  const rentalMatches = useQuery({
    queryKey: ["fleet-rental-matches", matchingRow?.id, rentalPage, rentalSearch],
    queryFn: ({ signal }) => fetchRentals({ page: rentalPage, pageSize: 10, search: rentalSearch || matchingRow?.vehicle_registration_original }, signal),
    enabled: Boolean(matchingRow),
  });
  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["fleet-imports"] }),
      queryClient.invalidateQueries({
        queryKey: ["fleet-import", selectedImportId],
      }),
      queryClient.invalidateQueries({
        queryKey: ["fleet-import-rows", selectedImportId],
      }),
      queryClient.invalidateQueries({ queryKey: ["rentals"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] }),
      queryClient.invalidateQueries({ queryKey: ["fleet-import-audit", selectedImportId] }),
    ]);
  };
  const uploadMutation = useMutation({
    mutationFn: fleetImportApi.uploadFleetImport,
    onSuccess: async (created) => {
      await invalidate();
      setSelectedImportId(created.id);
      setMessage({
        type: "success",
        text: "Fleet register staged for review.",
      });
    },
    onError: (error) =>
      setMessage({
        type: "error",
        text: getApiErrorMessage(error, "Fleet upload failed."),
      }),
  });
  const dryRunMutation = useMutation({
    mutationFn: () => fleetImportApi.dryRunFleetImport(selectedImportId!, [...selected]),
    onSuccess: (result) => {
      setDryRun(result);
      setMessage(
        result.canApply
          ? {
              type: "success",
              text: "Dry run passed. Review the exact changes before applying.",
            }
          : {
              type: "error",
              text: "Dry run found conflicts that must be resolved.",
            },
      );
    },
    onError: (error) =>
      setMessage({
        type: "error",
        text: getApiErrorMessage(error, "Dry run failed."),
      }),
  });
  const applyMutation = useMutation({
    mutationFn: () =>
      fleetImportApi.applyFleetImport(selectedImportId!, [...selected], idempotencyKey),
    onSuccess: async () => {
      setConfirmApply(false);
      setSelected(new Set());
      setDryRun(null);
      setIdempotencyKey(crypto.randomUUID());
      await invalidate();
      setMessage({
        type: "success",
        text: "The backend committed the selected fleet changes.",
      });
    },
    onError: (error) =>
      setMessage({
        type: "error",
        text: getApiErrorMessage(error, "Fleet apply failed."),
      }),
  });
  const rejectMutation = useMutation({
    mutationFn: () =>
      fleetImportApi.rejectFleetImportRows(
        selectedImportId!,
        [...selected],
        rejectReason,
      ),
    onSuccess: async () => {
      setSelected(new Set());
      setDryRun(null);
      setConfirmReject(false);
      setRejectReason("");
      await invalidate();
      setMessage({ type: "success", text: "Selected rows were rejected." });
    },
    onError: (error) =>
      setMessage({
        type: "error",
        text: getApiErrorMessage(error, "Reject failed."),
      }),
  });
  const acknowledgeMutation = useMutation({
    mutationFn: (rowId: string) =>
      fleetImportApi.updateFleetImportRow(selectedImportId!, rowId, {
        acknowledgeWarnings: true,
      }),
    onSuccess: invalidate,
    onError: (error) =>
      setMessage({
        type: "error",
        text: getApiErrorMessage(error, "Review acknowledgement failed."),
      }),
  });
  const editMutation = useMutation({
    mutationFn: async () => {
      if (!editingRow) throw new Error("No staged row selected.");
      await fleetImportApi.updateFleetImportRow(selectedImportId!, editingRow.id, {
        driverName: editDriverName.trim() || null,
        sourceNotes: editNotes.trim() || null,
        weeklyRate: Number(editWeeklyRate),
      });
    },
    onSuccess: async () => {
      setEditingRow(null);
      setDryRun(null);
      await invalidate();
      setSelected(new Set());
      setMessage({ type: "success", text: "Staged row saved and revalidated by the server." });
    },
    onError: (error) =>
      setMessage({
        type: "error",
        text: getApiErrorMessage(error, "Staged row update failed."),
      }),
  });
  const matchMutation = useMutation({
    mutationFn: (rentalId: number | null) => fleetImportApi.matchFleetImportRow(selectedImportId!, matchingRow!.id, rentalId),
    onSuccess: async (_row, rentalId) => {
      setMatchingRow(null);
      setSelected(new Set());
      setDryRun(null);
      await invalidate();
      setMessage({ type: "success", text: rentalId ? "Rental matched." : "Rental unmatched." });
    },
    onError: (error) => setMessage({ type: "error", text: getApiErrorMessage(error, "Rental matching failed.") }),
  });
  const revalidateMutation = useMutation({
    mutationFn: (rowId: string) => fleetImportApi.revalidateFleetImportRow(selectedImportId!, rowId),
    onSuccess: async () => { setSelected(new Set()); setDryRun(null); await invalidate(); setMessage({ type: "success", text: "Row revalidated." }); },
    onError: (error) => setMessage({ type: "error", text: getApiErrorMessage(error, "Revalidation failed.") }),
  });
  const cancelMutation = useMutation({
    mutationFn: () => fleetImportApi.cancelFleetImport(selectedImportId!),
    onSuccess: async () => {
      await invalidate();
      setSelectedImportId(null);
      setConfirmCancel(false);
      setMessage({ type: "success", text: "Unapplied fleet import cancelled." });
    },
    onError: (error) =>
      setMessage({ type: "error", text: getApiErrorMessage(error, "Fleet import cancellation failed.") }),
  });

  const selectedRows = useMemo(
    () => rows.data?.items.filter((row) => selected.has(row.id)) || [],
    [rows.data, selected],
  );
  const totalPages = Math.max(1, Math.ceil((rows.data?.total || 0) / 25));
  const historyTotalPages = Math.max(
    1,
    Math.ceil((history.data?.total || 0) / 25),
  );
  const openImport = (id: string) => {
    setSelectedImportId(id);
    setPage(1);
    setSelected(new Set());
    setDryRun(null);
    setIdempotencyKey(crypto.randomUUID());
    setMessage(null);
  };
  const downloadRejectedRows = async () => {
    if (isDownloading) return;
    setIsDownloading(true);
    try {
      const blob = await fleetImportApi.downloadFleetImportRejectedRows(selectedImportId!);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `fleet-import-${selectedImportId}-rejected.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage({
        type: "success",
        text: "Rejected and error rows downloaded.",
      });
    } catch (error) {
      setMessage({
        type: "error",
        text: getApiErrorMessage(error, "Rejected-row download failed."),
      });
    } finally {
      setIsDownloading(false);
    }
  };
  const openRowEditor = (row: fleetImportApi.FleetImportRow) => {
    setEditingRow(row);
    setEditDriverName(row.driver_name_original || "");
    setEditWeeklyRate(String(row.weekly_rate));
    setEditNotes(row.source_notes || "");
  };
  const openMatcher = (row: fleetImportApi.FleetImportRow) => {
    setMatchingRow(row);
    setRentalSearch(row.vehicle_registration_original);
    setRentalPage(1);
  };
  const normalizeRegistration = (value: string | null | undefined) => (value || "").trim().toUpperCase().replace(/\s+/g, "");

  if (!selectedImportId) {
    return (
      <section aria-labelledby="fleet-import-title" className="space-y-8">
        <header>
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-brand-gold">
            Operations
          </p>
          <h2
            id="fleet-import-title"
            className="mt-2 text-3xl font-bold text-white"
          >
            Fleet Register Import
          </h2>
          <p className="mt-2 max-w-3xl text-sm text-brand-grey">
            Upload a snapshot for staged server-side validation. Nothing changes
            in rentals, applications, payments, customers or Stripe until
            selected matched rows pass a dry run and are explicitly applied.
          </p>
        </header>
        {message && (
          <div
            role={message.type === "error" ? "alert" : "status"}
            className={`rounded-2xl border p-4 text-sm ${message.type === "error" ? "border-red-400/30 bg-red-500/10 text-red-100" : "border-green-400/30 bg-green-500/10 text-green-100"}`}
          >
            {message.text}
          </div>
        )}
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <label
            htmlFor="fleet-file"
            className="block text-sm font-bold text-white"
          >
            Fleet register file
          </label>
          <p className="mt-1 text-xs text-brand-grey">
            XLSX or CSV, maximum 2 MB. Parsing is server-side and formulas are
            never executed.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input
              id="fleet-file"
              type="file"
              accept=".xlsx,.csv"
              disabled={uploadMutation.isPending}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) uploadMutation.mutate(file);
              }}
              className="min-h-12 flex-1 rounded-xl border border-white/10 bg-brand-navy p-3 text-sm text-white file:mr-4 file:rounded-lg file:border-0 file:bg-brand-gold file:px-4 file:py-2 file:font-bold file:text-brand-navy"
            />
            <span className="flex items-center gap-2 text-xs text-brand-grey">
              {uploadMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Uploading and
                  parsing…
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" /> Select a file to begin
                </>
              )}
            </span>
          </div>
        </div>
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-xl font-bold text-white">Import history</h3>
            <Input
              aria-label="Search import history"
              placeholder="Search filename"
              value={historySearch}
              onChange={(_event, data) => {
                setHistorySearch(data.value);
                setHistoryPage(1);
              }}
            />
          </div>
          {history.isPending ? (
            <p className="text-brand-grey">Loading imports…</p>
          ) : history.isError ? (
            <div role="alert" className="text-red-200">
              {getApiErrorMessage(
                history.error,
                "Could not load import history.",
              )}{" "}
              <Button onClick={() => history.refetch()}>Retry</Button>
            </div>
          ) : history.data?.items.length ? (
            <div className="grid gap-4">
              {history.data.items.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => openImport(item.id)}
                  className="grid min-h-20 gap-2 rounded-2xl border border-white/10 bg-white/5 p-5 text-left transition hover:border-brand-gold/50 sm:grid-cols-6 sm:items-center"
                >
                  <span className="font-bold text-white sm:col-span-2">
                    {item.original_filename}
                  </span>
                  <span className="text-sm text-brand-grey">
                    {item.snapshot_date}
                  </span>
                  <span className="text-sm capitalize text-brand-gold">
                    {item.status.replace("_", " ")}
                  </span>
                  <span className="text-sm text-brand-grey">
                    {item.total_rows} rows
                  </span>
                  <span className="text-sm text-brand-grey">
                    {new Date(item.created_at).toLocaleString("en-AU")}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-white/15 p-10 text-center text-brand-grey">
              <FileSpreadsheet className="mx-auto mb-3 h-8 w-8" />
              No fleet imports match this search.
            </div>
          )}
          <div className="flex items-center justify-between text-sm text-brand-grey">
            <span>{history.data?.total || 0} imports</span>
            <div className="flex items-center gap-3">
              <Button
                disabled={historyPage <= 1 || history.isFetching}
                onClick={() => setHistoryPage((value) => value - 1)}
              >
                Previous
              </Button>
              <span>
                Page {historyPage} of {historyTotalPages}
              </span>
              <Button
                disabled={
                  historyPage >= historyTotalPages || history.isFetching
                }
                onClick={() => setHistoryPage((value) => value + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (summary.isPending)
    return (
      <div role="status" className="flex items-center gap-3 text-brand-grey">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading fleet import summary…
      </div>
    );
  if (summary.isError || !summary.data)
    return (
      <div
        role="alert"
        className="space-y-3 rounded-2xl border border-red-400/30 bg-red-500/10 p-5 text-red-100"
      >
        <p>
          {getApiErrorMessage(
            summary.error,
            "Could not load the fleet import summary.",
          )}
        </p>
        <div className="flex gap-3">
          <Button onClick={() => summary.refetch()}>Retry</Button>
          <Button onClick={() => setSelectedImportId(null)}>
            Back to history
          </Button>
        </div>
      </div>
    );

  return (
    <section aria-labelledby="fleet-detail-title" className="space-y-6">
      <Button
        appearance="subtle"
        icon={<ArrowLeft />}
        onClick={() => setSelectedImportId(null)}
      >
        Back to import history
      </Button>
      {summary.data.applied_rows === 0 && !["cancelled", "applied"].includes(summary.data.status) && (
        <Button appearance="outline" disabled={cancelMutation.isPending} onClick={() => setConfirmCancel(true)}>
          {cancelMutation.isPending ? "Cancelling…" : "Cancel import"}
        </Button>
      )}
      <header>
        <h2 id="fleet-detail-title" className="text-3xl font-bold text-white">
          {summary.data?.original_filename || "Fleet import"}
        </h2>
        <p className="mt-2 text-sm text-brand-grey">
          Snapshot {summary.data?.snapshot_date} · This date is not an approval,
          payment, activation, subscription or rental start date.
        </p>
      </header>
      {message && (
        <div
          role={message.type === "error" ? "alert" : "status"}
          className={`rounded-2xl border p-4 text-sm ${message.type === "error" ? "border-red-400/30 bg-red-500/10 text-red-100" : "border-green-400/30 bg-green-500/10 text-green-100"}`}
        >
          {message.text}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Total vehicles", summary.data?.total_rows],
          [
            "Weekly value",
            currency.format(Number(summary.data?.total_weekly_rate || 0)),
          ],
          ["Matched", summary.data?.matched_rows],
          ["Unmatched", summary.data?.unmatched_rows],
          ["Needs review", summary.data?.review_rows],
          ["Selected", selected.size],
          ["Increases", summary.data?.proposed_increases],
          ["Decreases", summary.data?.proposed_decreases],
        ].map(([label, value]) => (
          <div
            key={String(label)}
            className="rounded-2xl border border-white/10 bg-white/5 p-4"
          >
            <p className="text-[10px] font-bold uppercase tracking-widest text-brand-grey">
              {label}
            </p>
            <p className="mt-2 text-2xl font-bold text-white">{value ?? "—"}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 lg:flex-row lg:items-center">
        <Input
          aria-label="Search fleet rows"
          placeholder="Search driver or registration"
          value={search}
          onChange={(_e, data) => {
            setSearch(data.value);
            setPage(1);
          }}
        />
        <Select
          aria-label="Filter fleet rows"
          value={status}
          onChange={(_e, data) => {
            setStatus(data.value);
            setPage(1);
          }}
        >
          {filters.map((filter) => (
            <option key={filter} value={filter}>
              {filter ? filter.replace("_", " ") : "All rows"}
            </option>
          ))}
        </Select>
        <div className="flex flex-wrap gap-2 lg:ml-auto">
          <Button
            disabled={!selected.size || dryRunMutation.isPending}
            onClick={() => dryRunMutation.mutate()}
          >
            {dryRunMutation.isPending ? "Checking…" : "Dry run selected"}
          </Button>
          <Button
            appearance="primary"
            disabled={!selected.size || !dryRun?.canApply}
            onClick={() => setConfirmApply(true)}
          >
            Apply selected
          </Button>
          <Button
            appearance="outline"
            disabled={!selected.size || rejectMutation.isPending}
            onClick={() => setConfirmReject(true)}
          >
            Reject selected
          </Button>
          <Button
            appearance="subtle"
            icon={
              isDownloading ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Download />
              )
            }
            disabled={isDownloading}
            onClick={downloadRejectedRows}
          >
            {isDownloading ? "Downloading…" : "Download errors"}
          </Button>
        </div>
      </div>
      {dryRun && (
        <div className="rounded-2xl border border-brand-gold/20 bg-brand-gold/5 p-4">
          <h3 className="font-bold text-white">Dry-run changes</h3>
          <ul className="mt-2 space-y-1 text-sm text-brand-grey">
            {dryRun.rows.map((row) => (
              <li key={String(row.rowId)}>
                {String(row.registration || "Unmatched")}:{" "}
                {currency.format(Number(row.existingWeeklyRate || 0))} →{" "}
                {currency.format(Number(row.proposedWeeklyRate || 0))}
                {row.conflict ? ` — ${row.conflict}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="overflow-x-auto rounded-2xl border border-white/10">
        <table className="min-w-[1050px] w-full text-left text-sm">
          <thead className="bg-white/5 text-[10px] uppercase tracking-widest text-brand-grey">
            <tr>
              {[
                "Select",
                "Row",
                "Driver",
                "Rego",
                "Vehicle",
                "Proposed",
                "Matched rental",
                "Existing",
                "Status",
                "Notes",
                "Action",
              ].map((name) => (
                <th key={name} className="p-3">
                  {name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.isPending ? (
              <tr>
                <td colSpan={11} className="p-8 text-center text-brand-grey">
                  Loading rows…
                </td>
              </tr>
            ) : rows.isError ? (
              <tr>
                <td colSpan={11} className="p-8 text-center text-red-200">
                  {getApiErrorMessage(rows.error, "Could not load rows.")}
                </td>
              </tr>
            ) : rows.data?.items.length ? (
              rows.data.items.map((row) => (
                <tr
                  key={row.id}
                  className="border-t border-white/10 text-brand-grey"
                >
                  <td className="p-3">
                    <input
                      aria-label={`Select source row ${row.source_row_number}`}
                      type="checkbox"
                      checked={selected.has(row.id)}
                      disabled={row.apply_status !== "pending"}
                      onChange={() => {
                        setDryRun(null);
                        setSelected((current) => {
                          const next = new Set(current);
                          if (next.has(row.id)) next.delete(row.id);
                          else next.add(row.id);
                          return next;
                        });
                      }}
                    />
                  </td>
                  <td className="p-3">{row.source_row_number}</td>
                  <td className="p-3 text-white">
                    {row.driver_name_original || "Missing"}
                  </td>
                  <td className="p-3 font-mono text-white">
                    {row.vehicle_registration_original}
                  </td>
                  <td className="p-3">
                    {row.make_original} {row.model_original}
                  </td>
                  <td className="p-3">
                    {currency.format(Number(row.weekly_rate))}
                  </td>
                  <td className="p-3">
                    {row.matched_rental_id
                      ? `#${row.matched_rental_id} ${row.existing_registration || ""}`
                      : "Unmatched"}
                  </td>
                  <td className="p-3">
                    {row.existing_weekly_rate == null
                      ? "—"
                      : currency.format(Number(row.existing_weekly_rate))}
                  </td>
                  <td className="p-3 capitalize">
                    {row.apply_status !== "pending"
                      ? row.apply_status
                      : row.validation_status.replace("_", " ")}
                  </td>
                  <td className="max-w-56 p-3 text-xs">
                    {[
                      ...row.validation_errors,
                      ...row.validation_warnings,
                      row.source_notes,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </td>
                  <td className="space-y-2 p-3">
                    <Button
                      size="small"
                      disabled={row.apply_status !== "pending"}
                      onClick={() => openRowEditor(row)}
                    >
                      <Pencil className="h-4 w-4" /> Edit staged row
                    </Button>
                    <Button
                      size="small"
                      disabled={row.apply_status !== "pending"}
                      onClick={() => openMatcher(row)}
                    >
                      <Link2 className="h-4 w-4" /> Match rental
                    </Button>
                    {row.matched_rental_id && (
                      <Button size="small" disabled={matchMutation.isPending || row.apply_status !== "pending"} onClick={() => { setMatchingRow(row); matchMutation.mutate(null); }}>
                        <Unlink className="h-4 w-4" /> Unmatch
                      </Button>
                    )}
                    <Button size="small" disabled={revalidateMutation.isPending || row.apply_status !== "pending"} onClick={() => revalidateMutation.mutate(row.id)}>
                      <RefreshCw className="h-4 w-4" /> Revalidate row
                    </Button>
                    {row.validation_status === "needs_review" &&
                      row.validation_errors.length === 0 && (
                        <Button
                          size="small"
                          disabled={acknowledgeMutation.isPending}
                          onClick={() => acknowledgeMutation.mutate(row.id)}
                        >
                          Acknowledge
                        </Button>
                      )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={11} className="p-8 text-center text-brand-grey">
                  No rows match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-sm text-brand-grey">
        <span>{rows.data?.total || 0} rows</span>
        <div className="flex items-center gap-3">
          <Button
            disabled={page <= 1}
            onClick={() => setPage((value) => value - 1)}
          >
            Previous
          </Button>
          <span>
            Page {page} of {totalPages}
          </span>
          <Button
            disabled={page >= totalPages}
            onClick={() => setPage((value) => value + 1)}
          >
            Next
          </Button>
        </div>
      </div>
      {editingRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-navy/80 p-4">
          <AccessibleDialog
            ariaLabelledBy="edit-fleet-row-title"
            onClose={() => !editMutation.isPending && setEditingRow(null)}
            className="w-full max-w-xl space-y-5 rounded-3xl border border-white/10 bg-brand-navy p-6 shadow-2xl"
          >
            <div>
              <h3 id="edit-fleet-row-title" className="text-2xl font-bold text-white">
                Edit source row {editingRow.source_row_number}
              </h3>
              <p className="mt-2 text-sm text-brand-grey">
                Registration {editingRow.vehicle_registration_original} remains read-only. Review the current staged values before saving proposed changes.
              </p>
            </div>
            <div className="rounded-xl border border-white/10 p-3 text-sm text-brand-grey">
              Original: {editingRow.driver_name_original || "Missing driver"} · {currency.format(Number(editingRow.weekly_rate))} · {editingRow.source_notes || "No notes"}
            </div>
            <label htmlFor="fleet-edit-driver" className="block text-sm font-bold text-white">
              Proposed driver name
              <Input id="fleet-edit-driver" className="mt-2 w-full" value={editDriverName} onChange={(_event, data) => setEditDriverName(data.value)} />
            </label>
            <label htmlFor="fleet-edit-weekly-rate" className="block text-sm font-bold text-white">
              Proposed weekly rate
              <Input id="fleet-edit-weekly-rate" className="mt-2 w-full" type="number" min="0.01" step="0.01" value={editWeeklyRate} onChange={(_event, data) => setEditWeeklyRate(data.value)} />
            </label>
            <label className="block text-sm font-bold text-white">
              Source review notes
              <textarea className="mt-2 min-h-24 w-full rounded-xl border border-white/40 bg-white/5 p-3 text-white" value={editNotes} onChange={(event) => setEditNotes(event.target.value)} />
            </label>
            <div className="flex flex-col-reverse gap-3 sm:flex-row">
              <Button className="sm:flex-1" disabled={editMutation.isPending} onClick={() => setEditingRow(null)}>Cancel</Button>
              <Button appearance="primary" className="sm:flex-1" disabled={editMutation.isPending || !Number.isFinite(Number(editWeeklyRate)) || Number(editWeeklyRate) <= 0} onClick={() => editMutation.mutate()}>
                {editMutation.isPending ? "Saving…" : "Save staged row"}
              </Button>
            </div>
          </AccessibleDialog>
        </div>
      )}
      {matchingRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-navy/80 p-4">
          <AccessibleDialog ariaLabelledBy="match-fleet-row-title" onClose={() => !matchMutation.isPending && setMatchingRow(null)} className="max-h-[90vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-3xl border border-white/10 bg-brand-navy p-6 shadow-2xl">
            <h3 id="match-fleet-row-title" className="text-2xl font-bold text-white">Match rental for {matchingRow.vehicle_registration_original}</h3>
            <p className="text-sm text-brand-grey">Only an authoritative rental with the same normalized registration can be selected. Driver names are context only and never establish identity.</p>
            <Input aria-label="Search rentals for matching" value={rentalSearch} onChange={(_event, data) => { setRentalSearch(data.value); setRentalPage(1); }} />
            {rentalMatches.isPending ? <p role="status" className="text-brand-grey">Searching rentals…</p> : rentalMatches.isError ? <div role="alert" className="text-red-200">{getApiErrorMessage(rentalMatches.error, "Rental search failed.")} <Button onClick={() => rentalMatches.refetch()}>Retry</Button></div> : (() => {
              const valid = (rentalMatches.data?.items || []).filter((rental) => normalizeRegistration(rental.vehicle_registration) === normalizeRegistration(matchingRow.vehicle_registration_original));
              return valid.length ? <div className="space-y-3">{valid.map((rental) => <div key={rental.id} className="rounded-xl border border-white/10 p-4 text-sm text-brand-grey"><p className="font-bold text-white">Rental #{rental.id} · {rental.vehicle_registration}</p><p>{rental.applicant_name || "No driver context"} · {rental.status} · {currency.format(Number(rental.weekly_price))}</p><Button className="mt-3" appearance="primary" disabled={matchMutation.isPending} onClick={() => matchMutation.mutate(rental.id)}>Select rental #{rental.id}</Button></div>)}</div> : <p role="alert" className="rounded-xl border border-amber-400/30 p-4 text-amber-100">No rental with a matching authoritative registration was found.</p>;
            })()}
            <div className="flex items-center justify-between"><Button disabled={rentalPage <= 1} onClick={() => setRentalPage((value) => value - 1)}>Previous</Button><span className="text-sm text-brand-grey">Page {rentalPage}</span><Button disabled={!rentalMatches.data || rentalPage * 10 >= rentalMatches.data.totalItems} onClick={() => setRentalPage((value) => value + 1)}>Next</Button></div>
            <Button onClick={() => setMatchingRow(null)} disabled={matchMutation.isPending}>Close</Button>
          </AccessibleDialog>
        </div>
      )}
      {confirmReject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-navy/80 p-4"><AccessibleDialog ariaLabelledBy="reject-fleet-title" onClose={() => !rejectMutation.isPending && setConfirmReject(false)} className="w-full max-w-lg space-y-4 rounded-3xl border border-white/10 bg-brand-navy p-6"><h3 id="reject-fleet-title" className="text-2xl font-bold text-white">Reject {selected.size} selected rows?</h3><label className="block text-sm font-bold text-white">Rejection reason<textarea aria-label="Rejection reason" value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} className="mt-2 min-h-24 w-full rounded-xl border border-white/40 bg-white/5 p-3 text-white" /></label><div className="flex gap-3"><Button onClick={() => setConfirmReject(false)}>Keep rows</Button><Button appearance="primary" disabled={rejectMutation.isPending || !rejectReason.trim()} onClick={() => rejectMutation.mutate()}>{rejectMutation.isPending ? "Rejecting…" : "Confirm reject"}</Button></div></AccessibleDialog></div>
      )}
      {confirmCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-navy/80 p-4"><AccessibleDialog ariaLabelledBy="cancel-fleet-title" onClose={() => !cancelMutation.isPending && setConfirmCancel(false)} className="w-full max-w-lg space-y-4 rounded-3xl border border-white/10 bg-brand-navy p-6"><h3 id="cancel-fleet-title" className="text-2xl font-bold text-white">Cancel this unapplied import?</h3><p className="text-sm text-brand-grey">Staged rows will remain in audit history but can no longer be changed or applied.</p><div className="flex gap-3"><Button onClick={() => setConfirmCancel(false)}>Keep import</Button><Button appearance="primary" disabled={cancelMutation.isPending} onClick={() => cancelMutation.mutate()}>{cancelMutation.isPending ? "Cancelling…" : "Confirm cancel"}</Button></div></AccessibleDialog></div>
      )}
      <section aria-labelledby="fleet-audit-title" className="rounded-2xl border border-white/10 p-4">
        <h3 id="fleet-audit-title" className="text-xl font-bold text-white">Audit history</h3>
        {audit.isPending ? <p role="status" className="mt-3 text-brand-grey">Loading audit history…</p> : audit.isError ? <div role="alert" className="mt-3 text-red-200">Could not load audit history. <Button onClick={() => audit.refetch()}>Retry</Button></div> : audit.data?.items.length ? <ul className="mt-3 space-y-2 text-sm text-brand-grey">{audit.data.items.map((event) => <li key={event.id} className="rounded-xl bg-white/5 p-3"><span className="font-bold text-white">{event.action.replaceAll("_", " ")}</span> · {event.actor || "System"} · {new Date(event.created_at).toLocaleString("en-AU")}</li>)}</ul> : <p className="mt-3 text-brand-grey">No audit events recorded.</p>}
        <div className="mt-3 flex items-center justify-between"><Button disabled={auditPage <= 1} onClick={() => setAuditPage((value) => value - 1)}>Previous audit page</Button><span className="text-sm text-brand-grey">Audit page {auditPage}</span><Button disabled={!audit.data || auditPage * 10 >= audit.data.total} onClick={() => setAuditPage((value) => value + 1)}>Next audit page</Button></div>
      </section>
      {confirmApply && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-navy/80 p-4">
          <AccessibleDialog
            ariaLabelledBy="apply-fleet-title"
            onClose={() => !applyMutation.isPending && setConfirmApply(false)}
            className="w-full max-w-xl rounded-3xl border border-white/10 bg-brand-navy p-6 shadow-2xl"
          >
            <AlertTriangle className="h-8 w-8 text-brand-gold" />
            <h3
              id="apply-fleet-title"
              className="mt-4 text-2xl font-bold text-white"
            >
              Apply {selected.size} fleet changes?
            </h3>
            <p className="mt-3 text-sm leading-6 text-brand-grey">
              This updates only the weekly rate on the exact matched rental
              records shown in the successful dry run. It does not change
              registrations, applications, payments, customers, rental status,
              Stripe prices or subscriptions.
            </p>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row">
              <Button
                className="sm:flex-1"
                disabled={applyMutation.isPending}
                onClick={() => setConfirmApply(false)}
              >
                Cancel
              </Button>
              <Button
                appearance="primary"
                className="sm:flex-1"
                disabled={applyMutation.isPending}
                icon={
                  applyMutation.isPending ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <CheckCircle2 />
                  )
                }
                onClick={() => applyMutation.mutate()}
              >
                Confirm apply
              </Button>
            </div>
          </AccessibleDialog>
        </div>
      )}
    </section>
  );
}
