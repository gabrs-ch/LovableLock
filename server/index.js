import express from 'express';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
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
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self'",
      // 'unsafe-inline' em styles: o app.js usa atributos style="" (barras de progresso etc.)
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
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

// Rate-limit geral da API (limites mais estritos por rota em auth/couple)
app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições. Aguarde alguns minutos.' },
}));

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
