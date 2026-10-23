# Ledger frontend

React, TypeScript, Tailwind CSS, Redux Toolkit, and Axios frontend for the Ledger API.

## Run locally

1. Start the backend from the repository root with `npm run dev` (port `3000` by default).
2. In `frontend/`, run `npm install` once, then `npm run dev`.
3. Open the Vite URL shown in the terminal (usually `http://localhost:5173`).

Vite proxies `/api` requests to `http://localhost:3000`. Set `VITE_API_BASE_URL` in a local `.env` file to change the API base URL. See `.env.example` for the default.

## Available functionality

- Register, sign in, and sign out.
- Verify email, resend verification links, request password resets, and set a new password.
- Create accounts and view current balances.
- Add funds with Razorpay Checkout and view payment/refund activity.
- Transfer funds to another Ledger account using its account ID; the backend checks balances and records both ledger entries atomically.
- View paginated account activity.
- Administrators can search customers, suspend/restore customer accounts, freeze/reactivate ledger accounts, and review transactions. Server-side access is controlled by `ADMIN_EMAILS`.
- Redux Toolkit manages session/profile, account, and activity state. Axios uses the HTTP-only session cookie and obtains a signed CSRF token for state-changing requests.

Email links are printed in the backend terminal in development when email delivery is not configured. Online funding requires Razorpay keys and a webhook secret configured on the backend; it is disabled until those values are present.
