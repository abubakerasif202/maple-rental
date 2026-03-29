export const USER_ROLES = /** @type {const} */ (['driver', 'admin']);
export const DRIVER_STATUSES = /** @type {const} */ ([
  'pending',
  'approved',
  'active',
  'suspended',
  'disabled',
]);
export const VEHICLE_STATUSES = /** @type {const} */ ([
  'available',
  'reserved',
  'active',
  'maintenance',
  'inactive',
]);
export const APPLICATION_STATUSES = /** @type {const} */ ([
  'pending',
  'approved',
  'rejected',
  'checkout_pending',
  'subscribed',
  'cancelled',
]);
export const SUBSCRIPTION_STATUSES = /** @type {const} */ ([
  'draft',
  'checkout_pending',
  'trialing',
  'active',
  'past_due',
  'unpaid',
  'canceled',
]);
export const PAYMENT_STATUSES = /** @type {const} */ ([
  'pending',
  'paid',
  'failed',
  'refunded',
]);
export const CONTRACT_STATUSES = /** @type {const} */ ([
  'draft',
  'issued',
  'signed',
  'archived',
]);
export const NOTIFICATION_CHANNELS = /** @type {const} */ ([
  'email',
  'sms',
  'in_app',
]);
export const NOTIFICATION_STATUSES = /** @type {const} */ ([
  'queued',
  'sent',
  'failed',
]);
export const DEFAULT_CURRENCY = 'aud';
export const DEFAULT_CONTRACTS_BUCKET = 'contracts';
export const DEFAULT_WEEKLY_RATE = 420;
export const DEFAULT_BOND_AMOUNT = 840;
export const DEFAULT_SUPPORT_EMAIL = 'support@maplerentals.com.au';
