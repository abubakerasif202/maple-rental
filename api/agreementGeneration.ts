import {
  buildCarLeaseAgreementFees,
  renderCarLeaseAgreement,
} from './templates/carLeaseAgreement.js';
import { calculateBondFromWeeklyRent } from '../shared/rentalPricing.js';
import { getLeaseAgreementBusinessDetails } from './agreementConfig.js';

const toDateOnly = (value: string) => value.split('T')[0];
const toOptionalString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';
const toNonEmptyString = (value: unknown, fallback: string) =>
  toOptionalString(value) || fallback;
const formatBondStatus = (value: unknown) => {
  const normalized = toOptionalString(value);
  if (normalized === 'cash_paid') return 'Paid cash';
  if (normalized === 'already_paid') return 'Already paid / existing driver';
  return 'To be collected by admin';
};
const formatBondMethod = (value: unknown) => {
  const normalized = toOptionalString(value);
  if (normalized === 'cash') return 'Cash';
  if (normalized === 'existing_paid') return 'Existing paid';
  return 'Not yet collected';
};

export const buildLeaseAgreementInput = (
  application: Record<string, any>,
  car: Record<string, any>,
  approvedWeeklyPrice: number,
  nowIso: string,
  approvedBond = calculateBondFromWeeklyRent(approvedWeeklyPrice)
) => {
  const carName = String(car.name || 'Vehicle');
  const carTokens = carName.split(' ').filter(Boolean);
  const vehicleMake = carTokens[0] || 'Vehicle';
  const weeklyRentText = `$${Number(approvedWeeklyPrice || 0).toFixed(2)} per week`;
  const leaseAgreementBusinessDetails = getLeaseAgreementBusinessDetails();
  const rentalStartDate = toOptionalString(
    application.intended_start_date ?? application.intendedStartDate
  );
  const vehicleVin = toOptionalString(
    car.vin ?? car.vin_number ?? car.registration ?? car.car_registration
  );

  return {
    ...leaseAgreementBusinessDetails,
    agreementDate: toDateOnly(nowIso),
    bondAmount: `$${Number(approvedBond || 0).toFixed(2)}`,
    bondNotes: toOptionalString(application.bond_notes ?? application.bondNotes),
    bondPaymentMethod: formatBondMethod(
      application.bond_payment_method ?? application.bondPaymentMethod
    ),
    bondPaymentStatus: formatBondStatus(
      application.bond_payment_status ?? application.bondPaymentStatus
    ),
    fees: buildCarLeaseAgreementFees(approvedBond),
    renteeName: toNonEmptyString(application.name, 'Driver'),
    renteeDob: toNonEmptyString(
      application.date_of_birth ?? application.dateOfBirth,
      'Not provided'
    ),
    renteeEmail: toNonEmptyString(application.email, 'Not provided'),
    renteeContact: toNonEmptyString(application.phone, 'Not provided'),
    renteeAddress: toNonEmptyString(application.address, 'Not provided'),
    renteeLicenseNumber: toNonEmptyString(
      application.license_number ?? application.licenseNumber,
      'Not provided'
    ),
    renteeLicenseState: toNonEmptyString(
      application.license_state ?? application.licenseState,
      'NSW'
    ),
    vehicleMake,
    vehicleModel: carName,
    vehicleYear: car.model_year ? String(car.model_year) : 'Not recorded',
    vehicleVin: vehicleVin || 'Not recorded',
    weeklyRent: weeklyRentText,
    rentalStartDate: rentalStartDate ? toDateOnly(rentalStartDate) : toDateOnly(nowIso),
    rentalEndDate: 'Open-ended',
  };
};

export const renderApplicationLeaseAgreement = (
  application: Record<string, any>,
  car: Record<string, any>,
  approvedWeeklyPrice: number,
  nowIso: string,
  approvedBond = calculateBondFromWeeklyRent(approvedWeeklyPrice)
) =>
  renderCarLeaseAgreement(
    buildLeaseAgreementInput(application, car, approvedWeeklyPrice, nowIso, approvedBond)
  );
