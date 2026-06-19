import { afterEach, describe, expect, it } from 'vitest';

import { renderApplicationLeaseAgreement } from './agreementGeneration.js';

const restoreLeaseAgreementEnv = () => {
  delete process.env.LEASE_OWNER_NAME;
  delete process.env.LEASE_OWNER_ADDRESS;
  delete process.env.LEASE_OWNER_CONTACT;
  delete process.env.LEASE_OWNER_EMAIL;
};

afterEach(() => {
  restoreLeaseAgreementEnv();
});

describe('renderApplicationLeaseAgreement', () => {
  it('uses Gala Rentals defaults when lease owner env overrides are not set', () => {
    const agreement = renderApplicationLeaseAgreement(
      {
        name: 'Jordan Driver',
        email: 'jordan@example.com',
        phone: '0400111222',
        address: '22 Test Street',
        license_number: 'NSW12345',
        intended_start_date: '2026-03-20',
      },
      {
        name: 'Toyota Camry Hybrid',
        model_year: 2024,
      },
      450,
      '2026-03-19T08:00:00.000Z',
      900
    );

    expect(agreement).toContain('Name: Gala Rentals');
    expect(agreement).toContain('Address: Sydney NSW');
    expect(agreement).toContain('Contact: 1300 555 828');
    expect(agreement).toContain('Email: hello@galarentals.com.au');
  });

  it('fills lease agreements with configured owner details and non-placeholder fallbacks', () => {
    process.env.LEASE_OWNER_NAME = 'Gala Rentals';
    process.env.LEASE_OWNER_ADDRESS = 'Sydney NSW';
    process.env.LEASE_OWNER_CONTACT = '1300 555 828';
    process.env.LEASE_OWNER_EMAIL = 'hello@galarentals.com.au';

    const agreement = renderApplicationLeaseAgreement(
      {
        name: 'Jordan Driver',
        email: 'jordan@example.com',
        phone: '0400111222',
        address: '22 Test Street',
        license_number: 'NSW12345',
        intended_start_date: '2026-03-20',
      },
      {
        name: 'Toyota Camry Hybrid',
        model_year: 2024,
      },
      450,
      '2026-03-19T08:00:00.000Z',
      900
    );

    expect(agreement).toContain('Name: Gala Rentals');
    expect(agreement).toContain('Address: Sydney NSW');
    expect(agreement).toContain('Contact: 1300 555 828');
    expect(agreement).toContain('Email: hello@galarentals.com.au');
    expect(agreement).toContain('Date of Birth: Not provided');
    expect(agreement).toContain('VIN: Not recorded');
    expect(agreement).not.toContain('Business Address');
    expect(agreement).not.toContain('leasing@example.com');
    expect(agreement).not.toContain('TBD');
    expect(agreement).not.toContain('1990-01-01');
  });
});
