# Financial Payout & Revenue Reporting Design

## Purpose
To provide a comprehensive financial overview for the administrator. This enhancement bridges the gap between database-driven "Projected Revenue" and real-world "Stripe Payouts," focusing on a weekly performance cycle.

## Understanding Summary
- **What is being built:** A "Financial Intelligence Hub" for the admin dashboard.
- **Why it exists:** To track cash flow and net income, comparing expected rental revenue with actual bank deposits from Stripe.
- **Who it is for:** The sole administrator of the platform.
- **Key constraints:**
  - **Weekly Performance Cycle:** Focus on the last 7 days.
  - **Hybrid Data Sync:** Combines Supabase queries (projected) and Stripe API calls (actual).
  - **Security:** Protected by the `ADMIN_EMAIL` whitelist.
- **Explicit non-goals:** GST/tax calculation, Xero/accounting integration, or multi-currency support.

## Assumptions
- The administrator's Stripe account is correctly connected to the platform.
- The `rentals` table in Supabase remains the source of truth for "active" drivers.
- Platform fees (e.g., $1.00/wk) are based on the current `LEASE_STRIPE_SETTINGS`.

## Decision Log
| Decision | Alternatives Considered | Reason for Choice |
| :--- | :--- | :--- |
| **Hybrid Sync (Approach A)** | Snapshot Sync, Frontend Only | Most accurate for real-time cash flow and most secure for sensitive financial data. |
| **Weekly (7-day) Focus** | Monthly, Last 30 Days | Better alignment with your rental cycle and payout frequency. |
| **Net Income Contrast** | Gross Revenue Only | Provides a more realistic picture of profitability after Stripe and platform fees. |

## Final Design

### 1. API Endpoint (`GET /api/financials/weekly`)
- **Backend Logic:**
  - **Projected Gross:** `SELECT SUM(weeklyPrice) FROM rentals WHERE status = 'Active'`
  - **Actual Payouts:** `stripe.payouts.list({ created: { gte: last_7_days_timestamp } })`
  - **Net Projected:** Subtract platform fees ($1.00/wk/rental) from the projected gross.
- **Response Format:**
```json
{
  "projectedGrossWeekly": 1250.00,
  "projectedNetWeekly": 1242.00,
  "actualPayoutsWeekly": 1180.50,
  "recentPayouts": [
    { "id": "po_...", "amount": 1180.50, "arrival_date": "2026-03-01", "status": "paid" }
  ]
}
```

### 2. Dashboard Integration (`AdminDashboard.tsx`)
- **Financial Module:** A new card or section on the main Dashboard or a dedicated "Earnings" tab.
- **Weekly Comparison:** A visual card comparing "Weekly Rent (Expected)" vs. "Actual Stripe Payouts (Received)".
- **Payout History:** A list of recent bank transfers from Stripe with their current status (e.g., "Paid", "Pending", "In Transit").

### 3. Security Enforcement
- The `ADMIN_EMAIL` whitelist check must be performed on all requests to the `/api/financials` routes.
- Stripe data is only fetched for the authenticated primary admin.

## Implementation Plan
1. Add the `GET /api/financials/weekly` route to `api/index.ts`.
2. Update `src/lib/api.ts` to include the `fetchWeeklyFinancials` frontend call.
3. Refactor `AdminDashboard.tsx` to include the new "Financial Overview" module.
4. (Optional) Add a simple chart or sparkline showing the weekly payout trend.
