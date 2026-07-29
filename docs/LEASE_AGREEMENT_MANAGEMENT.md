# Lease agreement management

Lease agreements are an explicit admin workflow after an application is `Paid`;
Checkout never creates one and never creates or activates a rental.

- `api/routes/agreements.ts` authorizes generation, history reads, and PDF access.
- `lease_agreements` stores immutable rendered content, application identity,
  registration text, template version, status, and exact creation time.
- Agreement history is append-only; corrections create a new record.
- `api/agreementPdfArtifacts.ts` creates a deterministic private PDF artifact,
  verifies its hash after upload, and issues a five-minute signed URL.
- `supabase/migrations/20260721092000_add_lease_agreement_pdf_artifacts.sql`
  defines artifact state and the private `lease-agreements` bucket.

There is no lease-agreement delete endpoint and no agreement-to-cars relationship.
Vehicle/number-plate identity remains plain text. Private-document authorization,
object policy, retention, audit, and accessibility requirements are in
[`security-model.md`](security-model.md).
