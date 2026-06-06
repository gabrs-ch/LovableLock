import { z } from 'zod';
import db from './db.js';
import { requireAuth } from './auth.js';

const CATEGORIES = [
  'Mercado', 'Comida fora', 'Casa', 'Contas', 'Lazer',
  'Viagem', 'Transporte', 'Saúde', 'Presentes', 'Assinaturas', 'Outros'
];

function requireCouple(req, res, next) {
  if (!req.user.couple_id) return res.status(400).json({ error: 'Você ainda não está pareado' });
  next();
}

function parseId(raw) {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 && n < 2_147_483_647 ? n : null;
}

function partnerOf(coupleId, userId) {
  return db.prepare('SELECT id, name FROM users WHERE couple_id = ? AND id != ?').get(coupleId, userId);
}

const balanceSchema = z.object({
  cash_balance: z.number().min(0).max(99999999),
});

const txSchema = z.object({
  amount: z.number().positive().max(9999999),
  description: z.string().min(1).max(200),
  category: z.enum(CATEGORIES),
  split_mode: z.enum(['equal', 'payer', 'custom']).default('equal'),
  payer_share: z.number().min(0).max(1).optional(),
  occurred_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  payer_id: z.number().int().optional(),
});

const goalSchema = z.object({
  title: z.string().min(1).max(80),
  target_amount: z.number().positive().max(99999999),
  emoji: z.string().max(8).optional(),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(d => d > new Date().toISOString().slice(0, 10), 'O prazo da meta deve estar no futuro')
    .optional().nullable(),
});

const goalContribSchema = z.object({
  amount: z.number().min(-99999999).max(99999999).refine(v => v !== 0, 'Não pode ser zero'),
});

