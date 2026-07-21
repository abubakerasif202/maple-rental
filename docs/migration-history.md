# Migration history notes

The migrations `20260709231806_fix_lease_agreement_idempotency.sql` and `20260710103000_fix_lease_agreement_idempotency.sql` are equivalent production-safe repairs. The later `20260711110000_make_lease_agreement_history_immutable.sql` supersedes their effective final uniqueness state by enabling append-only agreement history.

These files may already be recorded in remote migration history. They must not be renamed, deleted, squashed, or edited. Any future schema change must be additive.
