import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import Stripe from 'stripe';
import { z } from 'zod';
import { db, initializeDB } from '../src/db/index.js';
import { ensureEsbuildBinaryPath } from '../scripts/ensureEsbuildBinaryPath.js';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Validation Schemas
const carSchema = z.object({
  name: z.string().min(1),
  modelYear: z.number().int().min(1900).max(new Date().getFullYear() + 1),
  weeklyPrice: z.number().positive(),
  bond: z.number().nonnegative(),
  status: z.enum(['Available', 'Rented', 'Maintenance']),
  image: z.string().url(),
});

const applicationSchema = z.object({
  name: z.string().min(2),
  phone: z.string().min(10),
  email: z.string().email(),
  licenseNumber: z.string().min(5),
  licenseExpiry: z.string(),
  uberStatus: z.enum(['Active', 'Applying', 'Not Yet Registered']),
  experience: z.string().min(1),
  address: z.string().min(5),
  weeklyBudget: z.string().optional(),
  intendedStartDate: z.string(),
  licensePhoto: z.string().optional().nullable(),
  uberScreenshot: z.string().optional().nullable(),
});

const payoutIntervalEnum = z.enum(['daily', 'weekly', 'monthly']);
const countrySchema = z
  .string()
  .length(2)
  .default('US')
  .transform((value) => value.toUpperCase());

const merchantSchema = z.object({
  businessName: z.string().min(2),
  email: z.string().email(),
  country: countrySchema,
  payoutInterval: payoutIntervalEnum.default('weekly'),
});

const SAAS_FRONTEND_BASE =
  process.env.APP_URL || process.env.FRONTEND_URL || 'http://localhost:5173';
const SAAS_ONBOARDING_REFRESH_URL = `${SAAS_FRONTEND_BASE}/platform/onboarding?status=refresh`;
const SAAS_ONBOARDING_RETURN_URL = `${SAAS_FRONTEND_BASE}/platform/onboarding?status=complete`;

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16' as any,
});

app.use(cors());
app.use(cookieParser());
app.use(express.json());

let dbInitialized: Promise<void> | null = null;
const ensureDB = async () => {
  if (!dbInitialized) {
    dbInitialized = initializeDB();
  }
  return dbInitialized;
};

app.use(async (_req, res, next) => {
  try {
    await ensureDB();
    next();
  } catch (err) {
    console.error('Database initialization error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'dev-secret-not-for-production');
if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
  console.error('CRITICAL: JWT_SECRET environment variable is missing in production!');
}

const authenticateAdmin = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const token = req.cookies.admin_token || req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { data, error } = await db.auth.getUser(token);
    if (error || !data.user) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    (req as any).admin = data.user;
    next();
  } catch (err) {
    console.error('Authentication error:', err);
    res.status(401).json({ error: 'Invalid token' });
  }
};

app.post('/api/create-subscription', async (req, res) => {
  const { amount, recurringAmount, carName, currency = 'aud' } = req.body;

  if (!amount || !recurringAmount || Number(amount) <= 0 || Number(recurringAmount) <= 0) {
    return res.status(400).json({ error: 'Invalid amount parameters' });
  }

  try {
    const customer = await stripe.customers.create({
      description: 'Maple Rental Subscription Customer',
    });

    const product = await stripe.products.create({
      name: carName || 'Car Rental',
    });

    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: Math.round(Number(recurringAmount) * 100),
      currency: currency,
      recurring: { interval: 'week' },
    });

    const upfrontExtra = Math.round((Number(amount) - Number(recurringAmount)) * 100);

    if (upfrontExtra > 0) {
      await stripe.invoiceItems.create({
        customer: customer.id,
        amount: upfrontExtra,
        currency: currency,
        description: 'Upfront bond and initial payment',
      });
    }

    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: price.id }],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.payment_intent'],
    });

    const invoice = subscription.latest_invoice as any;
    const paymentIntent = invoice.payment_intent;

    res.json({
      clientSecret: paymentIntent.client_secret,
      subscriptionId: subscription.id,
      paymentIntentId: paymentIntent.id
    });
  } catch (error: any) {
    console.error('Subscription intent error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/create-payment-intent', async (req, res) => {
  const { amount, currency = 'aud' } = req.body;
  if (!amount || Number(amount) <= 0) {
    return res.status(400).json({ error: 'Invalid amount' });
  }

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(Number(amount) * 100),
      currency,
      automatic_payment_methods: { enabled: true },
    });
    res.json({ clientSecret: paymentIntent.client_secret, paymentIntentId: paymentIntent.id });
  } catch (error: any) {
    console.error('Payment intent error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    const { data, error } = await db.auth.signInWithPassword({
      email: username,
      password: password,
    });

    if (error || !data.session) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = data.session.access_token;
    res.cookie('admin_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });
    res.json({ token, username: data.user?.email });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/auth/logout', async (_req, res) => {
  res.clearCookie('admin_token');
  res.json({ message: 'Logged out' });
});

