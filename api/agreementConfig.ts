import { LEASE_SETTINGS } from './constants.js';

const DEFAULT_LEASE_OWNER_NAME = 'Gala Rentals';
const DEFAULT_LEASE_OWNER_ADDRESS = 'Sydney NSW';
const DEFAULT_LEASE_OWNER_CONTACT = '1300 555 828';
const DEFAULT_LEASE_OWNER_EMAIL = 'hello@galarentals.com.au';
const DEFAULT_KM_ALLOWANCE = 'As agreed in booking';
const DEFAULT_RETURN_NOTICE_DAYS = 14;
const DEFAULT_FUEL_POLICY =
  'Rentee is responsible for fuel used during the rental term and must return the vehicle with the same fuel level it was supplied with.';

export const LEASE_AGREEMENT_PRODUCTION_ENV_KEYS = [
  'LEASE_OWNER_NAME',
  'LEASE_OWNER_ADDRESS',
  'LEASE_OWNER_CONTACT',
  'LEASE_OWNER_EMAIL',
] as const;

export type LeaseAgreementBusinessDetails = {
  fuelPolicy: string;
  insuranceCoverage: string;
  kmAllowance: string;
  minimumRentalPeriod: string;
  registeredOwnerAddress: string;
  registeredOwnerContact: string;
  registeredOwnerEmail: string;
  registeredOwnerName: string;
  returnPolicy: string;
};

const readTrimmedEnv = (key: string, fallback: string) => {
  const value = process.env[key]?.trim();
  return value ? value : fallback;
};

const readPositiveIntEnv = (key: string, fallback: number) => {
  const value = Number(process.env[key]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
};

export const getLeaseAgreementBusinessDetails = (): LeaseAgreementBusinessDetails => {
  const returnNoticeDays = readPositiveIntEnv(
    'LEASE_RETURN_NOTICE_DAYS',
    DEFAULT_RETURN_NOTICE_DAYS
  );
  const returnPolicyBase = readTrimmedEnv('LEASE_RETURN_POLICY', '');
  const returnPolicy =
    returnPolicyBase ||
    `${DEFAULT_FUEL_POLICY} ${returnNoticeDays}-day written notice is required before return.`;

  return {
    registeredOwnerName: readTrimmedEnv('LEASE_OWNER_NAME', DEFAULT_LEASE_OWNER_NAME),
    registeredOwnerAddress: readTrimmedEnv(
      'LEASE_OWNER_ADDRESS',
      DEFAULT_LEASE_OWNER_ADDRESS
    ),
    registeredOwnerContact: readTrimmedEnv(
      'LEASE_OWNER_CONTACT',
      DEFAULT_LEASE_OWNER_CONTACT
    ),
    registeredOwnerEmail: readTrimmedEnv('LEASE_OWNER_EMAIL', DEFAULT_LEASE_OWNER_EMAIL),
    kmAllowance: readTrimmedEnv('LEASE_KM_ALLOWANCE', DEFAULT_KM_ALLOWANCE),
    fuelPolicy: readTrimmedEnv('LEASE_FUEL_POLICY', DEFAULT_FUEL_POLICY),
    insuranceCoverage: readTrimmedEnv(
      'LEASE_INSURANCE_COVERAGE',
      `Insurance coverage applies only in ${LEASE_SETTINGS.insurance_coverage_region}.`
    ),
    minimumRentalPeriod: readTrimmedEnv(
      'LEASE_MINIMUM_RENTAL_PERIOD',
      `Minimum ${LEASE_SETTINGS.minimum_rental_weeks} weeks`
    ),
    returnPolicy,
  };
};
