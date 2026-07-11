# Application document retention

Application identity documents are private operational records. The cleanup command is intentionally non-destructive by default and only considers unreferenced files older than 30 days.

## Safe workflow

```powershell
npm run clean:documents
```

Review the JSON report. To delete only the eligible files reported by the same policy:

```powershell
npm run clean:documents:apply
```

Both modes require the service-role environment variables and write an event to `admin_audit_events`. Apply mode aborts if retention holds or audit storage cannot be read.

## Legal and operational holds

Create a hold for each exact storage path that must not be deleted:

```sql
insert into public.document_retention_holds (
  application_id,
  storage_path,
  reason,
  held_until,
  created_by
) values (
  '<application-uuid>',
  '<storage-path>',
  '<reason>',
  null,
  '<admin-email>'
);
```

Release a hold without deleting its history:

```sql
update public.document_retention_holds
set released_at = current_timestamp
where storage_path = '<storage-path>'
  and released_at is null;
```

Confirm legal, insurance, dispute, tax, and regulatory retention obligations before releasing a hold or applying cleanup. A database backup does not include Supabase Storage objects; storage backups must be handled separately.