app.get('/api/auth/verify', authenticateAdmin, (req, res) => {
  res.json({ user: { username: (req as any).admin.email } });
});

app.get('/api/stats', authenticateAdmin, async (_req, res) => {
  try {
    const [applications, rentalsActive, incomeRows] = await Promise.all([
      db.from('applications').select('*', { count: 'exact', head: true }),
      db.from('rentals').select('*', { count: 'exact', head: true }).eq('status', 'Active'),
      db.from('rentals').select('weeklyPrice').eq('status', 'Active'),
    ]);

    const applicationsCount = applications.count || 0;
    const activeRentalsCount = rentalsActive.count || 0;
    const totalWeeklyIncome = incomeRows.data?.reduce((sum, row) => sum + Number(row.weeklyPrice), 0) || 0;

    res.json({
      totalApplications: applicationsCount,
      activeRentals: activeRentalsCount,
      totalWeeklyIncome: totalWeeklyIncome,
    });
  } catch (err) {
    console.error('Stats fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

app.get('/api/cars', async (_req, res) => {
  const { data, error } = await db.from('cars').select('*').order('created_at', { ascending: false });
  if (error) {
    console.error('Fetch cars error', error);
    return res.status(500).json({ error: 'Failed to fetch cars' });
  }
  res.json(data || []);
});

app.get('/api/cars/:id', async (req, res) => {
  const { data, error } = await db.from('cars').select('*').eq('id', req.params.id).single();

  if (error || !data) {
    return res.status(404).json({ error: 'Car not found' });
  }
  res.json(data);
});

app.post('/api/cars', authenticateAdmin, async (req, res) => {
  try {
    const data = carSchema.parse(req.body);
    const { data: inserted, error } = await db.from('cars').insert([
      {
        name: data.name,
        modelYear: data.modelYear,
        weeklyPrice: data.weeklyPrice,
        bond: data.bond,
        status: data.status,
        image: data.image
      }
    ]).select('id').single();

    if (error) throw error;
    res.status(201).json({ id: String(inserted.id) });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: err.issues });
    }
    console.error('Car creation error:', err);
    res.status(500).json({ error: 'Failed to create car' });
  }
});

app.put('/api/cars/:id', authenticateAdmin, async (req, res) => {
  try {
    const data = carSchema.parse(req.body);
    const { error } = await db.from('cars').update({
      name: data.name,
      modelYear: data.modelYear,
      weeklyPrice: data.weeklyPrice,
      bond: data.bond,
      status: data.status,
      image: data.image
    }).eq('id', req.params.id);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: err.issues });
    }
    console.error('Car update error:', err);
    res.status(500).json({ error: 'Failed to update car' });
  }
});

app.delete('/api/cars/:id', authenticateAdmin, async (req, res) => {
  try {
    const { error } = await db.from('cars').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error('Car deletion error:', error);
    res.status(500).json({ error: 'Failed to delete car' });
  }
});

app.get('/api/rentals', authenticateAdmin, async (_req, res) => {
  try {
    const { data, error } = await db
      .from('rentals')
      .select(`
        *,
        applications:applicationId(name),
        cars:carId(name)
      `)
      .order('createdAt', { ascending: false });

    if (error) throw error;

    // Map the relationships to match previous API response
    const formattedRentals = data.map((rental: any) => ({
      ...rental,
      applicantName: rental.applications?.name,
      carName: rental.cars?.name
    }));

    res.json(formattedRentals);
  } catch (error) {
    console.error('Fetch rentals error:', error);
    res.status(500).json({ error: 'Failed to fetch rentals' });
  }
});

app.get('/api/applications', authenticateAdmin, async (_req, res) => {
  const { data, error } = await db.from('applications').select('*').order('createdAt', { ascending: false });
  if (error) {
    return res.status(500).json({ error: 'Failed to fetch applications' });
  }
  res.json(data || []);
});

