import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { registerAuthRoutes } from './auth.js';
import { registerCoupleRoutes } from './couple.js';
import { registerFinanceRoutes } from './finance.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// JWT_SECRET é obrigatório — falha rápido no boot
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('✗ JWT_SECRET ausente ou curto demais (mínimo 32 caracteres).');
  console.error('  Gere um e exporte: openssl rand -hex 32');
  process.exit(1);
}

// Garante que o diretório do banco existe
const dbDir = path.join(__dirname, '..', 'db');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const app = express();
app.disable('x-powered-by');

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

app.use(express.json({ limit: '64kb' }));
app.use(cookieParser());

// Cabeçalhos de segurança
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ')
  );
  next();
});

registerAuthRoutes(app);
registerCoupleRoutes(app);
registerFinanceRoutes(app);

app.get('/api/health', (req, res) => res.json({ ok: true, app: 'LovableLock' }));

// 404 explícito para qualquer /api/* que não tenha rota
app.use('/api', (req, res) => res.status(404).json({ error: 'Endpoint não encontrado' }));

const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));
app.get('*', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`💞 LovableLock rodando em http://localhost:${port}`);
});
