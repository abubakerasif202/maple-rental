import express from 'express';
import crypto from 'node:crypto';
import { createAuthClient } from '../db/index.js';

const isVitest = process.env.VITEST === 'true';
const isProduction = process.env.NODE_ENV === 'production' && !isVitest;

const devAdminEmail = 'admin@maplerentals.com.au';
export const MIN_ADMIN_SESSION_SECRET_LENGTH = 32;

const LOCAL_ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const ACCESS_TOKEN_REFRESH_WINDOW_MS = 60 * 1000;

type LocalAdminSessionPayload = {
  email: string;
  exp: number;
  mode: 'local-admin';
};

type SupabaseAdminSessionPayload = {
  accessToken: string;
  accessTokenExpiresAt: number | null;
  email: string;
  exp: number;
  mode: 'supabase-admin';
  refreshToken: string;
};

type AdminSessionPayload =
  | LocalAdminSessionPayload
  | SupabaseAdminSessionPayload;

export const getEffectiveAdminEmail = () => {
  const configuredAdminEmail = (process.env.ADMIN_EMAIL || '')
    .trim()
    .toLowerCase();

  if (configuredAdminEmail) {
    return configuredAdminEmail;
  }

  if (!isProduction) {
    return devAdminEmail;
  }

  return null;
};

const toOrigin = (value?: string | null) => {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
};

const getRequestOrigin = (req: express.Request) => {
  const host = req.get('host');

  if (!host) {
    return null;
  }

  const forwardedProto = req.get('x-forwarded-proto');
  const protocol =
    forwardedProto?.split(',')[0]?.trim() || (req.secure ? 'https' : 'http');

  return `${protocol}://${host}`;
};

const getTrustedWriteOrigins = (req: express.Request) =>
  new Set(
    [
      ...(!isProduction ? [getRequestOrigin(req)] : []),
      toOrigin(process.env.APP_URL),
      toOrigin(process.env.FRONTEND_URL),
      toOrigin(process.env.CORS_ORIGIN),
      ...(!isProduction
        ? [
            'http://localhost:3000',
            'http://127.0.0.1:3000',
            'http://localhost:4173',
            'http://127.0.0.1:4173',
            'http://localhost:5173',
            'http://127.0.0.1:5173',
          ]
        : []),
    ].filter((origin): origin is string => Boolean(origin))
  );

const isSafeMethod = (method: string) =>
  ['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());

const getCookieSameSite = () => ((isProduction ? 'strict' : 'lax') as 'lax' | 'strict');

const shouldUseCrossSiteCookie = (req?: express.Request) => {
  if (!req) {
    return false;
  }

  const requestOrigin = toOrigin(req.get('origin'));
  if (!requestOrigin) {
    return false;
  }

  const hostOrigin = toOrigin(getRequestOrigin(req));
  return requestOrigin !== hostOrigin && requestOrigin.startsWith('https://');
};

const readAdminSessionSecret = () => (process.env.JWT_SECRET || '').trim();

export const getAdminSessionSecretConfigurationIssue = ({
  required = isProduction,
}: {
  required?: boolean;
} = {}) => {
  if (!required) {
    return null;
  }

  const secret = readAdminSessionSecret();
  if (!secret) {
    return 'JWT_SECRET is required for production admin authentication.';
  }

  if (secret.length < MIN_ADMIN_SESSION_SECRET_LENGTH) {
    return `JWT_SECRET must be at least ${MIN_ADMIN_SESSION_SECRET_LENGTH} characters for production admin authentication.`;
  }

  return null;
};

const hasTrustedWriteOrigin = (req: express.Request) => {
  if (isSafeMethod(req.method)) {
    return true;
  }

  const trustedOrigins = getTrustedWriteOrigins(req);
  const requestOrigin = toOrigin(req.get('origin'));
  if (requestOrigin && trustedOrigins.has(requestOrigin)) {
    return true;
  }

  const refererOrigin = toOrigin(req.get('referer'));
  if (refererOrigin && trustedOrigins.has(refererOrigin)) {
    return true;
  }

  return false;
};

export const createCookieOptions = (req?: express.Request) => {
  const useCrossSiteCookie = shouldUseCrossSiteCookie(req);

  return {
    httpOnly: true,
    maxAge: LOCAL_ADMIN_SESSION_TTL_MS,
    path: '/',
    sameSite: useCrossSiteCookie ? ('none' as const) : getCookieSameSite(),
    secure: useCrossSiteCookie || isProduction,
  };
};

const getCookieClearOptions = () => {
  const cookieBase = {
    httpOnly: true,
    path: '/',
  };

  return [
    {
      ...cookieBase,
      sameSite: 'none' as const,
      secure: true,
    },
    {
      ...cookieBase,
      sameSite: 'strict' as const,
      secure: true,
    },
    {
      ...cookieBase,
      sameSite: 'strict' as const,
      secure: isProduction,
    },
  ];
};

export const requireTrustedAdminWriteOrigin = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  if (!req.cookies.admin_token || hasTrustedWriteOrigin(req)) {
    next();
    return;
  }

  res.status(403).json({ error: 'Cross-site admin request rejected' });
};

