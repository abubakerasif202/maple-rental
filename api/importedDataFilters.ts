type DataRecord = Record<string, any>;

const IMPORTED_SOURCE_VALUES = new Set([
  'demo',
  'imported',
  'legacy',
  'legacy-import',
  'test',
]);

const IMPORTED_EXPERIENCE_MARKERS = [
  'imported from live fleet data',
  'legacy renter import',
];

const FAKE_EMAIL_SUFFIX = '@example.invalid';
const LEGACY_PHONE = '0000000000';

const value = (record: DataRecord, ...keys: string[]) => {
  for (const key of keys) {
    if (record[key] != null) {
      return record[key];
    }
  }

  return null;
};

const normalized = (input: unknown) => String(input ?? '').trim().toLowerCase();

const hasImportedSource = (record: DataRecord) =>
  IMPORTED_SOURCE_VALUES.has(normalized(record.source));

const hasFakeEmail = (record: DataRecord) => normalized(record.email).endsWith(FAKE_EMAIL_SUFFIX);

const hasLegacyPhone = (record: DataRecord) => normalized(record.phone) === LEGACY_PHONE;

const hasLegacyId = (record: DataRecord, ...keys: string[]) =>
  keys.some((key) => record[key] != null && String(record[key]).trim() !== '');

const hasContactOrRosterDetails = (record: DataRecord) =>
  [
    record.email,
    record.phone,
    record.company_name,
    record.companyName,
    record.staff_number,
    record.staffNumber,
    record.external_id,
    record.externalId,
  ].some((field) => normalized(field) !== '');

const hasLegacyLicenseNumber = (record: DataRecord) =>
  normalized(value(record, 'license_number', 'licenseNumber')).startsWith('legacy-');

const hasImportedExperience = (record: DataRecord) => {
  const experience = normalized(record.experience);
  return IMPORTED_EXPERIENCE_MARKERS.some((marker) => experience.includes(marker));
};

const idAsString = (input: unknown) => (input == null ? '' : String(input));

export const isImportedApplicationRecord = (application: DataRecord) =>
  hasLegacyId(application, 'legacy_id', 'legacyId') ||
  hasFakeEmail(application) ||
  hasLegacyPhone(application) ||
  hasLegacyLicenseNumber(application) ||
  hasImportedExperience(application);

export const filterRealApplications = <T extends DataRecord>(applications: T[]) =>
  applications.filter((application) => !isImportedApplicationRecord(application));

export const getImportedApplicationIdSet = (applications: DataRecord[]) =>
  new Set(
    applications
      .filter(isImportedApplicationRecord)
      .map((application) => idAsString(application.id))
      .filter(Boolean),
  );

export const isImportedRentalRecord = (
  rental: DataRecord,
  importedApplicationIds: Set<string>,
) =>
  hasLegacyId(rental, 'legacy_application_id', 'legacyApplicationId') ||
  importedApplicationIds.has(idAsString(value(rental, 'application_id', 'applicationId')));

export const filterRealRentals = <T extends DataRecord>(
  rentals: T[],
  importedApplicationIds: Set<string>,
) => rentals.filter((rental) => !isImportedRentalRecord(rental, importedApplicationIds));

export const isImportedOperationalCustomerRecord = (
  customer: DataRecord,
  importedApplicationIds = new Set<string>(),
  importedRentalIds = new Set<string>(),
) =>
  hasImportedSource(customer) ||
  hasFakeEmail(customer) ||
  hasLegacyPhone(customer) ||
  importedApplicationIds.has(idAsString(value(customer, 'application_id', 'applicationId'))) ||
  importedRentalIds.has(idAsString(value(customer, 'rental_id', 'rentalId')));

export const filterRealOperationalCustomers = <T extends DataRecord>(
  customers: T[],
  importedApplicationIds = new Set<string>(),
  importedRentalIds = new Set<string>(),
) =>
  customers.filter(
    (customer) =>
      !isImportedOperationalCustomerRecord(customer, importedApplicationIds, importedRentalIds),
  );

export const isEmptyOperationalCustomerRecord = (customer: DataRecord) =>
  !hasContactOrRosterDetails(customer) &&
  Number(customer.invoice_count || customer.invoiceCount || 0) <= 0 &&
  Number(customer.total_billed || customer.totalBilled || 0) <= 0 &&
  Number(customer.outstanding_balance || customer.outstandingBalance || 0) <= 0 &&
  !value(customer, 'last_invoice_date', 'lastInvoiceDate');

export const isImportedOperationalInvoiceRecord = (
  invoice: DataRecord,
  importedCustomerIds = new Set<string>(),
) =>
  hasImportedSource(invoice) ||
  importedCustomerIds.has(idAsString(value(invoice, 'customer_id', 'customerId')));

export const filterRealOperationalInvoices = <T extends DataRecord>(
  invoices: T[],
  importedCustomerIds = new Set<string>(),
) =>
  invoices.filter((invoice) => !isImportedOperationalInvoiceRecord(invoice, importedCustomerIds));

export const isImportedManualInvoiceRecord = (invoice: DataRecord) => {
  const searchable = [
    invoice.invoice_number,
    invoice.bill_to_name,
    invoice.bill_to_email,
    invoice.bill_to_abn_mobile,
    invoice.vehicle_reference,
    invoice.rental_period_reference,
    invoice.notes,
    invoice.additional_details,
    invoice.created_by,
  ]
    .map(normalized)
    .join(' ');

  return (
    searchable.includes('legacy') ||
    searchable.includes('demo') ||
    searchable.includes('test') ||
    searchable.includes('imported') ||
    searchable.includes(FAKE_EMAIL_SUFFIX)
  );
};

export const getRecordIdSet = (rows: DataRecord[]) =>
  new Set(rows.map((row) => idAsString(row.id)).filter(Boolean));
