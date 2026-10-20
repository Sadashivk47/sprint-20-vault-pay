import 'dotenv/config'; // Load .env FIRST before any other imports
import express from 'express';
import path from 'path';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import { seedDatabaseIfEmpty } from './server/db/database';
import authRoutes from './server/routes/auth';
import invoiceRoutes from './server/routes/invoices';
import webhookRoutes from './server/routes/webhooks';
import qaRoutes from './server/routes/qa';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Initialize DB and demo data
  seedDatabaseIfEmpty();

  // Basic security and CORS headers
  app.use(cors({
    origin: true,
    credentials: true,
  }));

  // REQUIREMENT 4: Stripe Webhook needs the RAW request body (not JSON-parsed)
  // Mount raw body parser specifically on the webhook path BEFORE general json parser
  app.use('/api/webhooks/stripe', express.raw({ type: '*/*' }));

  // General JSON and URL-encoded body parser for all other routes
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // API Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/invoices', invoiceRoutes);
  app.use('/api/webhooks', webhookRoutes);
  app.use('/api/qa', qaRoutes);

  // Health and System Info
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'healthy',
      system: 'VaultPay Financial Core',
      organization: 'Nexus Corporate Services',
      timestamp: new Date().toISOString(),
    });
  });

  // Vite development middleware or production static serving
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[VaultPay] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[VaultPay] Fatal startup failure:', err);
  process.exit(1);
});
