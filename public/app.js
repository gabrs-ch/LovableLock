// LovableLock — SPA vanilla, hash router
const $app = document.getElementById('app');
const BRL = (n) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n || 0);
const fmtDate = (iso) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}`;
};
const todayISO = () => new Date().toISOString().slice(0, 10);

const api = async (path, opts = {}) => {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('json') ? await res.json() : await res.text();
  if (!res.ok) throw new Error(data?.error || 'Erro inesperado');
  return data;
};

// ─── escapar HTML em strings vindas do servidor ───
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

// estado global
const state = { user: null, couple: null, partner: null };

// ─── roteador ──────────────────────────────────────
const routes = {};
const route = (name, fn) => (routes[name] = fn);

async function navigate(hash) {
  const target = hash || location.hash || '#/dash';
  if (target !== location.hash) location.hash = target;
  const [path] = target.replace(/^#\//, '').split('?');
  const fn = routes[path] || routes['dash'];
  await fn();
}

window.addEventListener('hashchange', () => navigate());

// ─── boot ──────────────────────────────────────────
(async function boot() {
  try {
    state.user = await api('/api/auth/me');
    if (state.user.couple_id) {
      const c = await api('/api/couple/me');
      state.couple = c.couple; state.partner = c.partner;
    }
    navigate(location.hash || (state.user.couple_id ? '#/dash' : '#/pair'));
  } catch {
    state.user = null;
    renderAuth();
  }
})();

// ─── shell (topbar + footer) ───────────────────────
function shell(inner, active) {
  const initials = (state.user?.name?.[0] || '?') + (state.partner?.name?.[0] || '');
  const tabs = state.user?.couple_id
    ? [['dash', 'I · Painel'], ['transactions', 'II · Lançamentos'], ['goals', 'III · Metas'], ['settings', 'IV · Conta']]
    : [['pair', 'I · Parear'], ['settings', 'II · Conta']];

  return `
    <div class="shell">
      <header class="topbar">
        <div class="brand">LovableLock<small>diário de duas contas</small></div>
        <nav class="nav">
          ${tabs.map(([k, label]) => `<a href="#/${k}" class="${k === active ? 'active' : ''}">${label}</a>`).join('')}
          <button class="nav-logout" id="logout-btn">sair</button>
        </nav>
      </header>
      <section class="page reveal">${inner}</section>
      <footer class="footer">
        <span>LovableLock · ${esc(state.couple?.nickname || 'um caderno a dois')}</span>
        <span class="romans">— MMXXVI —</span>
      </footer>
    </div>
  `;
}

document.addEventListener('click', async (e) => {
  if (e.target?.id === 'logout-btn') {
    await api('/api/auth/logout', { method: 'POST' });
    state.user = null; state.couple = null; state.partner = null;
    renderAuth();
  }
});

// ──────────────────────────────────────────────────
//  AUTH
// ──────────────────────────────────────────────────
function renderAuth(initialTab = 'login', message = null) {
  $app.innerHTML = `
    <div class="auth-stage">
      <aside class="auth-art">
        <div class="crest">L<span>♥</span><br/>ovable<br/>Lock</div>
        <div>
          <p class="quote">Dois caixas, um destino. Um caderno onde cada centavo lembra de quem foi a vez.</p>
          <p class="sig">— para vocês dois</p>
        </div>
      </aside>
      <div class="auth-form">
        <div class="tabs">
          <button class="tab ${initialTab === 'login' ? 'active' : ''}" data-tab="login">Entrar</button>
          <button class="tab ${initialTab === 'register' ? 'active' : ''}" data-tab="register">Criar conta</button>
        </div>
        <div id="auth-pane"></div>
      </div>
    </div>
  `;
  $app.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => renderAuth(t.dataset.tab)));
  if (message) {
    const div = document.createElement('div');
    div.className = 'alert ok';
    div.textContent = message;
    $app.querySelector('.auth-form').insertBefore(div, $app.querySelector('#auth-pane'));
  }
  initialTab === 'register' ? renderRegister() : renderLogin();
}

function renderLogin() {
  const pane = $app.querySelector('#auth-pane');
  pane.innerHTML = `
    <h1>Bem-vindos <em class="display">de volta</em></h1>
    <p class="subtitle">Abra o caderno onde vocês fazem as contas.</p>
    <form id="login-form">
      <div class="field">
        <label>Email</label>
        <input type="email" name="email" required autocomplete="email" />
      </div>
      <div class="field">
        <label>Senha</label>
        <input type="password" name="password" required autocomplete="current-password" />
      </div>
      <div id="login-err"></div>
      <button class="btn">Entrar</button>
    </form>
  `;
  pane.querySelector('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target).entries());
    try {
      state.user = await api('/api/auth/login', { method: 'POST', body: data });
      if (state.user.couple_id) {
        const c = await api('/api/couple/me');
        state.couple = c.couple; state.partner = c.partner;
        location.hash = '#/dash';
      } else {
        location.hash = '#/pair';
      }
      navigate();
    } catch (err) {
      pane.querySelector('#login-err').innerHTML = `<div class="alert">${esc(err.message)}</div>`;
    }
  });
}

function passwordChecks(pw) {
  return {
    len: pw.length >= 8,
    upper: /[A-Z]/.test(pw),
    lower: /[a-z]/.test(pw),
    digit: /\d/.test(pw),
    special: /[^A-Za-z0-9]/.test(pw),
  };
}

function renderRegister() {
  const pane = $app.querySelector('#auth-pane');
  pane.innerHTML = `
    <h1>Comecem <em class="display">aqui</em></h1>
    <p class="subtitle">Um cadastro de cada vez — depois vocês se encontram pelo código.</p>
    <form id="register-form">
      <div class="field">
        <label>Como te chamamos?</label>
        <input name="name" maxlength="60" required />
      </div>
      <div class="field">
        <label>Email</label>
        <input type="email" name="email" required autocomplete="email" />
      </div>
      <div class="field">
        <label>Senha</label>
        <input type="password" name="password" id="pw" required autocomplete="new-password" />
        <div class="meter" data-score="0"><span></span><span></span><span></span><span></span><span></span></div>
        <ul class="req-list" id="req-list">
          <li data-k="len">8 caracteres</li>
          <li data-k="upper">1 maiúscula</li>
          <li data-k="lower">1 minúscula</li>
          <li data-k="digit">1 número</li>
          <li data-k="special">1 especial</li>
        </ul>
      </div>
      <div id="reg-err"></div>
      <button class="btn">Criar conta</button>
    </form>
  `;
  const pwInput = pane.querySelector('#pw');
  pwInput.addEventListener('input', () => {
    const c = passwordChecks(pwInput.value);
    let score = 0;
    Object.values(c).forEach(v => v && score++);
    pane.querySelector('.meter').dataset.score = score;
    pane.querySelectorAll('#req-list li').forEach(li => {
      li.classList.toggle('ok', c[li.dataset.k]);
    });
  });

  pane.querySelector('#register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target).entries());
    try {
      state.user = await api('/api/auth/register', { method: 'POST', body: data });
      location.hash = '#/pair';
      navigate();
    } catch (err) {
      pane.querySelector('#reg-err').innerHTML = `<div class="alert">${esc(err.message)}</div>`;
    }
  });
}

// ──────────────────────────────────────────────────
//  PAIR
// ──────────────────────────────────────────────────
route('pair', async () => {
  if (!state.user) return renderAuth();
  if (state.user.couple_id) return navigate('#/dash');

  $app.innerHTML = shell(`
    <div class="pair-page">
      <div class="chapter">
        <span class="num">I.</span>
        <span class="line"></span>
        <span class="label">Pareamento</span>
      </div>
      <h1>Vocês são <em class="display">dois</em>. <br/>Hora de se encontrar.</h1>
      <p class="lede">Cada conta é individual. O pareamento dura para sempre — até que vocês decidam o contrário. Um lado gera um código, o outro digita. Pronto.</p>
      <div class="pair-grid">
        <div>
          <h3>Gerar convite</h3>
          <p class="muted">Compartilhe este código com sua pessoa. Vale por 7 dias.</p>
          <div id="invite-box">
            <button class="btn" id="gen-code">Gerar código</button>
          </div>
        </div>
        <div>
          <h3>Tenho um código</h3>
          <p class="muted">Digite o código que recebeu para entrar.</p>
          <form id="join-form">
            <div class="field field-mono">
              <input name="code" maxlength="6" placeholder="ABC123" style="text-transform:uppercase; text-align:center; font-size:1.4rem;" required />
            </div>
            <div id="join-msg"></div>
            <button class="btn btn-gold" style="margin-top:14px; width:100%;">Parear contas</button>
          </form>
        </div>
      </div>
    </div>
  `, 'pair');

  $app.querySelector('#gen-code').addEventListener('click', async (e) => {
    try {
      const { code } = await api('/api/couple/invite', { method: 'POST' });
      $app.querySelector('#invite-box').innerHTML = `
        <div class="code-display">${esc(code)}</div>
        <p class="muted" style="text-align:center;">expira em 7 dias · compartilhe com cuidado</p>
      `;
    } catch (err) {
      $app.querySelector('#invite-box').innerHTML = `<div class="alert">${esc(err.message)}</div>`;
    }
  });

  $app.querySelector('#join-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = new FormData(e.target).get('code').toString().trim().toUpperCase();
    try {
      await api('/api/couple/join', { method: 'POST', body: { code } });
      state.user = await api('/api/auth/me');
      const c = await api('/api/couple/me');
      state.couple = c.couple; state.partner = c.partner;
      location.hash = '#/dash';
      navigate();
    } catch (err) {
      $app.querySelector('#join-msg').innerHTML = `<div class="alert">${esc(err.message)}</div>`;
    }
  });
});

// ──────────────────────────────────────────────────
//  DASHBOARD
// ──────────────────────────────────────────────────
route('dash', async () => {
  if (!state.user) return renderAuth();
  if (!state.user.couple_id) return navigate('#/pair');

  const d = await api('/api/dashboard');

  const owes = (() => {
    const n = d.net_to_me;
    if (Math.abs(n) < 0.5) return `<div class="even">as contas do mês estão <em>equilibradas</em> ✦</div>`;
    if (n > 0) return `
      <div class="verdict"><em>${esc(d.partner.name)}</em> contribuiu menos no período</div>
      <div class="amount">${BRL(n)}</div>
      <div class="actions"><button class="btn btn-sm" id="ask-settle">registrar ajuste</button></div>`;
    return `
      <div class="verdict">você contribuiu menos que <em>${esc(d.partner.name)}</em></div>
      <div class="amount">${BRL(Math.abs(n))}</div>
      <div class="actions"><button class="btn btn-sm" id="do-settle">registrar ajuste</button></div>`;
  })();

  const initials = (state.user.name?.[0] || '?') + (d.partner?.name?.[0] || '?');

  const catBars = d.month.by_category.length
    ? d.month.by_category.map(c => {
        const pct = d.month.total ? Math.round(c.total / d.month.total * 100) : 0;
        return `<div class="cat-row">
          <span class="name">${esc(c.category)}</span>
          <span class="bar"><span style="width:${pct}%"></span></span>
          <span class="total">${BRL(c.total)}</span>
        </div>`;
      }).join('')
    : '<div class="empty">Nenhum lançamento este mês ainda.</div>';

  const recentRows = d.recent_transactions.length
    ? d.recent_transactions.map(t => `
        <div class="row">
          <span class="date">${fmtDate(t.occurred_on)}</span>
          <div class="desc">${esc(t.description)}<small>${esc(t.category)}</small></div>
          <span class="who-paid">por ${esc(t.payer_name)}</span>
          <span class="amount">${BRL(t.amount)}</span>
          <span></span>
        </div>`).join('')
    : '<div class="empty">Os lançamentos aparecerão aqui.</div>';

  const goalsHtml = d.goals.length
    ? d.goals.map(g => {
        const pct = Math.min(100, Math.round((g.current_amount / g.target_amount) * 100));
        return `
        <div class="goal">
          <div class="emoji">${esc(g.emoji || '✦')}</div>
          <h4>${esc(g.title)}</h4>
          ${g.deadline ? `<div class="deadline">até ${esc(g.deadline)}</div>` : ''}
          <div class="progress"><span style="width:${pct}%"></span></div>
          <div class="nums"><b>${BRL(g.current_amount)}</b><span>${BRL(g.target_amount)} · ${pct}%</span></div>
        </div>`;
      }).join('')
    : '<div class="empty">Vocês ainda não definiram metas conjuntas. <a href="#/goals">Criar uma</a>.</div>';

  $app.innerHTML = shell(`
    <div class="chapter">
      <span class="num">I.</span><span class="line"></span><span class="label">Painel do casal</span>
    </div>
    <div class="split-row" style="margin-bottom: 32px;">
      <div>
        <h1>${esc(d.couple.nickname || `${state.user.name} & ${d.partner.name}`)}</h1>
        <p class="muted">${d.month.year_month} · um mês a dois</p>
      </div>
      <div class="seal-row">
        <div class="seal">${esc(initials.toUpperCase())}</div>
      </div>
    </div>

    <div class="dash-hero">
      <div class="hero-card">
        <div class="label">Soma dos caixas</div>
        <div class="pool">${BRL(d.pool_total)}<small>BRL</small></div>
        <div class="split">
          <div>
            <div class="who">${esc(d.me.name)}</div>
            <div class="qty">${BRL(d.me.cash_balance)}</div>
          </div>
          <div>
            <div class="who">${esc(d.partner.name)}</div>
            <div class="qty">${BRL(d.partner.cash_balance)}</div>
          </div>
          <div style="flex:0; align-self:flex-end;">
            <button class="btn btn-ghost btn-sm" id="set-balance">ajustar meu caixa</button>
          </div>
        </div>
      </div>
      <div class="who-owes">
        <div class="title">⟜ saldo entre vocês</div>
        ${owes}
      </div>
    </div>

    <div class="cards">
      <div class="card">
        <div class="k">Gasto do mês</div>
        <div class="v"><span class="currency">R$</span>${(d.month.total).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</div>
      </div>
      <div class="card">
        <div class="k">Lançamentos</div>
        <div class="v">${d.recent_transactions.length}<span style="font-family:var(--serif);font-style:italic;font-size:1rem;color:var(--ink-soft); margin-left:8px;">recentes</span></div>
      </div>
      <div class="card">
        <div class="k">Metas em curso</div>
        <div class="v">${d.goals.length}</div>
      </div>
    </div>

    <div class="ledger" style="margin-bottom: 48px;">
      <div class="head">
        <h3>Últimos lançamentos</h3>
        <button class="btn btn-sm" id="add-tx">+ novo lançamento</button>
      </div>
      ${recentRows}
    </div>

    <div class="chapter"><span class="num">§.</span><span class="line"></span><span class="label">Categorias do mês</span></div>
    <div class="month-grid">
      <div class="cat-list">${catBars}</div>
      <div>
        <h3 style="margin-bottom: 14px;">Metas a dois</h3>
        <div class="goals-grid">${goalsHtml}</div>
      </div>
    </div>
  `, 'dash');

  $app.querySelector('#add-tx').addEventListener('click', () => openTxModal());
  $app.querySelector('#set-balance').addEventListener('click', () => openBalanceModal(d.me.cash_balance));
  const settleBtn = $app.querySelector('#do-settle') || $app.querySelector('#ask-settle');
  if (settleBtn) settleBtn.addEventListener('click', () => openSettleModal(d.net_to_me, d.partner));
});

// ──────────────────────────────────────────────────
//  TRANSACTIONS
// ──────────────────────────────────────────────────
route('transactions', async () => {
  if (!state.user) return renderAuth();
  if (!state.user.couple_id) return navigate('#/pair');

  const month = new Date().toISOString().slice(0, 7);
  const txs = await api(`/api/transactions?month=${month}`);
  const rows = txs.length ? txs.map(t => `
    <div class="row">
      <span class="date">${fmtDate(t.occurred_on)}</span>
      <div class="desc">${esc(t.description)}<small>${esc(t.category)} · ${t.split_mode === 'equal' ? '50/50' : t.split_mode === 'payer' ? 'só pagante' : Math.round(t.payer_share * 100) + '/' + Math.round((1 - t.payer_share) * 100)}</small></div>
      <span class="who-paid">por ${esc(t.payer_name)}</span>
      <span class="amount">${BRL(t.amount)}</span>
      <button class="del" data-id="${t.id}" title="excluir">✕</button>
    </div>
  `).join('') : '<div class="empty">Sem lançamentos neste mês.</div>';

  $app.innerHTML = shell(`
    <div class="chapter"><span class="num">II.</span><span class="line"></span><span class="label">Lançamentos · ${month}</span></div>
    <div class="split-row" style="margin-bottom: 28px;">
      <div>
        <h1>O que <em class="display">passou</em> pelo caixa</h1>
        <p class="muted">${txs.length} entradas neste mês</p>
      </div>
      <button class="btn" id="add-tx">+ novo lançamento</button>
    </div>
    <div class="ledger">
      <div class="head"><h3>${month}</h3></div>
      ${rows}
    </div>
  `, 'transactions');

  $app.querySelector('#add-tx').addEventListener('click', () => openTxModal());
  $app.querySelectorAll('.del').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Apagar este lançamento? O valor volta ao caixa de quem pagou.')) return;
    await api(`/api/transactions/${b.dataset.id}`, { method: 'DELETE' });
    navigate();
  }));
});

// ──────────────────────────────────────────────────
//  GOALS
// ──────────────────────────────────────────────────
route('goals', async () => {
  if (!state.user) return renderAuth();
  if (!state.user.couple_id) return navigate('#/pair');

  const goals = await api('/api/goals');
  const cards = goals.length ? goals.map(g => {
    const pct = Math.min(100, Math.round((g.current_amount / g.target_amount) * 100));
    return `
      <div class="goal">
        <div class="emoji">${esc(g.emoji || '✦')}</div>
        <h4>${esc(g.title)}</h4>
        ${g.deadline ? `<div class="deadline">até ${esc(g.deadline)}</div>` : ''}
        <div class="progress"><span style="width:${pct}%"></span></div>
        <div class="nums"><b>${BRL(g.current_amount)}</b><span>${BRL(g.target_amount)} · ${pct}%</span></div>
        <div class="actions">
          <button class="btn btn-sm" data-action="contrib" data-id="${g.id}">+ contribuir</button>
          <button class="btn btn-sm btn-ghost" data-action="del" data-id="${g.id}">apagar</button>
        </div>
      </div>`;
  }).join('') : '<div class="empty">Crie a primeira meta — viagem, aniversário, alianças…</div>';

  $app.innerHTML = shell(`
    <div class="chapter"><span class="num">III.</span><span class="line"></span><span class="label">Metas a dois</span></div>
    <div class="split-row" style="margin-bottom: 28px;">
      <div>
        <h1>Onde vocês <em class="display">querem chegar</em></h1>
        <p class="muted">${goals.length} meta(s) ativa(s)</p>
      </div>
      <button class="btn" id="new-goal">+ nova meta</button>
    </div>
    <div class="goals-grid">${cards}</div>
  `, 'goals');

  $app.querySelector('#new-goal').addEventListener('click', openGoalModal);
  $app.querySelectorAll('[data-action="contrib"]').forEach(b => b.addEventListener('click', () => openContribModal(b.dataset.id)));
  $app.querySelectorAll('[data-action="del"]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Apagar esta meta?')) return;
    await api(`/api/goals/${b.dataset.id}`, { method: 'DELETE' });
    navigate();
  }));
});

// ──────────────────────────────────────────────────
//  SETTINGS
// ──────────────────────────────────────────────────
route('settings', async () => {
  if (!state.user) return renderAuth();
  const me = await api('/api/auth/me');
  let coupleBlock = '';
  if (me.couple_id) {
    const c = await api('/api/couple/me');
    state.couple = c.couple; state.partner = c.partner;
    coupleBlock = `
      <div class="chapter"><span class="num">§.</span><span class="line"></span><span class="label">Casal</span></div>
      <form id="couple-form" style="display:grid; gap:16px; max-width:520px; margin-bottom: 40px;">
        <div class="field">
          <label>Apelido do casal</label>
          <input name="nickname" value="${esc(c.couple.nickname || '')}" placeholder="ex: A &amp; B" />
        </div>
        <div class="field">
          <label>Data em que começou</label>
          <input type="date" name="started_at" value="${esc(c.couple.started_at || '')}" />
        </div>
        <div class="flex">
          <button class="btn">salvar</button>
          <button class="btn btn-ghost" type="button" id="leave-couple">desfazer pareamento</button>
        </div>
        <div id="couple-msg"></div>
      </form>
    `;
  }

  $app.innerHTML = shell(`
    <div class="chapter"><span class="num">${me.couple_id ? 'IV.' : 'II.'}</span><span class="line"></span><span class="label">Conta &amp; preferências</span></div>
    <h1>A sua <em class="display">conta</em></h1>
    <p class="lede">Aqui ficam as configurações pessoais e do casal.</p>
    <div style="display:grid; gap:8px; max-width:520px; margin-bottom: 40px;">
      <div><strong>Nome:</strong> ${esc(me.name)}</div>
      <div><strong>Email:</strong> ${esc(me.email)}</div>
      <div><strong>Caixa atual:</strong> ${BRL(me.cash_balance)} <button class="btn btn-sm btn-ghost" id="edit-balance" style="margin-left:10px;">ajustar</button></div>
    </div>
    ${coupleBlock}
  `, 'settings');

  $app.querySelector('#edit-balance').addEventListener('click', () => openBalanceModal(me.cash_balance));
  const cf = $app.querySelector('#couple-form');
  if (cf) {
    cf.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target).entries());
      if (!data.started_at) delete data.started_at;
      try {
        await api('/api/couple/me', { method: 'PATCH', body: data });
        $app.querySelector('#couple-msg').innerHTML = '<div class="alert ok">Salvo ✦</div>';
      } catch (err) {
        $app.querySelector('#couple-msg').innerHTML = `<div class="alert">${esc(err.message)}</div>`;
      }
    });
    $app.querySelector('#leave-couple').addEventListener('click', async () => {
      if (!confirm('Tem certeza? Isso te desconecta da conta conjunta.')) return;
      await api('/api/couple/leave', { method: 'POST' });
      state.user = await api('/api/auth/me');
      state.couple = null; state.partner = null;
      location.hash = '#/pair'; navigate();
    });
  }
});

// ──────────────────────────────────────────────────
//  MODAIS
// ──────────────────────────────────────────────────
function openModal(html) {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal">${html}</div>`;
  bg.addEventListener('click', (e) => { if (e.target === bg) bg.remove(); });
  document.body.appendChild(bg);
  return bg;
}

