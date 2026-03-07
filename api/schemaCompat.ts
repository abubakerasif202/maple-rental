type SchemaMode = 'snake' | 'camel';

type OpenApiDefinition = {
  properties?: Record<string, unknown>;
};

type SchemaCompat = {
  coreMode: SchemaMode;
  merchantMode: SchemaMode;
  rentalStripeSubscriptionColumn: string | null;
  rentalStripeCustomerColumn: string | null;
};

const DEFAULT_SCHEMA_COMPAT: SchemaCompat = {
  coreMode: 'snake',
  merchantMode: 'snake',
  rentalStripeSubscriptionColumn: 'stripe_subscription_id',
  rentalStripeCustomerColumn: 'stripe_customer_id',
};

let schemaCompatPromise: Promise<SchemaCompat> | null = null;

const hasProperty = (definition: OpenApiDefinition | undefined, key: string) =>
  Boolean(definition?.properties && Object.prototype.hasOwnProperty.call(definition.properties, key));

const fetchOpenApiDefinitions = async (): Promise<Record<string, OpenApiDefinition> | null> => {
  if (
    process.env.VITEST === 'true' ||
    !process.env.SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return null;
  }

  const response = await fetch(new URL('/rest/v1/', process.env.SUPABASE_URL), {
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      Accept: 'application/openapi+json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to inspect Supabase schema: ${response.status} ${response.statusText}`);
  }

  const spec = (await response.json()) as { definitions?: Record<string, OpenApiDefinition> };
  return spec.definitions || null;
};

export const getSchemaCompat = async (): Promise<SchemaCompat> => {
  if (!schemaCompatPromise) {
    schemaCompatPromise = (async () => {
      try {
        const definitions = await fetchOpenApiDefinitions();
        if (!definitions) {
          return DEFAULT_SCHEMA_COMPAT;
        }

        const carsDefinition = definitions.cars;
        const rentalsDefinition = definitions.rentals;
        const merchantsDefinition = definitions.merchants;

        const coreMode: SchemaMode = hasProperty(carsDefinition, 'modelYear') ? 'camel' : 'snake';
        const merchantMode: SchemaMode = hasProperty(merchantsDefinition, 'stripeAccountId')
          ? 'camel'
          : 'snake';
        const rentalStripeSubscriptionColumn = hasProperty(rentalsDefinition, 'stripeSubscriptionId')
          ? 'stripeSubscriptionId'
          : hasProperty(rentalsDefinition, 'stripe_subscription_id')
            ? 'stripe_subscription_id'
            : null;
        const rentalStripeCustomerColumn = hasProperty(rentalsDefinition, 'stripeCustomerId')
          ? 'stripeCustomerId'
          : hasProperty(rentalsDefinition, 'stripe_customer_id')
            ? 'stripe_customer_id'
            : null;

        return {
          coreMode,
          merchantMode,
          rentalStripeSubscriptionColumn,
          rentalStripeCustomerColumn,
        };
      } catch (error) {
        console.warn('Falling back to default schema compatibility mode:', error);
        return DEFAULT_SCHEMA_COMPAT;
      }
    })();
  }

  return schemaCompatPromise;
};

export const getCarSelectColumns = async () => {
  const { coreMode } = await getSchemaCompat();
  return coreMode === 'camel'
    ? 'id, name, model_year:modelYear, weekly_price:weeklyPrice, bond, status, image, created_at'
    : 'id, name, model_year, weekly_price, bond, status, image, created_at';
};

export const toCarWritePayload = async (car: {
  name: string;
  model_year: number;
  weekly_price: number;
  bond: number;
  status: string;
  image: string;
}) => {
  const { coreMode } = await getSchemaCompat();

  return coreMode === 'camel'
    ? {
        name: car.name,
        modelYear: car.model_year,
        weeklyPrice: car.weekly_price,
        bond: car.bond,
        status: car.status,
        image: car.image,
      }
    : {
        name: car.name,
        model_year: car.model_year,
        weekly_price: car.weekly_price,
        bond: car.bond,
        status: car.status,
        image: car.image,
      };
};

export const getCarWeeklyPriceColumn = async () => {
  const { coreMode } = await getSchemaCompat();
  return coreMode === 'camel' ? 'weeklyPrice' : 'weekly_price';
};

export const getCarCreatedAtColumn = async () => {
  const { coreMode } = await getSchemaCompat();
  return coreMode === 'camel' ? 'created_at' : 'created_at';
};

export const getApplicationSelectColumns = async () => {
  const { coreMode } = await getSchemaCompat();
  return coreMode === 'camel'
    ? [
        'id',
        'name',
        'phone',
        'email',
        'license_number:licenseNumber',
        'license_expiry:licenseExpiry',
        'uber_status:uberStatus',
        'experience',
        'address',
        'weekly_budget:weeklyBudget',
        'intended_start_date:intendedStartDate',
        'license_photo:licensePhoto',
        'uber_screenshot:uberScreenshot',
        'status',
        'created_at:createdAt',
      ].join(', ')
    : [
        'id',
        'name',
        'phone',
        'email',
        'license_number',
        'license_expiry',
        'uber_status',
        'experience',
        'address',
        'weekly_budget',
        'intended_start_date',
        'license_photo',
        'uber_screenshot',
        'status',
        'created_at',
      ].join(', ');
};

export const toApplicationWritePayload = async (application: {
  name: string;
  phone: string;
  email: string;
  license_number: string;
  license_expiry: string;
  uber_status: string;
  experience: string;
  address: string;
  weekly_budget?: string | null;
  intended_start_date: string;
  license_photo?: string | null;
  uber_screenshot?: string | null;
  status?: string;
}) => {
  const { coreMode } = await getSchemaCompat();

  return coreMode === 'camel'
    ? {
        name: application.name,
        phone: application.phone,
        email: application.email,
        licenseNumber: application.license_number,
        licenseExpiry: application.license_expiry,
        uberStatus: application.uber_status,
        experience: application.experience,
        address: application.address,
        weeklyBudget: application.weekly_budget ?? null,
        intendedStartDate: application.intended_start_date,
        licensePhoto: application.license_photo ?? null,
        uberScreenshot: application.uber_screenshot ?? null,
        ...(application.status ? { status: application.status } : {}),
      }
    : {
        name: application.name,
        phone: application.phone,
        email: application.email,
        license_number: application.license_number,
        license_expiry: application.license_expiry,
        uber_status: application.uber_status,
        experience: application.experience,
        address: application.address,
        weekly_budget: application.weekly_budget ?? null,
        intended_start_date: application.intended_start_date,
        license_photo: application.license_photo ?? null,
        uber_screenshot: application.uber_screenshot ?? null,
        ...(application.status ? { status: application.status } : {}),
      };
};

export const getApplicationCreatedAtColumn = async () => {
  const { coreMode } = await getSchemaCompat();
  return coreMode === 'camel' ? 'createdAt' : 'created_at';
};

export const getApplicationDocumentColumn = async (
  column: 'license_photo' | 'uber_screenshot'
) => {
  const { coreMode } = await getSchemaCompat();

  if (coreMode === 'snake') {
    return column;
  }

  return column === 'license_photo' ? 'licensePhoto' : 'uberScreenshot';
};

export const getRentalSelectColumns = async ({
  includeRelations = false,
  includeStripeFields = false,
}: {
  includeRelations?: boolean;
  includeStripeFields?: boolean;
} = {}) => {
  const compat = await getSchemaCompat();
  const columns =
    compat.coreMode === 'camel'
      ? [
          'id',
          'car_id:carId',
          'application_id:applicationId',
          'start_date:startDate',
          'end_date:endDate',
          'weekly_price:weeklyPrice',
          'bond_paid:bondPaid',
          'status',
          'created_at:createdAt',
        ]
      : [
          'id',
          'car_id',
          'application_id',
          'start_date',
          'end_date',
          'weekly_price',
          'bond_paid',
          'status',
          'created_at',
        ];

  if (includeStripeFields && compat.rentalStripeSubscriptionColumn) {
    columns.push(
      compat.rentalStripeSubscriptionColumn === 'stripeSubscriptionId'
        ? 'stripe_subscription_id:stripeSubscriptionId'
        : 'stripe_subscription_id'
    );
  }

  if (includeStripeFields && compat.rentalStripeCustomerColumn) {
    columns.push(
      compat.rentalStripeCustomerColumn === 'stripeCustomerId'
        ? 'stripe_customer_id:stripeCustomerId'
        : 'stripe_customer_id'
    );
  }

  if (includeRelations) {
    columns.push(
      compat.coreMode === 'camel'
        ? 'applications:applicationId(name), cars:carId(name)'
        : 'applications:application_id(name), cars:car_id(name)'
    );
  }

  return columns.join(', ');
};

export const toRentalWritePayload = async (rental: {
  car_id: number;
  application_id: number;
  start_date: string;
  end_date?: string | null;
  weekly_price: number;
  bond_paid?: number | null;
  status: string;
  stripe_subscription_id?: string | null;
  stripe_customer_id?: string | null;
}) => {
  const compat = await getSchemaCompat();
  const basePayload =
    compat.coreMode === 'camel'
      ? {
          carId: rental.car_id,
          applicationId: rental.application_id,
          startDate: rental.start_date,
          endDate: rental.end_date ?? null,
          weeklyPrice: rental.weekly_price,
          bondPaid: rental.bond_paid ?? 0,
          status: rental.status,
        }
      : {
          car_id: rental.car_id,
          application_id: rental.application_id,
          start_date: rental.start_date,
          end_date: rental.end_date ?? null,
          weekly_price: rental.weekly_price,
          bond_paid: rental.bond_paid ?? 0,
          status: rental.status,
        };

  if (compat.rentalStripeSubscriptionColumn && rental.stripe_subscription_id) {
    (basePayload as Record<string, unknown>)[compat.rentalStripeSubscriptionColumn] =
      rental.stripe_subscription_id;
  }

  if (compat.rentalStripeCustomerColumn && rental.stripe_customer_id) {
    (basePayload as Record<string, unknown>)[compat.rentalStripeCustomerColumn] =
      rental.stripe_customer_id;
  }

  return basePayload;
};

export const getRentalCreatedAtColumn = async () => {
  const { coreMode } = await getSchemaCompat();
  return coreMode === 'camel' ? 'createdAt' : 'created_at';
};

export const getRentalCarIdColumn = async () => {
  const { coreMode } = await getSchemaCompat();
  return coreMode === 'camel' ? 'carId' : 'car_id';
};

export const getRentalApplicationIdColumn = async () => {
  const { coreMode } = await getSchemaCompat();
  return coreMode === 'camel' ? 'applicationId' : 'application_id';
};

export const getMerchantSelectColumns = async () => {
  const { merchantMode } = await getSchemaCompat();
  return merchantMode === 'camel'
    ? 'id, name, email, country, stripe_account_id:stripeAccountId, payout_interval:payoutInterval, onboarding_status:onboardingStatus, created_at:createdAt, updated_at:updatedAt'
    : 'id, name, email, country, stripe_account_id, payout_interval, onboarding_status, created_at, updated_at';
};

export const toMerchantWritePayload = async (merchant: {
  name: string;
  email: string;
  country: string;
  stripe_account_id: string;
  payout_interval: string;
}) => {
  const { merchantMode } = await getSchemaCompat();
  return merchantMode === 'camel'
    ? {
        name: merchant.name,
        email: merchant.email,
        country: merchant.country,
        stripeAccountId: merchant.stripe_account_id,
        payoutInterval: merchant.payout_interval,
      }
    : merchant;
};

export const getMerchantCreatedAtColumn = async () => {
  const { merchantMode } = await getSchemaCompat();
  return merchantMode === 'camel' ? 'createdAt' : 'created_at';
};

export const toMerchantUpdatedAtPayload = async (updatedAt: string) => {
  const { merchantMode } = await getSchemaCompat();
  return merchantMode === 'camel' ? { updatedAt } : { updated_at: updatedAt };
};

export const getBookingSelectColumns = async () => {
  const { coreMode } = await getSchemaCompat();
  return coreMode === 'camel'
    ? 'id, total_amount:totalAmount'
    : 'id, total_amount';
};
