# Vercel multi-service deployment

The root `vercel.json` defines two services in one Vercel project:

- `frontend` builds the Vite app from `frontend/` and serves the client-side routes.
- `app` runs the Express app from the repository root.

The top-level rewrites expose `/api/*` through `app` and all other paths through `frontend`, on the same Vercel domain. The frontend already uses `/api` as its default API base. Browser requests pass through Vercel's public routing layer; neither service makes a server-side request to the other, so no service binding is needed.

Configure these project environment variables in Vercel before deploying:

- `MONGO_URI`: a production MongoDB URI reachable from Vercel
- `JWT_SECRET`: a unique random secret at least 32 characters long
- `NODE_ENV=production`
- `TRUST_PROXY=true`
- `SESSION_SAME_SITE=lax`
- `FRONTEND_URL`: the production Vercel domain, used to build email links
- `FRONTEND_ORIGINS`: comma-separated allowed origins for any cross-origin clients; same-origin requests on the Vercel domain are allowed directly

Add `ADMIN_EMAILS`, email delivery settings, and Razorpay credentials only when needed. Store Razorpay secrets as Vercel environment variables; never put them in frontend variables. Use newly rotated credentials, not values previously exposed in chat.

Vercel builds both services under the same project and deployment. For local Vercel routing and generated service bindings, use `vercel dev` (or `vercel dev -L` without Cloud authentication).
