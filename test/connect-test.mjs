// Test end-to-end de provider-usage con cache de proyección sintética.
import path from 'node:path';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const packageDir = path.resolve(import.meta.dirname, '..');
const tmpDir = path.join(packageDir, 'test', 'tmp');
rmSync(tmpDir, { recursive: true, force: true });
const home = path.join(tmpDir, 'dsh-home');
const proj = path.join(home, 'storages', 'session_projcache', 'sessions');
mkdirSync(proj, { recursive: true });

const wrap = (val) => ({ ver: 1, seq: 10, val });
function writeSession(sessionId, rows) { writeFileSync(path.join(proj, `${sessionId}.json`), JSON.stringify({ version: 7, record: { rows } }), 'utf8'); }
writeSession('aaaa-session', {
  title: wrap('Sesión A'),
  modelSelection: wrap({ lastUsed: { provider: 'deepseek-official', model: 'deepseek-flash', reasoningEffort: 'high' }, pending: null }),
  tokenUsage: wrap({ totals: { uncachedInputTokens: 500, outputTokens: 1000, cacheReadTokens: 1000, cacheWriteTokens: 0 }, last: { turn: 3, step: 1, buckets: { uncachedInputTokens: 10, outputTokens: 20, cacheReadTokens: 100, cacheWriteTokens: 0 } } }),
  sessionStats: wrap({ turns: 3, steps: 10, llmMs: 2000, toolMs: 1000, ttftMs: 500, ttftSteps: 10, decodeMs: 1000, decodeTokens: 1000 }),
  sessionListMetadata: wrap({ lastPromptAt: 1794454320800 }),
});
writeSession('bbbb-session', {
  title: wrap('Sesión B'),
  tokenUsage: wrap({ totals: { uncachedInputTokens: 100, outputTokens: 200, cacheReadTokens: 300, cacheWriteTokens: 0 } }),
  sessionStats: wrap({ turns: 1, steps: 2, llmMs: 1000, toolMs: 1000, ttftMs: 100, ttftSteps: 2, decodeMs: 500, decodeTokens: 200 }),
  sessionListMetadata: wrap({ lastPromptAt: 1794454220800 }),
});
writeFileSync(path.join(proj, 'roto.json'), '{ mal', 'utf8');

function makeClient() {
  const entry = process.env.USAGE_SERVER ? path.resolve(process.env.USAGE_SERVER) : path.join(packageDir, 'server.mjs');
  const transport = new StdioClientTransport({ command: process.execPath, args: [entry], env: { SystemRoot: process.env.SystemRoot || 'C:\\Windows', PATH: process.env.PATH, USERPROFILE: process.env.USERPROFILE, HOME: process.env.HOME || process.env.USERPROFILE, TEMP: process.env.TEMP, TMP: process.env.TMP, DSH_HOME: home }, stderr: 'pipe' });
  transport.stderr?.on('data', (c) => process.stderr.write(`[server] ${c}`));
  const client = new Client({ name: 'usage-test', version: '1.0.0' }, { capabilities: {}, versionNegotiation: { mode: 'auto' } });
  return client.connect(transport).then(() => ({ client, transport }));
}
const textOf = (r) => (r.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');

const { client, transport } = await makeClient();
console.log('tools:', (await client.listTools()).tools.map((t) => t.name).join(', '));
const status = textOf(await client.callTool({ name: 'status', arguments: {} }));
console.log('--- status ---'); console.log(status);
console.log('cache hit 68.4%:', status.includes('68.4%'));
console.log('velocidad 800 tok/s:', status.includes('800 tokens/s'));
console.log('modelo listado:', status.includes('deepseek-official/deepseek-flash'));
console.log('output/turno 300:', status.includes('300 tokens'));
console.log('sesiones 2:', status.includes('Sesiones: 2'));
const sessions = textOf(await client.callTool({ name: 'sessions', arguments: {} }));
console.log('--- sessions ---'); console.log(sessions);
console.log('ordena por billable A primero:', sessions.split('\n')[0].includes('Sesión A'));
const detail = textOf(await client.callTool({ name: 'session', arguments: { sessionId: 'aaaa' } }));
console.log('--- session ---'); console.log(detail);
console.log('detalle turnos:', detail.includes('3 turnos') && detail.includes('1000 tok/s'));
const missing = await client.callTool({ name: 'session', arguments: { sessionId: 'no-existe' } });
console.log('inexistente isError:', missing.isError === true);
await client.close(); try { await transport.close?.(); } catch {}
console.log('OK');