app.post('/api/applications', async (req, res) => {
  try {
    const data = applicationSchema.parse(req.body);
    let licensePhotoUrl = null;
    let uberScreenshotUrl = null;

    const uploadImage = async (base64Str: string, filePrefix: string) => {
      const match = base64Str.match(/^data:([a-zA-Z0-9-+/=.]+);base64,(.+)$/);
      if (!match) return null;

      const [, contentType, base64Data] = match;
      const buffer = Buffer.from(base64Data, 'base64');
      const filename = `${Date.now()}-${Math.floor(Math.random() * 10000)}-${filePrefix}`;

      const { data: uploadData, error: uploadError } = await db.storage
        .from('applications')
        .upload(filename, buffer, { contentType });

      if (uploadError) {
        console.error(`Error uploading ${filePrefix}:`, uploadError);
        return null;
      }

      const { data: publicUrlData } = db.storage.from('applications').getPublicUrl(filename);
      return publicUrlData.publicUrl;
    };

    if (data.licensePhoto) {
      licensePhotoUrl = await uploadImage(data.licensePhoto, 'license');
    }

    if (data.uberScreenshot) {
      uberScreenshotUrl = await uploadImage(data.uberScreenshot, 'uber');
    }

    const { data: inserted, error } = await db.from('applications').insert([
      {
        name: data.name,
        phone: data.phone,
        email: data.email,
        licenseNumber: data.licenseNumber,
        licenseExpiry: data.licenseExpiry,
        uberStatus: data.uberStatus,
        experience: data.experience,
        address: data.address,
        weeklyBudget: data.weeklyBudget || null,
        intendedStartDate: data.intendedStartDate,
        licensePhoto: licensePhotoUrl || data.licensePhoto || null,
        uberScreenshot: uberScreenshotUrl || data.uberScreenshot || null,
      }
    ]).select('id').single();

    if (error) throw error;

    // Send Confirmation Emails via Resend
    if (process.env.RESEND_API_KEY) {
      const { Resend } = await import('resend');
      const resend = new Resend(process.env.RESEND_API_KEY);

      try {
        // Email to the Applicant
        await resend.emails.send({
          from: 'Maple Rentals <noreply@maplerentals.com.au>',
          to: data.email,
          subject: 'Application Received - Maple Rentals',
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #1a202c;">
              <h2 style="color: #D4AF37;">Application Received</h2>
              <p>Hi ${data.name},</p>
              <p>Thank you for applying to rent a Toyota Camry Hybrid with Maple Rentals.</p>
              <p>We have successfully received your application, including your license and Uber details. Our team will review your application and try to get back to you within 24 hours.</p>
              <p>If you have any urgent questions, please contact us directly.</p>
              <br>
              <p>Best regards,</p>
              <p><strong>The Maple Rentals Team</strong></p>
            </div>
          `
        });

        // Email to the Admin
        await resend.emails.send({
          from: 'Maple Rentals Notifications <noreply@maplerentals.com.au>',
          to: 'admin@maplerentals.com.au',
          subject: `New Driver Application: ${data.name}`,
          html: `
            <div style="font-family: sans-serif; color: #1a202c;">
              <h2>New Driver Application</h2>
              <p>A new driver application has been submitted:</p>
              <ul>
                <li><strong>Name:</strong> ${data.name}</li>
                <li><strong>Phone:</strong> ${data.phone}</li>
                <li><strong>Email:</strong> ${data.email}</li>
                <li><strong>Address:</strong> ${data.address}</li>
                <li><strong>Uber Status:</strong> ${data.uberStatus}</li>
                <li><strong>Experience:</strong> ${data.experience}</li>
                <li><strong>Intended Start:</strong> ${data.intendedStartDate}</li>
              </ul>
              <p>Please log in to the admin dashboard to review their documents and approve/deny the application.</p>
            </div>
          `
        });
        console.log(`Confirmation emails sent successfully for applicant: ${data.email}`);
      } catch (emailError) {
        console.error("Failed to send Resend emails:", emailError);
      }
    }

    res.json({ success: true, applicationId: String(inserted.id) });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: err.issues });
    }
    console.error('Application submission error:', err);
    res.status(500).json({ error: 'Application submission failed' });
  }
});

app.put('/api/applications/:id/status', authenticateAdmin, async (req, res) => {
  const { status } = req.body;
  if (!status) {
    return res.status(400).json({ error: 'Status is required' });
  }

  try {
    const { error } = await db.from('applications').update({ status }).eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error('Application update error:', error);
    res.status(500).json({ error: 'Failed to update application status' });
  }
});

app.post('/api/bookings', async (req, res) => {
  const { carId, applicationId = null, startDate, endDate, totalAmount } = req.body;

  if (!carId || !startDate || !endDate || !totalAmount) {
    return res.status(400).json({ error: 'Missing booking fields' });
  }

  try {
    const { data, error } = await db.from('bookings').insert([
      {
        carId,
        applicationId,
        startDate,
        endDate,
        totalAmount,
        status: 'pending'
      }
    ]).select('id').single();
    if (error) throw error;
    res.status(201).json({ success: true, bookingId: String(data.id) });
  } catch (error) {
    console.error('Create booking error:', error);
    res.status(500).json({ error: 'Failed to create booking' });
  }
});

app.post('/api/bookings/verify-payment', async (req, res) => {
  const { sessionId, paymentIntentId } = req.body;

  try {
    if (paymentIntentId) {
      const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
      return res.json({ success: intent.status === 'succeeded', status: intent.status });
    }

    if (sessionId) {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      return res.json({
        success: session.payment_status === 'paid',
        status: session.payment_status,
      });
    }

    return res.status(400).json({ error: 'sessionId or paymentIntentId is required', success: false });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

const createOnboardingLink = (accountId: string) =>
  stripe.accountLinks.create({
    account: accountId,
    refresh_url: SAAS_ONBOARDING_REFRESH_URL,
    return_url: SAAS_ONBOARDING_RETURN_URL,
    type: 'account_onboarding',
    collect: 'eventually_due',
  });

app.post('/api/saas/merchants', async (req, res) => {
  try {
    const data = merchantSchema.parse(req.body);

    const account = await stripe.accounts.create({
      type: 'express',
      country: data.country,
      email: data.email,
      business_type: 'company',
      business_profile: {
        mcc: '7519',
        product_description: `${data.businessName} on Maple SaaS`,
        url: 'https://maple-rental.com',
      },
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      settings: {
        payouts: {
          schedule: {
            interval: data.payoutInterval,
          },
        },
      },
      metadata: {
        platform: 'maple-rental-saas',
      },
    });

    const accountLink = await createOnboardingLink(account.id);

    const { data: inserted, error: insertError } = await db.from('merchants').insert([
      {
        name: data.businessName,
        email: data.email,
        country: data.country,
        stripeAccountId: account.id,
        payoutInterval: data.payoutInterval
      }
    ]).select().single();

    if (insertError) throw insertError;

    res.status(201).json({
      merchant: inserted,
      onboardingLink: accountLink.url,
      onboardingExpiresAt: accountLink.expires_at ? new Date(accountLink.expires_at * 1000).toISOString() : null,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.issues });
    }
    console.error('Create SaaS merchant error:', error);
    res.status(500).json({ error: 'Failed to create merchant' });
  }
});

app.get('/api/saas/merchants', async (_req, res) => {
  try {
    const { data, error } = await db.from('merchants').select('id, name, email, country, stripeAccountId, payoutInterval, onboardingStatus, createdAt').order('createdAt', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Fetch SaaS merchants error:', error);
    res.status(500).json({ error: 'Failed to fetch merchants' });
  }
});

app.post('/api/saas/merchants/:id/link', async (req, res) => {
  try {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    const { data: merchant, error: fetchError } = await db.from('merchants').select('*').eq('id', id).single();
    if (fetchError || !merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    const accountLink = await createOnboardingLink(merchant.stripeAccountId);

    // In Supabase we typically don't explicitly set updatedAt if there's a trigger,
    // but if we need to force it we can just update a field. We might just 
    // leave it alone since updating the timestamp isn't functionally critical right here if no data changed.
    // Or we could execute a dummy update:
    await db.from('merchants').update({ updatedAt: new Date().toISOString() }).eq('id', merchant.id);

    res.json({
      onboardingLink: accountLink.url,
      onboardingExpiresAt: accountLink.expires_at ? new Date(accountLink.expires_at * 1000).toISOString() : null,
    });
  } catch (error) {
    console.error('Refresh onboarding link error:', error);
    res.status(500).json({ error: 'Failed to refresh onboarding link' });
  }
});

const startServer = async () => {
  await ensureDB();

  if (process.env.NODE_ENV !== 'production') {
    ensureEsbuildBinaryPath();
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (_req, res) => {
      res.sendFile('dist/index.html', { root: '.' });
    });
  }

  if (process.env.VERCEL !== '1') {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }
};

if (process.env.VERCEL !== '1') {
  startServer();
}

export default app;
