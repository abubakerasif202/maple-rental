import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import Stripe from 'stripe';
import { z } from 'zod';
import { db, initializeDB } from '../src/db/index.js';
import { ensureEsbuildBinaryPath } from '../scripts/ensureEsbuildBinaryPath.js';
import { renderCarLeaseAgreement } from './templates/carLeaseAgreement.js';

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
const applicationStatusEnum = z.enum(['Pending', 'Approved', 'Rejected']);

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
const SAAS_ONBOARDING_REFRESH_URL = `${SAAS_FRONTEND_BASE}/admin/dashboard?onboardingStatus=refresh`;
const SAAS_ONBOARDING_RETURN_URL = `${SAAS_FRONTEND_BASE}/admin/dashboard?onboardingStatus=complete`;

const toOrigin = (value?: string) => {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
};

const corsOrigins = [
  toOrigin(process.env.APP_URL),
  toOrigin(process.env.FRONTEND_URL),
  process.env.CORS_ORIGIN || null,
  'http://localhost:5173',
  'http://127.0.0.1:5173',
].filter((origin): origin is string => Boolean(origin));

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16' as any,
});

const LEASE_STRIPE_SETTINGS = {
  currency: 'aud',
  recurringInterval: 'week' as const,
  minimumRentalWeeks: 6,
  insuranceCoverageRegion: 'NSW',
  fees: {
    accountManagementWeekly: 1.0,
    newAccountSetup: 10.0,
    directDebitAccountSetup: 2.2,
  },
};

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && !corsOrigins.includes(origin)) {
    return res.status(403).json({ error: 'CORS origin denied' });
  }
  next();
});

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow server-to-server calls (no Origin header) and same-origin requests.
      if (!origin || corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
  })
);
app.use(cookieParser());

