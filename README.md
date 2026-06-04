# LovableLock 💞

Caderno-razão íntimo de duas contas. Controle financeiro a dois — saldos individuais, despesas compartilhadas, metas conjuntas, e o veredicto sereno de **quem deve a quem**.

## Stack

- **Backend:** Node.js + Express + SQLite (better-sqlite3) + bcrypt + JWT (cookie httpOnly)
- **Frontend:** SPA vanilla (sem build), Fraunces + Lora + JetBrains Mono
- **Auth:** senha forte obrigatória (8+, A-Z, a-z, dígito, especial)
- **Pareamento:** código de 6 caracteres, expira em 7 dias

## Funcionalidades

1. Cadastro/login com senha de complexidade enforçada
2. Pareamento entre 2 contas via código
3. Saldo de caixa individual ("quanto tenho em dinheiro/conta")
4. Lançamentos: descrição, valor, categoria, pagador, divisão (50/50, só pagante, custom %)
5. Acerto de contas com cálculo automático de quem deve a quem
6. Metas conjuntas com barra de progresso, prazo e emoji
7. Dashboard editorial: pool, veredicto, gastos do mês por categoria, últimas transações, metas

## Rodar

```bash
npm install
JWT_SECRET=troque-isso PORT=3000 npm start
# abra http://localhost:3000
```

Para desenvolvimento (auto-reload):

```bash
JWT_SECRET=dev-secret npm run dev
```

## Estrutura

```
LovableLock/
├── server/
│   ├── index.js       — boot Express + static
│   ├── db.js          — schema SQLite (WAL, FK on)
│   ├── auth.js        — /api/auth/* + middleware requireAuth
│   ├── couple.js      — /api/couple/* (invite, join, leave, me)
│   └── finance.js     — /api/transactions, /api/goals, /api/settlements, /api/dashboard
├── public/
│   ├── index.html
│   ├── styles.css     — paleta editorial (bordeaux/ouro queimado/creme)
│   └── app.js         — SPA com hash router
└── db/lovablelock.sqlite  (criado no 1º boot)
```

## Endpoints REST

| Método | Path | Descrição |
| --- | --- | --- |
| POST | `/api/auth/register` | cria conta (valida senha forte) |
| POST | `/api/auth/login` | login (cookie httpOnly) |
| POST | `/api/auth/logout` | derruba sessão |
| GET | `/api/auth/me` | usuário atual |
| POST | `/api/couple/invite` | gera código 6 chars |
| POST | `/api/couple/join` | entra com código |
| POST | `/api/couple/leave` | sai do casal |
| GET/PATCH | `/api/couple/me` | dados do casal |
| PATCH | `/api/account/balance` | ajusta caixa |
| GET/POST/DELETE | `/api/transactions` | despesas |
| GET/POST/DELETE | `/api/goals` | metas |
| POST | `/api/goals/:id/contribute` | aporte na meta |
| POST | `/api/settlements` | acerto entre os dois |
| GET | `/api/dashboard` | tudo agregado |

## Segurança

- senhas com bcrypt (cost 12)
- JWT em cookie `httpOnly + sameSite=lax + secure em produção`
- queries parametrizadas (better-sqlite3 prepared statements)
- validação Zod em todas as entradas
- escape de HTML em todas as strings vindas do servidor (`esc()`)
- cabeçalhos: X-Content-Type-Options, X-Frame-Options, Referrer-Policy

## Próximos passos sugeridos

- recorrência (assinaturas mensais auto-lançadas)
- export CSV
- foto/recibo anexo
- notificação por email quando o parceiro lança despesa grande
- PWA / install no celular
