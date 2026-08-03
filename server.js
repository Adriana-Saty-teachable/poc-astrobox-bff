/**
 * POC - BFF Proxy para testar se o astro-dashboard envia requests via atributo `bff`
 *
 * Modos de operação:
 *   MOCK_MODE=true  → Retorna respostas salvas em ./mocks/ (sem precisar de token/API)
 *   MOCK_MODE=false → Proxy real para a API do Astrobox (precisa de token válido)
 *
 * Como usar:
 * 1. npm install
 * 2. Configure .env com ASTROBOX_API_URL, HOTMART_TOKEN, e opcionalmente MOCK_MODE=true
 * 3. npm start
 * 4. No frontend, use: <astro-dashboard bff="http://localhost:3099" ... />
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ============================================================
// CONFIG
// ============================================================
const PORT = process.env.PORT || 3099;
const ASTROBOX_API_URL = process.env.ASTROBOX_API_URL || 'https://api-astrobox.buildstaging.com';
const HOTMART_TOKEN = process.env.HOTMART_TOKEN || 'YOUR_TOKEN_HERE';
const DASHBOARD_ID = 'e1452c16-84fe-4c53-92b7-8f8f19794292';
const MOCK_MODE = process.env.MOCK_MODE === 'true';

// ============================================================
// MOCK RESPONSES — mapeia path → arquivo de mock
// ============================================================
const MOCK_MAP = {
  'GET:/v1/resource/dashboard/:id': 'mocks/dashboard.json',
  'GET:/v1/features/list': 'mocks/features-list.json',
  'POST:/v1/executor/reactive/component': 'mocks/executor-component.ndjson',
  // Adicione mais mocks conforme necessário:
  // 'POST:/v1/executor/reactive/by-id': 'mocks/executor-by-id.ndjson',
};

/**
 * Tenta encontrar um mock para o request
 * Suporta patterns com :param (ex: /v1/resource/dashboard/:id)
 */
function findMock(method, path) {
  // Tenta match exato primeiro
  const exactKey = `${method}:${path}`;
  if (MOCK_MAP[exactKey]) return MOCK_MAP[exactKey];

  // Tenta match com pattern
  for (const [pattern, file] of Object.entries(MOCK_MAP)) {
    const colonIndex = pattern.indexOf(':');
    const patternMethod = pattern.substring(0, colonIndex);
    const patternPath = pattern.substring(colonIndex + 1);
    if (patternMethod !== method) continue;

    const patternParts = patternPath.split('/');
    const pathParts = path.split('/');

    if (patternParts.length !== pathParts.length) continue;

    const matches = patternParts.every((part, i) =>
      part.startsWith(':') || part === pathParts[i]
    );

    if (matches) return file;
  }

  return null;
}

// ============================================================
// APP
// ============================================================
const app = express();

// Middlewares
app.use(cors()); // aceita requests de qualquer origem (POC)
app.use(express.json({ limit: '10mb' }));
app.use(express.text({ type: 'application/x-ndjson' }));

// Logger — mostra tudo que chega
app.use((req, res, next) => {
  console.log('\n' + '='.repeat(60));
  console.log(`📥 ${req.method} ${req.path}`);
  console.log(`   Query: ${JSON.stringify(req.query)}`);
  console.log(`   Headers relevantes:`);
  console.log(`     Content-Type: ${req.headers['content-type'] || '(nenhum)'}`);
  console.log(`     Authorization: ${req.headers['authorization'] ? '***presente***' : '(nenhum)'}`);
  console.log(`     X-Client-Name: ${req.headers['x-client-name'] || '(nenhum)'}`);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log(`   Body: ${JSON.stringify(req.body, null, 2)}`);
  }
  console.log('='.repeat(60));
  next();
});

