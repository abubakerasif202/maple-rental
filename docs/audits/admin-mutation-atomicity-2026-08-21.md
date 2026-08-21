# Admin mutation and audit atomicity matrix

This matrix records the final-hardening review of server-side admin mutations.
“Yes” means the business write and its audit insert execute inside the same
PostgreSQL transaction. External Stripe, email, and object-storage side effects
cannot share a PostgreSQL transaction; those flows require a durable saga/outbox
and explicit reconciliation state.

| Mutation | Business write | Audit write | Same transaction? |
| --- | --- | --- | --- |
| Application payment approval / payment-link version | CAS update of `applications` | `application_payment_approved` after optional email | No — remaining |
| Application rejection/status change | `applications.status` update | `application_status_changed` afterward | No — remaining |
| Verified Checkout payment fulfilment | `Paid` state, fulfilment ledger, Stripe identity, customer create/link | operational-customer audit | Yes when direct session PostgreSQL is available; otherwise fail closed to `Payment Review` before `Paid` |
| Verified Stripe identity persistence | `applications` identity plus customer create/link | operational-customer audit | Yes — `persist_verified_stripe_relationship` RPC |
| Rental activation | customer relationship RPC, then `rentals` insert | `rental_activated` afterward | No — remaining high-value conversion candidate |
| Application/rental cancellation | durable cancellation-operation saga plus CAS business write | requested/completed/reconciled events | No single cross-system transaction; reconciliation state prevents false success, but local completion/audit is not atomic |
| Lease agreement creation | `lease_agreements` insert | `lease_agreement_created` afterward | No — remaining |
| Agreement template create/revise/activate | template mutation | audit insert in RPC | Yes — transactional RPCs |
| Manual invoice creation | invoice and items | audit insert in `create_manual_invoice_transaction` | Yes |
| Toll notice creation/manual status | notice insert/update | notice audit afterward | No — remaining |
| Toll notice email finalization | delivery attempt and notice status | delivery audit in `finalize_toll_notice_delivery` | Yes |
| Maintenance imported-data reset | direct PostgreSQL reset transaction | general audit afterward | No — remaining; destructive flow is feature-gated, token-confirmed, and rollback-aware |
| Fleet import upload/edit/match/apply/reject/cancel | direct PostgreSQL transaction | audit insert using the same transaction client | Yes |
| Application document deletion | Object Storage removal during failed submission cleanup | no business mutation audit | Not applicable to a single DB transaction; no admin customer-document deletion endpoint exists |
| Agreement/manual-invoice document access | no business mutation | fail-closed access audit before disclosure | Yes for disclosure gate, not a business write |
| Customer edits | no general customer mutation endpoint exists | n/a | n/a |
| Rental edits | activation and cancellation routes only | see rows above | No general rental edit endpoint exists |

## Decision

The verified Stripe identity path was the confirmed partial financial-link risk:
the application payment/identity could commit before customer linkage or audit
insertion. The direct-database fulfilment path now encloses the `Paid` write,
fulfilment ledger, identity/customer RPC, and audit insert in one transaction and
rolls back at every persistence boundary. Restricted mode fails closed to
`Payment Review` before recording `Paid`; it cannot claim equivalent atomicity.

F-14 remains partially fixed. Retrofitting every remaining flow in one release
patch would create more schema and compatibility risk than it removes, especially
for legacy agreement columns and cross-system cancellation/email operations. The
next migration should prioritize rental activation, application approval/status,
lease-agreement creation, toll notice mutation, and maintenance reset in that
order. Cross-system operations should use durable intent/outbox records rather
than claiming PostgreSQL atomicity across Stripe, Resend, or Storage.