// Stripe Webhook Endpoint (Must be before express.json() to get raw body)
app.post('/api/webhook', express.raw({ type: 'application/json' }), async (request, response) => {
  const sig = request.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      request.body,
      sig as string,
      process.env.STRIPE_WEBHOOK_SECRET || ''
    );
  } catch (err: any) {
    console.error(`Stripe Webhook Error: ${err.message}`);
    response.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  // Handle the event
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log(`✅ Webhook: Checkout session completed ${session.id}`);
        // Here you could link one-time payments to bookings
        break;
      }
      case 'account.updated': {
        const account = event.data.object as Stripe.Account;
        console.log(`ℹ️ Webhook: Connected account updated ${account.id}`);

        if (account.details_submitted) {
          await db.from('merchants')
            .update({ onboardingStatus: 'active' })
            .eq('stripeAccountId', account.id);
        }
        break;
      }
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as any;
        const subscriptionId = invoice.subscription as string;
        const customerId = invoice.customer as string;

        if (!subscriptionId) break;

        // Retrieve subscription to get metadata
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const { car_id, application_id } = subscription.metadata;

        if (car_id && application_id) {
          console.log(`✅ Webhook: Payment succeeded for car ${car_id} and application ${application_id}`);

          // 1. Check if rental already exists
          const { data: existingRental } = await db
            .from('rentals')
            .select('id')
            .eq('stripeSubscriptionId', subscriptionId)
            .single();

          if (!existingRental) {
            // 2. Fetch car details for the rental record
            const { data: car } = await db.from('cars').select('weeklyPrice').eq('id', car_id).single();

            // 3. Create Rental record
            await db.from('rentals').insert([{
              carId: Number(car_id),
              applicationId: Number(application_id),
              startDate: new Date().toISOString().split('T')[0],
              weeklyPrice: car?.weeklyPrice || 0,
              status: 'Active',
              stripeSubscriptionId: subscriptionId,
              stripeCustomerId: customerId
            }]);

            // 4. Update Car status
            await db.from('cars').update({ status: 'Rented' }).eq('id', car_id);
            
            console.log(`📊 Database: Created rental for subscription ${subscriptionId}`);

            // 5. Send Confirmation Email to Driver
            if (process.env.RESEND_API_KEY) {
              const { data: appData } = await db.from('applications').select('name, email').eq('id', application_id).single();
              const { data: carData } = await db.from('cars').select('name').eq('id', car_id).single();

              if (appData && carData) {
                const { Resend } = await import('resend');
                const resend = new Resend(process.env.RESEND_API_KEY);
                
                try {
                  await resend.emails.send({
                    from: 'Maple Rentals <noreply@maplerentals.com.au>',
                    to: appData.email,
                    subject: 'Rental Confirmed - Maple Rentals',
                    html: `
                      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #1a202c;">
                        <h2 style="color: #D4AF37;">Lease Confirmed</h2>
                        <p>Hi ${appData.name},</p>
                        <p>Great news! Your payment for the <strong>${carData.name}</strong> has been successfully processed.</p>
                        <p>Your rental is now <strong>Active</strong>. You can now arrange for vehicle collection as discussed.</p>
                        <p><strong>Subscription ID:</strong> ${subscriptionId}</p>
                        <br>
                        <p>Best regards,</p>
                        <p><strong>The Maple Rentals Team</strong></p>
                      </div>
                    `
                  });
                  console.log(`📧 Webhook: Confirmation email sent to ${appData.email}`);
                } catch (emailErr) {
                  console.error('Failed to send rental confirmation email:', emailErr);
                }
              }
            }
          }
        }
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as any;
        const subscriptionId = invoice.subscription as string;
        
        console.log(`❌ Webhook: Payment failed for invoice ${invoice.id} (Subscription: ${subscriptionId})`);

        if (subscriptionId) {
          await db.from('rentals')
            .update({ status: 'Overdue' })
            .eq('stripeSubscriptionId', subscriptionId);
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const subscriptionId = subscription.id;
        const { car_id } = subscription.metadata;

        console.log(`⚠️ Webhook: Subscription deleted ${subscriptionId}`);

        // 1. Update Rental status to 'Completed' or 'Cancelled'
        await db.from('rentals')
          .update({ status: 'Completed', endDate: new Date().toISOString().split('T')[0] })
          .eq('stripeSubscriptionId', subscriptionId);

        // 2. Update Car status back to 'Available'
        if (car_id) {
          await db.from('cars').update({ status: 'Available' }).eq('id', car_id);
        }
        
        break;
      }
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const subscriptionId = subscription.id;
        const status = subscription.status;

        console.log(`ℹ️ Webhook: Subscription updated ${subscriptionId} (Status: ${status})`);

        if (status === 'past_due' || status === 'unpaid') {
          await db.from('rentals')
            .update({ status: 'Overdue' })
            .eq('stripeSubscriptionId', subscriptionId);
        } else if (status === 'active') {
          await db.from('rentals')
            .update({ status: 'Active' })
            .eq('stripeSubscriptionId', subscriptionId);
        }
        break;
      }
      default:
        console.log(`ℹ️ Webhook: Unhandled event type ${event.type}`);
    }
  } catch (err) {
    console.error(`Error processing webhook event ${event.type}:`, err);
    return response.status(500).send('Webhook processing failed');
  }

  // Return a 200 response to acknowledge receipt of the event
  response.status(200).send('received');
});

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

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || (process.env.NODE_ENV === 'production' ? '' : 'admin@maplerentals.com.au');
if (!ADMIN_EMAIL && process.env.NODE_ENV === 'production') {
  console.error('CRITICAL: ADMIN_EMAIL environment variable is missing in production! Exiting.');
  process.exit(1);
}

const authenticateAdmin = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const token = req.cookies.admin_token || req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { data, error } = await db.auth.getUser(token);
    if (error || !data.user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Single-Admin Email Whitelist Check
    if (data.user.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
      return res.status(403).json({ error: 'Access denied: Unauthorized email' });
    }

    (req as any).admin = data.user;
    next();
  } catch (err) {
    console.error('Authentication error:', err);
    res.status(401).json({ error: 'Invalid token' });
  }
};