// ============================================================
// ROUTES
// ============================================================
app.all('/*', async (req, res) => {
  // ---- MOCK MODE ----
  if (MOCK_MODE) {
    const mockFile = findMock(req.method, req.path);

    if (mockFile) {
      const filePath = join(__dirname, mockFile);

      if (existsSync(filePath)) {
        console.log(`🎭 MOCK MODE — Retornando: ${mockFile}`);
        const data = readFileSync(filePath, 'utf-8');
        const contentType = mockFile.endsWith('.ndjson')
          ? 'application/x-ndjson'
          : 'application/json';
        res.setHeader('Content-Type', contentType);
        res.status(200).send(data);
        return;
      } else {
        console.log(`⚠️  MOCK MODE — Arquivo não encontrado: ${filePath}`);
        res.status(404).json({ error: `Mock file not found: ${mockFile}` });
        return;
      }
    }

    // Sem mock definido pra essa rota — retorna 501
    console.log(`⚠️  MOCK MODE — Nenhum mock definido para: ${req.method} ${req.path}`);
    res.status(501).json({
      error: 'No mock defined for this route',
      method: req.method,
      path: req.path,
      hint: 'Add an entry to MOCK_MAP in server.js',
    });
    return;
  }

  // ---- PROXY MODE ----
  const targetUrl = `${ASTROBOX_API_URL}${req.path}`;
  const queryString = new URLSearchParams(req.query).toString();
  const fullUrl = queryString ? `${targetUrl}?${queryString}` : targetUrl;

  console.log(`\n🔀 Repassando para: ${fullUrl}`);

  try {
    const headers = {
      'Content-Type': req.headers['content-type'] || 'application/json',
      'Accept': req.headers['accept'] || 'application/json',
      'Authorization': `Bearer ${HOTMART_TOKEN}`,
      'X-Client-Name': 'poc-bff-teachable',
    };

    // Forward X-Request-ID if present
    if (req.headers['x-request-id']) {
      headers['X-Request-ID'] = req.headers['x-request-id'];
    }

    const fetchOptions = {
      method: req.method,
      headers,
    };

    // Só inclui body em POST/PUT/PATCH
    if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
      fetchOptions.body = JSON.stringify(req.body);
    }

    const response = await fetch(fullUrl, fetchOptions);

    console.log(`✅ Resposta do Astrobox: ${response.status} ${response.statusText}`);

    // Forward content-type da resposta
    const contentType = response.headers.get('content-type') || 'application/json';
    res.setHeader('Content-Type', contentType);
    res.status(response.status);

    // Lê e loga preview da resposta
    const data = await response.text();
    console.log(`   Resposta (preview): ${data.substring(0, 200)}${data.length > 200 ? '...' : ''}`);
    res.send(data);
  } catch (error) {
    console.error(`❌ Erro ao repassar: ${error.message}`);
    res.status(502).json({
      error: 'Falha ao comunicar com Astrobox',
      details: error.message,
    });
  }
});

// ============================================================
// START
// ============================================================
app.listen(PORT, () => {
  const mode = MOCK_MODE ? '🎭 MOCK' : '🔀 PROXY';
  console.log(`
╔══════════════════════════════════════════════════════════╗
║  POC BFF ${mode} rodando em http://localhost:${PORT}    ║
╠══════════════════════════════════════════════════════════╣
║                                                          ║
║  Modo: ${MOCK_MODE ? 'MOCK (retorna JSONs de ./mocks/)'.padEnd(48) : 'PROXY (repassa para API)'.padEnd(48)}║
║  Astrobox API: ${ASTROBOX_API_URL.padEnd(40)}║
║  Dashboard:   ${DASHBOARD_ID.padEnd(40)}║${MOCK_MODE ? '' : `
║  Token: ${HOTMART_TOKEN === 'YOUR_TOKEN_HERE' ? '⚠️  NÃO CONFIGURADO'.padEnd(47) : '✅ Configurado'.padEnd(47)}║`}
║                                                          ║
║  Use no microfrontend:                                   ║
║  <astro-dashboard                                        ║
║    bff="http://localhost:${PORT}"                          ║
║    dashboard-id="${DASHBOARD_ID}"   ║
║    language="pt-BR"                                      ║
║    user-id="test-user"                                   ║
║  />                                                      ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
  `);
});
