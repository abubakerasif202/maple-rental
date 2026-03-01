# Single-Admin Security Enhancement

## Purpose
To secure the `maple-rental` admin platform by restricting all administrative access to a single, authorized email address. This ensures that even if other users exist in the authentication system, only the designated administrator can view or modify platform data.

## Understanding Summary
- **What is being built:** A "Single-Admin Email Whitelist" security gate.
- **Why it exists:** To prevent unauthorized access to sensitive operational and financial data.
- **Who it is for:** The sole administrator of the platform.
- **Key constraints:** Only one specific email address (`ADMIN_EMAIL`) can access the admin dashboard and API routes.
- **Explicit non-goals:** Multi-role support, granular permissions, or self-registration for admins.

## Assumptions
- The application will use an environment variable (`ADMIN_EMAIL`) as the source of truth for the whitelist.
- Supabase continues to handle the underlying JWT-based authentication.
- The `authenticateAdmin` middleware will be the primary point of enforcement.

## Decision Log
| Decision | Alternatives Considered | Reason for Choice |
| :--- | :--- | :--- |
| **Email Whitelist via Env Var** | RLS, Admins Table | Simplest to implement and maintain for a single-admin scenario. |
| **Double-Gatekeeper Pattern** | Only Login Check, Only Middleware Check | Provides defense-in-depth: login prevents initial session, middleware prevents token abuse. |
| **Startup Safety Check** | None | Prevents accidental security vulnerabilities if `ADMIN_EMAIL` is missing in production. |

## Final Design

### 1. Environment Variable
A new environment variable, `ADMIN_EMAIL`, must be added to the server's `.env` file.
```env
ADMIN_EMAIL=your-actual-admin-email@example.com
```

### 2. Login Flow (`POST /api/auth/login`)
- The login endpoint will be modified to check the incoming `username` (email) against `process.env.ADMIN_EMAIL`.
- If the email does not match exactly (case-insensitive), the server will return a `403 Forbidden` response immediately.
- This prevents the creation of any administrative session for unauthorized users.

### 3. Middleware Security (`authenticateAdmin`)
- The middleware will be updated to extract the `email` from the decoded Supabase JWT.
- It will verify that this email matches `process.env.ADMIN_EMAIL`.
- Any mismatch will result in a `403 Forbidden` response, protecting all subsequent API calls.

### 4. Safety Check
- The server initialization will include a check to ensure `ADMIN_EMAIL` is defined and valid.
- In production mode, the server will refuse to start if this variable is missing.

## Implementation Plan
1. Update `.env.example` to include `ADMIN_EMAIL`.
2. Add a startup check in `api/index.ts` to verify the environment variable.
3. Modify the `authenticateAdmin` middleware in `api/index.ts` to enforce the whitelist.
4. Update the `POST /api/auth/login` endpoint to reject non-whitelisted emails.
5. (Optional) Update the frontend to gracefully handle `403 Forbidden` errors.