app.post('/api/create-subscription', async (req, res) => {
  const payload = z.object({
    carId: z.coerce.number().int().positive().optional(),
    applicationId: z.coerce.number().int().positive().optional(),
    customWeeklyPrice: z.coerce.number().optional(),
    customBond: z.coerce.number().optional(),
  });

  try {
    const { carId, applicationId, customWeeklyPrice, customBond } = payload.parse(req.body);
    
    let carName = 'Car Lease';
    let weeklyRent = customWeeklyPrice || 0;
    let bond = customBond || 0;

    if (carId) {
      const { data: car, error: carError } = await db
        .from('cars')
        .select('id, name, weeklyPrice, bond, status')
        .eq('id', carId)
        .single();

      if (carError || !car) {
        return res.status(404).json({ error: 'Car not found' });
      }
      
      carName = car.name;
      if (!customWeeklyPrice) weeklyRent = Number(car.weeklyPrice);
      if (!customBond) bond = Number(car.bond);
    }

    if (!weeklyRent || weeklyRent <= 0) {
      return res.status(400).json({ error: 'Invalid weekly price configuration' });
    }

    const recurringAmount = weeklyRent + LEASE_STRIPE_SETTINGS.fees.accountManagementWeekly;
    const recurringAmountCents = Math.round(recurringAmount * 100);

    const upfrontItems = [
      {
        amountCents: Math.round(bond * 100),
        description: 'Security Bond (Refundable)',
      },
      {
        amountCents: Math.round(weeklyRent * 100),
        description: 'Initial Weekly Rent',
      },
      {
        amountCents: Math.round(LEASE_STRIPE_SETTINGS.fees.newAccountSetup * 100),
        description: 'New Account Setup Fee',
      },
      {
        amountCents: Math.round(LEASE_STRIPE_SETTINGS.fees.directDebitAccountSetup * 100),
        description: 'Direct Debit Account Setup Fee',
      },
    ].filter((item) => item.amountCents > 0);

    const upfrontDueCents = upfrontItems.reduce((sum, item) => sum + item.amountCents, 0);

    const customer = await stripe.customers.create({
      description: 'Maple Rental Subscription Customer',
      metadata: {
        car_id: carId ? String(carId) : '',
        application_id: applicationId ? String(applicationId) : '',
        lease_minimum_weeks: String(LEASE_STRIPE_SETTINGS.minimumRentalWeeks),
        insurance_coverage_region: LEASE_STRIPE_SETTINGS.insuranceCoverageRegion,
      },
    });

    const product = await stripe.products.create({
      name: `${carName} Subscription`,
    });

    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: recurringAmountCents,
      currency: LEASE_STRIPE_SETTINGS.currency,
      recurring: { interval: LEASE_STRIPE_SETTINGS.recurringInterval },
    });

    for (const item of upfrontItems) {
      await stripe.invoiceItems.create({
        customer: customer.id,
        amount: item.amountCents,
        currency: LEASE_STRIPE_SETTINGS.currency,
        description: item.description,
      });
    }

    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: price.id }],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      metadata: {
        car_id: carId ? String(carId) : '',
        application_id: applicationId ? String(applicationId) : '',
        lease_minimum_weeks: String(LEASE_STRIPE_SETTINGS.minimumRentalWeeks),
        insurance_coverage_region: LEASE_STRIPE_SETTINGS.insuranceCoverageRegion,
      },
      expand: ['latest_invoice.payment_intent'],
    });

    const invoice = subscription.latest_invoice as any;
    const paymentIntent = invoice.payment_intent;

    res.json({
      clientSecret: paymentIntent.client_secret,
      subscriptionId: subscription.id,
      paymentIntentId: paymentIntent.id,
      billingBreakdown: {
        currency: LEASE_STRIPE_SETTINGS.currency.toUpperCase(),
        upfrontDue: upfrontDueCents / 100,
        recurringWeekly: recurringAmountCents / 100,
        minimumRentalWeeks: LEASE_STRIPE_SETTINGS.minimumRentalWeeks,
      }
    });
  } catch (error) {
    console.error('Stripe Subscription Error:', error);
    res.status(500).json({ error: 'Failed to initiate payment session' });
  }
});

