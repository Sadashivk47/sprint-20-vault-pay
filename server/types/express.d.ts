import { DbUser, DbInvoice } from '../db/database';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        name: string;
        role: 'admin' | 'client';
      };
      invoice?: DbInvoice;
      rawBody?: Buffer;
    }
  }
}
