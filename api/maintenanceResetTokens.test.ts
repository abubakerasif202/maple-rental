import { beforeEach, describe, expect, it } from 'vitest';
import {
  createMaintenanceResetToken,
  verifyMaintenanceResetToken,
} from './maintenanceResetTokens.js';

describe('maintenance reset tokens', () => {
  beforeEach(() => {
    process.env.MAINTENANCE_RESET_TOKEN_SECRET = 'test-maintenance-reset-secret-32-characters';
  });

  it('binds tokens to the administrator and exact plan', () => {
    const plan = { counts: { applications: 2 } };
    const token = createMaintenanceResetToken({ adminEmail: 'ADMIN@example.com', plan, nowSeconds: 100 });
    expect(() => verifyMaintenanceResetToken({
      adminEmail: 'admin@example.com',
      plan,
      token,
      nowSeconds: 101,
    })).not.toThrow();
    expect(() => verifyMaintenanceResetToken({
      adminEmail: 'other@example.com',
      plan,
      token,
      nowSeconds: 101,
    })).toThrow(/administrator/i);
    expect(() => verifyMaintenanceResetToken({
      adminEmail: 'admin@example.com',
      plan: { counts: { applications: 3 } },
      token,
      nowSeconds: 101,
    })).toThrow(/plan changed/i);
  });

  it('rejects expired and tampered tokens', () => {
    const plan = { counts: {} };
    const token = createMaintenanceResetToken({ adminEmail: 'admin@example.com', plan, nowSeconds: 100 });
    expect(() => verifyMaintenanceResetToken({
      adminEmail: 'admin@example.com', plan, token, nowSeconds: 701,
    })).toThrow(/expired/i);
    expect(() => verifyMaintenanceResetToken({
      adminEmail: 'admin@example.com', plan, token: `${token}x`, nowSeconds: 101,
    })).toThrow(/invalid/i);
  });
});
