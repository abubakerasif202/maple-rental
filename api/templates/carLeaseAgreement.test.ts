import { describe, it, expect } from 'bun:test';
import { renderCarLeaseAgreement, defaultCarLeaseAgreement } from './carLeaseAgreement.js';

describe('renderCarLeaseAgreement', () => {
  it('should render with default values', () => {
    const output = renderCarLeaseAgreement();
    expect(output).toContain('MAPLE RENT');
    expect(output).toContain('Mohammad Ali Alizadah');
    expect(output).toContain('Toyota');
    expect(output).toContain('Camry Hybrid');
  });

  it('should override renteeName', () => {
    const output = renderCarLeaseAgreement({ renteeName: 'Jane Smith' });
    expect(output).toContain('Jane Smith');
    expect(output).not.toContain(defaultCarLeaseAgreement.renteeName);
  });

  it('should render custom fees', () => {
    const customFees = [{ code: 'TEST-1', title: 'Test Fee', amount: '$100' }];
    const output = renderCarLeaseAgreement({ fees: customFees });
    expect(output).toContain('TEST-1 Test Fee: $100');
    // Ensure default fees are not there if we provided custom ones
    expect(output).not.toContain('4.1 Security Bond: $0');
  });

  it('should handle empty fees array', () => {
    const output = renderCarLeaseAgreement({ fees: [] });
    expect(output).toContain('### Fee Schedule');
    // The next line after Fee Schedule should be empty or the next section
    // Checking that a default fee is NOT present
    expect(output).not.toContain('4.1 Security Bond: $0');
  });

  it('should override multiple fields', () => {
    const input = {
      renteeName: 'John Doe',
      vehicleMake: 'Tesla',
      vehicleModel: 'Model 3',
      agreementDate: '2025-01-01'
    };
    const output = renderCarLeaseAgreement(input);
    expect(output).toContain('Name: John Doe');
    expect(output).toContain('Make: Tesla');
    expect(output).toContain('Model: Model 3');
    expect(output).toContain('Date: 2025-01-01');
  });
});
