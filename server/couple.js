import crypto from 'node:crypto';
import { z } from 'zod';
import db from './db.js';
import { requireAuth } from './auth.js';

function generateCode() {
  // 6 chars, alfabeto sem caracteres ambíguos (0/O, 1/I/L)
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let out = '';
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

const joinSchema = z.object({
  code: z.string().min(6).max(6).transform(s => s.toUpperCase()),
});

const coupleMetaSchema = z.object({
  nickname: z.string().min(1).max(60).optional(),
  started_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export function registerCoupleRoutes(app) {
  // Gera código de convite para parear
  app.post('/api/couple/invite', requireAuth, (req, res) => {
    if (req.user.couple_id) {
      return res.status(400).json({ error: 'Você já está em um casal. Saia antes de convidar outra pessoa.' });
    }
    // limpa convites velhos do usuário
    db.prepare("DELETE FROM invites WHERE user_id = ? OR expires_at < datetime('now')").run(req.user.id);

    let code;
    for (let i = 0; i < 10; i++) {
      code = generateCode();
      const exists = db.prepare('SELECT 1 FROM invites WHERE code = ?').get(code);
      if (!exists) break;
    }
    db.prepare("INSERT INTO invites (code, user_id, expires_at) VALUES (?, ?, datetime('now', '+7 days'))").run(code, req.user.id);
    res.json({ code, expires_in_days: 7 });
  });

  // Aceita um convite e cria o casal
  app.post('/api/couple/join', requireAuth, (req, res) => {
    const parsed = joinSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Código inválido' });
    if (req.user.couple_id) return res.status(400).json({ error: 'Você já está pareado' });

    const invite = db.prepare(`
      SELECT code, user_id FROM invites
      WHERE code = ? AND used = 0 AND expires_at > datetime('now')
    `).get(parsed.data.code);

    if (!invite) return res.status(404).json({ error: 'Convite inválido ou expirado' });
    if (invite.user_id === req.user.id) return res.status(400).json({ error: 'Não dá pra parear com você mesmo 💔' });

    const otherUser = db.prepare('SELECT id, couple_id FROM users WHERE id = ?').get(invite.user_id);
    if (!otherUser) return res.status(404).json({ error: 'Usuário do convite não existe mais' });
    if (otherUser.couple_id) return res.status(400).json({ error: 'Essa pessoa já está em outro casal' });

    const tx = db.transaction(() => {
      const couple = db.prepare("INSERT INTO couples DEFAULT VALUES").run();
      db.prepare('UPDATE users SET couple_id = ? WHERE id IN (?, ?)').run(couple.lastInsertRowid, req.user.id, otherUser.id);
      db.prepare('UPDATE invites SET used = 1 WHERE code = ?').run(invite.code);
      return couple.lastInsertRowid;
    });
    const coupleId = tx();
    res.json({ couple_id: coupleId, message: 'Pareados com sucesso 💞' });
  });

  // Sai do casal
  app.post('/api/couple/leave', requireAuth, (req, res) => {
    if (!req.user.couple_id) return res.status(400).json({ error: 'Você não está em um casal' });
    db.prepare('UPDATE users SET couple_id = NULL WHERE id = ?').run(req.user.id);
    res.json({ ok: true });
  });

  // Detalhes do casal + parceiro
  app.get('/api/couple/me', requireAuth, (req, res) => {
    if (!req.user.couple_id) return res.json({ couple: null, partner: null });
    const couple = db.prepare('SELECT id, nickname, started_at, created_at FROM couples WHERE id = ?').get(req.user.couple_id);
    const partner = db.prepare('SELECT id, name, email, cash_balance FROM users WHERE couple_id = ? AND id != ?').get(req.user.couple_id, req.user.id);
    res.json({ couple, partner });
  });

  // Atualiza nickname e data de início do relacionamento
  app.patch('/api/couple/me', requireAuth, (req, res) => {
    if (!req.user.couple_id) return res.status(400).json({ error: 'Sem casal' });
    const parsed = coupleMetaSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos' });
    const fields = [];
    const values = [];
    if (parsed.data.nickname !== undefined) { fields.push('nickname = ?'); values.push(parsed.data.nickname); }
    if (parsed.data.started_at !== undefined) { fields.push('started_at = ?'); values.push(parsed.data.started_at); }
    if (!fields.length) return res.json({ ok: true });
    values.push(req.user.couple_id);
    db.prepare(`UPDATE couples SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    res.json({ ok: true });
  });
}
