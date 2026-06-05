import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import db from './db.js';

const JWT_SECRET = process.env.JWT_SECRET;
const COOKIE_NAME = 'll_token';
const TOKEN_TTL = '7d';
const IS_PROD = process.env.NODE_ENV === 'production';

// Senha forte: >=8, 1 maiúscula, 1 minúscula, 1 dígito, 1 especial
const strongPassword = z.string()
  .min(8, 'Mínimo de 8 caracteres')
  .max(128)
  .refine(v => /[A-Z]/.test(v), 'Precisa de letra maiúscula')
  .refine(v => /[a-z]/.test(v), 'Precisa de letra minúscula')
  .refine(v => /\d/.test(v), 'Precisa de dígito numérico')
  .refine(v => /[^A-Za-z0-9]/.test(v), 'Precisa de caractere especial');

const registerSchema = z.object({
  email: z.string().email('Email inválido').max(160).transform(s => s.trim().toLowerCase()),
  name: z.string().min(1, 'Nome obrigatório').max(60),
  password: strongPassword,
});

const loginSchema = z.object({
  email: z.string().email().transform(s => s.trim().toLowerCase()),
  password: z.string().min(1).max(128),
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Tente novamente em alguns minutos.' },
});

// Limita por conta-alvo (email), não por IP — barra brute-force distribuído contra um usuário
const loginAccountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) =>
    typeof req.body?.email === 'string'
      ? `email:${req.body.email.trim().toLowerCase()}`
      : ipKeyGenerator(req.ip),
  message: { error: 'Muitas tentativas para esta conta. Tente novamente em alguns minutos.' },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitos cadastros a partir deste IP. Tente novamente mais tarde.' },
});

function signToken(userId) {
  return jwt.sign({ uid: userId }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: IS_PROD,
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, cookieOptions());
}

export function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'Não autenticado' });
  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    const user = db.prepare(
      'SELECT id, email, name, cash_balance, couple_id FROM users WHERE id = ?'
    ).get(payload.uid);
    if (!user) return res.status(401).json({ error: 'Sessão inválida' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Sessão expirada' });
  }
}

export function registerAuthRoutes(app) {
  app.post('/api/auth/register', registerLimiter, async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0].message });
    }
    const { email, name, password } = parsed.data;
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) return res.status(409).json({ error: 'Email já cadastrado' });

    const hash = await bcrypt.hash(password, 12);
    const info = db.prepare(
      'INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)'
    ).run(email, hash, name);
    const token = signToken(info.lastInsertRowid);
    setAuthCookie(res, token);
    res.json({ id: info.lastInsertRowid, email, name, couple_id: null });
  });

  app.post('/api/auth/login', loginLimiter, loginAccountLimiter, async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Email e senha obrigatórios' });
    const { email, password } = parsed.data;
    const row = db.prepare(
      'SELECT id, email, name, password_hash, couple_id FROM users WHERE email = ?'
    ).get(email);
    if (!row) {
      // hash dummy para nivelar tempo de resposta — evita user enumeration por timing
      await bcrypt.compare(password, '$2b$12$abcdefghijklmnopqrstuv0123456789ABCDEFGHIJKLMNOPQRSTUV');
      return res.status(401).json({ error: 'Email ou senha incorretos' });
    }
    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) return res.status(401).json({ error: 'Email ou senha incorretos' });
    const token = signToken(row.id);
    setAuthCookie(res, token);
    res.json({ id: row.id, email: row.email, name: row.name, couple_id: row.couple_id });
  });

  app.post('/api/auth/logout', (req, res) => {
    res.clearCookie(COOKIE_NAME, { path: '/', sameSite: 'strict', secure: IS_PROD, httpOnly: true });
    res.json({ ok: true });
  });

  app.get('/api/auth/me', requireAuth, (req, res) => {
    res.json(req.user);
  });
}
