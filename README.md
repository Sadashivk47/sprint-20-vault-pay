# VaultPay Financial Core

> **Sprint 20 — Client Delivery Phase III: Finance & Security**
> Built for **Nexus Corporate Services** — A secure, role-based invoicing portal with Stripe payments, automated PDF receipts, and webhook-driven settlement.

---

## 🏗️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS 4 |
| Backend | Node.js + Express + TypeScript |
| Database | SQLite (node:sqlite) |
| Payments | Stripe Checkout + Webhooks |
| PDF Generation | pdfkit |
| Email | Nodemailer (Gmail SMTP) |
| Auth | JWT (jsonwebtoken) + bcrypt |

---

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Create .env file (see Environment Variables below)
cp .env.example .env

# Start development server
npm run dev
```

The app runs at **http://localhost:3000**

### Stripe Webhook Forwarding (Development)

```bash
# In a separate terminal
stripe login
stripe listen --events checkout.session.completed --forward-to localhost:3000/api/webhooks/stripe
```

---

## 🔐 Demo Credentials

| Role | Email | Password |
|---|---|---|
| Admin | `admin@nexuscorporate.com` | `AdminPass123!` |
| Client A (Acme) | `client.acme@nexus.com` | `ClientPass123!` |
| Client B (Globex) | `client.globex@nexus.com` | `ClientPass123!` |
| Client C (Soylent) | `client.soylent@nexus.com` | `ClientPass123!` |

**Stripe Test Card:** `4242 4242 4242 4242` | Exp: `12/30` | CVC: `123`

---

## 🔑 Environment Variables

Create a `.env` file in the project root:

```env
# JWT
JWT_SECRET=your_jwt_secret_here

# Stripe
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret

# Email (Gmail SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_gmail_app_password
SMTP_FROM=billing@nexuscorporate.com
```

---

## 📁 Project Architecture

```
sprint-20-vault-pay/
├── server.ts                    # Express entry point
├── server/
│   ├── routes/
│   │   ├── auth.ts              # Login, /me, demo-accounts
│   │   ├── invoices.ts          # CRUD + PDF download + checkout session
│   │   ├── webhooks.ts          # Stripe webhook receiver (signature verification)
│   │   └── qa.ts                # Evaluator/QA tools (webhook simulator, email tester)
│   ├── middleware/
│   │   ├── auth.ts              # JWT verification + requireRole()
│   │   └── ownership.ts         # IDOR prevention — requireInvoiceAccess()
│   ├── services/
│   │   ├── stripe.ts            # Stripe Checkout session creation
│   │   ├── pdf.ts               # pdfkit receipt generation
│   │   └── email.ts             # Nodemailer dispatch
│   └── db/
│       └── database.ts          # SQLite schema, CRUD, seed data
├── src/
│   ├── App.tsx                  # Main routing + RBAC guards + payment redirect
│   ├── components/
│   │   ├── LoginView.tsx        # Authentication UI
│   │   ├── AdminDashboard.tsx   # Admin: all invoices, create invoice, revenue
│   │   ├── ClientDashboard.tsx  # Client: own invoices only
│   │   ├── InvoiceDetailPage.tsx# Invoice detail + pay + download PDF
│   │   ├── ForbiddenView.tsx    # 403 page for unauthorized access
│   │   ├── EvaluatorToolsDrawer.tsx  # QA tools panel
│   │   └── SecurityConsoleModal.tsx  # Postman-style security audit tool
│   ├── context/AuthContext.tsx  # JWT auth state management
│   ├── services/api.ts         # API client with auth headers
│   └── types.ts                # TypeScript interfaces
└── .env                        # Environment variables (not committed)
```

---

## 🛡️ Security Features

### RBAC (Role-Based Access Control)
- **Admin** sees all invoices across all clients, can create invoices
- **Client** sees only their own invoices
- Frontend route guards: client accessing `/admin/*` → instant 403 page
- Backend middleware: `requireRole('admin')` blocks API-level access

### IDOR Prevention (Insecure Direct Object Reference)
- `requireInvoiceAccess()` middleware on every invoice endpoint
- Server checks `invoice.clientId === user.id` before returning data
- Client A requesting Client B's invoice → `403 Forbidden`

### Stripe Webhook Verification
- `stripe.webhooks.constructEvent()` with HMAC-SHA256 signature verification
- Database marked PAID **only** through verified webhook — never from frontend
- Raw body parsing on webhook route to preserve signature integrity

---

## 💳 Payment Flow

```
Client clicks "Pay Invoice"
    ↓ (button disabled + spinner immediately)
Server creates Stripe Checkout Session
    ↓
Client redirected to checkout.stripe.com
    ↓
Client pays with test card
    ↓
Stripe redirects back to VaultPay (success banner shown)
    ↓
Stripe servers → POST /api/webhooks/stripe
    ↓
Server verifies cryptographic signature
    ↓
Database invoice status → "paid"
    ↓
pdfkit generates PDF receipt
    ↓
Nodemailer emails PDF to client
```

---

## 📄 Key API Endpoints

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/login` | Public | Login, returns JWT |
| GET | `/api/auth/me` | JWT | Current user info |
| GET | `/api/invoices` | JWT | List invoices (role-filtered) |
| GET | `/api/invoices/:id` | JWT + Ownership | Invoice detail (IDOR-protected) |
| POST | `/api/invoices` | JWT + Admin | Create invoice |
| POST | `/api/invoices/:id/checkout-session` | JWT + Ownership | Create Stripe session |
| GET | `/api/invoices/:id/pdf` | JWT + Ownership | Download PDF receipt |
| POST | `/api/webhooks/stripe` | Stripe Signature | Webhook receiver |

---

## 👨‍💻 Author

Built as part of **Prodesk IT** Sprint 20 — Client Delivery Phase III (Finance & Security).

---
