import { describe, expect, it } from 'vitest';

import { mapStripeCustomerRow } from './import-stripe-admin-csv.js';

describe('Stripe customer CSV mapping', () => {
  it('maps Address State to customers.state instead of the country code', () => {
    const mapped = mapStripeCustomerRow({
      'Address City': 'Sydney',
      'Address Country': 'AU',
      'Address Line1': '1 Example Street',
      'Address Postal Code': '2000',
      'Address State': 'NSW',
      'Created (UTC)': '2026-07-14 01:02:03',
      Email: 'driver@example.com',
      Name: 'Example Driver',
      id: 'cus_123',
    });

    expect(mapped?.values[6]).toBe('NSW');
    expect(mapped?.values).not.toContain('AU');
  });
});
