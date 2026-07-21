import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };
const HARDENING_DEFINITIONS = {
  admin_audit_events: {
    properties: {
      action: { type: 'string' },
      target_type: { type: 'string' },
      metadata: { type: 'object' },
    },
  },
  customers: { properties: { is_imported: { type: 'boolean' } } },
  document_retention_holds: {
    properties: {
      storage_path: { type: 'string' },
      released_at: { type: 'string' },
    },
  },
  invoices: { properties: { is_imported: { type: 'boolean' } } },
  stripe_cancellation_operations: {
    properties: {
      idempotency_key: {}, expected_payment_link_version: {}, processing_started_at: {},
      requested_mode: {}, status: {}, stripe_subscription_id: {},
    },
  },
  lease_agreement_pdf_artifacts: {
    properties: {
      source_agreement_id: {}, generation_status: {}, generation_started_at: {},
      storage_path: {}, sha256: {},
    },
  },
};

describe('schemaContract', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = {
      ...ORIGINAL_ENV,
      NODE_ENV: 'production',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
      VITEST: 'false',
    };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
  });

  it('passes when required contract columns exist', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          definitions: {
            ...HARDENING_DEFINITIONS,
            applications: {
              properties: {
                approved_at: { type: 'string' },
                approved_bond: { type: 'number' },
                approved_vehicle: { type: 'string' },
                approved_weekly_price: { type: 'number' },
                assigned_car_id: { type: 'number' },
                agreement_accepted_at: { type: 'string' },
                agreement_signature: { type: 'string' },
                agreement_template_version: { type: 'number' },
                cancelled_at: { type: 'string' },
                cancel_reason: { type: 'string' },
                passport_or_uber_profile_screenshot: { type: 'string' },
                paid_at: { type: 'string' },
                payment_link_sent_at: { type: 'string' },
                payment_link_version: { type: 'number' },
                pending_checkout_session_id: { type: 'string' },
              },
            },
            cars: { properties: { created_at: { type: 'string' } } },
            rentals: {
              properties: {
                vehicle_registration: { type: 'string' },
                stripe_customer_id: { type: 'string' },
                stripe_subscription_id: { type: 'string' },
                stripe_status_event_created_at: { type: 'string' },
                stripe_status_event_id: { type: 'string' },
                stripe_status_event_terminal: { type: 'boolean' },
              },
            },
            stripe_webhook_events: {
              properties: {
                application_id: { type: 'string' },
                stripe_customer_id: { type: 'string' },
                stripe_event_id: { type: 'string' },
                stripe_subscription_id: { type: 'string' },
                status: { type: 'string' },
                received_at: { type: 'string' },
                updated_at: { type: 'string' },
              },
            },
          },
        }),
      })
    );

    const {
      resetSchemaContractValidationForTests,
      verifyProductionSchemaContract,
    } = await import('./schemaContract.js');

    resetSchemaContractValidationForTests();
    await expect(verifyProductionSchemaContract()).resolves.toBeUndefined();
  });

  it('passes when the live schema still exposes legacy camelCase payment columns', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          definitions: {
            ...HARDENING_DEFINITIONS,
            applications: {
              properties: {
                approvedAt: { type: 'string' },
                approvedBond: { type: 'number' },
                approvedVehicle: { type: 'string' },
                approvedWeeklyPrice: { type: 'number' },
                assignedCarId: { type: 'number' },
                agreementAcceptedAt: { type: 'string' },
                agreementSignature: { type: 'string' },
                agreementTemplateVersion: { type: 'number' },
                cancelledAt: { type: 'string' },
                cancelReason: { type: 'string' },
                licenseBackPhoto: { type: 'string' },
                passportOrUberProfileScreenshot: { type: 'string' },
                paidAt: { type: 'string' },
                paymentLinkSentAt: { type: 'string' },
                paymentLinkVersion: { type: 'number' },
                pendingCheckoutSessionId: { type: 'string' },
              },
            },
            cars: { properties: { created_at: { type: 'string' }, modelYear: { type: 'number' } } },
            rentals: {
              properties: {
                vehicleRegistration: { type: 'string' },
                stripeCustomerId: { type: 'string' },
                stripeSubscriptionId: { type: 'string' },
                stripe_status_event_created_at: { type: 'string' },
                stripe_status_event_id: { type: 'string' },
                stripe_status_event_terminal: { type: 'boolean' },
              },
            },
            stripe_webhook_events: {
              properties: {
                application_id: { type: 'string' },
                stripe_customer_id: { type: 'string' },
                stripe_event_id: { type: 'string' },
                stripe_subscription_id: { type: 'string' },
                status: { type: 'string' },
                received_at: { type: 'string' },
                updated_at: { type: 'string' },
              },
            },
          },
        }),
      })
    );

    const {
      resetSchemaContractValidationForTests,
      verifyProductionSchemaContract,
    } = await import('./schemaContract.js');

    resetSchemaContractValidationForTests();
    await expect(verifyProductionSchemaContract()).resolves.toBeUndefined();
  });

  it('fails when required contract columns are missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          definitions: {
            applications: {
              properties: {
                approved_at: { type: 'string' },
              },
            },
            cars: { properties: { created_at: { type: 'string' } } },
            rentals: { properties: {} },
            stripe_webhook_events: { properties: {} },
          },
        }),
      })
    );

    const {
      resetSchemaContractValidationForTests,
      verifyProductionSchemaContract,
    } = await import('./schemaContract.js');

    resetSchemaContractValidationForTests();
    await expect(verifyProductionSchemaContract()).rejects.toThrow(
      'Production schema contract check failed'
    );
  });

  it('fails when the modern webhook ledger is missing updated_at for stale claim recovery', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          definitions: {
            applications: {
              properties: {
                approved_at: { type: 'string' },
                approved_bond: { type: 'number' },
                approved_vehicle: { type: 'string' },
                approved_weekly_price: { type: 'number' },
                agreement_accepted_at: { type: 'string' },
                agreement_signature: { type: 'string' },
                agreement_template_version: { type: 'number' },
                cancelled_at: { type: 'string' },
                cancel_reason: { type: 'string' },
                paid_at: { type: 'string' },
                passport_or_uber_profile_screenshot: { type: 'string' },
                payment_link_sent_at: { type: 'string' },
                payment_link_version: { type: 'number' },
                pending_checkout_session_id: { type: 'string' },
              },
            },
            cars: { properties: { created_at: { type: 'string' } } },
            rentals: {
              properties: {
                vehicle_registration: { type: 'string' },
                stripe_customer_id: { type: 'string' },
                stripe_subscription_id: { type: 'string' },
                stripe_status_event_created_at: { type: 'string' },
                stripe_status_event_id: { type: 'string' },
                stripe_status_event_terminal: { type: 'boolean' },
              },
            },
            stripe_webhook_events: {
              properties: {
                stripe_event_id: { type: 'string' },
                status: { type: 'string' },
                received_at: { type: 'string' },
              },
            },
          },
        }),
      })
    );

    const {
      resetSchemaContractValidationForTests,
      verifyProductionSchemaContract,
    } = await import('./schemaContract.js');

    resetSchemaContractValidationForTests();
    await expect(verifyProductionSchemaContract()).rejects.toThrow(
      'stripe_webhook_events'
    );
  });

  it('fails with actionable message when schema inspection endpoint fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
      })
    );

    const {
      resetSchemaContractValidationForTests,
      verifyProductionSchemaContract,
    } = await import('./schemaContract.js');

    resetSchemaContractValidationForTests();
    await expect(verifyProductionSchemaContract()).rejects.toThrow(
      'Failed to verify production schema contract: 503 Service Unavailable'
    );
  });
});
