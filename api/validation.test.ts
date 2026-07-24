import { describe, expect, it } from 'vitest';
import {
  adminLoginSchema,
  applicationApprovalSchema,
  carSchema,
  createLeaseAgreementSchema,
  modelYearSchema,
  uuidSchema,
  vehicleCheckoutLinkSchema,
  vehicleCheckoutSessionSchema,
  weeklyPriceSchema,
} from './validation.js';

// ---------------------------------------------------------------------------
// carSchema
// ---------------------------------------------------------------------------

describe('carSchema', () => {
  const validCar = {
    name: 'Toyota Prius',
    model_year: 2022,
    weekly_price: 350,
    bond: 700,
    status: 'Available' as const,
    image: '/assets/prius.jpg',
  };

  it('accepts a car with a root-relative image path', () => {
    expect(() => carSchema.parse(validCar)).not.toThrow();
  });

  it('accepts a car with an https image URL', () => {
    expect(() => carSchema.parse({ ...validCar, image: 'https://cdn.example.com/car.jpg' })).not.toThrow();
  });

  it('accepts a car with an http image URL', () => {
    expect(() => carSchema.parse({ ...validCar, image: 'http://cdn.example.com/car.jpg' })).not.toThrow();
  });

  it('accepts all valid status values', () => {
    for (const status of ['Available', 'Rented', 'Maintenance'] as const) {
      expect(() => carSchema.parse({ ...validCar, status })).not.toThrow();
    }
  });

  it('accepts zero bond', () => {
    expect(() => carSchema.parse({ ...validCar, bond: 0 })).not.toThrow();
  });

  it('rejects an empty name', () => {
    expect(() => carSchema.parse({ ...validCar, name: '' })).toThrow();
  });

  it('rejects a negative weekly_price', () => {
    expect(() => carSchema.parse({ ...validCar, weekly_price: -1 })).toThrow();
  });

  it('rejects zero weekly_price', () => {
    expect(() => carSchema.parse({ ...validCar, weekly_price: 0 })).toThrow();
  });

  it('rejects a negative bond', () => {
    expect(() => carSchema.parse({ ...validCar, bond: -1 })).toThrow();
  });

  it('rejects an unrecognised status', () => {
    expect(() => carSchema.parse({ ...validCar, status: 'Sold' })).toThrow();
  });

  it('rejects a non-root-relative, non-URL image path', () => {
    expect(() => carSchema.parse({ ...validCar, image: 'relative/path/image.jpg' })).toThrow();
  });

  it('rejects a double-slash image path (protocol-relative)', () => {
    expect(() => carSchema.parse({ ...validCar, image: '//cdn.example.com/car.jpg' })).toThrow();
  });

  it('accepts an empty image string', () => {
    expect(() => carSchema.parse({ ...validCar, image: '' })).not.toThrow();
  });

  it('rejects a missing name field', () => {
    const { name: _name, ...rest } = validCar;
    expect(() => carSchema.parse(rest)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// adminLoginSchema
// ---------------------------------------------------------------------------

describe('adminLoginSchema', () => {
  it('accepts valid credentials', () => {
    const result = adminLoginSchema.parse({ username: 'admin@test.com', password: 'secret' });
    expect(result.username).toBe('admin@test.com');
    expect(result.password).toBe('secret');
  });

  it('trims leading/trailing whitespace from username', () => {
    const result = adminLoginSchema.parse({ username: '  admin@test.com  ', password: 'pass' });
    expect(result.username).toBe('admin@test.com');
  });

  it('rejects an empty username', () => {
    expect(() => adminLoginSchema.parse({ username: '', password: 'pass' })).toThrow();
  });

  it('rejects a whitespace-only username', () => {
    expect(() => adminLoginSchema.parse({ username: '   ', password: 'pass' })).toThrow();
  });

  it('rejects an empty password', () => {
    expect(() => adminLoginSchema.parse({ username: 'admin@test.com', password: '' })).toThrow();
  });

  it('rejects missing fields', () => {
    expect(() => adminLoginSchema.parse({})).toThrow();
  });
});

// ---------------------------------------------------------------------------
// uuidSchema
// ---------------------------------------------------------------------------

describe('uuidSchema', () => {
  it('accepts a valid v4 UUID', () => {
    expect(() => uuidSchema.parse('11111111-1111-4111-8111-111111111111')).not.toThrow();
  });

  it('accepts a valid UUID with mixed case after trimming', () => {
    expect(() => uuidSchema.parse('  22222222-2222-4222-8222-222222222222  ')).not.toThrow();
  });

  it('rejects a non-UUID string', () => {
    expect(() => uuidSchema.parse('not-a-uuid')).toThrow();
  });

  it('rejects an empty string', () => {
    expect(() => uuidSchema.parse('')).toThrow();
  });

  it('rejects a UUID with a wrong variant digit', () => {
    expect(() => uuidSchema.parse('11111111-1111-1111-1111-111111111111')).toThrow();
  });
});

// ---------------------------------------------------------------------------
// modelYearSchema
// ---------------------------------------------------------------------------

describe('modelYearSchema', () => {
  it('accepts a recent year', () => {
    expect(() => modelYearSchema.parse(2022)).not.toThrow();
  });

  it('accepts exactly 1900', () => {
    expect(() => modelYearSchema.parse(1900)).not.toThrow();
  });

  it('accepts the current year', () => {
    expect(() => modelYearSchema.parse(new Date().getFullYear())).not.toThrow();
  });

  it('accepts one year ahead of the current year', () => {
    expect(() => modelYearSchema.parse(new Date().getFullYear() + 1)).not.toThrow();
  });

  it('rejects a year before 1900', () => {
    expect(() => modelYearSchema.parse(1899)).toThrow();
  });

  it('rejects two years ahead of the current year', () => {
    expect(() => modelYearSchema.parse(new Date().getFullYear() + 2)).toThrow();
  });

  it('rejects a non-integer year', () => {
    expect(() => modelYearSchema.parse(2022.5)).toThrow();
  });

  it('rejects a string year', () => {
    expect(() => modelYearSchema.parse('2022')).toThrow();
  });
});

// ---------------------------------------------------------------------------
// weeklyPriceSchema
// ---------------------------------------------------------------------------

describe('weeklyPriceSchema', () => {
  it('accepts a positive weekly price', () => {
    expect(() => weeklyPriceSchema.parse(350)).not.toThrow();
  });

  it('accepts a fractional positive price', () => {
    expect(() => weeklyPriceSchema.parse(299.99)).not.toThrow();
  });

  it('rejects zero', () => {
    expect(() => weeklyPriceSchema.parse(0)).toThrow();
  });

  it('rejects a negative price', () => {
    expect(() => weeklyPriceSchema.parse(-100)).toThrow();
  });

  it('rejects a string price', () => {
    expect(() => weeklyPriceSchema.parse('350')).toThrow();
  });
});

// ---------------------------------------------------------------------------
// vehicleCheckoutSessionSchema
// ---------------------------------------------------------------------------

describe('vehicleCheckoutSessionSchema', () => {
  const valid = {
    application_id: '11111111-1111-4111-8111-111111111111',
    checkout_token: 'tok_abc123',
  };

  it('accepts a valid payload', () => {
    expect(() => vehicleCheckoutSessionSchema.parse(valid)).not.toThrow();
  });

  it('rejects a non-UUID application_id', () => {
    expect(() => vehicleCheckoutSessionSchema.parse({ ...valid, application_id: 'bad' })).toThrow();
  });

  it('rejects an empty checkout_token', () => {
    expect(() => vehicleCheckoutSessionSchema.parse({ ...valid, checkout_token: '' })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// applicationApprovalSchema
// ---------------------------------------------------------------------------

describe('applicationApprovalSchema', () => {
  const valid = {
    approved_vehicle: '2023 Toyota Camry Hybrid',
    approved_bond: 700,
    approved_weekly_price: 350,
    application_id: '11111111-1111-4111-8111-111111111111',
  };

  it('accepts a valid approval payload', () => {
    expect(() => applicationApprovalSchema.parse(valid)).not.toThrow();
  });

  it('defaults send_payment_link to true when not provided', () => {
    const result = applicationApprovalSchema.parse(valid);
    expect(result.send_payment_link).toBe(true);
  });

  it('accepts send_payment_link: false', () => {
    const result = applicationApprovalSchema.parse({ ...valid, send_payment_link: false });
    expect(result.send_payment_link).toBe(false);
  });

  it('accepts zero approved_bond', () => {
    expect(() => applicationApprovalSchema.parse({ ...valid, approved_bond: 0 })).not.toThrow();
  });

  it('rejects a negative approved_bond', () => {
    expect(() => applicationApprovalSchema.parse({ ...valid, approved_bond: -1 })).toThrow();
  });

  it('rejects zero approved_weekly_price', () => {
    expect(() => applicationApprovalSchema.parse({ ...valid, approved_weekly_price: 0 })).toThrow();
  });

  it('rejects a negative approved_weekly_price', () => {
    expect(() => applicationApprovalSchema.parse({ ...valid, approved_weekly_price: -100 })).toThrow();
  });

  it('rejects a non-UUID application_id', () => {
    expect(() => applicationApprovalSchema.parse({ ...valid, application_id: 'bad-id' })).toThrow();
  });

  it('rejects car_id in payment approval payloads', () => {
    expect(() => applicationApprovalSchema.parse({ ...valid, car_id: 1 })).toThrow();
  });

  it('accepts an optional rental subscription start date', () => {
    const result = applicationApprovalSchema.parse({
      ...valid,
      rental_subscription_start_date: '2026-07-01',
    });

    expect(result.rental_subscription_start_date).toBe('2026-07-01');
  });

  it('rejects an invalid rental subscription start date', () => {
    expect(() =>
      applicationApprovalSchema.parse({
        ...valid,
        rental_subscription_start_date: '2026-02-31',
      })
    ).toThrow();
  });

  it('rejects an empty approved_vehicle', () => {
    expect(() => applicationApprovalSchema.parse({ ...valid, approved_vehicle: '' })).toThrow();
  });

  it('coerces string numbers for approved_bond', () => {
    const result = applicationApprovalSchema.parse({ ...valid, approved_bond: '500' });
    expect(result.approved_bond).toBe(500);
  });

  it('accepts a to-collect bond with no payment method', () => {
    const result = applicationApprovalSchema.parse({
      ...valid,
      bond_payment_method: null,
      bond_payment_status: 'to_collect',
    });

    expect(result.bond_payment_status).toBe('to_collect');
    expect(result.bond_payment_method).toBeNull();
  });

  it('accepts a cash-paid bond with the cash method', () => {
    expect(
      applicationApprovalSchema.parse({
        ...valid,
        bond_payment_method: 'cash',
        bond_payment_status: 'cash_paid',
      }).bond_payment_method
    ).toBe('cash');
  });

  it('accepts an already-paid bond with the existing-paid method', () => {
    expect(
      applicationApprovalSchema.parse({
        ...valid,
        bond_notes: 'Existing driver receipt checked by admin.',
        bond_payment_method: 'existing_paid',
        bond_payment_status: 'already_paid',
      }).bond_payment_status
    ).toBe('already_paid');
  });

  it('rejects an already-paid bond paired with cash', () => {
    expect(() =>
      applicationApprovalSchema.parse({
        ...valid,
        bond_payment_method: 'cash',
        bond_payment_status: 'already_paid',
      })
    ).toThrow();
  });

  it('rejects a cash-paid bond paired with existing-paid', () => {
    expect(() =>
      applicationApprovalSchema.parse({
        ...valid,
        bond_payment_method: 'existing_paid',
        bond_payment_status: 'cash_paid',
      })
    ).toThrow();
  });

  it('rejects a to-collect bond with a paid method', () => {
    expect(() =>
      applicationApprovalSchema.parse({
        ...valid,
        bond_payment_method: 'cash',
        bond_payment_status: 'to_collect',
      })
    ).toThrow();
  });
});

describe('vehicleCheckoutLinkSchema', () => {
  const valid = {
    application_id: '11111111-1111-4111-8111-111111111111',
    car_id: 1,
  };

  it('rejects car_id in payment link payloads', () => {
    expect(() => vehicleCheckoutLinkSchema.parse(valid)).toThrow();
  });

  it('accepts a missing car_id', () => {
    const { car_id: _carId, ...withoutCarId } = valid;
    expect(() => vehicleCheckoutLinkSchema.parse(withoutCarId)).not.toThrow();
  });
});

describe('createLeaseAgreementSchema', () => {
  const valid = {
    application_id: '11111111-1111-4111-8111-111111111111',
    content: 'Signed lease agreement content',
    vehicle_label: 'ABC123 - Toyota Camry',
  };

  it('accepts a manual vehicle label without requiring a car_id', () => {
    const result = createLeaseAgreementSchema.parse(valid);

    expect(result).toMatchObject({
      application_id: valid.application_id,
      content: valid.content,
      status: 'generated',
      vehicle_label: 'ABC123 - Toyota Camry',
    });
    expect('car_id' in result).toBe(false);
  });

  it('accepts a positive immutable template version when saving an agreement', () => {
    const result = createLeaseAgreementSchema.parse({
      ...valid,
      agreement_template_version: '3',
    });

    expect(result.agreement_template_version).toBe(3);
  });

  it('rejects invalid application identifiers and empty agreement content', () => {
    expect(() =>
      createLeaseAgreementSchema.parse({
        ...valid,
        application_id: 'not-a-uuid',
      })
    ).toThrow();

    expect(() =>
      createLeaseAgreementSchema.parse({
        ...valid,
        content: '',
      })
    ).toThrow();
  });

  it('rejects non-positive template versions so saved agreements cannot point at invalid history', () => {
    expect(() =>
      createLeaseAgreementSchema.parse({
        ...valid,
        agreement_template_version: 0,
      })
    ).toThrow();
  });
});
