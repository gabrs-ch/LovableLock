# LovableLock 💞

Diário financeiro de duas contas. Cada um tem seu próprio saldo, mas as despesas, metas e o cálculo de **quem deve a quem** ficam compartilhados.

## Stack

- **Backend:** Node.js + Express + SQLite (better-sqlite3) + bcrypt + JWT (cookie httpOnly)
- **Frontend:** SPA vanilla (sem build), Fraunces + Lora + JetBrains Mono
- **Auth:** senha forte obrigatória (8+, A-Z, a-z, dígito, especial)
- **Pareamento:** código de 6 caracteres, expira em 7 dias

## Pré-requisitos

- **Node.js >= 18.17** (testado em 20.x)
- **npm** (vem com o Node)
- **Compilador C** para o `better-sqlite3` (compilação nativa):
  - **Debian/Ubuntu/Kali:** `sudo apt install -y build-essential python3`
  - **Fedora/RHEL:** `sudo dnf install -y gcc-c++ make python3`
  - **macOS:** `xcode-select --install`
  - **Windows:** `npm install --global windows-build-tools` (PowerShell admin)

## Instalação local

```bash
# 1. Clonar e entrar
git clone https://github.com/gabrs-ch/LovableLock.git
cd LovableLock

# 2. Instalar dependências
npm install

# 3. Configurar variáveis de ambiente
cp .env.example .env
# Edite .env e defina JWT_SECRET com pelo menos 32 caracteres:
#   openssl rand -hex 32
# Cole o resultado em JWT_SECRET=...

# 4. Rodar
npm start
# (ou, para auto-reload no dev:)
npm run dev

# 5. Abrir
# http://localhost:3000
```

> O diretório `db/` é criado automaticamente no primeiro boot. O SQLite usa WAL e FKs ativadas.

> O servidor **falha rápido** se `JWT_SECRET` não estiver definido ou tiver menos de 32 caracteres — isso é proposital.

## Primeiro uso (passo a passo)

1. Abra `http://localhost:3000` e clique em **Criar conta**.
2. Cadastre a conta A (email, nome, senha forte).
3. **Abra outra janela anônima** (ou outro navegador) e cadastre a conta B.
4. Na conta A, vá em **Parear** → clique em **Gerar código** → copie os 6 caracteres.
5. Na conta B, vá em **Parear** → cole o código em **Tenho um código** → **Parear contas**.
6. As duas contas agora compartilham lançamentos, metas e o veredicto de quem deve a quem.

## Funcionalidades

1. Cadastro/login com senha de complexidade enforçada
2. Pareamento entre 2 contas via código
3. Saldo de caixa individual ("quanto tenho em dinheiro/conta")
4. Lançamentos: descrição, valor, categoria, pagador, divisão (50/50, só pagante, custom %)
5. Acerto de contas com cálculo automático de quem deve a quem
6. Metas conjuntas com barra de progresso, prazo e emoji
7. Dashboard com soma dos caixas, quem deve a quem, gastos do mês por categoria, últimas transações e metas

## Estrutura

```
LovableLock/
├── server/
│   ├── index.js       — boot Express + headers de segurança + static
│   ├── db.js          — schema SQLite (WAL, FK on)
│   ├── auth.js        — /api/auth/* + middleware requireAuth + rate limit
│   ├── couple.js      — /api/couple/* (invite, join, leave, me)
│   └── finance.js     — /api/transactions, /api/goals, /api/settlements, /api/dashboard
├── public/
│   ├── index.html
│   ├── styles.css     — estilos (paleta bordeaux/ouro/creme)
│   └── app.js         — SPA com hash router
└── db/lovablelock.sqlite  (criado no 1º boot)
```

## Endpoints REST

| Método | Path | Descrição |
| --- | --- | --- |
| POST | `/api/auth/register` | cria conta (valida senha forte, rate-limited) |
| POST | `/api/auth/login` | login (cookie httpOnly, rate-limited) |
| POST | `/api/auth/logout` | derruba sessão |
| GET | `/api/auth/me` | usuário atual |
| POST | `/api/couple/invite` | gera código 6 chars |
| POST | `/api/couple/join` | entra com código (rate-limited) |
| POST | `/api/couple/leave` | sai do casal |
| GET/PATCH | `/api/couple/me` | dados do casal |
| PATCH | `/api/account/balance` | ajusta caixa |
| GET/POST/DELETE | `/api/transactions` | despesas |
| GET/POST/DELETE | `/api/goals` | metas |
| POST | `/api/goals/:id/contribute` | aporte na meta |
| POST | `/api/settlements` | acerto entre os dois |
| GET | `/api/dashboard` | tudo agregado |

## Segurança

- `JWT_SECRET` obrigatório com mínimo de 32 caracteres (boot falha caso contrário)
- senhas com bcrypt (cost 12)
- comparação bcrypt dummy no login para nivelar timing (evita user enumeration)
- JWT em cookie `httpOnly + sameSite=strict + secure em produção`
- rate limiting em `/api/auth/login`, `/api/auth/register` e `/api/couple/join`
- queries 100% parametrizadas (better-sqlite3 prepared statements)
- transações atômicas em operações compostas (lançamento, acerto, exclusão)
- validação Zod em todas as entradas, IDs numéricos validados
- escape de HTML em todas as strings vindas do servidor (`esc()` no frontend)
- CSP restritivo + `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`
- `x-powered-by` desabilitado
- 404 explícito para rotas `/api/*` não existentes

## Notas para produção

Esta aplicação foi pensada para **uso local entre duas pessoas**. Para colocar em produção:

- coloque atrás de um reverse proxy com HTTPS (nginx, Caddy, Cloudflare Tunnel)
- defina `NODE_ENV=production` para ativar `secure` cookies
- ative `trust proxy` (já tratado no código quando em produção)
- faça backup periódico do `db/lovablelock.sqlite`
- considere adicionar 2FA, logs de auditoria e revisão profissional antes de expor publicamente

## Próximos passos sugeridos

- recorrência (assinaturas mensais auto-lançadas)
- export CSV
- foto/recibo anexo
- notificação por email quando o parceiro lança despesa grande
- PWA / install no celular
- testes automatizados (jest/vitest)
