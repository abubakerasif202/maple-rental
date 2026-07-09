import { getLeaseAgreementBusinessDetails } from '../agreementConfig.js';

export const CAR_LEASE_AGREEMENT_TEMPLATE_VERSION = 2;

export type LeaseFee = {
  code: string;
  title: string;
  amount: string;
};

export type CarLeaseAgreementInput = {
  agreementDate: string;
  registeredOwnerName: string;
  registeredOwnerAddress: string;
  registeredOwnerContact: string;
  registeredOwnerEmail: string;
  renteeName: string;
  renteeDob: string;
  renteeLicenseNumber: string;
  renteeLicenseState: string;
  renteeAddress: string;
  renteeContact: string;
  renteeEmail: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: string;
  vehicleVin: string;
  kmAllowance: string;
  weeklyRent: string;
  fuelPolicy: string;
  insuranceCoverage: string;
  rentalStartDate: string;
  rentalEndDate: string;
  minimumRentalPeriod: string;
  returnPolicy: string;
  fees: LeaseFee[];
  bondAmount: string;
  bondNotes: string;
  bondPaymentMethod: string;
  bondPaymentStatus: string;
};

export const buildCarLeaseAgreementFees = (bondAmount = 0): LeaseFee[] => [
  { code: '4.1', title: 'Security Bond', amount: `$${Number(bondAmount || 0).toFixed(2)}` },
  { code: '4.2', title: 'Standard Accident Excess For Rentee', amount: '$1250.00' },
  { code: '4.3', title: 'Additional to 4.2 - Second accident within 6 months', amount: '$500' },
  { code: '4.4', title: 'Additional to 4.2 - Unlisted Drivers Excess', amount: '$5000' },
  { code: '4.5', title: 'Additional to 4.2 - Age Excess if under 25 years', amount: '$500' },
  { code: '4.6', title: 'Late Payment Fee', amount: '$10' },
  { code: '4.7', title: 'Toll Management Fee (Per Toll)', amount: '$5' },
  { code: '4.8', title: 'Direct Debit Decline Fee', amount: '$11.00' },
  { code: '4.9', title: 'Declaration Fee', amount: '$10.00' },
];

export const buildDefaultCarLeaseAgreement = (): CarLeaseAgreementInput => ({
  agreementDate: new Date().toISOString().split('T')[0],
  ...getLeaseAgreementBusinessDetails(),
  renteeName: 'Sample Driver',
  renteeDob: 'Not provided',
  renteeLicenseNumber: 'NSW0000000',
  renteeLicenseState: 'NSW',
  renteeAddress: 'Sample Address, Sydney NSW 2000, Australia',
  renteeContact: '0400000000',
  renteeEmail: 'driver@example.com',
  vehicleMake: 'Toyota',
  vehicleModel: 'Camry Hybrid',
  vehicleYear: '2024',
  vehicleVin: 'Not recorded',
  weeklyRent: '$250.00 per week',
  bondAmount: '$0.00',
  bondNotes: '',
  bondPaymentMethod: 'Not yet collected',
  bondPaymentStatus: 'To be collected by admin',
  rentalStartDate: new Date().toISOString().split('T')[0],
  rentalEndDate: 'Open-ended',
  fees: buildCarLeaseAgreementFees(),
});

export const DEFAULT_CAR_LEASE_AGREEMENT_TEMPLATE = `# Car Lease Agreement

## 1. Registered Owner Details
- Name: {{registeredOwnerName}}
- Address: {{registeredOwnerAddress}}
- Contact: {{registeredOwnerContact}}
- Email: {{registeredOwnerEmail}}

## 2. Rentee Details
- Name: {{renteeName}}
- Date of Birth: {{renteeDob}}
- License Number: {{renteeLicenseNumber}}
- License State: {{renteeLicenseState}}
- Address: {{renteeAddress}}
- Contact: {{renteeContact}}
- Email: {{renteeEmail}}

## 3. Vehicle Details
- Make: {{vehicleMake}}
- Model: {{vehicleModel}}
- Year: {{vehicleYear}}
- VIN: {{vehicleVin}}
- KM Allowance: {{kmAllowance}}

## 4. Rental Fee / Cost
Your invoice is issued weekly and may include:
- Weekly rent
- Toll notice fee
- Account management fee
- Toll management fee
- Direct debit fee
- Other additional charges

Rentee agrees to pay:
- Weekly Rent: {{weeklyRent}}
- Bond Amount: {{bondAmount}}
- Bond Status: {{bondPaymentStatus}}
- Bond Method: {{bondPaymentMethod}}
- Fuel Policy: {{fuelPolicy}}

Bond is handled manually by Maple Rentals and is not charged through Stripe.
{{bondNotesLine}}

### Fee Schedule
{{feeSchedule}}

{{insuranceCoverage}}

## 5. Rental Period
- Starting Date: {{rentalStartDate}}
- Ending Date: {{rentalEndDate}}
- Minimum Rental Period: {{minimumRentalPeriod}}

## 6. Return Of Vehicle
{{returnPolicy}}

## 7. Legal Notice
The parties choose the addresses above as their physical addresses where legal proceedings may be instituted.

Date: {{agreementDate}}

Rentee Signature: _______________________________`;

export const resolveCarLeaseAgreementInput = (
  input: Partial<CarLeaseAgreementInput> = {}
) => {
  const defaultCarLeaseAgreement = buildDefaultCarLeaseAgreement();
  const bondAmount = Number(
    String(input.bondAmount ?? defaultCarLeaseAgreement.bondAmount)
      .replace(/[^0-9.-]/g, '')
  );
  return {
    ...defaultCarLeaseAgreement,
    ...input,
    fees:
      input.fees ??
      buildCarLeaseAgreementFees(Number.isFinite(bondAmount) ? bondAmount : 0),
  };
};

export const renderCarLeaseAgreementTemplate = (
  template: string,
  input: Partial<CarLeaseAgreementInput> = {}
) => {
  const agreement: CarLeaseAgreementInput = resolveCarLeaseAgreementInput(input);
  const feeLines = agreement.fees
    .map((fee) => `${fee.code} ${fee.title}: ${fee.amount}`)
    .concat(
      template.includes('{{bondPaymentStatus}}')
        ? []
        : [`Bond Payment Status: ${agreement.bondPaymentStatus}`],
      template.includes('{{bondPaymentMethod}}')
        ? []
        : [`Bond Payment Method: ${agreement.bondPaymentMethod}`],
      template.includes('{{bondNotesLine}}') || !agreement.bondNotes
        ? []
        : [`Bond Notes: ${agreement.bondNotes}`],
    )
    .join('\n');

  const values: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(agreement).map(([key, value]) => [
        key,
        Array.isArray(value) ? '' : String(value ?? ''),
      ])
    ),
    feeSchedule: feeLines,
    bondNotesLine: agreement.bondNotes
      ? `Bond Notes: ${agreement.bondNotes}`
      : '',
  };

  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match
  );
};

export const renderCarLeaseAgreement = (input: Partial<CarLeaseAgreementInput> = {}) =>
  renderCarLeaseAgreementTemplate(DEFAULT_CAR_LEASE_AGREEMENT_TEMPLATE, input);
