import express from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { ZodError } from 'zod';

import { createAuthClient } from '../db/index.js';
import { adminLoginSchema } from '../validation.js';
import {
  authenticateAdmin,
  createCookieOptions,
  createLocalAdminSessionToken,
  requireTrustedAdminWriteOrigin,
  createSupabaseAdminSessionToken,
  clearAdminSessionCookie,
  getEffectiveAdminEmail,
  getSupabaseSessionExpiry,
} from '../middleware/auth.js';

const router = express.Router();
const isVitest = process.env.VITEST === 'true';
const isProduction = process.env.NODE_ENV === 'production' && !isVitest;

const devAdminPassword = (process.env.ADMIN_PASSWORD || '').trim();

const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip: () => process.env.VITEST === 'true',
  validate: { xForwardedForHeader: false },
  keyGenerator: (req) => {
    const ip = req.ip ? ipKeyGenerator(req.ip) : 'unknown';
    const email = (req.body?.username || '').trim().toLowerCase();
    return `auth_${ip}_${email}`;
  },
  message: { error: 'Too many login attempts. Try again later.' },
});

const canUseLocalAdminSession =
  !isProduction && Boolean(devAdminPassword);

router.post('/login', loginRateLimiter, async (req, res) => {
  try {
    const effectiveAdminEmail = getEffectiveAdminEmail();
    if (!effectiveAdminEmail) {
      return res
        .status(500)
        .json({ error: 'Admin authentication is not configured' });
    }

    const { username, password } = adminLoginSchema.parse(req.body ?? {});
    const email = username.trim().toLowerCase();
    const pass = password;

    if (email !== effectiveAdminEmail) {
      return res.status(403).json({
        error: 'Unauthorized: Access restricted to primary admin',
      });
    }

    if (canUseLocalAdminSession && pass === devAdminPassword) {
      res.cookie(
        'admin_token',
        createLocalAdminSessionToken(email),
        createCookieOptions(req)
      );
      return res.json({ username: email });
    }

    const authClient = createAuthClient();
    const { data, error } = await authClient.auth.signInWithPassword({
      email,
      password: pass,
    });

    if (error || !data.session) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!data.session.refresh_token) {
      throw new Error('Supabase session is missing a refresh token.');
    }

    res.cookie(
      'admin_token',
      createSupabaseAdminSessionToken({
        accessToken: data.session.access_token,
        accessTokenExpiresAt: getSupabaseSessionExpiry(data.session),
        email: data.user?.email || email,
        refreshToken: data.session.refresh_token,
      }),
      createCookieOptions(req)
    );
    res.json({ username: data.user?.email });
  } catch (err) {
    if (err instanceof ZodError) {
      return res
        .status(400)
        .json({ error: 'Validation failed', details: err.issues });
    }

    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

router.post('/logout', requireTrustedAdminWriteOrigin, async (req, res) => {
  clearAdminSessionCookie(req, res);
  res.json({ message: 'Logged out' });
});

router.get('/verify', authenticateAdmin, (req, res) => {
  const adminEmail = req.admin?.email;

  if (!adminEmail) {
    return res
      .status(500)
      .json({ error: 'Admin session is missing an email address' });
  }

  return res.json({ user: { username: adminEmail } });
});

export default router;
