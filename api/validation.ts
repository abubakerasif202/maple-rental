import { z } from 'zod';

export const modelYearSchema = z.number().int().min(1900).max(new Date().getFullYear() + 1);
export const weeklyPriceSchema = z.number().positive();

export const carSchema = z.object({
  name: z.string().min(1),
  model_year: modelYearSchema,
  weekly_price: weeklyPriceSchema,
  bond: z.number().nonnegative(),
  status: z.enum(['Available', 'Rented', 'Maintenance']),
  image: z.string().url(),
});

export const applicationSchema = z.object({
  name: z.string().min(2),
  phone: z.string().min(10),
  email: z.string().email(),
  license_number: z.string().min(5),
  license_expiry: z.string(),
  uber_status: z.enum(['Active', 'Applying', 'Not Yet Registered']),
  experience: z.string().min(1),
  address: z.string().min(5),
  weekly_budget: z.string().optional(),
  intended_start_date: z.string(),
  license_photo: z.string().optional().nullable(),
  uber_screenshot: z.string().optional().nullable(),
});

export const applicationStatusEnum = z.enum(['Pending', 'Paid', 'Approved', 'Rejected']);

export const payoutIntervalEnum = z.enum(['daily', 'weekly', 'monthly']);
export const countrySchema = z
  .string()
  .length(2)
  .default('AU')
  .transform((value) => value.toUpperCase());

export const merchantSchema = z.object({
  business_name: z.string().min(2),
  email: z.string().email(),
  country: countrySchema,
  payout_interval: payoutIntervalEnum.default('weekly'),
});

export const subscriptionPayloadSchema = z.object({
  car_id: z.coerce.number().int().positive().optional(),
  application_id: z.coerce.number().int().positive(),
  plan_id: z.string().min(1).optional(),
}).strict().superRefine((value, ctx) => {
  const hasCar = typeof value.car_id === 'number';
  const hasPlan = typeof value.plan_id === 'string';

  if (hasCar === hasPlan) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Provide exactly one of car_id or plan_id',
      path: ['car_id'],
    });
  }
});

export const paymentIntentPayloadSchema = z.object({
  booking_id: z.coerce.number().int().positive(),
  currency: z.string().length(3).default('aud'),
});

export const leaseFeeSchema = z.object({
  code: z.string().min(1),
  title: z.string().min(1),
  amount: z.string().min(1),
});

export const leaseAgreementSchema = z.object({
  agreementDate: z.string().optional(),
  registeredOwnerName: z.string().optional(),
  registeredOwnerAddress: z.string().optional(),
  registeredOwnerContact: z.string().optional(),
  registeredOwnerEmail: z.string().optional(),
  renteeName: z.string().optional(),
  renteeDob: z.string().optional(),
  renteeLicenseNumber: z.string().optional(),
  renteeLicenseState: z.string().optional(),
  renteeAddress: z.string().optional(),
  renteeContact: z.string().optional(),
  renteeEmail: z.string().optional(),
  vehicleMake: z.string().optional(),
  vehicleModel: z.string().optional(),
  vehicleYear: z.string().optional(),
  vehicleVin: z.string().optional(),
  kmAllowance: z.string().optional(),
  weeklyRent: z.string().optional(),
  fuelPolicy: z.string().optional(),
  insuranceCoverage: z.string().optional(),
  rentalStartDate: z.string().optional(),
  rentalEndDate: z.string().optional(),
  minimumRentalPeriod: z.string().optional(),
  returnPolicy: z.string().optional(),
  fees: z.array(leaseFeeSchema).optional(),
});

export const createLeaseAgreementSchema = z.object({
  application_id: z.coerce.number().int().positive(),
  car_id: z.coerce.number().int().positive(),
  content: z.string().min(1),
  status: z.string().optional().default('generated'),
});
