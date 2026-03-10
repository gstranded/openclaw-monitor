import fs from 'node:fs/promises';
import path from 'node:path';

const docsDir = path.resolve(process.cwd(), 'docs');
const markdownAllowlist = new Set([
  'dashboard-agent-aggregation.examples.md',
  'self-monitoring-mvp-backend-contract.md',
]);

function toDate(value) {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed;
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveRuntimeRoot() {
  if (process.env.OPENCLAW_RUNTIME_DIR) return path.resolve(process.env.OPENCLAW_RUNTIME_DIR);

  // Heuristic: walk up a few levels looking for tasks.json.
  let cursor = process.cwd();
  for (let i = 0; i < 8; i += 1) {
    const candidate = path.join(cursor, 'tasks.json');
    if (await pathExists(candidate)) return cursor;
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }

  // Fallback: prefer empty snapshot with explicit degrade reason.
  return null;
}

async function loadJson(runtimeRoot, filename) {
  if (!runtimeRoot) {
    return {
      ok: false,
      filename,
      error: { code: 'RUNTIME_ROOT_NOT_FOUND', message: 'Unable to resolve runtime root' },
    };
  }

  const absolutePath = path.join(runtimeRoot, filename);
  try {
    const [raw, stat] = await Promise.all([
      fs.readFile(absolutePath, 'utf8'),
      fs.stat(absolutePath),
    ]);
    return {
      ok: true,
      filename,
      absolutePath,
      data: JSON.parse(raw),
      mtimeMs: stat.mtimeMs,
    };
  } catch (error) {
    return {
      ok: false,
      filename,
      absolutePath,
      error: { code: error?.code ?? 'READ_FAILED', message: error?.message ?? String(error) },
    };
  }
}

function buildFreshness(collectedAtMs, source) {
  if (!source?.ok) return { ok: false };
  const lagMs = Math.max(0, collectedAtMs - source.mtimeMs);
  return {
    ok: true,
    updatedAt: new Date(source.mtimeMs).toISOString(),
    lagMs,
  };
}

function buildMeta(collectedAtMs, sources, extra = {}) {
  const degradeReasons = [];
  for (const [name, source] of Object.entries(sources)) {
    if (!source?.ok) degradeReasons.push(`${name}_unavailable`);
  }

  const freshness = Object.fromEntries(Object.entries(sources).map(([name, source]) => [name, buildFreshness(collectedAtMs, source)]));
  const lagCandidates = Object.values(freshness)
    .filter((item) => item?.ok)
    .map((item) => item.lagMs);
  const sourceLagMs = lagCandidates.length ? Math.max(...lagCandidates) : undefined;

  const partial = degradeReasons.length > 0;

  return {
    partial,
    collectedAt: new Date(collectedAtMs).toISOString(),
    ...(typeof sourceLagMs === 'number' ? { sourceLagMs } : {}),
    degradeReasons,
    freshness,
    ...extra,
  };
}

function buildSourceStatus(collectedAtMs, sources) {
  return Object.entries(sources).map(([name, source]) => {
    if (source?.ok) {
      return {
        name,
        status: 'ok',
        message: `${name} loaded`,
        collectedAt: new Date(collectedAtMs).toISOString(),
        updatedAt: new Date(source.mtimeMs).toISOString(),
      };
    }
    return {
      name,
      status: 'degraded',
      message: `${name} unavailable: ${source?.error?.code ?? 'UNKNOWN'}`,
      collectedAt: new Date(collectedAtMs).toISOString(),
      updatedAt: null,
    };
  });
}

async function loadSnapshot() {
  const collectedAtMs = Date.now();
  const runtimeRoot = await resolveRuntimeRoot();
  const [scores, tasks, events] = await Promise.all([
    loadJson(runtimeRoot, 'scores.json'),
    loadJson(runtimeRoot, 'tasks.json'),
    loadJson(runtimeRoot, 'events.json'),
  ]);

  const sources = { scores, tasks, events };
  const meta = buildMeta(collectedAtMs, sources);
  const sourceStatus = buildSourceStatus(collectedAtMs, sources);

  return {
    collectedAtMs,
    runtimeRoot,
    sources,
    scores: scores.ok ? scores.data : {},
    tasks: tasks.ok ? tasks.data : [],
    events: events.ok ? events.data : [],
    meta,
    sourceStatus,
  };
}

function computeActiveTask(tasksForAgent) {
  const sorted = [...tasksForAgent].sort((a, b) => {
    const aAt = toDate(a.updated_at || a.updated_at || a.created_at)?.getTime() ?? 0;
    const bAt = toDate(b.updated_at || b.updated_at || b.created_at)?.getTime() ?? 0;
    return bAt - aAt;
  });

  const candidate = sorted.find((t) => t.status === 'todo' || t.status === 'blocked') ?? sorted[0];
  if (!candidate) return null;
  return {
    taskId: candidate.id,
    title: candidate.title,
    issueUrl: candidate.issue_url,
    priority: candidate.priority,
    status: candidate.status,
    updatedAt: candidate.updated_at ?? null,
  };
}

function computeLastActivityAt(eventsForAgent) {
  const times = eventsForAgent
    .map((evt) => toDate(evt.at)?.getTime())
    .filter((value) => typeof value === 'number');
  if (!times.length) return null;
  return new Date(Math.max(...times)).toISOString();
}

function computeAgentStatus(activeTask, lastActivityAtIso) {
  if (activeTask?.status === 'blocked') return 'blocked';
  if (activeTask?.status === 'todo') return 'active';
  const last = toDate(lastActivityAtIso)?.getTime();
  if (last && Date.now() - last < 30 * 60 * 1000) return 'active';
  if (last) return 'idle';
  return 'unknown';
}

function normalizeAgents(snapshot) {
  const scoreEntries = snapshot.scores && typeof snapshot.scores === 'object' ? snapshot.scores : {};
  const agentIds = new Set([
    ...Object.keys(scoreEntries),
    ...snapshot.tasks.map((t) => t.agent_id).filter(Boolean),
    ...snapshot.events.map((e) => e.agent_id).filter(Boolean),
  ]);

  const agents = Array.from(agentIds).sort().map((agentId) => {
    const score = scoreEntries[agentId] ?? {};
    const tasksForAgent = snapshot.tasks.filter((t) => t.agent_id === agentId);
    const eventsForAgent = snapshot.events.filter((e) => e.agent_id === agentId);

    const activeTask = computeActiveTask(tasksForAgent);
    const lastActivityAt = computeLastActivityAt(eventsForAgent);
    const status = computeAgentStatus(activeTask, lastActivityAt);

    return {
      agentId,
      displayName: score.name ?? agentId,
      emoji: score.emoji ?? '',
      role: score.role ?? 'unknown',
      score: typeof score.score === 'number' ? score.score : 0,
      status,
      activeTask,
      lastActivityAt,
      degraded: snapshot.meta.partial,
      degradeReasons: snapshot.meta.degradeReasons,
    };
  });

  return agents;
}

export function createNotFound(agentId, meta) {
  return {
    error: {
      code: 'NOT_FOUND',
      message: `Agent '${agentId}' not found`,
      retryable: false,
      details: { agentId },
    },
    meta,
  };
}

export async function getDashboard() {
  const snapshot = await loadSnapshot();
  const agents = normalizeAgents(snapshot);
  const leaderboard = [...agents]
    .sort((a, b) => b.score - a.score)
    .map((entry, index) => ({
      agentId: entry.agentId,
      displayName: entry.displayName,
      role: entry.role,
      rank: index + 1,
      score: entry.score,
      lastActivityAt: entry.lastActivityAt,
      degraded: entry.degraded,
    }));

  return {
    data: {
      agents,
      leaderboard,
      recentEvents: snapshot.events.slice(-50),
      sourceStatus: snapshot.sourceStatus,
    },
    meta: snapshot.meta,
  };
}

export async function listAgents({ status, role, limit } = {}) {
  const snapshot = await loadSnapshot();
  let results = normalizeAgents(snapshot);
  if (status) results = results.filter((item) => item.status === status);
  if (role) results = results.filter((item) => item.role === role);
  if (typeof limit === 'number') results = results.slice(0, limit);
  return { data: results, meta: snapshot.meta };
}

export async function getAgentDetail(agentId) {
  const snapshot = await loadSnapshot();
  const agents = normalizeAgents(snapshot);
  const summary = agents.find((item) => item.agentId === agentId);
  if (!summary) return null;

  const tasks = snapshot.tasks
    .filter((t) => t.agent_id === agentId)
    .sort((a, b) => (toDate(b.updated_at)?.getTime() ?? 0) - (toDate(a.updated_at)?.getTime() ?? 0))
    .slice(0, 50);

  const recentEvents = snapshot.events
    .filter((evt) => evt.agent_id === agentId)
    .sort((a, b) => (toDate(b.at)?.getTime() ?? 0) - (toDate(a.at)?.getTime() ?? 0))
    .slice(0, 50);

  const markdownFiles = await listMarkdownFiles();

  return {
    data: {
      ...summary,
      tasks,
      recentEvents,
      sourceStatus: snapshot.sourceStatus,
      markdownFiles: markdownFiles.data,
    },
    meta: snapshot.meta,
  };
}

export async function getLeaderboard({ limit, sortBy = 'score', window = '24h' } = {}) {
  const snapshot = await loadSnapshot();
  const agents = normalizeAgents(snapshot);
  const sorters = {
    score: (a, b) => b.score - a.score,
    activity: (a, b) => (toDate(b.lastActivityAt)?.getTime() ?? 0) - (toDate(a.lastActivityAt)?.getTime() ?? 0),
  };

  let results = [...agents].sort(sorters[sortBy] ?? sorters.score);
  results = results.map((entry, index) => ({
    agentId: entry.agentId,
    displayName: entry.displayName,
    role: entry.role,
    rank: index + 1,
    score: entry.score,
    lastActivityAt: entry.lastActivityAt,
    degraded: entry.degraded,
  }));

  if (typeof limit === 'number') results = results.slice(0, limit);

  return {
    data: results,
    meta: { ...snapshot.meta, window, sortBy },
  };
}

function resolveAllowedMarkdown(fileId) {
  if (!markdownAllowlist.has(fileId)) {
    return {
      error: {
        code: 'FORBIDDEN_PATH',
        message: `Markdown file '${fileId}' is not in the allowlist`,
        retryable: false,
        details: { fileId, allowlist: Array.from(markdownAllowlist) },
      },
    };
  }

  const absolutePath = path.resolve(docsDir, fileId);
  if (!absolutePath.startsWith(`${docsDir}${path.sep}`)) {
    return {
      error: {
        code: 'FORBIDDEN_PATH',
        message: `Markdown file '${fileId}' resolves outside the allowlist root`,
        retryable: false,
        details: { fileId },
      },
    };
  }

  return { absolutePath };
}

function createUnifiedDiff(previousContent, nextContent, fileId) {
  if (previousContent === nextContent) {
    return `--- a/${fileId}\n+++ b/${fileId}\n@@ no changes @@`;
  }

  return [
    `--- a/${fileId}`,
    `+++ b/${fileId}`,
    '@@ -1 +1 @@',
    ...previousContent.split('\n').map((line) => `-${line}`),
    ...nextContent.split('\n').map((line) => `+${line}`),
  ].join('\n');
}

export async function listMarkdownFiles() {
  const collectedAtMs = Date.now();
  const files = await Promise.all(Array.from(markdownAllowlist).sort().map(async (fileId) => {
    const absolutePath = path.resolve(docsDir, fileId);
    const stats = await fs.stat(absolutePath);
    return {
      fileId,
      path: `docs/${fileId}`,
      name: path.basename(fileId),
      sizeBytes: stats.size,
      updatedAt: stats.mtime.toISOString(),
      writable: true,
    };
  }));

  return {
    data: files,
    meta: {
      partial: false,
      collectedAt: new Date(collectedAtMs).toISOString(),
      allowlistRoot: 'docs',
      allowlistCount: files.length,
    },
  };
}

export async function readMarkdownFile(fileId) {
  const resolved = resolveAllowedMarkdown(fileId);
  if (resolved.error) return { error: resolved.error, statusCode: 403, meta: { partial: false, collectedAt: new Date().toISOString() } };

  try {
    const content = await fs.readFile(resolved.absolutePath, 'utf8');
    const stats = await fs.stat(resolved.absolutePath);
    return {
      data: {
        fileId,
        path: `docs/${fileId}`,
        content,
        updatedAt: stats.mtime.toISOString(),
        bytes: Buffer.byteLength(content, 'utf8'),
      },
      meta: { partial: false, collectedAt: new Date().toISOString(), allowlistRoot: 'docs' },
      statusCode: 200,
    };
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return {
        error: {
          code: 'NOT_FOUND',
          message: `Markdown file '${fileId}' not found`,
          retryable: false,
          details: { fileId },
        },
        meta: { partial: true, collectedAt: new Date().toISOString(), degradeReasons: ['markdown_missing'] },
        statusCode: 404,
      };
    }
    throw error;
  }
}

