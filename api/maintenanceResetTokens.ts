import crypto from 'node:crypto';

const TOKEN_TTL_SECONDS = 10 * 60;

const getSecret = () => {
  const secret = process.env.MAINTENANCE_RESET_TOKEN_SECRET || process.env.JWT_SECRET || '';
  if (secret.length < 32) {
    throw new Error('A maintenance reset token secret of at least 32 characters is required.');
  }
  return secret;
};

const stableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stableValue(nested)]),
    );
  }
  return value;
};

export const getMaintenanceResetPlanHash = (plan: unknown) =>
  crypto.createHash('sha256').update(JSON.stringify(stableValue(plan))).digest('base64url');

const sign = (payload: string) =>
  crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url');

export const createMaintenanceResetToken = ({
  adminEmail,
  plan,
  nowSeconds = Math.floor(Date.now() / 1000),
}: {
  adminEmail: string;
  plan: unknown;
  nowSeconds?: number;
}) => {
  const payload = Buffer.from(JSON.stringify({
    adminEmail: adminEmail.trim().toLowerCase(),
    exp: nowSeconds + TOKEN_TTL_SECONDS,
    planHash: getMaintenanceResetPlanHash(plan),
    version: 1,
  })).toString('base64url');
  return `${payload}.${sign(payload)}`;
};

export const verifyMaintenanceResetToken = ({
  adminEmail,
  plan,
  token,
  nowSeconds = Math.floor(Date.now() / 1000),
}: {
  adminEmail: string;
  plan: unknown;
  token: string;
  nowSeconds?: number;
}) => {
  const [payload, providedSignature, extra] = token.split('.');
  if (!payload || !providedSignature || extra) throw new Error('Invalid dry-run token.');
  const expectedSignature = sign(payload);
  const providedBuffer = Buffer.from(providedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    providedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    throw new Error('Invalid dry-run token.');
  }

  let claims: { adminEmail?: string; exp?: number; planHash?: string; version?: number };
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    throw new Error('Invalid dry-run token.');
  }
  if (claims.version !== 1 || !Number.isSafeInteger(claims.exp) || Number(claims.exp) <= nowSeconds) {
    throw new Error('Dry-run token has expired. Run the dry-run again.');
  }
  if (claims.adminEmail !== adminEmail.trim().toLowerCase()) {
    throw new Error('Dry-run token does not belong to this administrator.');
  }
  if (claims.planHash !== getMaintenanceResetPlanHash(plan)) {
    throw new Error('Reset plan changed after the dry-run. Run the dry-run again.');
  }
};
