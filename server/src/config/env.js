import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  APP_URL: z.string().url().optional(),
  CLIENT_URL: z.string().url().optional(),
  ADMIN_EMAIL: z.string().email().default('admin@maplerentals.com.au'),
  JWT_SECRET: z.string().min(32).default('change-this-jwt-secret-before-production'),
  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),
  STRIPE_PRICE_CURRENCY: z.string().default('aud'),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_ANON_KEY: z.string().optional(),
  CONTRACTS_BUCKET: z.string().default('contracts'),
  RESEND_API_KEY: z.string().optional(),
  NOTIFY_FROM_EMAIL: z.string().email().default('noreply@maplerentals.com.au'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_SECURE: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .transform((value) => value === 'true'),
  SMS_FROM: z.string().default('MAPLE'),
  PAYMENT_RETRY_LIMIT: z.coerce.number().int().positive().default(3),
  PAYMENT_RETRY_DELAY_HOURS: z.coerce.number().int().positive().default(24),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
  throw new Error(`Invalid environment configuration:\n${issues.join('\n')}`);
}

export const env = parsed.data;
