# PROMPTS.md — AI Transparency & Learning Log

> Sprint 20 | VaultPay Financial Core
> This document records the AI-assisted prompts, questions, and learning moments encountered while building this project.

---

## 1. Stripe Webhook Signature Verification

**Prompt / Question:**
> "How do I verify that a webhook POST to `/api/webhooks/stripe` actually came from Stripe and not someone spoofing the request?"

**What I Learned:**
- Stripe signs every webhook payload with HMAC-SHA256 using your webhook secret.
- You **must** use `stripe.webhooks.constructEvent(rawBody, signatureHeader, webhookSecret)` — this mathematically verifies the signature.
- The raw body must be preserved — if Express parses it as JSON first, the signature won't match. This requires a special `express.raw({ type: 'application/json' })` middleware on the webhook route only.
- Never trust the frontend to tell you a payment succeeded. The webhook is the single source of truth.

**Code Reference:** `server/routes/webhooks.ts` — `stripe.webhooks.constructEvent()`

---

## 2. IDOR (Insecure Direct Object Reference) Prevention

**Prompt / Question:**
> "If Client A is logged in and manually changes the URL to `/api/invoices/INV-2001` (which belongs to Client B), what stops them from seeing it?"

**What I Learned:**
- JWT authentication alone is NOT enough. It tells you *who* the user is, but not *what they own*.
- You need an ownership middleware that checks `invoice.clientId === authenticatedUser.id` on every single invoice endpoint.
- Admin users bypass this check (they need to see everything).
- This is called IDOR prevention — one of the OWASP Top 10 vulnerabilities.

**Code Reference:** `server/middleware/ownership.ts` — `requireInvoiceAccess()`

---

## 3. Preventing Double-Charge on Payment Button

**Prompt / Question:**
> "What if the user double-clicks the Pay button before the Stripe redirect happens? Could they get charged twice?"

**What I Learned:**
- The `setPaying(true)` state must fire **synchronously** — before any `await` call.
- The button's `disabled={paying}` attribute immediately prevents a second click.
- A loading spinner provides visual feedback that something is happening.
- This is a critical UX pattern for any financial application.

**Code Reference:** `src/components/InvoiceDetailPage.tsx` — `handlePay()`

---

## 4. Environment Variables Not Loading (dotenv)

**Prompt / Question:**
> "I set STRIPE_SECRET_KEY in my .env file but the server keeps falling back to mock mode. Why?"

**What I Learned:**
- Node.js does NOT automatically load `.env` files. You need `import 'dotenv/config'` at the very top of your entry file.
- The import must come BEFORE any other imports that read `process.env`.
- Without it, `process.env.STRIPE_SECRET_KEY` is `undefined` and the app silently falls back to mock/demo behavior.
- This is a common gotcha — the app "works" but with fake data, giving no error.

**Code Reference:** `server.ts` — line 1: `import 'dotenv/config'`

---

## 5. PDF Download Authentication Problem

**Prompt / Question:**
> "The Download PDF button uses an `<a href='...'>` tag but it returns a 401. How do I send the JWT with a file download?"

**What I Learned:**
- Browser `<a>` tags and `window.open()` cannot send custom HTTP headers (like `Authorization: Bearer`).
- The solution is to use `fetch()` with the auth header, convert the response to a `Blob`, create a temporary URL with `URL.createObjectURL()`, and trigger a programmatic download.
- This is a pattern needed any time you have an authenticated file download endpoint.

**Code Reference:** `src/components/InvoiceDetailPage.tsx` — `handleDownloadPdf()`

---

## 6. Stripe CLI for Local Webhook Testing

**Prompt / Question:**
> "Stripe webhooks need to reach my server, but I'm on localhost behind a router. How do I test this?"

**What I Learned:**
- Stripe CLI can forward webhook events to your local machine: `stripe listen --events checkout.session.completed --forward-to localhost:3000/api/webhooks/stripe`
- It generates a temporary webhook signing secret (`whsec_...`) that you put in your `.env`.
- The CLI session expires after a few hours — you need to `stripe login` again.
- In production (Render/Vercel), you configure the webhook URL in the Stripe Dashboard and use the permanent webhook secret.

---

## 7. Role-Based Route Guards (Frontend + Backend)

**Prompt / Question:**
> "How do I prevent a client from accessing the admin dashboard — both in the UI and at the API level?"

**What I Learned:**
- **Frontend guard:** Check `user.role` before rendering admin components. If a client navigates to an admin route, render a `403 Forbidden` page.
- **Backend guard:** `requireRole('admin')` middleware returns `403` before the route handler runs.
- Both layers are necessary — the frontend guard is for UX, the backend guard is for security.
- Never rely on frontend-only security — anyone can use Postman or curl to hit your API directly.

**Code Reference:** `server/middleware/auth.ts` — `requireRole()`, `src/App.tsx` — `handleNavigateToAdminRoute()`

---

## 8. Automated Post-Payment Pipeline

**Prompt / Question:**
> "After a payment is confirmed via webhook, how do I automatically generate a PDF and send an email in one flow?"

**What I Learned:**
- The webhook handler becomes an orchestrator: verify signature → update DB → generate PDF → send email.
- Each step is in a try/catch so one failure doesn't break the others.
- `pdfkit` creates PDFs programmatically — you create a document, add text/shapes, and pipe it to a file.
- `nodemailer` connects to Gmail SMTP and sends the PDF as an attachment using a Buffer.
- Gmail requires an "App Password" (not your regular password) when 2FA is enabled.

**Code Reference:** `server/routes/webhooks.ts` — `settleInvoiceFromWebhook()`

---

## 9. Raw Body Parsing for Webhooks

**Prompt / Question:**
> "Stripe webhook signature verification keeps failing with 'No signatures found matching the expected signature'. What's wrong?"

**What I Learned:**
- Express's `express.json()` middleware parses the body and changes it from a raw Buffer to a JS object.
- Stripe's signature is computed over the raw bytes — so if Express already parsed it, the signature won't match.
- The fix is to use `express.raw({ type: 'application/json' })` specifically on the webhook route, and mount it BEFORE the global `express.json()` middleware.

**Code Reference:** `server.ts` — webhook route mounted before JSON body parser

---

## Tools Used

| Tool | Purpose |
|---|---|
| **AI Assistant** | Architecture guidance, debugging dotenv issues, Stripe webhook configuration, IDOR pattern implementation |
| **Stripe Docs** | Checkout Session API, webhook signature verification, test cards |
| **pdfkit Docs** | PDF document creation API |
| **Nodemailer Docs** | SMTP transport configuration, Gmail App Password setup |
| **Stripe CLI** | Local webhook forwarding during development |

---

*All AI assistance was used as a learning tool. Each concept was understood, implemented, and tested independently.*
