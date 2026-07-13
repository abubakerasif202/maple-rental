import { z } from 'zod';
import {
  AUSTRALIAN_MOBILE_REGEX,
  getTodayInAustralia,
  isTodayOrFutureAustraliaDate,
  isValidDateOnly,
  normalizeApplicationEmail,
  normalizeAustralianMobile,
} from './applicationSubmission.js';

const dateField = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .refine(isValidDateOnly, `${label} must be a valid date`)
    .refine(
      (value) => isTodayOrFutureAustraliaDate(value, getTodayInAustralia()),
      `${label} must be today or later`
    );

export const inquirySchema = z
  .object({
    name: z.string().trim().min(2, 'Name is required'),
    email: z.string().transform(normalizeApplicationEmail).pipe(z.string().email('Invalid email address')),
    phone: z
      .string()
      .transform(normalizeAustralianMobile)
      .pipe(z.string().regex(AUSTRALIAN_MOBILE_REGEX, 'Valid Australian mobile number required')),
    startDate: dateField('Start date'),
    endDate: dateField('End date'),
    message: z
      .string()
      .trim()
      .max(2000, 'Message must be 2000 characters or fewer')
      .optional()
      .transform((value) => value || undefined),
  })
  .superRefine((value, ctx) => {
    if (value.endDate < value.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'End date must be on or after the start date',
        path: ['endDate'],
      });
    }
  });

export type InquiryFormValues = z.input<typeof inquirySchema>;
export type InquiryValues = z.output<typeof inquirySchema>;
