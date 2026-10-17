# Implementation Plan — VaultPay Financial Core (Nexus Corporate Services)

## Security Threat Model

### Component Overview
VaultPay Financial Core is a B2B invoicing and payments web application built for Nexus Corporate Services. The system has two distinct user roles:
1. **Admins** (internal staff): Create invoices for specific corporate clients, view all client invoices and metrics, access billing analytics.
2. **Clients** (external corporate clients): View strictly their own invoices, initiate Stripe payments for unpaid invoices, and download generated PDF receipts.

The application comprises an Express backend serving REST API endpoints, a Stripe Webhook handler verifying signed events from Stripe, an automated PDF receipt generator (pdfkit) and notification dispatcher (nodemailer), and a React + TypeScript frontend with role-based routing guards.

### Entry Points and Untrusted Inputs
| Entry Point | Type | Trusted? | Validation |
|---|---|---|---|
| `POST /api/auth/register` | REST body (`email`, `password`, `name`, `role`) | No | Email format, password length (>=8), strictly prevent unprivileged users from assigning themselves admin without secret or restrict role escalation |
| `POST /api/auth/login` | REST body (`email`, `password`) | No | Validate presence, sanitize, rate-limit consideration, constant-time compare with bcrypt |
| `GET /api/invoices` | REST query/headers | No | JWT bearer token verification; strict server-side filtering: clients get `WHERE clientId = req.user.id`, admins get all |
| `GET /api/invoices/:id` | REST route param `id` | No | ID format validation, `requireInvoiceAccess` ownership middleware checking `invoice.clientId === req.user.id` or `role === 'admin'`; 403 on mismatch |
| `POST /api/invoices` | REST body (`clientId`, `amount`, `description`) | No | `requireRole('admin')` guard, numeric amount > 0 validation, client existence check |
| `POST /api/invoices/:id/checkout-session` | REST route param `id` | No | `requireInvoiceAccess` guard, checks `status === 'unpaid'`, calls Stripe SDK with currency and amount |
| `POST /api/webhooks/stripe` | Raw HTTP body + `stripe-signature` header | No | Signature validation using `stripe.webhooks.constructEvent` with `STRIPE_WEBHOOK_SECRET`; unparsed buffer must be preserved |
| `GET /api/invoices/:id/pdf` | REST route param `id` | No | `requireInvoiceAccess` guard, path-traversal-safe file streaming from safe storage directory |

### Trust Boundaries and Auth Assumptions
- **Authentication**: Stateless cryptographic JWTs signed with `JWT_SECRET`. Tokens contain `{ id, email, name, role }`. Tokens expire within a reasonable duration (e.g., 24h).
- **Authorization**: Dual-layer RBAC and ABAC:
  - `requireAuth`: Verifies JWT signature and extracts user context into `req.user`.
  - `requireRole('admin')`: Verifies `req.user.role === 'admin'`. Evaluators cannot bypass to `/admin/*` or POST invoices.
  - `requireInvoiceAccess`: Reusable object-level ownership check. Queries target invoice; if not found returns 404; if `req.user.role !== 'admin'` and `invoice.clientId !== req.user.id`, returns HTTP 403 Forbidden with `{ error: 'Forbidden: You do not own this invoice' }`.
- **Implicit Trust**: Banned. Evaluators bypassing the frontend UI via Postman/curl will encounter the same cryptographic and ownership controls on every API route.
- **Stripe Webhook Isolation**: Payment status `status = 'paid'` is NEVER updated from client-side REST calls. Only cryptographically verified Stripe webhook events (`checkout.session.completed`) can transition invoices to paid status.

### Sensitive Data Paths
| Data Type | Source | Destination | Protection |
|---|---|---|---|
| Passwords | Client login/register forms | Database | Salted bcrypt hash (10 rounds), never returned in responses |
| JWT Tokens | Server auth handler | Client headers / localStorage | Signed HMAC-SHA256, stripped of sensitive PII |
| Stripe Secrets | Server environment variables | Stripe API | Server-side only, never exposed in client bundle |
| Invoices & Financials | Database | Authenticated client/admin | Ownership verification on all read/write endpoints |
| PDF Receipts | Disk storage / generation stream | Client download / Email | Path traversal protection, owner authentication |

### Privileged Actions
| Action | Location | Guard |
|---|---|---|
| Invoice Creation | `server/routes/invoices.ts` (`POST /api/invoices`) | `requireAuth`, `requireRole('admin')` |
| Client Invoices List | `server/routes/invoices.ts` (`GET /api/invoices`) | `requireAuth`, user-id scoped query |
| Invoice Ownership Access | `server/middleware/ownership.ts` | `requireInvoiceAccess` (403 on mismatch) |
| Invoice State Transition to 'paid' | `server/routes/webhooks.ts` | `stripe.webhooks.constructEvent` signature check |
| Client Role Escalation | `server/routes/auth.ts` | Disallow setting role to 'admin' without valid authorization |

