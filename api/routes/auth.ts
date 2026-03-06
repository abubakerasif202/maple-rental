import express from 'express';
import { db } from '../db/index.js';

const router = express.Router();

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
if (!ADMIN_EMAIL && process.env.NODE_ENV === 'production') {
  throw new Error('CRITICAL: ADMIN_EMAIL environment variable is missing in production!');
}

const devAdminEmail = 'admin@maplerentals.com.au';
const effectiveAdminEmail = (ADMIN_EMAIL || devAdminEmail).toLowerCase();

export const authenticateAdmin = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const token = req.cookies.admin_token || req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { data, error } = await db.auth.getUser(token);
    if (error || !data.user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Single-Admin Email Whitelist Check
    if (data.user.email?.toLowerCase() !== effectiveAdminEmail) {
      return res.status(403).json({ error: 'Access denied: Unauthorized email' });
    }

    (req as any).admin = data.user;
    next();
  } catch (err) {
    console.error('Authentication error:', err);
    res.status(401).json({ error: 'Invalid token' });
  }
};

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const email = typeof username === 'string' ? username.trim().toLowerCase() : '';
  const pass = typeof password === 'string' ? password : '';

  if (!email || !pass) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  // Single-Admin Email Whitelist Check
  if (email !== effectiveAdminEmail) {
    return res.status(403).json({ error: 'Unauthorized: Access restricted to primary admin' });
  }

  try {
    const { data, error } = await db.auth.signInWithPassword({
      email,
      password: pass,
    });

    if (error || !data.session) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = data.session.access_token;
    res.cookie('admin_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    });
    res.json({ username: data.user?.email });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

router.post('/logout', async (_req, res) => {
  res.clearCookie('admin_token');
  res.json({ message: 'Logged out' });
});

router.get('/verify', authenticateAdmin, (req, res) => {
  res.json({ user: { username: (req as any).admin.email } });
});

export default router;