app.get('/api/stripe/lease-settings', (_req, res) => {
  res.json({
    currency: LEASE_STRIPE_SETTINGS.currency.toUpperCase(),
    recurringInterval: LEASE_STRIPE_SETTINGS.recurringInterval,
    minimumRentalWeeks: LEASE_STRIPE_SETTINGS.minimumRentalWeeks,
    insuranceCoverageRegion: LEASE_STRIPE_SETTINGS.insuranceCoverageRegion,
    fees: LEASE_STRIPE_SETTINGS.fees,
  });
});

app.post('/api/create-payment-intent', async (req, res) => {
  const payload = z.object({
    bookingId: z.coerce.number().int().positive(),
    currency: z.string().length(3).default('aud'),
  });

  try {
    const { bookingId, currency } = payload.parse(req.body);
    const { data: booking, error: bookingError } = await db
      .from('bookings')
      .select('id, totalAmount')
      .eq('id', bookingId)
      .single();

    if (bookingError || !booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const amount = Number(booking.totalAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Invalid booking amount' });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(Number(amount) * 100),
      currency: currency.toLowerCase(),
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
  const email = typeof username === 'string' ? username.trim().toLowerCase() : '';
  const pass = typeof password === 'string' ? password : '';

  if (!email || !pass) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  // Single-Admin Email Whitelist Check
  if (email !== ADMIN_EMAIL.toLowerCase()) {
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
      sameSite: 'strict',
    });
    res.json({ username: data.user?.email });
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

app.get('/api/financials/weekly', authenticateAdmin, async (_req, res) => {
  try {
    // 1. Calculate Projected Weekly Gross (Database)
    const { data: activeRentals, error: rentalsError } = await db
      .from('rentals')
      .select('weeklyPrice')
      .eq('status', 'Active');

    if (rentalsError) throw rentalsError;

    const projectedGrossWeekly = activeRentals?.reduce((sum, rental) => sum + Number(rental.weeklyPrice), 0) || 0;
    
    // 2. Estimate Net (Subtract Platform Fees)
    // Assuming $1.00/wk account management fee per active rental
    const estimatedPlatformFees = activeRentals?.length || 0;
    const projectedNetWeekly = projectedGrossWeekly - estimatedPlatformFees;

    // 3. Fetch Actual Payouts (Stripe) for last 7 days
    const sevenDaysAgo = Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60);
    const payouts = await stripe.payouts.list({
      created: { gte: sevenDaysAgo },
      limit: 10,
    });

    const actualPayoutsWeekly = payouts.data
      .filter(p => p.status === 'paid' || p.status === 'in_transit')
      .reduce((sum, p) => sum + (p.amount / 100), 0);

    res.json({
      projectedGrossWeekly,
      projectedNetWeekly,
      estimatedPlatformFees,
      actualPayoutsWeekly,
      recentPayouts: payouts.data.map(p => ({
        id: p.id,
        amount: p.amount / 100,
        arrivalDate: new Date(p.arrival_date * 1000).toISOString().slice(0, 10),
        status: p.status,
      })),
    });
  } catch (err) {
    console.error('Financials fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch weekly financials' });
  }
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
      if (!data.licensePhoto.startsWith('data:')) {
        return res.status(400).json({ error: 'License photo must be a valid image data URL' });
      }
      licensePhotoUrl = await uploadImage(data.licensePhoto, 'license');
      if (!licensePhotoUrl) {
        return res.status(500).json({ error: 'Failed to upload license photo' });
      }
    }

    if (data.uberScreenshot) {
      if (!data.uberScreenshot.startsWith('data:')) {
        return res.status(400).json({ error: 'Uber screenshot must be a valid image data URL' });
      }
      uberScreenshotUrl = await uploadImage(data.uberScreenshot, 'uber');
      if (!uberScreenshotUrl) {
        return res.status(500).json({ error: 'Failed to upload uber screenshot' });
      }
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
        licensePhoto: licensePhotoUrl,
        uberScreenshot: uberScreenshotUrl,
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
  try {
    const { status } = z.object({ status: applicationStatusEnum }).parse(req.body ?? {});
    const { error } = await db.from('applications').update({ status }).eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.issues });
    }
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

const leaseFeeSchema = z.object({
  code: z.string().min(1),
  title: z.string().min(1),
  amount: z.string().min(1),
});

const leaseAgreementSchema = z.object({
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

const createLeaseAgreementSchema = z.object({
  applicationId: z.coerce.number().int().positive(),
  carId: z.coerce.number().int().positive(),
  content: z.string().min(1),
  status: z.string().optional().default('generated'),
});

app.get('/api/agreements/car-lease/template', (_req, res) => {
  const template = renderCarLeaseAgreement();
  res.type('text/markdown').send(template);
});

app.post('/api/agreements/car-lease/render', async (req, res) => {
  try {
    const payload = leaseAgreementSchema.parse(req.body ?? {});
    const rendered = renderCarLeaseAgreement(payload);
    res.json({ agreement: rendered });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.issues });
    }
    console.error('Render agreement error:', error);
    res.status(500).json({ error: 'Failed to render agreement' });
  }
});

app.post('/api/agreements', authenticateAdmin, async (req, res) => {
  try {
    const data = createLeaseAgreementSchema.parse(req.body);
    const { data: inserted, error } = await db.from('lease_agreements').insert([
      {
        applicationId: data.applicationId,
        carId: data.carId,
        content: data.content,
        status: data.status
      }
    ]).select('id').single();

    if (error) throw error;
    res.status(201).json({ id: String(inserted.id) });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: err.issues });
    }
    console.error('Lease agreement creation error:', err);
    res.status(500).json({ error: 'Failed to save lease agreement' });
  }
});

