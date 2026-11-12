#!/usr/bin/env node
// dsh-plugin-provider-usage — uso y rendimiento por proveedor/modelo.
// Tools: status, sessions, session.

import path from 'node:path';
import os from 'node:os';
import { mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';

const VERSION = '0.1.0';
const DSH_HOME = (() => {
  const v = process.env.DSH_HOME && process.env.DSH_HOME.trim();
  return v || path.join(process.env.USERPROFILE || process.env.HOME || os.homedir(), '.dsh');
})();
const PROJ_ROOT = path.join(DSH_HOME, 'storages', 'session_projcache', 'sessions');
const log = (m) => process.stderr.write(`[usage] ${m}\n`);

function unwrap(value) { return value && typeof value === 'object' && 'val' in value ? value.val : value; }
function num(value) { return typeof value === 'number' && Number.isFinite(value) ? value : 0; }
function pct(part, total) { return total > 0 ? (part / total) * 100 : 0; }
function fmtTokens(tokens) {
  if (tokens >= 1e6) return `${(tokens / 1e6).toFixed(2)}M`;
  if (tokens >= 1e3) return `${(tokens / 1e3).toFixed(1)}k`;
  return String(Math.round(tokens));
}

function readSession(file) {
  try {
    const data = JSON.parse(readFileSync(file, 'utf8')) || {};
    const rows = data.record?.rows || {};
    const usage = unwrap(rows.tokenUsage) || {};
    const stats = unwrap(rows.sessionStats) || {};
    const model = unwrap(rows.modelSelection) || {};
    const title = unwrap(rows.title);
    const meta = unwrap(rows.sessionListMetadata) || {};
    return {
      file,
      sessionId: path.basename(file, '.json'),
      title: typeof title === 'string' ? title : null,
      model: model.lastUsed ? { provider: model.lastUsed.provider || null, model: model.lastUsed.model || null, reasoningEffort: model.lastUsed.reasoningEffort || null } : null,
      lastPromptAt: num(meta.lastPromptAt),
      mtime: statSync(file).mtimeMs,
      totals: {
        uncachedInputTokens: num(usage.totals?.uncachedInputTokens),
        outputTokens: num(usage.totals?.outputTokens),
        cacheReadTokens: num(usage.totals?.cacheReadTokens),
        cacheWriteTokens: num(usage.totals?.cacheWriteTokens),
      },
      last: usage.last || null,
      stats: { turns: num(stats.turns), steps: num(stats.steps), llmMs: num(stats.llmMs), toolMs: num(stats.toolMs), ttftMs: num(stats.ttftMs), ttftSteps: num(stats.ttftSteps), decodeMs: num(stats.decodeMs), decodeTokens: num(stats.decodeTokens) },
    };
  } catch { return null; }
}
function allSessions(limit = 500) {
  let files = [];
  try { files = readdirSync(PROJ_ROOT, { withFileTypes: true }).filter((e) => e.isFile() && e.name.endsWith('.json')).map((e) => path.join(PROJ_ROOT, e.name)); } catch { return []; }
  return files.map(readSession).filter(Boolean).sort((a, b) => (b.lastPromptAt || b.mtime) - (a.lastPromptAt || a.mtime)).slice(0, limit);
}

function aggregate(sessions) {
  const totals = { uncachedInputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  const stats = { turns: 0, steps: 0, llmMs: 0, toolMs: 0, ttftMs: 0, ttftSteps: 0, decodeMs: 0, decodeTokens: 0 };
  for (const session of sessions) {
    for (const key of Object.keys(totals)) totals[key] += session.totals[key];
    for (const key of Object.keys(stats)) stats[key] += session.stats[key];
  }
  const billedInput = totals.uncachedInputTokens + totals.cacheReadTokens;
  return {
    sessions: sessions.length,
    totals,
    stats,
    cacheHitRate: pct(totals.cacheReadTokens, billedInput),
    decodeTokensPerSecond: stats.decodeMs > 0 ? stats.decodeTokens / (stats.decodeMs / 1000) : 0,
    avgTtftMs: stats.ttftSteps > 0 ? stats.ttftMs / stats.ttftSteps : 0,
    outputPerTurn: stats.turns > 0 ? totals.outputTokens / stats.turns : 0,
    toolShare: pct(stats.toolMs, stats.llmMs + stats.toolMs),
  };
}
function modelCounts(sessions) {
  const counts = new Map();
  for (const session of sessions) {
    const key = session.model ? `${session.model.provider || '?'}/${session.model.model || '?'}${session.model.reasoningEffort ? ` (${session.model.reasoningEffort})` : ''}` : 'sin modelo';
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}
function textResult(text) { return { content: [{ type: 'text', text }] }; }

function buildInstructions() {
  return [
    'Provider Usage: uso y rendimiento de tokens por sesión/modelo en el harness.',
    '',
    `Datos: ${PROJ_ROOT}`,
    '',
    'Herramientas: status, sessions, session.',
    '',
    'Reglas:',
    '- Solo lectura: no modifica datos ni envía métricas a ningún lado.',
    '- Las cifras salen de tokenUsage/sessionStats/modelSelection de la cache de proyección.',
    '- Reporta ratios reales (cache hit, tokens/s, TTFT); si faltan datos lo indica.',
  ].join('\n');
}

function buildServer() {
  const server = new McpServer({ name: 'dsh-plugin-provider-usage', version: VERSION }, { capabilities: { tools: {} }, instructions: buildInstructions() });

  server.registerTool(
    'status',
    { title: 'Estado global', description: 'Totales de tokens, cache hit, velocidad de decodificación y modelos usados.', inputSchema: z.object({}) },
    async () => {
      const sessions = allSessions();
      if (sessions.length === 0) return textResult(`Sin sesiones en ${PROJ_ROOT}.`);
      const agg = aggregate(sessions);
      return textResult([
        `Sesiones: ${agg.sessions} · turnos: ${agg.stats.turns} · pasos: ${agg.stats.steps}`,
        '',
        `Tokens: input sin cache ${fmtTokens(agg.totals.uncachedInputTokens)} · cache read ${fmtTokens(agg.totals.cacheReadTokens)} · cache write ${fmtTokens(agg.totals.cacheWriteTokens)} · output ${fmtTokens(agg.totals.outputTokens)}`,
        `Cache hit: ${agg.cacheHitRate.toFixed(1)}%`,
        `Velocidad: ${agg.decodeTokensPerSecond.toFixed(0)} tokens/s · TTFT medio ${agg.avgTtftMs.toFixed(0)} ms`,
        `Output por turno: ${fmtTokens(agg.outputPerTurn)} tokens · tools ${agg.toolShare.toFixed(1)}% del tiempo`,
        '',
        'Modelos (sesiones):',
        ...modelCounts(sessions).map(([name, count]) => `- ${name}: ${count}`),
      ].join('\n'));
    },
  );

  server.registerTool(
    'sessions',
    { title: 'Sesiones por consumo', description: 'Lista sesiones ordenadas por tokens facturables.', inputSchema: z.object({ limit: z.number().int().min(1).max(100).optional() }) },
    async (args) => {
      const sessions = allSessions().slice(0, args.limit ?? 20);
      if (sessions.length === 0) return textResult(`Sin sesiones en ${PROJ_ROOT}.`);
      return textResult(sessions.map((session) => {
        const billed = session.totals.uncachedInputTokens + session.totals.outputTokens;
        const hit = pct(session.totals.cacheReadTokens, session.totals.cacheReadTokens + session.totals.uncachedInputTokens);
        return `${fmtTokens(billed)} · ${session.title || '(sin título)'} · ${session.model ? `${session.model.provider}/${session.model.model}` : 'sin modelo'} · cache ${hit.toFixed(0)}% · ${session.stats.turns} turnos · id ${session.sessionId.slice(0, 8)}`;
      }).join('\n'));
    },
  );

  server.registerTool(
    'session',
    { title: 'Detalle de sesión', description: 'Métricas de una sesión (última por defecto).', inputSchema: z.object({ sessionId: z.string().optional() }) },
    async (args) => {
      const sessions = allSessions();
      const session = args.sessionId ? sessions.find((item) => item.sessionId.startsWith(args.sessionId)) : sessions[0];
      if (!session) throw new Error(`sesión no encontrada: ${args.sessionId || '(ninguna)'}`);
      const billed = session.totals.uncachedInputTokens + session.totals.outputTokens;
      const hit = pct(session.totals.cacheReadTokens, session.totals.cacheReadTokens + session.totals.uncachedInputTokens);
      const speed = session.stats.decodeMs > 0 ? session.stats.decodeTokens / (session.stats.decodeMs / 1000) : 0;
      const ttft = session.stats.ttftSteps > 0 ? session.stats.ttftMs / session.stats.ttftSteps : 0;
      const last = session.last;
      return textResult([
        `# ${session.title || '(sin título)'}`,
        `id: ${session.sessionId}`,
        session.model ? `Modelo: ${session.model.provider}/${session.model.model}${session.model.reasoningEffort ? ` · esfuerzo ${session.model.reasoningEffort}` : ''}` : 'Modelo: desconocido',
        '',
        `Tokens: input ${fmtTokens(session.totals.uncachedInputTokens)} · cache read ${fmtTokens(session.totals.cacheReadTokens)} · output ${fmtTokens(session.totals.outputTokens)} (facturable ${fmtTokens(billed)})`,
        `Cache hit: ${hit.toFixed(1)}% · velocidad ${speed.toFixed(0)} tok/s · TTFT ${ttft.toFixed(0)} ms`,
        `Actividad: ${session.stats.turns} turnos · ${session.stats.steps} pasos`,
        last ? `Último paso (turno ${last.turn}, paso ${last.step}): input ${fmtTokens(num(last.buckets?.uncachedInputTokens))} · output ${fmtTokens(num(last.buckets?.outputTokens))} · cache ${fmtTokens(num(last.buckets?.cacheReadTokens))}` : '',
      ].filter(Boolean).join('\n'));
    },
  );

  return server;
}

try { mkdirSync(path.join(DSH_HOME, 'cache', 'provider-usage'), { recursive: true }); } catch { /* ignora */ }
log(`cache: ${PROJ_ROOT}`);
serveStdio(buildServer, { onerror: (e) => log(`serveStdio: ${e.message}`) });
process.on('uncaughtException', (e) => log(`excepción: ${e.message}`));
process.on('unhandledRejection', (e) => log(`rechazo: ${e && e.message ? e.message : String(e)}`));