async function openTxModal() {
  const [cats, coupleMe] = await Promise.all([
    api('/api/meta/categories'),
    api('/api/couple/me'),
  ]);
  const partner = coupleMe.partner;
  const m = openModal(`
    <h2>Novo <em class="display">lançamento</em></h2>
    <form id="tx-form">
      <div class="field">
        <label>Descrição</label>
        <input name="description" required maxlength="200" placeholder="Mercado, sushi de quinta…" />
      </div>
      <div class="row-2">
        <div class="field">
          <label>Valor (R$)</label>
          <input type="number" step="0.01" min="0.01" name="amount" required />
        </div>
        <div class="field">
          <label>Data</label>
          <input type="date" name="occurred_on" value="${todayISO()}" required />
        </div>
      </div>
      <div class="row-2">
        <div class="field">
          <label>Categoria</label>
          <select name="category">${cats.map(c => `<option>${esc(c)}</option>`).join('')}</select>
        </div>
        <div class="field">
          <label>Quem pagou</label>
          <select name="payer_id">
            <option value="${state.user.id}">${esc(state.user.name)} (eu)</option>
            ${partner ? `<option value="${partner.id}">${esc(partner.name)}</option>` : ''}
          </select>
        </div>
      </div>
      <div class="field">
        <label>Como dividir</label>
        <select name="split_mode">
          <option value="equal">Metade pra cada</option>
          <option value="payer">Quem pagou assume tudo</option>
          <option value="custom">Personalizado</option>
        </select>
      </div>
      <div class="field" id="share-field" style="display:none;">
        <label>Quanto da conta o pagador absorve (%)</label>
        <input type="number" min="0" max="100" name="payer_share_pct" value="50" />
        <div class="hint">o restante fica para a outra pessoa</div>
      </div>
      <div id="tx-err"></div>
      <div class="actions">
        <button class="btn btn-ghost" type="button" data-close>cancelar</button>
        <button class="btn">registrar</button>
      </div>
    </form>
  `);
  m.querySelector('[name="split_mode"]').addEventListener('change', (e) => {
    m.querySelector('#share-field').style.display = e.target.value === 'custom' ? '' : 'none';
  });
  m.querySelector('[data-close]').addEventListener('click', () => m.remove());
  m.querySelector('#tx-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {
      description: fd.get('description'),
      amount: parseFloat(fd.get('amount')),
      occurred_on: fd.get('occurred_on'),
      category: fd.get('category'),
      payer_id: parseInt(fd.get('payer_id')),
      split_mode: fd.get('split_mode'),
    };
    if (body.split_mode === 'custom') {
      body.payer_share = parseFloat(fd.get('payer_share_pct')) / 100;
    }
    try {
      await api('/api/transactions', { method: 'POST', body });
      m.remove(); navigate();
    } catch (err) {
      m.querySelector('#tx-err').innerHTML = `<div class="alert">${esc(err.message)}</div>`;
    }
  });
}