export async function previewMarkdownSave(fileId, nextContent) {
  const current = await readMarkdownFile(fileId);
  if (current.error) return current;

  return {
    data: {
      fileId,
      path: current.data.path,
      changed: current.data.content !== nextContent,
      diff: createUnifiedDiff(current.data.content, nextContent, fileId),
      previousBytes: current.data.bytes,
      nextBytes: Buffer.byteLength(nextContent, 'utf8'),
    },
    meta: { partial: false, collectedAt: new Date().toISOString(), allowlistRoot: 'docs' },
    statusCode: 200,
  };
}

export async function saveMarkdownFile(fileId, nextContent, expectedContent = undefined) {
  const current = await readMarkdownFile(fileId);
  if (current.error) return current;

  if (typeof expectedContent === 'string' && current.data.content !== expectedContent) {
    return {
      error: {
        code: 'CONFLICT',
        message: `Markdown file '${fileId}' changed since preview`,
        retryable: true,
        details: { fileId },
      },
      meta: { partial: true, collectedAt: new Date().toISOString(), degradeReasons: ['stale_expected_content'] },
      statusCode: 409,
    };
  }

  const resolved = resolveAllowedMarkdown(fileId);
  if (resolved.error) return { error: resolved.error, statusCode: 403, meta: { partial: false, collectedAt: new Date().toISOString() } };

  await fs.writeFile(resolved.absolutePath, nextContent, 'utf8');
  const diff = createUnifiedDiff(current.data.content, nextContent, fileId);
  const stats = await fs.stat(resolved.absolutePath);

  return {
    data: {
      fileId,
      path: current.data.path,
      saved: true,
      changed: current.data.content !== nextContent,
      diff,
      updatedAt: stats.mtime.toISOString(),
      bytes: Buffer.byteLength(nextContent, 'utf8'),
    },
    meta: { partial: false, collectedAt: new Date().toISOString(), allowlistRoot: 'docs' },
    statusCode: 200,
  };
}
