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
};

const defaultFees: LeaseFee[] = [
  { code: '4.1', title: 'Security Bond', amount: '$0' },
  { code: '4.2', title: 'Standard Excess For Rentee', amount: '$1000.00' },
  { code: '4.3', title: 'Additional to 4.2 - Second accident within 6 months', amount: '$500' },
  { code: '4.4', title: 'Additional to 4.2 - Unlisted Drivers Excess', amount: '$5000' },
  { code: '4.5', title: 'Additional to 4.2 - Age Excess if under 25 years', amount: '$500' },
  { code: '4.6', title: 'Late Payment Fee', amount: '$10' },
  { code: '4.7', title: 'Toll Management Fee (Per Toll)', amount: '$5' },
  { code: '4.8', title: 'Account Management Fee Per Week', amount: '$1.00' },
  { code: '4.9', title: 'New Account Set Up Fee', amount: '$10' },
  { code: '4.10', title: 'Direct Debit Fee Per Transaction', amount: '$0.99' },
  { code: '4.11', title: 'Direct Debit Account Set Up Fee', amount: '$2.20' },
  { code: '4.12', title: 'Direct Debit Decline Fee', amount: '$11.00' },
  { code: '4.13', title: 'Declaration Fee', amount: '$10.00' },
];

export const defaultCarLeaseAgreement: CarLeaseAgreementInput = {
  agreementDate: '04/04/2024',
  registeredOwnerName: 'MAPLE RENT',
  registeredOwnerAddress: 'Unit 13, Merrylands NSW 2160, AU',
  registeredOwnerContact: '+61 420 550 556',
  registeredOwnerEmail: 'sarfarazrajabi5@yahoo.com',
  renteeName: 'Mohammad Ali Alizadah',
  renteeDob: '21/12/1990',
  renteeLicenseNumber: '21357495',
  renteeLicenseState: 'NSW',
  renteeAddress: '29 Baker Street, Merrylands NSW 2160, Australia',
  renteeContact: '0412230293',
  renteeEmail: 'jalil_alizadah@yahoo.com',
  vehicleMake: 'Toyota',
  vehicleModel: 'Camry Hybrid',
  vehicleYear: '2014',
  vehicleVin: 'TBD',
  kmAllowance: 'As agreed in booking',
  weeklyRent: '$249.00 per week (plus GST)',
  fuelPolicy: 'Rentee must pay fuel usage. Extra amount may be added to excess according to age.',
  insuranceCoverage: 'Insurance coverage applies only in New South Wales.',
  rentalStartDate: '2024-04-22',
  rentalEndDate: 'Open-ended',
  minimumRentalPeriod: 'Minimum 6 weeks',
  returnPolicy:
    'Car must be full of fuel on return. Failure incurs $20 + fuel cost per liter. Two weeks notice is required before return.',
  fees: defaultFees,
};

export const renderCarLeaseAgreement = (input: Partial<CarLeaseAgreementInput> = {}) => {
  const agreement: CarLeaseAgreementInput = {
    ...defaultCarLeaseAgreement,
    ...input,
    fees: input.fees ?? defaultCarLeaseAgreement.fees,
  };

  const feeLines = agreement.fees
    .map((fee) => `${fee.code} ${fee.title}: ${fee.amount}`)
    .join('\n');

  return `# Car Lease Agreement

## 1. Registered Owner Details
- Name: ${agreement.registeredOwnerName}
- Address: ${agreement.registeredOwnerAddress}
- Contact: ${agreement.registeredOwnerContact}
- Email: ${agreement.registeredOwnerEmail}

## 2. Rentee Details
- Name: ${agreement.renteeName}
- Date of Birth: ${agreement.renteeDob}
- License Number: ${agreement.renteeLicenseNumber}
- License State: ${agreement.renteeLicenseState}
- Address: ${agreement.renteeAddress}
- Contact: ${agreement.renteeContact}
- Email: ${agreement.renteeEmail}

## 3. Vehicle Details
- Make: ${agreement.vehicleMake}
- Model: ${agreement.vehicleModel}
- Year: ${agreement.vehicleYear}
- VIN: ${agreement.vehicleVin}
- KM Allowance: ${agreement.kmAllowance}

## 4. Rental Fee / Cost
Your invoice is issued weekly and may include:
- Weekly rent
- Toll notice fee
- Account management fee
- Toll management fee
- Direct debit fee
- Other additional charges

Rentee agrees to pay:
- Weekly Rent: ${agreement.weeklyRent}
- Fuel Policy: ${agreement.fuelPolicy}

### Fee Schedule
${feeLines}

${agreement.insuranceCoverage}

## 5. Rental Period
- Starting Date: ${agreement.rentalStartDate}
- Ending Date: ${agreement.rentalEndDate}
- Minimum Rental Period: ${agreement.minimumRentalPeriod}

## 6. Return Of Vehicle
${agreement.returnPolicy}

## 7. Legal Notice
The parties choose the addresses above as their physical addresses where legal proceedings may be instituted.

Date: ${agreement.agreementDate}

Rentee Signature: _______________________________`;
};