function openBalanceModal(current) {
  const m = openModal(`
    <h2>Ajustar <em class="display">caixa</em></h2>
    <p class="muted" style="margin-bottom: 14px;">Quanto você tem em dinheiro/conta agora? Esse número serve de referência pra somar com seu par.</p>
    <form id="bal-form">
      <div class="field">
        <label>Saldo (R$)</label>
        <input type="number" step="0.01" min="0" name="cash_balance" value="${current ?? 0}" required />
      </div>
      <div id="bal-err"></div>
      <div class="actions">
        <button class="btn btn-ghost" type="button" data-close>cancelar</button>
        <button class="btn">salvar</button>
      </div>
    </form>
  `);
  m.querySelector('[data-close]').addEventListener('click', () => m.remove());
  m.querySelector('#bal-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = parseFloat(new FormData(e.target).get('cash_balance'));
    try {
      await api('/api/account/balance', { method: 'PATCH', body: { cash_balance: v } });
      m.remove(); navigate();
    } catch (err) {
      m.querySelector('#bal-err').innerHTML = `<div class="alert">${esc(err.message)}</div>`;
    }
  });
}

function openSettleModal(netToMe, partner) {
  const owedByMe = netToMe < 0 ? Math.abs(netToMe) : 0;
  const m = openModal(`
    <h2>Registrar <em class="display">ajuste</em></h2>
    <p class="muted" style="margin-bottom:14px;">Use quando um de vocês passou um valor ao outro para equilibrar as contribuições — o caixa de quem transferiu diminui, e o do outro aumenta.</p>
    <form id="set-form">
      <div class="row-2">
        <div class="field">
          <label>Valor</label>
          <input type="number" step="0.01" min="0.01" name="amount" value="${owedByMe || ''}" required />
        </div>
        <div class="field">
          <label>Data</label>
          <input type="date" name="occurred_on" value="${todayISO()}" required />
        </div>
      </div>
      <div class="field">
        <label>Nota (opcional)</label>
        <input name="note" maxlength="200" placeholder="ajuste de outubro…" />
      </div>
      <div id="set-err"></div>
      <div class="actions">
        <button class="btn btn-ghost" type="button" data-close>cancelar</button>
        <button class="btn">registrar</button>
      </div>
    </form>
  `);
  m.querySelector('[data-close]').addEventListener('click', () => m.remove());
  m.querySelector('#set-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api('/api/settlements', { method: 'POST', body: {
        to_user: partner.id,
        amount: parseFloat(fd.get('amount')),
        occurred_on: fd.get('occurred_on'),
        note: fd.get('note') || undefined,
      }});
      m.remove(); navigate();
    } catch (err) {
      m.querySelector('#set-err').innerHTML = `<div class="alert">${esc(err.message)}</div>`;
    }
  });
}

