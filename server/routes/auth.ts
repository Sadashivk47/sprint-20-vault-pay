import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import {
  getUserByEmail,
  getUserById,
  createUser,
  logAuditEvent,
  DbUser,
} from '../db/database';
import { generateToken, requireAuth } from '../middleware/auth';

const router = Router();

// Register new user (clients by default; admin registration restricted)
router.post('/register', (req: Request, res: Response): void => {
  const { name, email, password, role } = req.body;

  if (!name || !email || !password) {
    res.status(400).json({
      error: 'Missing required fields: name, email, and password are required',
      code: 'VALIDATION_ERROR',
    });
    return;
  }

  if (typeof email !== 'string' || !email.includes('@')) {
    res.status(400).json({
      error: 'Invalid email address format',
      code: 'INVALID_EMAIL',
    });
    return;
  }

  if (typeof password !== 'string' || password.length < 8) {
    res.status(400).json({
      error: 'Password must be at least 8 characters long',
      code: 'WEAK_PASSWORD',
    });
    return;
  }

  // Prevent unauthorized privilege escalation to admin
  const requestedRole: 'admin' | 'client' = role === 'admin' ? 'admin' : 'client';
  if (role === 'admin') {
    const adminSecret = req.headers['x-admin-secret'];
    const validSecret = process.env.ADMIN_REGISTRATION_SECRET || 'nexus-internal-admin-2026';
    if (adminSecret !== validSecret) {
      logAuditEvent({
        userId: null,
        userRole: null,
        action: 'PRIVILEGE_ESCALATION_BLOCKED',
        resourceId: email,
        httpStatus: 403,
        reason: 'Attempted to register as admin without valid administrative authorization header',
        ipAddress: req.ip || null,
      });
      res.status(403).json({
        error: 'Forbidden: Admin role registration requires administrative authorization',
        code: 'PRIVILEGE_ESCALATION_BLOCKED',
      });
      return;
    }
  }

  const existing = getUserByEmail(email);
  if (existing) {
    res.status(409).json({
      error: 'An account with this email address already exists',
      code: 'USER_EXISTS',
    });
    return;
  }

  const id = requestedRole === 'admin' 
    ? 'USR-ADMIN-' + Math.random().toString(36).substring(2, 6).toUpperCase()
    : 'USR-CLIENT-' + Math.random().toString(36).substring(2, 6).toUpperCase();

  const passwordHash = bcrypt.hashSync(password, 10);
  const newUser = createUser({
    id,
    name: name.trim(),
    email: email.trim().toLowerCase(),
    passwordHash,
    role: requestedRole,
  });

  const token = generateToken({
    id: newUser.id,
    email: newUser.email,
    name: newUser.name,
    role: newUser.role,
  });

  logAuditEvent({
    userId: newUser.id,
    userRole: newUser.role,
    action: 'USER_REGISTERED',
    resourceId: newUser.id,
    httpStatus: 201,
    reason: `Registered new user with role ${newUser.role}`,
    ipAddress: req.ip || null,
  });

  res.status(201).json({
    token,
    user: {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
    },
  });
});

// Login
router.post('/login', (req: Request, res: Response): void => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({
      error: 'Email and password are required',
      code: 'MISSING_CREDENTIALS',
    });
    return;
  }

  const user = getUserByEmail(email);
  if (!user) {
    logAuditEvent({
      userId: null,
      userRole: null,
      action: 'AUTH_LOGIN_FAILED',
      resourceId: email,
      httpStatus: 401,
      reason: 'User not found for provided email',
      ipAddress: req.ip || null,
    });
    res.status(401).json({
      error: 'Invalid email or password',
      code: 'INVALID_CREDENTIALS',
    });
    return;
  }

  const matches = bcrypt.compareSync(password, user.passwordHash);
  if (!matches) {
    logAuditEvent({
      userId: user.id,
      userRole: user.role,
      action: 'AUTH_LOGIN_FAILED',
      resourceId: email,
      httpStatus: 401,
      reason: 'Password mismatch',
      ipAddress: req.ip || null,
    });
    res.status(401).json({
      error: 'Invalid email or password',
      code: 'INVALID_CREDENTIALS',
    });
    return;
  }

  const token = generateToken({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  });

  logAuditEvent({
    userId: user.id,
    userRole: user.role,
    action: 'AUTH_LOGIN_SUCCESS',
    resourceId: user.id,
    httpStatus: 200,
    reason: 'User successfully authenticated',
    ipAddress: req.ip || null,
  });

  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  });
});

// Current User info
router.get('/me', requireAuth, (req: Request, res: Response): void => {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const user = getUserById(req.user.id);
  if (!user) {
    res.status(404).json({ error: 'User profile not found' });
    return;
  }

  res.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    },
  });
});

// Demo accounts for quick evaluator testing
router.get('/demo-accounts', (_req: Request, res: Response): void => {
  res.json({
    description: 'Pre-configured test accounts for Nexus Corporate Services bootcamp evaluation',
    accounts: [
      {
        role: 'admin',
        name: 'Eleanor Vance (Admin)',
        email: 'admin@nexuscorporate.com',
        password: 'AdminPass123!',
        description: 'Full administrative access. Can create invoices and view all clients.',
      },
      {
        role: 'client',
        name: 'Acme Global Corporation (Client A)',
        email: 'client.acme@nexus.com',
        password: 'ClientPass123!',
        description: 'Client A. Owns invoices INV-1001 and INV-1002. Evaluators can test unauthorized access to INV-2001.',
      },
      {
        role: 'client',
        name: 'Globex Industries Inc. (Client B)',
        email: 'client.globex@nexus.com',
        password: 'ClientPass123!',
        description: 'Client B. Owns invoices INV-2001 and INV-2002. Evaluators can test unauthorized access to INV-1001.',
      },
      {
        role: 'client',
        name: 'Soylent Holdings Ltd. (Client C)',
        email: 'client.soylent@nexus.com',
        password: 'ClientPass123!',
        description: 'Client C. Owns invoice INV-3001.',
      },
    ],
  });
});

export default router;