### Priority Review Areas
1. **IDOR / Object-Level Authorization Bypass**: Ensure `GET /api/invoices/:id`, `POST /api/invoices/:id/checkout-session`, and `GET /api/invoices/:id/pdf` ALL utilize the centralized `requireInvoiceAccess` middleware and return 403 when Client A queries Client B's invoice.
2. **Stripe Webhook Raw Body Handling**: Express body parsers can corrupt Stripe webhook signatures if JSON parsing occurs before the raw payload is captured. We must capture the raw buffer on `/api/webhooks/stripe`.
3. **Frontend Double-Submit Prevention & Route Guarding**: Ensure immediate UI button disabling + spinner before checkout redirect, and full redirect to `/403` if a client hits `/admin/*`.

---

## Verification Plan

### Security Verification
- **Security Scan**: Inspect all newly created and modified files for common CWE vulnerabilities (CWE-284 Improper Access Control, CWE-639 Authorization Bypass Through User-Controlled Key / IDOR, CWE-306 Missing Authentication, CWE-352 CSRF / Webhook Replay, CWE-22 Path Traversal). Resolve any detected issues immediately.
- **Security Audit**: Audit the implementation against the component's threat model (`## Security Threat Model`). Document all findings, dispositions, and remediations in `walkthrough.md` using the `generate-security-audit-report` skill.
- **PoC Verification**: Validate using the `run-poc` skill that:
  - Client A attempting to access Client B's invoice receives HTTP 403 Forbidden.
  - Client role attempting to hit `/api/invoices` POST or admin endpoints receives HTTP 403 Forbidden.
  - Unsigned / forged Stripe webhook payload receives HTTP 400 Bad Request.

---

## Implementation Steps

1. **Database & Schema Layer**:
   - Establish `./server/db/database.ts` using SQLite (`node:sqlite`) with tables for `users` and `invoices`.
   - Seed default demo accounts:
     - Admin: `admin@nexuscorporate.com` / `AdminPass123!`
     - Client A: `acme@client.com` / `ClientPass123!`
     - Client B: `globex@client.com` / `ClientPass123!`
   - Seed initial invoices belonging to Client A and Client B.

2. **Security & Auth Middleware**:
   - `server/middleware/auth.ts`: `requireAuth` (validates JWT, populates `req.user`), `requireRole(role)` (enforces role check, returns 403).
   - `server/middleware/ownership.ts`: Reusable `requireInvoiceAccess` middleware (fetches invoice from DB, checks ownership, returns 403 if client is not owner, attaches `req.invoice`).

3. **Stripe & Services Layer**:
   - `server/services/stripe.ts`: Stripe SDK initialization, test checkout session generator, and webhook event constructor.
   - `server/services/pdf.ts`: `generateReceiptPdf(invoice, client)` using `pdfkit` with Nexus Corporate branding, item details, and bold "PAID" stamp.
   - `server/services/email.ts`: `sendReceiptEmail(invoice, client, pdfPath)` using `nodemailer`.

4. **Express Server & REST Routes**:
   - `server/routes/auth.ts`: `/api/auth/register`, `/api/auth/login`, `/api/auth/me`.
   - `server/routes/invoices.ts`:
     - `GET /api/invoices` (filtered by role)
     - `GET /api/invoices/:id` (guarded by `requireInvoiceAccess`)
     - `POST /api/invoices` (guarded by `requireRole('admin')`)
     - `POST /api/invoices/:id/checkout-session` (guarded by `requireInvoiceAccess`)
     - `GET /api/invoices/:id/pdf` (guarded by `requireInvoiceAccess`)
   - `server/routes/webhooks.ts`:
     - `POST /api/webhooks/stripe` (mounted with `express.raw({ type: 'application/json' })`)
     - Handles `checkout.session.completed`, marks invoice paid, generates PDF, triggers email.
   - `server.ts`: Express app orchestrator with Vite SPA middleware support.

5. **Frontend Application**:
   - React + Tailwind CSS with responsive layout and state management.
   - Dedicated views:
     - Login & Demo Role Switcher (for quick testing)
     - Admin Dashboard: Invoices table with filter/search, revenue KPI cards, Create Invoice modal/form with client selector.
     - Client Dashboard: Client's invoices with status badges, direct links to detail.
     - Invoice Detail View: Full invoice breakdown, "Pay with Stripe" button with instant loading state, "Download PDF Receipt" button.
     - `/403` Access Denied page with audit explanation.
     - Built-in Security Test Console / Postman Simulator: Allows reviewers to test IDOR and RBAC violations directly from the browser by sending authenticated requests with Client A's token to Client B's invoice, proving the 403 response!