const requireAdminSessionSecret = () => {
  const secret = readAdminSessionSecret();
  if (!secret) {
    throw new Error('JWT_SECRET is required to issue admin sessions.');
  }

  return secret;
};

const signAdminSessionValueWithSecret = (value: string, secret: string) =>
  crypto.createHmac('sha256', secret).update(value).digest('base64url');

const signAdminSessionValue = (value: string) =>
  signAdminSessionValueWithSecret(value, requireAdminSessionSecret());

const getAdminSessionEncryptionKey = () =>
  crypto
    .createHash('sha256')
    .update(`maple-admin-session:v1:${requireAdminSessionSecret()}`)
    .digest();

const encryptAdminSessionPayload = (payload: SupabaseAdminSessionPayload) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(
    'aes-256-gcm',
    getAdminSessionEncryptionKey(),
    iv
  );
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    'enc',
    'v1',
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
};

const decryptAdminSessionPayload = (
  token: string
): Partial<SupabaseAdminSessionPayload> | null => {
  const [prefix, version, ivValue, tagValue, ciphertextValue] = token.split('.');
  if (
    prefix !== 'enc' ||
    version !== 'v1' ||
    !ivValue ||
    !tagValue ||
    !ciphertextValue
  ) {
    return null;
  }

  try {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      getAdminSessionEncryptionKey(),
      Buffer.from(ivValue, 'base64url')
    );
    decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertextValue, 'base64url')),
      decipher.final(),
    ]).toString('utf8');

    return JSON.parse(plaintext) as Partial<SupabaseAdminSessionPayload>;
  } catch {
    return null;
  }
};

const verifySignedSessionToken = (token: string) => {
  const adminSessionSecret = readAdminSessionSecret();
  if (!adminSessionSecret) {
    return null;
  }

  const [encodedPayload, providedSignature] = token.split('.');
  if (!encodedPayload || !providedSignature) {
    return null;
  }

  const expectedSignature = signAdminSessionValueWithSecret(
    encodedPayload,
    adminSessionSecret
  );
  const providedBuffer = Buffer.from(providedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    providedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8')
    ) as Partial<AdminSessionPayload>;

    if (typeof payload.exp !== 'number' || payload.exp <= Date.now()) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
};

const verifyLocalAdminSessionToken = (token: string) => {
  const payload = verifySignedSessionToken(token);
  if (!payload || payload.mode !== 'local-admin') {
    return null;
  }

  if (typeof payload.email !== 'string') {
    return null;
  }

  return payload as LocalAdminSessionPayload;
};

const verifySupabaseAdminSessionToken = (token: string) => {
  const payload = decryptAdminSessionPayload(token);
  if (!payload || payload.mode !== 'supabase-admin') {
    return null;
  }

  if (
    typeof payload.email !== 'string' ||
    typeof payload.accessToken !== 'string' ||
    typeof payload.refreshToken !== 'string'
  ) {
    return null;
  }

  if (typeof payload.exp !== 'number' || payload.exp <= Date.now()) {
    return null;
  }

  return payload as SupabaseAdminSessionPayload;
};

export const clearAdminSessionCookie = (req: express.Request, res: express.Response) => {
  void req;

  for (const options of getCookieClearOptions()) {
    res.clearCookie('admin_token', options);
  }
};

export const getSupabaseSessionExpiry = (
  session:
    | {
        expires_at?: number | null;
      }
    | null
    | undefined
) => {
  if (
    typeof session?.expires_at === 'number' &&
    Number.isFinite(session.expires_at)
  ) {
    return session.expires_at * 1000;
  }

  return null;
};

export const createSupabaseAdminSessionToken = ({
  accessToken,
  accessTokenExpiresAt,
  email,
  refreshToken,
}: {
  accessToken: string;
  accessTokenExpiresAt: number | null;
  email: string;
  refreshToken: string;
}) => {
  requireAdminSessionSecret();

  const payload: SupabaseAdminSessionPayload = {
    accessToken,
    accessTokenExpiresAt,
    email,
    exp: Date.now() + LOCAL_ADMIN_SESSION_TTL_MS,
    mode: 'supabase-admin',
    refreshToken,
  };

  return encryptAdminSessionPayload(payload);
};

