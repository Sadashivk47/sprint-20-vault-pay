import { Request, Response, NextFunction } from 'express';
import { getInvoiceById, logAuditEvent } from '../db/database';

/**
 * Reusable zero-trust ownership check middleware for invoice resources.
 * 
 * Rules:
 * 1. Requires valid authentication (req.user must be populated).
 * 2. Fetches the target invoice by route param `id`.
 * 3. Returns 404 if the invoice does not exist.
 * 4. Checks ownership:
 *    - Admin role has full system read/write access.
 *    - Client role can ONLY access their own invoices (`invoice.clientId === req.user.id`).
 * 5. Returns HTTP 403 Forbidden with detailed security code if ownership check fails.
 * 6. Attaches verified `req.invoice` for subsequent downstream handlers.
 */
export function requireInvoiceAccess(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({
      error: 'Unauthorized: Authentication required before checking resource ownership',
      code: 'AUTH_REQUIRED',
    });
    return;
  }

  const invoiceId = req.params.id;
  if (!invoiceId) {
    res.status(400).json({
      error: 'Bad Request: Missing invoice ID in route parameter',
      code: 'PARAM_MISSING',
    });
    return;
  }

  const invoice = getInvoiceById(invoiceId);
  if (!invoice) {
    res.status(404).json({
      error: `Invoice with ID '${invoiceId}' was not found`,
      code: 'INVOICE_NOT_FOUND',
      invoiceId,
    });
    return;
  }

  // Admin bypass
  if (req.user.role === 'admin') {
    req.invoice = invoice;
    next();
    return;
  }

  // Client ownership verification
  if (invoice.clientId === req.user.id) {
    req.invoice = invoice;
    next();
    return;
  }

  // IDOR violation detected
  logAuditEvent({
    userId: req.user.id,
    userRole: req.user.role,
    action: 'IDOR_ACCESS_DENIED',
    resourceId: invoiceId,
    httpStatus: 403,
    reason: `Client user ${req.user.id} (${req.user.email}) attempted unauthorized access to invoice ${invoiceId} owned by client ${invoice.clientId}`,
    ipAddress: req.ip || null,
  });

  res.status(403).json({
    error: 'Forbidden: You do not have permission to access or view this invoice',
    code: 'INVOICE_ACCESS_DENIED',
    invoiceId,
    requestedBy: req.user.id,
  });
}