function openGoalModal() {
  const m = openModal(`
    <h2>Nova <em class="display">meta</em></h2>
    <form id="g-form">
      <div class="row-2">
        <div class="field" style="grid-column:1/3;">
          <label>Título</label>
          <input name="title" required maxlength="80" placeholder="Viagem pra Paraty" />
        </div>
        <div class="field">
          <label>Valor alvo (R$)</label>
          <input type="number" step="0.01" min="1" name="target_amount" required />
        </div>
        <div class="field">
          <label>Emoji</label>
          <input name="emoji" maxlength="4" placeholder="🌊" />
        </div>
        <div class="field" style="grid-column:1/3;">
          <label>Prazo (opcional)</label>
          <input type="date" name="deadline" />
        </div>
      </div>
      <div id="g-err"></div>
      <div class="actions">
        <button class="btn btn-ghost" type="button" data-close>cancelar</button>
        <button class="btn">criar</button>
      </div>
    </form>
  `);
  m.querySelector('[data-close]').addEventListener('click', () => m.remove());
  m.querySelector('#g-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {
      title: fd.get('title'),
      target_amount: parseFloat(fd.get('target_amount')),
      emoji: fd.get('emoji') || undefined,
    };
    if (fd.get('deadline')) body.deadline = fd.get('deadline');
    try {
      await api('/api/goals', { method: 'POST', body });
      m.remove(); navigate();
    } catch (err) {
      m.querySelector('#g-err').innerHTML = `<div class="alert">${esc(err.message)}</div>`;
    }
  });
}

function openContribModal(goalId) {
  const m = openModal(`
    <h2>Aporte <em class="display">na meta</em></h2>
    <p class="muted" style="margin-bottom: 14px;">Use valor positivo para somar, negativo para corrigir.</p>
    <form id="c-form">
      <div class="field">
        <label>Valor (R$)</label>
        <input type="number" step="0.01" name="amount" required />
      </div>
      <div id="c-err"></div>
      <div class="actions">
        <button class="btn btn-ghost" type="button" data-close>cancelar</button>
        <button class="btn">adicionar</button>
      </div>
    </form>
  `);
  m.querySelector('[data-close]').addEventListener('click', () => m.remove());
  m.querySelector('#c-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const amount = parseFloat(new FormData(e.target).get('amount'));
    try {
      await api(`/api/goals/${goalId}/contribute`, { method: 'POST', body: { amount } });
      m.remove(); navigate();
    } catch (err) {
      m.querySelector('#c-err').innerHTML = `<div class="alert">${esc(err.message)}</div>`;
    }
  });
}
