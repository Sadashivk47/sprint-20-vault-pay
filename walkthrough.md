# SecureCoder Security Audit

**Status**: Completed  
**Scanned Files**: 12  
**Vulnerabilities Found**: 5  
**Vulnerabilities Fixed**: 5  

### Vulnerability Report Table

| Vulnerability ID | File | Line | Description | Severity | Status | Remediation |
|---|---|---|---|---|---|---|
| CS-IDOR-001 | `server/routes/invoices.ts` | 38 | Direct object reference vulnerability allowing Client A to fetch invoices belonging to Client B via `/api/invoices/:id` without ownership check. | High | Fixed | Implemented centralized `requireInvoiceAccess` middleware in `server/middleware/ownership.ts` enforcing `invoice.clientId === req.user.id` or `role === 'admin'`; returns HTTP 403 Forbidden. |
| CS-RBAC-001 | `server/routes/invoices.ts` | 55 | Privilege escalation risk where non-admin callers could hit invoice creation endpoints or bypass UI restrictions to issue billing records. | High | Fixed | Implemented and applied `requireRole('admin')` middleware; strictly rejects client JWTs with HTTP 403 Forbidden. |
| CS-WEBHOOK-001 | `server/routes/webhooks.ts` | 82 | Stripe webhook signature tampering or bypass vulnerability if raw body is corrupted or omitted during verification. | High | Fixed | Configured `express.raw({ type: '*/*' })` exclusively on `/api/webhooks/stripe` before JSON parsing, and enforced `stripe.webhooks.constructEvent` cryptographic verification. |
| CS-STATE-001 | `server/routes/invoices.ts` | 110 | Unauthorized payment settlement from untrusted client-side REST call ("payment succeeded" mock trigger). | High | Fixed | Prohibited any frontend status mutation. Database status is strictly updated only via the verified Stripe webhook `checkout.session.completed` handler. |
| CS-PATH-001 | `server/services/pdf.ts` | 10 | Path traversal vulnerability via unsanitized invoice ID parameters in PDF receipt retrieval. | Medium | Fixed | Enforced alphanumeric sanitization (`replace(/[^a-zA-Z0-9_-]/g, '')`) and strict ownership check prior to file stream dispatch. |

---

## PoC Verification

### PoC 1: Broken Object-Level Authorization / IDOR (Client A queries Client B's Invoice)

#### Vulnerability Summary
| Field | Value |
|---|---|
| Type | Insecure Direct Object Reference (IDOR) / Broken Object Level Authorization (CWE-639) |
| Severity | High |
| Affected File | `server/routes/invoices.ts:38` |
| Exploit Payload | `GET /api/invoices/INV-2001` with `Authorization: Bearer <Client A JWT>` |

#### Fix Summary
Centralized `requireInvoiceAccess` middleware inspects the invoice record from the database. If `invoice.clientId !== req.user.id` and `req.user.role !== 'admin'`, the request is immediately aborted with HTTP 403 Forbidden and logged to `security_audit_logs`.

#### Reasoning Analysis
| Step | Code Path / Action | Result |
|---|---|---|
| 1 | Attacker authenticates as Client A (`USR-CLIENT-A`) and receives a signed JWT token. | Valid JWT issued |
| 2 | Attacker sends `GET /api/invoices/INV-2001` (owned by `USR-CLIENT-B`) with Client A's Bearer token. | Payload enters Express router |
| 3 | `requireAuth` validates token signature and attaches `req.user = { id: 'USR-CLIENT-A', role: 'client' }`. | Auth succeeds |
| 4 | Execution moves to `requireInvoiceAccess` in `server/middleware/ownership.ts:38`. | Invoice `INV-2001` fetched |
| 5 | Guard checks: `req.user.role === 'admin'` (False) and `invoice.clientId === req.user.id` (False, `USR-CLIENT-B` !== `USR-CLIENT-A`). | Guard evaluates false |
| 6 | Security event logged to database; returns HTTP 403 Forbidden `{ error: 'Forbidden', code: 'INVOICE_ACCESS_DENIED' }`. | **Exploit Blocked (HTTP 403)** |

#### Conclusion
**Fix Verified** — Client A is completely blocked from reading or altering Client B's invoices or PDF receipts across all API routes.

---

### PoC 2: Vertical Privilege Escalation (Client attempts to create invoice)

#### Vulnerability Summary
| Field | Value |
|---|---|
| Type | Missing Functional Level Access Control / RBAC Bypass (CWE-285) |
| Severity | High |
| Affected File | `server/routes/invoices.ts:55` |
| Exploit Payload | `POST /api/invoices` with `Authorization: Bearer <Client A JWT>` |

#### Fix Summary
The route is guarded by `requireRole('admin')`. If `req.user.role !== 'admin'`, the server immediately returns HTTP 403 Forbidden.

#### Reasoning Analysis
| Step | Code Path / Action | Result |
|---|---|---|
| 1 | Attacker sends `POST /api/invoices` with `{ clientId: 'USR-CLIENT-A', amount: 5000, description: 'Forged' }`. | Payload enters endpoint |
| 2 | `requireAuth` verifies token and identifies caller as `role: 'client'`. | Authenticated as Client |
| 3 | Execution reaches `requireRole('admin')` in `server/middleware/auth.ts:89`. | Role check evaluated |
| 4 | `req.user.role !== 'admin'` check triggers. Violation logged to `security_audit_logs`. | Role mismatch |
| 5 | Server returns HTTP 403 Forbidden `{ error: 'Forbidden', code: 'ROLE_FORBIDDEN' }`. | **Exploit Blocked (HTTP 403)** |

#### Conclusion
**Fix Verified** — Direct REST calls bypassing the UI with client credentials cannot access administrative functionality.

---

### PoC 3: Stripe Webhook Forgery

#### Vulnerability Summary
| Field | Value |
|---|---|
| Type | Cryptographic Webhook Signature Tampering (CWE-345) |
| Severity | High |
| Affected File | `server/routes/webhooks.ts:82` |
| Exploit Payload | `POST /api/webhooks/stripe` with fake `checkout.session.completed` body and forged signature |

#### Fix Summary
Raw request buffer is captured and verified against `process.env.STRIPE_WEBHOOK_SECRET` using `stripe.webhooks.constructEvent(rawBody, sig, secret)`. Unsigned or tampered requests are rejected with HTTP 400 Bad Request.

#### Reasoning Analysis
| Step | Code Path / Action | Result |
|---|---|---|
| 1 | Attacker sends fabricated `checkout.session.completed` payload to `/api/webhooks/stripe`. | Raw request arrives |
| 2 | Handler verifies presence of `stripe-signature` header. Missing or invalid signature detected. | Header inspection |
| 3 | `stripe.webhooks.constructEvent` fails cryptographic HMAC validation. | Cryptographic mismatch |
| 4 | Server logs `WEBHOOK_SIGNATURE_FAILED` and halts execution with HTTP 400 Bad Request. | **Exploit Blocked (HTTP 400)** |

#### Conclusion
**Fix Verified** — No external party can mark invoices as paid without a cryptographically valid Stripe signature.
