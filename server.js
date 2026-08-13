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
// MOCK RESPONSES — maps path → mock file
// ============================================================
const MOCK_MAP = {
  'GET:/v1/resource/dashboard/:id': 'mocks/dashboard.json',
  'GET:/v1/features/list': 'mocks/features-list.json',
  'POST:/v1/executor/reactive/component': 'mocks/executor-component.ndjson',
  // Add more mocks as needed:
  // 'POST:/v1/executor/reactive/by-id': 'mocks/executor-by-id.ndjson',
};

/**
 * Tries to find a mock for the request
 * Supports patterns with :param (e.g.: /v1/resource/dashboard/:id)
 */
function findMock(method, path) {
  // Try exact match first
  const exactKey = `${method}:${path}`;
  if (MOCK_MAP[exactKey]) return MOCK_MAP[exactKey];

  // Try pattern match
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
app.use(cors()); // accept requests from any origin (POC)
app.use(express.json({ limit: '10mb' }));
app.use(express.text({ type: 'application/x-ndjson' }));

// Logger — shows everything that arrives
app.use((req, res, next) => {
  console.log('\n' + '='.repeat(60));
  console.log(`📥 ${req.method} ${req.path}`);
  console.log(`   Query: ${JSON.stringify(req.query)}`);
  console.log(`   Relevant headers:`);
  console.log(`     Content-Type: ${req.headers['content-type'] || '(none)'}`);
  console.log(`     Authorization: ${req.headers['authorization'] ? '***present***' : '(none)'}`);
  console.log(`     X-Client-Name: ${req.headers['x-client-name'] || '(none)'}`);
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
        console.log(`🎭 MOCK MODE — Returning: ${mockFile}`);
        const data = readFileSync(filePath, 'utf-8');
        const contentType = mockFile.endsWith('.ndjson')
          ? 'application/x-ndjson'
          : 'application/json';
        res.setHeader('Content-Type', contentType);
        res.status(200).send(data);
        return;
      } else {
        console.log(`⚠️  MOCK MODE — File not found: ${filePath}`);
        res.status(404).json({ error: `Mock file not found: ${mockFile}` });
        return;
      }
    }

    // No mock defined for this route — return 501
    console.log(`⚠️  MOCK MODE — No mock defined for: ${req.method} ${req.path}`);
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

  console.log(`\n🔀 Forwarding to: ${fullUrl}`);

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

    // Only include body for POST/PUT/PATCH
    if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
      // If body is already a string (e.g.: ndjson parsed by express.text), send as is
      if (typeof req.body === 'string') {
        fetchOptions.body = req.body;
      } else {
        fetchOptions.body = JSON.stringify(req.body);
      }
      console.log(`   📤 Body sent (preview): ${fetchOptions.body.substring(0, 300)}${fetchOptions.body.length > 300 ? '...' : ''}`);
    }

    const response = await fetch(fullUrl, fetchOptions);

    console.log(`${response.status < 400 ? '✅' : '❌'} Astrobox response: ${response.status} ${response.statusText}`);

    // Forward response content-type
    const contentType = response.headers.get('content-type') || 'application/json';
    res.setHeader('Content-Type', contentType);
    res.status(response.status);

    // Read and log response preview
    const data = await response.text();
    if (response.status >= 400) {
      // Show full response on error
      console.log(`   ⚠️  Full error response:`);
      console.log(`   ${data}`);
    } else {
      console.log(`   Response (preview): ${data.substring(0, 200)}${data.length > 200 ? '...' : ''}`);
    }
    res.send(data);
  } catch (error) {
    console.error(`❌ Error forwarding: ${error.message}`);
    res.status(502).json({
      error: 'Failed to communicate with Astrobox',
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
║  POC BFF ${mode} running at http://localhost:${PORT}    ║
╠══════════════════════════════════════════════════════════╣
║                                                          ║
║  Mode: ${MOCK_MODE ? 'MOCK (returns JSONs from ./mocks/)'.padEnd(48) : 'PROXY (forwards to API)'.padEnd(48)}║
║  Astrobox API: ${ASTROBOX_API_URL.padEnd(40)}║
║  Dashboard:   ${DASHBOARD_ID.padEnd(40)}║${MOCK_MODE ? '' : `
║  Token: ${HOTMART_TOKEN === 'YOUR_TOKEN_HERE' ? '⚠️  NOT CONFIGURED'.padEnd(47) : '✅ Configured'.padEnd(47)}║`}
║                                                          ║
║  Usage at frontend:                                      ║
║  <astro-dashboard                                        ║
║    bff="http://localhost:${PORT}"                        ║
║    dashboard-id="${DASHBOARD_ID}"                        ║
║    language="pt-BR"                                      ║
║    user-id="test-user"                                   ║
║  />                                                      ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
  `);
});
