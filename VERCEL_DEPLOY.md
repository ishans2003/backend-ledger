# Vercel deployment

Deploy this repository as two Vercel projects so the frontend can use a same-origin API proxy for session cookies.

## Backend project

Create a Vercel project with the repository as its root directory. Vercel serves `api/[...path].js` as the Express API function. Add these Production environment variables before deploying:

- `NODE_ENV=production`
- `MONGO_URI`: a production MongoDB URI reachable from Vercel (for example, a MongoDB Atlas cluster)
- `JWT_SECRET`: a unique random secret of at least 32 characters
- `FRONTEND_ORIGINS`: the exact frontend production origin, such as `https://ledger-web.vercel.app`
- `FRONTEND_URL`: the same frontend origin, used for email links
- `SESSION_SAME_SITE=lax`
- `TRUST_PROXY=true`

Add `ADMIN_EMAILS`, email delivery settings, and Razorpay live credentials only if those features are needed. Keep payment secrets in the backend project only.

Deploy the backend and note its origin, such as `https://ledger-api.vercel.app`.

## Frontend project

Create a second Vercel project from the same repository and set its Root Directory to `frontend`. Vercel detects Vite; use `npm run build` and `dist` as the output directory. Set this Production environment variable:

- `BACKEND_URL`: the backend origin from the previous step, without a trailing slash or `/api`

The `frontend/api/[...path].js` function forwards `/api/*` requests and cookies to the backend. `frontend/vercel.json` sends client-side routes to `index.html`.

After the frontend deploys, copy its exact production origin into the backend's `FRONTEND_ORIGINS` and `FRONTEND_URL` values, then redeploy the backend.

## CLI alternative

After authenticating with `vercel login`, link and deploy each project from its root directory. Add the environment variables through the Vercel project settings or `vercel env add` before production deployments. Do not deploy using the development `.env` values: the database must be remotely reachable, and production secrets should be unique to the deployment.
