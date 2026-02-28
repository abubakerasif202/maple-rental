<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/edb4d6f6-9a94-4e5b-91f2-ccb6d7fb9089

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Stripe SaaS Connect MWE

1. Ensure `APP_URL` points to the URL that serves the client (for example `http://localhost:5173`) so the backend can build return/refresh URLs.
2. Start the local server: `npm run dev`.
3. Navigate to `/platform` to exercise the Accounts v2 onboarding flow, create a Connect Express merchant, and capture the onboarding link (refresh it if it expires).
4. Use the page content to contrast Stripe-owned versus buy-rate monetization and tune the `payoutInterval` before moving to production.
