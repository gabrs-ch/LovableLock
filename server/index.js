import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerAuthRoutes } from './auth.js';
import { registerCoupleRoutes } from './couple.js';
import { registerFinanceRoutes } from './finance.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json({ limit: '64kb' }));
app.use(cookieParser());

// Pequeno cabeçalho de segurança — sem dependência extra
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

registerAuthRoutes(app);
registerCoupleRoutes(app);
registerFinanceRoutes(app);

app.get('/api/health', (req, res) => res.json({ ok: true, app: 'LovableLock' }));

const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));
app.get('*', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`💞 LovableLock rodando em http://localhost:${port}`);
});
