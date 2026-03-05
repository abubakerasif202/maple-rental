# Maple Rental - Project Overview

Maple Rental is a full-stack car rental platform primarily targeting Uber and rideshare drivers. It features a React-based frontend, an Express-integrated development server using Vite, and a Supabase (PostgreSQL) backend with Stripe for subscription payments.

## Tech Stack

- **Frontend**: React 19, Vite 7, Tailwind CSS 4, React Router 7, TanStack Query 5, Framer Motion (Motion), Lucide Icons.
- **Backend**: Node.js (Express) integrated with Vite via `vite-node`.
- **Database**: Supabase (PostgreSQL) with Row Level Security (RLS).
- **Payments**: Stripe (Connect/Express for merchants, Subscriptions for rentals).
- **Email**: Resend for application and payment confirmations.
- **Validation**: Zod for request and schema validation.

## Key Features

- **Car Listings**: Browsing available vehicles (e.g., Toyota Camry Hybrids).
- **Driver Applications**: A multi-step application form with document uploads (license, Uber screenshots) to Supabase Storage.
- **Automated Subscriptions**: Stripe-driven weekly rental payments and bond collection.
- **Admin Dashboard**: Secure single-admin dashboard for managing fleet, reviewing applications, and monitoring financial stats.
- **Lease Agreements**: Dynamic generation of car lease agreements in Markdown/PDF.
- **SaaS Merchant Onboarding**: Support for multiple merchants using Stripe Connect Express.

## Getting Started

### Prerequisites

- Node.js 20+
- A Supabase project with Database and Storage (bucket: `applications`).
- A Stripe account (for API keys and webhooks).
- A Resend API key for emails.

### Environment Variables

Create a `.env` or `.env.local` file with the following:

```env
# Server
PORT=3000
APP_URL=http://localhost:5173
NODE_ENV=development

# Gemini (for AI features if applicable)
GEMINI_API_KEY=your_key

# Supabase
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Stripe
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=your_webhook_secret

# Admin
ADMIN_EMAIL=admin@maplerentals.com.au
ADMIN_PASSWORD=your_admin_password
JWT_SECRET=your_jwt_secret

# Email
RESEND_API_KEY=your_resend_key
```

### Installation & Development

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Run the development server**:
   ```bash
   npm run dev
   ```
   This command uses `vite-node api/index.ts` to run the Express backend, which also serves the Vite frontend middleware.

3. **Build for production**:
   ```bash
   npm run build
   ```
   This generates the frontend in `dist/` and prepares the server for production deployment.

## Development Conventions

- **Unified Server**: The backend entry point is `api/index.ts`. It handles both API routes and Vite's development middleware.
- **Database Access**: All database interactions use the `db` singleton from `src/db/index.ts` (Supabase Service Role client).
- **Security**: 
  - Admin access is restricted via a single-email whitelist (`ADMIN_EMAIL`).
  - Row Level Security (RLS) is enabled in Supabase; ensure policies match the `admin_full_access` logic in `supabase-schema.sql`.
- **Utility Scripts**: Use scripts in `scripts/` for common tasks:
  - `npm run seed-data`: Seed initial car data.
  - `node scripts/seed-admin.js`: Set up the initial admin user.
  - `node scripts/pg-seed.js`: Destructive database reset and seed (requires `ALLOW_SCHEMA_RESET=true`).
- **Styles**: Tailwind CSS 4 is used with the `@tailwindcss/vite` plugin. Custom brand colors are defined in `src/index.css`.

## Project Structure

- `api/`: Express backend and Stripe webhook handlers.
- `src/components/`: Reusable React components (Navbar, Footer, forms).
- `src/pages/`: Main application views (Home, Cars, AdminDashboard, etc.).
- `src/db/`: Supabase client configuration.
- `scripts/`: Utility scripts for maintenance and data management.
- `docs/`: High-level documentation for reliability, security, and reporting.
- `supabase-schema.sql`: Source of truth for the database schema.
