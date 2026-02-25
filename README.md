# Maple Rentals - Car Rental Platform

A comprehensive car rental platform designed for Uber drivers in Sydney, featuring a React frontend and an Express backend.

## Features

- **Frontend**: React, Vite, Tailwind CSS, Lucide Icons, Framer Motion.
- **Backend**: Express.js, SQLite (via `@libsql/client` and `better-sqlite3`), Zod for validation.
- **Authentication**: JWT-based admin authentication.
- **Payments**: Stripe integration for bookings.
- **Database**: SQLite database for managing cars, applications, rentals, and bookings.

## Getting Started

### Prerequisites

- Node.js (or Bun) installed.
- Stripe account (for payments).

### Installation

1.  Clone the repository.
2.  Install dependencies:
    ```bash
    bun install
    # or
    npm install
    ```

### Running the Application

To start the development server (frontend + backend):

```bash
bun run dev
# or
npm run dev
```

The application will be available at `http://localhost:3000`.

## Project Structure

- `src/pages/`: React pages (Home, Cars, AdminDashboard, etc.).
- `src/components/`: Reusable UI components.
- `src/lib/`: Utility functions and API clients.
- `src/db/`: Database configuration and schema.
- `server.ts`: Express backend server.

## Environment Variables

Create a `.env` file in the root directory with the following variables:

- `JWT_SECRET`: Secret key for JWT signing.
- `STRIPE_SECRET_KEY`: Stripe secret key.
- `STRIPE_WEBHOOK_SECRET`: Stripe webhook secret.
- `PORT`: Server port (default: 3000).

## License

All rights reserved by Maple Rentals.