export const createLocalAdminSessionToken = (email: string) => {
  requireAdminSessionSecret();

  const payload: LocalAdminSessionPayload = {
    email,
    exp: Date.now() + LOCAL_ADMIN_SESSION_TTL_MS,
    mode: 'local-admin',
  };

  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString(
    'base64url'
  );

  return `${encodedPayload}.${signAdminSessionValue(encodedPayload)}`;
};

const shouldRefreshSupabaseSession = (
  session: SupabaseAdminSessionPayload
) =>
  typeof session.accessTokenExpiresAt === 'number' &&
  session.accessTokenExpiresAt <= Date.now() + ACCESS_TOKEN_REFRESH_WINDOW_MS;

const getBearerToken = (req: express.Request) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return null;
  }

  return header.slice('Bearer '.length).trim() || null;
};

const authenticateSupabaseAdminToken = async (
  token: string,
  effectiveAdminEmail: string
) => {
  const authClient = createAuthClient();
  const { data, error } = await authClient.auth.getUser(token);

  if (error || !data.user) {
    return null;
  }

  if (data.user.email?.toLowerCase() !== effectiveAdminEmail) {
    return { accessDenied: true as const, user: null };
  }

  return { accessDenied: false as const, user: data.user };
};

const refreshSupabaseAdminSession = async (
  req: express.Request,
  res: express.Response,
  session: SupabaseAdminSessionPayload,
  effectiveAdminEmail: string
) => {
  const authClient = createAuthClient();
  const { data, error } = await authClient.auth.refreshSession({
    refresh_token: session.refreshToken,
  });

  if (error || !data.session || !data.user) {
    clearAdminSessionCookie(req, res);
    return null;
  }

  if (data.user.email?.toLowerCase() !== effectiveAdminEmail) {
    clearAdminSessionCookie(req, res);
    return { accessDenied: true as const, user: null };
  }

  res.cookie(
    'admin_token',
    createSupabaseAdminSessionToken({
      accessToken: data.session.access_token,
      accessTokenExpiresAt: getSupabaseSessionExpiry(data.session),
      email: data.user.email || effectiveAdminEmail,
      refreshToken: data.session.refresh_token,
    }),
    createCookieOptions(req)
  );

  return { accessDenied: false as const, user: data.user };
};

export const authenticateAdmin = async (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  const bearerToken = getBearerToken(req);
  const cookieToken = req.cookies.admin_token;
  const token = bearerToken || cookieToken;
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!bearerToken && cookieToken && !hasTrustedWriteOrigin(req)) {
    return res.status(403).json({ error: 'Cross-site admin request rejected' });
  }

  try {
    const effectiveAdminEmail = getEffectiveAdminEmail();
    if (!effectiveAdminEmail) {
      return res
        .status(500)
        .json({ error: 'Admin authentication is not configured' });
    }

    const localAdminSession = verifyLocalAdminSessionToken(token);
    if (localAdminSession?.email.toLowerCase() === effectiveAdminEmail) {
      req.admin = { email: localAdminSession.email };
      next();
      return;
    }

    const supabaseAdminSession = verifySupabaseAdminSessionToken(token);
    if (supabaseAdminSession) {
      const sessionResult = shouldRefreshSupabaseSession(supabaseAdminSession)
        ? await refreshSupabaseAdminSession(
            req,
            res,
            supabaseAdminSession,
            effectiveAdminEmail
          )
        : (await authenticateSupabaseAdminToken(
            supabaseAdminSession.accessToken,
            effectiveAdminEmail
          )) ||
          (await refreshSupabaseAdminSession(
            req,
            res,
            supabaseAdminSession,
            effectiveAdminEmail
          ));

      if (!sessionResult?.user) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      if (sessionResult.accessDenied) {
        return res
          .status(403)
          .json({ error: 'Access denied: Unauthorized email' });
      }

      req.admin = sessionResult.user;
      next();
      return;
    }

    const tokenResult = await authenticateSupabaseAdminToken(
      token,
      effectiveAdminEmail
    );
    if (!tokenResult?.user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    if (tokenResult.accessDenied) {
      return res
        .status(403)
        .json({ error: 'Access denied: Unauthorized email' });
    }

    req.admin = tokenResult.user;
    next();
  } catch (err) {
    console.error('Authentication error:', err);
    res.status(401).json({ error: 'Invalid token' });
  }
};