const settlementSchema = z.object({
  amount: z.number().positive().max(9999999),
  to_user: z.number().int(),
  note: z.string().max(200).optional(),
  occurred_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export function registerFinanceRoutes(app) {
  // --- caixa pessoal -------------------------------------------------
  app.patch('/api/account/balance', requireAuth, (req, res) => {
    const parsed = balanceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Saldo inválido' });
    db.prepare('UPDATE users SET cash_balance = ? WHERE id = ?').run(parsed.data.cash_balance, req.user.id);
    res.json({ cash_balance: parsed.data.cash_balance });
  });

  app.get('/api/meta/categories', (req, res) => res.json(CATEGORIES));

  // --- transações ----------------------------------------------------
  app.post('/api/transactions', requireAuth, requireCouple, (req, res) => {
    const parsed = txSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const t = parsed.data;
    const payerId = t.payer_id ?? req.user.id;
    const member = db.prepare('SELECT id FROM users WHERE id = ? AND couple_id = ?').get(payerId, req.user.couple_id);
    if (!member) return res.status(400).json({ error: 'Pagador não pertence ao casal' });

    let payerShare = 0.5;
    if (t.split_mode === 'equal') payerShare = 0.5;
    else if (t.split_mode === 'payer') payerShare = 1;
    else if (t.split_mode === 'custom') payerShare = t.payer_share ?? 0.5;

    const txn = db.transaction(() => {
      const info = db.prepare(`
        INSERT INTO transactions (couple_id, payer_id, amount, description, category, split_mode, payer_share, occurred_on)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(req.user.couple_id, payerId, t.amount, t.description, t.category, t.split_mode, payerShare, t.occurred_on);
      // Débito sem clamp: precisa ser simétrico ao estorno do DELETE,
      // senão criar/apagar transação geraria dinheiro no caixa
      db.prepare('UPDATE users SET cash_balance = cash_balance - ? WHERE id = ?').run(t.amount, payerId);
      return info.lastInsertRowid;
    });
    res.json({ id: txn() });
  });

  app.get('/api/transactions', requireAuth, requireCouple, (req, res) => {
    const limit = Math.max(1, Math.min(parseInt(req.query.limit, 10) || 100, 500));
    const month = req.query.month; // YYYY-MM
    let sql = `
      SELECT t.*, u.name AS payer_name
      FROM transactions t JOIN users u ON u.id = t.payer_id
      WHERE t.couple_id = ?
    `;
    const params = [req.user.couple_id];
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      sql += ` AND t.occurred_on LIKE ?`;
      params.push(month + '%');
    }
    sql += ` ORDER BY t.occurred_on DESC, t.id DESC LIMIT ?`;
    params.push(limit);
    res.json(db.prepare(sql).all(...params));
  });

  app.delete('/api/transactions/:id', requireAuth, requireCouple, (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const txn = db.transaction(() => {
      const tx = db.prepare('SELECT * FROM transactions WHERE id = ? AND couple_id = ?').get(id, req.user.couple_id);
      if (!tx) return null;
      db.prepare('UPDATE users SET cash_balance = cash_balance + ? WHERE id = ?').run(tx.amount, tx.payer_id);
      db.prepare('DELETE FROM transactions WHERE id = ?').run(tx.id);
      return tx;
    });
    const result = txn();
    if (!result) return res.status(404).json({ error: 'Transação não encontrada' });
    res.json({ ok: true });
  });

  // --- metas ---------------------------------------------------------
  app.get('/api/goals', requireAuth, requireCouple, (req, res) => {
    res.json(db.prepare('SELECT * FROM goals WHERE couple_id = ? ORDER BY created_at DESC').all(req.user.couple_id));
  });

  app.post('/api/goals', requireAuth, requireCouple, (req, res) => {
    const parsed = goalSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const g = parsed.data;
    const info = db.prepare(`
      INSERT INTO goals (couple_id, title, target_amount, emoji, deadline)
      VALUES (?, ?, ?, ?, ?)
    `).run(req.user.couple_id, g.title, g.target_amount, g.emoji ?? null, g.deadline ?? null);
    res.json({ id: info.lastInsertRowid });
  });

  app.post('/api/goals/:id/contribute', requireAuth, requireCouple, (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const parsed = goalContribSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const goal = db.prepare('SELECT * FROM goals WHERE id = ? AND couple_id = ?').get(id, req.user.couple_id);
    if (!goal) return res.status(404).json({ error: 'Meta não encontrada' });
    const newAmount = Math.min(99999999, Math.max(0, goal.current_amount + parsed.data.amount));
    db.prepare('UPDATE goals SET current_amount = ? WHERE id = ?').run(newAmount, goal.id);
    res.json({ current_amount: newAmount });
  });

  app.delete('/api/goals/:id', requireAuth, requireCouple, (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    db.prepare('DELETE FROM goals WHERE id = ? AND couple_id = ?').run(id, req.user.couple_id);
    res.json({ ok: true });
  });

  // --- acertos (settlements) ----------------------------------------
  app.post('/api/settlements', requireAuth, requireCouple, (req, res) => {
    const parsed = settlementSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const s = parsed.data;
    const partner = partnerOf(req.user.couple_id, req.user.id);
    if (!partner || partner.id !== s.to_user) return res.status(400).json({ error: 'Destinatário inválido' });

    const txn = db.transaction(() => {
      db.prepare(`
        INSERT INTO settlements (couple_id, from_user, to_user, amount, note, occurred_on)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(req.user.couple_id, req.user.id, s.to_user, s.amount, s.note ?? null, s.occurred_on);
      // Débito sem clamp: o crédito ao parceiro é integral, então clampar aqui criaria dinheiro
      db.prepare('UPDATE users SET cash_balance = cash_balance - ? WHERE id = ?').run(s.amount, req.user.id);
      db.prepare('UPDATE users SET cash_balance = cash_balance + ? WHERE id = ?').run(s.amount, s.to_user);
    });
    txn();
    res.json({ ok: true });
  });

  app.get('/api/settlements', requireAuth, requireCouple, (req, res) => {
    res.json(db.prepare(`
      SELECT s.*, u1.name AS from_name, u2.name AS to_name
      FROM settlements s
      JOIN users u1 ON u1.id = s.from_user
      JOIN users u2 ON u2.id = s.to_user
      WHERE s.couple_id = ?
      ORDER BY s.occurred_on DESC, s.id DESC LIMIT 50
    `).all(req.user.couple_id));
  });

  // --- dashboard -----------------------------------------------------
  app.get('/api/dashboard', requireAuth, requireCouple, (req, res) => {
    const me = db.prepare('SELECT id, name, cash_balance FROM users WHERE id = ?').get(req.user.id);
    const partner = partnerOf(req.user.couple_id, req.user.id);
    if (!partner) return res.status(400).json({ error: 'Parceiro não encontrado' });
    const partnerFull = db.prepare('SELECT id, name, cash_balance FROM users WHERE id = ?').get(partner.id);

    const allTx = db.prepare('SELECT payer_id, amount, payer_share FROM transactions WHERE couple_id = ?').all(req.user.couple_id);
    // saldo entre eles: positivo => parceiro deve a "me"
    let net = 0;
    for (const t of allTx) {
      const payerOwesItself = t.amount * t.payer_share;
      const otherOwesPayer = t.amount - payerOwesItself;
      if (t.payer_id === me.id) net += otherOwesPayer;
      else net -= otherOwesPayer;
    }
    const settlements = db.prepare('SELECT from_user, to_user, amount FROM settlements WHERE couple_id = ?').all(req.user.couple_id);
    for (const s of settlements) {
      if (s.from_user === me.id && s.to_user === partner.id) net += s.amount;
      else if (s.from_user === partner.id && s.to_user === me.id) net -= s.amount;
    }

    // Mês atual
    const ym = new Date().toISOString().slice(0, 7);
    const monthRows = db.prepare(`
      SELECT category, SUM(amount) AS total
      FROM transactions
      WHERE couple_id = ? AND occurred_on LIKE ?
      GROUP BY category ORDER BY total DESC
    `).all(req.user.couple_id, ym + '%');
    const monthTotal = monthRows.reduce((s, r) => s + r.total, 0);

    const recent = db.prepare(`
      SELECT t.id, t.description, t.amount, t.category, t.occurred_on, t.payer_id, u.name AS payer_name
      FROM transactions t JOIN users u ON u.id = t.payer_id
      WHERE t.couple_id = ?
      ORDER BY t.occurred_on DESC, t.id DESC LIMIT 6
    `).all(req.user.couple_id);

    const goals = db.prepare('SELECT * FROM goals WHERE couple_id = ? ORDER BY created_at DESC LIMIT 3').all(req.user.couple_id);
    const couple = db.prepare('SELECT id, nickname, started_at FROM couples WHERE id = ?').get(req.user.couple_id);

    res.json({
      couple,
      me,
      partner: partnerFull,
      pool_total: me.cash_balance + partnerFull.cash_balance,
      net_to_me: Number(net.toFixed(2)),  // se > 0, parceiro deve a mim
      month: { year_month: ym, total: monthTotal, by_category: monthRows },
      recent_transactions: recent,
      goals,
    });
  });
}
