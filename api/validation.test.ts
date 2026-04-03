import { describe, expect, it } from 'vitest';
import {
  adminLoginSchema,
  applicationApprovalSchema,
  carSchema,
  modelYearSchema,
  uuidSchema,
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

  it('rejects an empty image string', () => {
    expect(() => carSchema.parse({ ...validCar, image: '' })).toThrow();
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
    car_id: 1,
    checkout_token: 'tok_abc123',
  };

  it('accepts a valid payload', () => {
    expect(() => vehicleCheckoutSessionSchema.parse(valid)).not.toThrow();
  });

  it('coerces a string car_id to a number', () => {
    const result = vehicleCheckoutSessionSchema.parse({ ...valid, car_id: '2' });
    expect(result.car_id).toBe(2);
  });

  it('rejects a non-UUID application_id', () => {
    expect(() => vehicleCheckoutSessionSchema.parse({ ...valid, application_id: 'bad' })).toThrow();
  });

  it('rejects a zero car_id', () => {
    expect(() => vehicleCheckoutSessionSchema.parse({ ...valid, car_id: 0 })).toThrow();
  });

  it('rejects a negative car_id', () => {
    expect(() => vehicleCheckoutSessionSchema.parse({ ...valid, car_id: -1 })).toThrow();
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
    approved_bond: 700,
    approved_weekly_price: 350,
    application_id: '11111111-1111-4111-8111-111111111111',
    assigned_car_id: 1,
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

  it('rejects a zero assigned_car_id', () => {
    expect(() => applicationApprovalSchema.parse({ ...valid, assigned_car_id: 0 })).toThrow();
  });

  it('coerces string numbers for approved_bond', () => {
    const result = applicationApprovalSchema.parse({ ...valid, approved_bond: '500' });
    expect(result.approved_bond).toBe(500);
  });
});
