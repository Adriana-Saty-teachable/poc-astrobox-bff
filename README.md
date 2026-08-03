# POC - BFF Proxy para Astro-Dashboard

Servidor mínimo para validar que o `<astro-dashboard>` envia requests pelo atributo `bff`.

## Setup

```bash
cd poc-bff
npm install
```

## Uso

### 1. Configurar

Edite as variáveis no topo do `server.js`, ou passe via ambiente:

```bash
export ASTROBOX_API_URL="https://api.astrobox.hotmart.com"  # URL real da API
export HOTMART_TOKEN="eyJhbG..."                             # Token obtido manualmente
```

### 2. Rodar

```bash
npm start
```

O servidor sobe em `http://localhost:3099`.

### 3. Testar no microfrontend

```html
<astro-dashboard
  bff="http://localhost:3099"
  dashboard-id="SEU_DASHBOARD_ID"
  language="pt-BR"
  user-id="test-user"
/>
```

**Não passe `token`** — o proxy injeta automaticamente.

### 4. Observar

No terminal do servidor, você vai ver logs de cada request:

```
============================================================
📥 GET /v1/resource/dashboard/abc123
   Headers relevantes:
     Authorization: (nenhum)
     X-Client-Name: astro-dashboard
   Body: (vazio)
============================================================

🔀 Repassando para: https://api.astrobox.hotmart.com/v1/resource/dashboard/abc123
✅ Resposta do Astrobox: 200 OK
```

## O que validar

- [ ] As requests do microfrontend estão chegando no proxy (aparecem no log)
- [ ] O path está correto (`/v1/resource/dashboard/{id}`, `/v1/executor/...`)
- [ ] A resposta do Astrobox chega e o dashboard renderiza
- [ ] Sem `token` no frontend, o dashboard ainda funciona (proxy injeta)

## Endpoints esperados

| Método | Path | Quando |
|--------|------|--------|
| GET | `/v1/resource/dashboard/{id}` | Ao carregar o dashboard |
| POST | `/v1/executor/reactive/by-id` | Ao executar queries (visualizações) |
| POST | `/v1/executor/reactive/component` | Ao executar componentes salvos |

## Próximos passos (pós-POC)

1. Adicionar autenticação do usuário Teachable (middleware de sessão)
2. Injetar `school_id` no body baseado no usuário logado
3. Mover token pro Secrets Manager
4. Deployar como serviço real