app.get('/api/agreements', authenticateAdmin, async (_req, res) => {
  try {
    const { data, error } = await db
      .from('lease_agreements')
      .select(`
        *,
        applications:applicationId(name),
        cars:carId(name)
      `)
      .order('createdAt', { ascending: false });

    if (error) throw error;

    const formattedAgreements = data.map((item: any) => ({
      ...item,
      applicantName: item.applications?.name,
      carName: item.cars?.name
    }));

    res.json(formattedAgreements);
  } catch (error) {
    console.error('Fetch lease agreements error:', error);
    res.status(500).json({ error: 'Failed to fetch lease agreements' });
  }
});

app.get('/api/agreements/:id', authenticateAdmin, async (req, res) => {
  try {
    const { data, error } = await db
      .from('lease_agreements')
      .select(`
        *,
        applications:applicationId(name),
        cars:carId(name)
      `)
      .eq('id', req.params.id)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Lease agreement not found' });
    }

    res.json({
      ...data,
      applicantName: data.applications?.name,
      carName: data.cars?.name
    });
  } catch (error) {
    console.error('Fetch lease agreement error:', error);
    res.status(500).json({ error: 'Failed to fetch lease agreement' });
  }
});

app.delete('/api/agreements/:id', authenticateAdmin, async (req, res) => {
  try {
    const { error } = await db.from('lease_agreements').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error('Lease agreement deletion error:', error);
    res.status(500).json({ error: 'Failed to delete lease agreement' });
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

app.post('/api/saas/merchants', authenticateAdmin, async (req, res) => {
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

app.get('/api/saas/merchants', authenticateAdmin, async (_req, res) => {
  try {
    const { data, error } = await db.from('merchants').select('id, name, email, country, stripeAccountId, payoutInterval, onboardingStatus, createdAt').order('createdAt', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Fetch SaaS merchants error:', error);
    res.status(500).json({ error: 'Failed to fetch merchants' });
  }
});

app.post('/api/saas/merchants/:id/link', authenticateAdmin, async (req, res) => {
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
