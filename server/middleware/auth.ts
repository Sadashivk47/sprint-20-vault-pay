import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { logAuditEvent } from '../db/database';

export const JWT_SECRET = process.env.JWT_SECRET || 'vaultpay-super-secret-jwt-signing-key-production-grade';

export interface JwtPayload {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'client';
  iat?: number;
  exp?: number;
}

export function generateToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    logAuditEvent({
      userId: null,
      userRole: null,
      action: 'API_AUTH_MISSING',
      resourceId: req.originalUrl,
      httpStatus: 401,
      reason: 'Missing or malformed Authorization Bearer header',
      ipAddress: req.ip || null,
    });
    res.status(401).json({
      error: 'Unauthorized: Missing or invalid authentication token',
      code: 'AUTH_REQUIRED',
    });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;

    if (!decoded.id || !decoded.role) {
      logAuditEvent({
        userId: decoded.id || null,
        userRole: decoded.role || null,
        action: 'API_AUTH_INVALID_CLAIMS',
        resourceId: req.originalUrl,
        httpStatus: 401,
        reason: 'Token missing required user identity claims',
        ipAddress: req.ip || null,
      });
      res.status(401).json({
        error: 'Unauthorized: Malformed token claims',
        code: 'INVALID_CLAIMS',
      });
      return;
    }

    req.user = {
      id: decoded.id,
      email: decoded.email,
      name: decoded.name,
      role: decoded.role,
    };

    next();
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Invalid token';
    logAuditEvent({
      userId: null,
      userRole: null,
      action: 'API_AUTH_FAILED',
      resourceId: req.originalUrl,
      httpStatus: 401,
      reason: `JWT verification failure: ${errorMessage}`,
      ipAddress: req.ip || null,
    });
    res.status(401).json({
      error: 'Unauthorized: Invalid or expired token',
      code: 'TOKEN_INVALID',
    });
  }
}

export function requireRole(allowedRole: 'admin' | 'client') {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized: Authentication required' });
      return;
    }

    if (req.user.role !== allowedRole) {
      logAuditEvent({
        userId: req.user.id,
        userRole: req.user.role,
        action: 'RBAC_ROLE_DENIED',
        resourceId: req.originalUrl,
        httpStatus: 403,
        reason: `User with role '${req.user.role}' attempted to access endpoint restricted to '${allowedRole}'`,
        ipAddress: req.ip || null,
      });

      res.status(403).json({
        error: `Forbidden: Endpoint requires role '${allowedRole}', but user has role '${req.user.role}'`,
        code: 'ROLE_FORBIDDEN',
        requiredRole: allowedRole,
        currentRole: req.user.role,
      });
      return;
    }

    next();
  };
}
