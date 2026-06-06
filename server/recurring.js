import { z } from 'zod';
import db from './db.js';
import { requireAuth } from './auth.js';

const recurringSchema = z.object({
  type: z.enum(['credit', 'debit']),
  description: z.string().min(1, 'Descrição obrigatória').max(120),
  day_of_month: z.number().int().min(1).max(31),
  is_variable: z.boolean().default(false),
  amount: z.number().positive().max(9999999).optional(),
}).refine(d => d.is_variable || d.amount !== undefined, {
  message: 'Informe o valor para recorrência de valor fixo',
});

const confirmSchema = z.object({
  amount: z.number().positive().max(9999999),
});

function parseId(raw) {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 && n < 2_147_483_647 ? n : null;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// dia agendado clamped ao último dia do mês (ex: dia 31 em fevereiro → 28/29)
function occurrenceDate(ym, day) {
  const [y, m] = ym.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const d = Math.min(day, lastDay);
  return `${ym}-${String(d).padStart(2, '0')}`;
}

function nextMonth(ym) {
  let [y, m] = ym.split('-').map(Number);
  m++;
  if (m > 12) { m = 1; y++; }
  return `${y}-${String(m).padStart(2, '0')}`;
}

// Ocorrências vencidas e ainda não aplicadas, em ordem cronológica.
// Começa no mês da criação (ocorrência só vale se cair em/apos a data de criação).
function dueOccurrences(entry) {
  const today = todayISO();
  const createdDate = entry.created_at.slice(0, 10);
  let ym = entry.last_applied ? nextMonth(entry.last_applied) : createdDate.slice(0, 7);
  const out = [];
  while (ym <= today.slice(0, 7)) {
    const occ = occurrenceDate(ym, entry.day_of_month);
    if (occ >= createdDate && occ <= today) out.push({ ym, occurred_on: occ });
    ym = nextMonth(ym);
    if (out.length > 120) break; // trava de sanidade
  }
  return out;
}

function applyOccurrence(entry, amount, occurredOn, ym) {
  const delta = entry.type === 'credit' ? amount : -amount;
  db.prepare('UPDATE users SET cash_balance = cash_balance + ? WHERE id = ?').run(delta, entry.user_id);
  db.prepare(`
    INSERT INTO recurring_log (recurring_id, user_id, type, description, amount, occurred_on)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(entry.id, entry.user_id, entry.type, entry.description, amount, occurredOn);
  db.prepare('UPDATE recurring_entries SET last_applied = ? WHERE id = ?').run(ym, entry.id);
}

export function registerRecurringRoutes(app) {
  app.get('/api/recurring', requireAuth, (req, res) => {
    res.json(db.prepare(
      'SELECT id, type, description, amount, day_of_month, is_variable, last_applied, created_at FROM recurring_entries WHERE user_id = ? ORDER BY day_of_month, id'
    ).all(req.user.id));
  });

  app.post('/api/recurring', requireAuth, (req, res) => {
    const parsed = recurringSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const r = parsed.data;
    const info = db.prepare(`
      INSERT INTO recurring_entries (user_id, type, description, amount, day_of_month, is_variable)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(req.user.id, r.type, r.description, r.is_variable ? null : r.amount, r.day_of_month, r.is_variable ? 1 : 0);
    res.json({ id: info.lastInsertRowid });
  });

  app.delete('/api/recurring/:id', requireAuth, (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const info = db.prepare('DELETE FROM recurring_entries WHERE id = ? AND user_id = ?').run(id, req.user.id);
    if (!info.changes) return res.status(404).json({ error: 'Recorrência não encontrada' });
    res.json({ ok: true });
  });

  // Aplica todas as ocorrências fixas vencidas; lista as variáveis pendentes
  app.post('/api/recurring/process', requireAuth, (req, res) => {
    const entries = db.prepare('SELECT * FROM recurring_entries WHERE user_id = ?').all(req.user.id);
    const applied = [];
    const pending = [];
    const txn = db.transaction(() => {
      for (const entry of entries) {
        const due = dueOccurrences(entry);
        if (!due.length) continue;
        if (entry.is_variable) {
          for (const occ of due) {
            pending.push({ id: entry.id, type: entry.type, description: entry.description, occurred_on: occ.occurred_on });
          }
        } else {
          for (const occ of due) {
            applyOccurrence(entry, entry.amount, occ.occurred_on, occ.ym);
            applied.push({ id: entry.id, type: entry.type, description: entry.description, amount: entry.amount, occurred_on: occ.occurred_on });
          }
        }
      }
    });
    txn();
    res.json({ applied, pending });
  });

  // Confirma a ocorrência variável pendente mais antiga com o valor informado
  app.post('/api/recurring/:id/confirm', requireAuth, (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const parsed = confirmSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Valor inválido' });
    const entry = db.prepare('SELECT * FROM recurring_entries WHERE id = ? AND user_id = ?').get(id, req.user.id);
    if (!entry) return res.status(404).json({ error: 'Recorrência não encontrada' });
    if (!entry.is_variable) return res.status(400).json({ error: 'Esta recorrência tem valor fixo' });
    const due = dueOccurrences(entry);
    if (!due.length) return res.status(400).json({ error: 'Nenhuma ocorrência pendente' });
    const occ = due[0];
    const txn = db.transaction(() => applyOccurrence(entry, parsed.data.amount, occ.occurred_on, occ.ym));
    txn();
    res.json({ ok: true, occurred_on: occ.occurred_on, remaining: due.length - 1 });
  });

  // Histórico das aplicações automáticas
  app.get('/api/recurring/log', requireAuth, (req, res) => {
    res.json(db.prepare(
      'SELECT * FROM recurring_log WHERE user_id = ? ORDER BY occurred_on DESC, id DESC LIMIT 50'
    ).all(req.user.id));
  });
}
