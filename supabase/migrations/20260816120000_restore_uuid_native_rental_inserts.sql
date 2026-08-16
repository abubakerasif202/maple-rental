-- Restore production compatibility for explicit UUID-native rental activation.
--
-- The UUID conversion retained the former numeric application foreign key as
-- legacy_application_id. Historical/imported rentals keep that value, while
-- rentals created from applications.id must be allowed to leave it NULL.
--
-- Production also retains public.rentals_id_seq, but rentals.id has lost its
-- default. Reattach the existing sequence and position it without ever moving
-- it backwards. No rental row or existing rental id is updated by this change.
--
-- Compatibility
--   Migration-first rollout is required for the deployed activation payload,
--   which intentionally omits id and legacy_application_id. Older writers that
--   explicitly provide either value remain compatible.
--
-- Preflight
--   Confirm rentals.id is BIGINT with no default, legacy_application_id is NOT
--   NULL, public.rentals_id_seq is the intended sequence, and compare its
--   last_value/is_called with max(rentals.id). The DO blocks fail closed if the
--   named sequence is absent or is not a sequence.
--
-- Recovery
--   Prefer a forward correction. The table changes are transactional; setval
--   may remain advanced after a failed transaction, which is safe because gaps
--   are valid and this migration never moves the sequence backwards. Do not
--   restore legacy_application_id NOT NULL after UUID-native rentals exist.
--
-- Tests
--   api/rentalActivationMigration.test.ts and api/paymentLifecycle.test.ts.

BEGIN;

SET LOCAL lock_timeout = '10s';

-- Prevent a rental insert from racing the sequence alignment. This lock is
-- intentionally fail-fast so a busy production table causes a safe retry of
-- the migration rather than an unbounded deployment wait.
LOCK TABLE public.rentals IN ACCESS EXCLUSIVE MODE;

DO $$
DECLARE
  rental_id_sequence REGCLASS := to_regclass('public.rentals_id_seq');
  rental_id_sequence_kind "char";
BEGIN
  IF rental_id_sequence IS NULL THEN
    RAISE EXCEPTION
      'Cannot restore rentals.id default: public.rentals_id_seq does not exist';
  END IF;

  SELECT relkind
  INTO rental_id_sequence_kind
  FROM pg_catalog.pg_class
  WHERE oid = rental_id_sequence;

  IF rental_id_sequence_kind <> 'S' THEN
    RAISE EXCEPTION
      'Cannot restore rentals.id default: public.rentals_id_seq is not a sequence';
  END IF;
END
$$;

ALTER TABLE public.rentals
  ALTER COLUMN id SET DEFAULT nextval('public.rentals_id_seq'::regclass),
  ALTER COLUMN legacy_application_id DROP NOT NULL;

DO $$
DECLARE
  highest_rental_id BIGINT;
  sequence_is_called BOOLEAN;
  sequence_last_value BIGINT;
BEGIN
  SELECT max(id)
  INTO highest_rental_id
  FROM public.rentals;

  SELECT last_value, is_called
  INTO sequence_last_value, sequence_is_called
  FROM public.rentals_id_seq;

  -- If is_called is false, nextval returns last_value itself. Preserve that
  -- state only when it is already above every rental id. Otherwise mark the
  -- greatest used value as called so the next generated id is strictly higher.
  IF highest_rental_id IS NOT NULL
     AND (sequence_is_called OR sequence_last_value <= highest_rental_id) THEN
    PERFORM pg_catalog.setval(
      'public.rentals_id_seq'::regclass,
      GREATEST(sequence_last_value, highest_rental_id),
      true
    );
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
