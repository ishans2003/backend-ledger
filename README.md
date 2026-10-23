# Ledger

Ledger is a learning project for customer accounts, internal transfers, account funding, and an operations dashboard. It is **not a bank** and should not hold real customer funds without a proper financial, security, and compliance review.

## Stack

- API: Node.js, Express, MongoDB/Mongoose
- Web: React, TypeScript, Tailwind CSS, Redux Toolkit, Axios
- Funding: Razorpay Standard Checkout (test keys recommended for development)

## Local setup

1. Copy `.env.example` to `.env` and fill in MongoDB, JWT, and email settings. Never commit `.env`.
2. Install backend dependencies with `npm install` and start the API with `npm run dev` (port 3000 by default).
3. In `frontend/`, run `npm install`, then `npm run dev` (usually port 5173). Vite proxies `/api` to the local backend.
4. Create an account, open the verification link printed to the backend terminal in development, then sign in.

The API initializes cached account balances from the immutable ledger on startup. It marks pre-existing users without an `emailVerified` field as verified so existing accounts continue to work. New registrations must verify email.

## Admin access

Set `ADMIN_EMAILS` to a comma-separated allowlist of trusted account emails, then restart the backend. Admin access is checked server-side on every `/api/admin` request; hiding the frontend link is only a convenience. Do not let users self-assign an admin role.

## Online funding

Set Razorpay test credentials in `.env` to enable Add money. Enable automatic payment capture in the Razorpay Dashboard. Configure the Razorpay webhook URL as `https://YOUR_API_HOST/api/funding/webhook`, subscribe to `payment.captured` and `refund.processed`, and set the matching `RAZORPAY_WEBHOOK_SECRET`. The server verifies Checkout signatures and captured payment details before crediting the account, and records processed refunds as ledger debits. The Razorpay secret must only exist on the backend. To accept live payments, complete Razorpay onboarding and replace test credentials with live credentials. Razorpay requires a server-created order and server-side signature verification; its security guidance also recommends backend verification of captured amounts and HMAC validation of webhook requests. [Razorpay integration steps](https://razorpay.com/docs/payments/payment-gateway/react-native-integration/standard/integration-steps-ios/) · [Razorpay security checklist](https://razorpay.com/security/checklist/)

MongoDB must support multi-document transactions (a replica set or compatible cluster), which is required for transfers and payment credits.

## Production deployment

- Set `NODE_ENV=production`, `FRONTEND_ORIGINS` to the exact frontend origin(s), `FRONTEND_URL` to the public web URL, and `SESSION_SAME_SITE` according to your deployment (`lax` for same-site, `none` for cross-site HTTPS deployments).
- Use HTTPS, strong unique secrets, restricted database credentials, and production email credentials.
- Set `VITE_API_BASE_URL` in the frontend build to the API base (for example `https://api.example.com/api`).
- Configure Razorpay live keys and webhook secrets only in the server environment.

The customer API exposes accounts, balances, transfers, funding, and paginated activity. Admin endpoints expose customer/account/transaction operations to allowlisted administrators.
