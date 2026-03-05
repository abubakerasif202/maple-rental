-- Supabase destructive reset for local development only.
-- Do not run this in shared/staging/production environments.

DROP TABLE IF EXISTS lease_agreements CASCADE;
DROP TABLE IF EXISTS merchants CASCADE;
DROP TABLE IF EXISTS bookings CASCADE;
DROP TABLE IF EXISTS rentals CASCADE;
DROP TABLE IF EXISTS applications CASCADE;
DROP TABLE IF EXISTS cars CASCADE;
