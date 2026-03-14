import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const repoRoot = process.cwd();
const configDir = path.resolve(repoRoot, 'config');
const markdownBoundariesPath = process.env.OPENCLAW_MARKDOWN_BOUNDARIES_PATH
  ? path.resolve(process.env.OPENCLAW_MARKDOWN_BOUNDARIES_PATH)
  : path.resolve(configDir, 'markdown-boundaries.json');

function toDate(value) {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed;
}

function hashContent(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

function normalizeSlashes(value) {
  return String(value ?? '').replaceAll('\\', '/');
}

function isWithin(root, absolutePath) {
  return absolutePath === root || absolutePath.startsWith(`${root}${path.sep}`);
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
  let cursor = repoRoot;
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
  const [scores, tasks, events, sessions] = await Promise.all([
    loadJson(runtimeRoot, 'scores.json'),
    loadJson(runtimeRoot, 'tasks.json'),
    loadJson(runtimeRoot, 'events.json'),
    loadJson(runtimeRoot, 'sessions.json'),
  ]);

  const sources = { scores, tasks, events, sessions };
  const meta = buildMeta(collectedAtMs, sources);
  const sourceStatus = buildSourceStatus(collectedAtMs, sources);

  return {
    collectedAtMs,
    runtimeRoot,
    sources,
    scores: scores.ok ? scores.data : {},
    tasks: tasks.ok ? tasks.data : [],
    events: events.ok ? events.data : [],
    sessions: sessions.ok ? sessions.data : [],
    meta,
    sourceStatus,
  };
}

function computeActiveTask(tasksForAgent) {
  const sorted = [...tasksForAgent].sort((a, b) => {
    const aAt = toDate(a.updated_at || a.created_at)?.getTime() ?? 0;
    const bAt = toDate(b.updated_at || b.created_at)?.getTime() ?? 0;
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
    ...(Array.isArray(snapshot.sessions)
      ? snapshot.sessions.map((s) => s.agent_id ?? s.agentId).filter(Boolean)
      : []),
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

const NOISE_EVENT_KINDS = new Set(['worker-tick', 'worker-skip']);

function eventTimeMs(event) {
  return toDate(event?.at)?.getTime() ?? 0;
}

function deriveEventSeverity({ kind, message }) {
  const normalizedKind = String(kind ?? '').toLowerCase();
  const normalizedMessage = String(message ?? '').toLowerCase();

  if (normalizedKind.includes('error') || normalizedMessage.includes('error') || normalizedMessage.includes('failed')) return 'error';
  if (normalizedKind.includes('blocked') || normalizedMessage.includes('blocked') || normalizedKind.includes('degraded')) return 'warn';
  return 'info';
}

function parseTaskMessage(message) {
  const match = String(message ?? '').match(/^(assigned|completed|blocked|cancelled|reopened) task: (.+)$/i);
  if (!match) return null;
  return {
    action: match[1].toLowerCase(),
    subject: match[2].trim(),
  };
}

function deriveEventTitle({ kind, message }) {
  if (kind === 'task') {
    const parsed = parseTaskMessage(message);
    if (parsed) return `Task ${parsed.action}`;
    return 'Task event';
  }
  if (kind === 'dispatch') return 'Task dispatch';
  if (kind === 'worker-tick') return 'Worker tick';
  if (kind === 'worker-skip') return 'Worker skip';
  return kind ? `${kind} event` : 'Event';
}

function deriveEventSummary({ kind, message }) {
  if (kind === 'task') {
    const parsed = parseTaskMessage(message);
    if (parsed) return parsed.subject;
  }
  return String(message ?? '').trim();
}

function normalizeEventRecord(event, { index } = {}) {
  const kind = typeof event?.kind === 'string' ? event.kind : 'unknown';
  const message = typeof event?.message === 'string' ? event.message : '';
  const at = typeof event?.at === 'string' ? event.at : null;
  let agentId = typeof event?.agentId === 'string'
    ? event.agentId
    : (typeof event?.agent_id === 'string' ? event.agent_id : null);

  // For dispatch events, the actor is often the dispatcher; derive the target agent from message.
  if (kind === 'dispatch' && typeof message === 'string') {
    const match = message.match(/\bto\s+([a-z0-9_-]+)\s*$/i);
    if (match) agentId = match[1];
  }
  const source = typeof event?.source === 'string' ? event.source : 'runtime';

  const severity = typeof event?.severity === 'string'
    ? event.severity
    : deriveEventSeverity({ kind, message });

  const title = typeof event?.title === 'string'
    ? event.title
    : deriveEventTitle({ kind, message });

  const summary = typeof event?.summary === 'string'
    ? event.summary
    : deriveEventSummary({ kind, message });

  return {
    ...event,
    at,
    kind,
    severity,
    agentId,
    // keep legacy field for compatibility
    agent_id: typeof event?.agent_id === 'string' ? event.agent_id : agentId,
    source,
    title,
    summary,
    message,
    _index: index,
  };
}

function normalizeEvents(rawEvents) {
  const items = Array.isArray(rawEvents) ? rawEvents : [];
  const normalized = items.map((event, index) => normalizeEventRecord(event, { index }));
  normalized.sort((a, b) => {
    const delta = eventTimeMs(b) - eventTimeMs(a);
    if (delta !== 0) return delta;
    return (a._index ?? 0) - (b._index ?? 0);
  });
  return normalized;
}

function mergeNoiseEvents(events) {
  const merged = [];

  for (const event of events) {
    const previous = merged.at(-1);
    const isNoise = NOISE_EVENT_KINDS.has(event.kind);

    if (
      previous
      && isNoise
      && previous.kind === event.kind
      && previous.agentId === event.agentId
    ) {
      previous.count = (previous.count ?? 1) + 1;
      previous.atEnd = event.at ?? previous.atEnd ?? null;
      previous.summary = previous.count > 1
        ? `${previous.summary} (+${previous.count - 1} similar)`
        : previous.summary;
      continue;
    }

    merged.push({ ...event });
  }

  return merged;
}

function buildTimeline(events) {
  // Input is expected sorted by at DESC.
  const items = [];

  for (const event of events) {
    if (NOISE_EVENT_KINDS.has(event.kind)) continue;

    if (event.kind === 'task') {
      const parsed = parseTaskMessage(event.message);
      if (!parsed) continue;
      const severity = parsed.action === 'blocked' ? 'warn' : 'info';
      items.push({
        at: event.at,
        kind: `task.${parsed.action}`,
        severity,
        agentId: event.agentId,
        source: event.source,
        title: `Task ${parsed.action}`,
        summary: parsed.subject,
        message: event.message,
        extra: event.extra,
        _index: event._index,
      });
      continue;
    }

    if (event.kind === 'dispatch') {
      items.push({
        at: event.at,
        kind: 'dispatch',
        severity: 'info',
        agentId: event.agentId,
        source: event.source,
        title: 'Task dispatched',
        summary: event.summary,
        message: event.message,
        extra: event.extra,
        _index: event._index,
      });
    }
  }

  // Stable order: timeline is time-ascending (oldest first).
  items.sort((a, b) => {
    const delta = eventTimeMs(a) - eventTimeMs(b);
    if (delta !== 0) return delta;
    return (a._index ?? 0) - (b._index ?? 0);
  });

  return items;
}

function getNowMs(snapshot) {
  if (process.env.OPENCLAW_NOW_ISO) {
    const parsed = Date.parse(process.env.OPENCLAW_NOW_ISO);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return snapshot?.collectedAtMs ?? Date.now();
}

function collapseWhitespace(value) {
  return String(value ?? '').replaceAll(/\s+/g, ' ').trim();
}

function summarizeTaskTitle(title, maxLen = 48) {
  const normalized = collapseWhitespace(title);
  const stripped = normalized.replace(/^\[[^\]]+\]\s*/, '');
  if (stripped.length <= maxLen) return stripped;
  return `${stripped.slice(0, maxLen - 1)}…`;
}

function classifyBacklogTasks(tasksForAgent) {
  const backlogStatuses = new Set(['todo', 'blocked', 'in_progress']);
  const backlog = tasksForAgent.filter((task) => backlogStatuses.has(task.status));
  const sorted = [...backlog].sort((a, b) => {
    const aAt = toDate(a.updated_at || a.created_at)?.getTime() ?? 0;
    const bAt = toDate(b.updated_at || b.created_at)?.getTime() ?? 0;
    return bAt - aAt;
  });
  return {
    backlog: sorted,
    current: sorted[0] ?? null,
    next: sorted[1] ?? null,
  };
}

function extractEvidenceLinkFromEvent(event) {
  const extra = event?.extra && typeof event.extra === 'object' ? event.extra : {};
  for (const key of ['issue_url', 'pr_url', 'html_url', 'url', 'link']) {
    if (typeof extra[key] === 'string' && extra[key].startsWith('http')) return extra[key];
  }
  const messageUrl = String(event?.message ?? '').match(/https?:\/\/\S+/);
  return messageUrl ? messageUrl[0] : null;
}

function normalizeSessions(rawSessions) {
  const items = Array.isArray(rawSessions) ? rawSessions : [];
  const activeStates = new Set(['active', 'running', 'busy']);

  return items.map((session, index) => {
    const agentId = typeof session?.agentId === 'string'
      ? session.agentId
      : (typeof session?.agent_id === 'string' ? session.agent_id : null);
    const status = typeof session?.status === 'string'
      ? session.status
      : (typeof session?.state === 'string' ? session.state : 'unknown');

    const lastActiveAt = session?.last_active_at ?? session?.lastActiveAt ?? session?.updated_at ?? session?.updatedAt ?? null;
    const lastActiveAtMs = toDate(lastActiveAt)?.getTime() ?? null;

    const link = typeof session?.link === 'string'
      ? session.link
      : (typeof session?.url === 'string' ? session.url : null);

    return {
      agentId,
      status,
      active: activeStates.has(String(status).toLowerCase()),
      lastActiveAt: typeof lastActiveAt === 'string' ? lastActiveAt : null,
      lastActiveAtMs,
      link: typeof link === 'string' && link.startsWith('http') ? link : null,
      _index: index,
    };
  }).filter((session) => Boolean(session.agentId));
}

function buildStaffView({ snapshot, agents, normalizedEvents }) {
  const nowMs = getNowMs(snapshot);
  const workingWindowMs = Number.parseInt(process.env.OPENCLAW_WORKING_WINDOW_MS ?? '600000', 10);

  const sessions = normalizeSessions(snapshot.sessions);

  const sessionsByAgent = new Map();
  for (const session of sessions) {
    const list = sessionsByAgent.get(session.agentId) ?? [];
    list.push(session);
    sessionsByAgent.set(session.agentId, list);
  }

  const eventsByAgent = new Map();
  for (const event of normalizedEvents) {
    const list = eventsByAgent.get(event.agentId) ?? [];
    list.push(event);
    eventsByAgent.set(event.agentId, list);
  }

  const staff = agents.map((agent) => {
    const tasksForAgent = snapshot.tasks.filter((task) => task.agent_id === agent.agentId);
    const backlog = classifyBacklogTasks(tasksForAgent);

    const agentSessions = sessionsByAgent.get(agent.agentId) ?? [];
    const agentEvents = eventsByAgent.get(agent.agentId) ?? [];

    agentSessions.sort((a, b) => (b.lastActiveAtMs ?? 0) - (a.lastActiveAtMs ?? 0) || (a._index ?? 0) - (b._index ?? 0));
    agentEvents.sort((a, b) => eventTimeMs(b) - eventTimeMs(a) || (a._index ?? 0) - (b._index ?? 0));

    const sessionEvidence = agentSessions.find((session) => session.lastActiveAtMs != null) ?? null;
    const eventEvidence = agentEvents.find((evt) => evt.at) ?? null;

    const sessionAtMs = sessionEvidence?.lastActiveAtMs ?? null;
    const eventAtMs = eventEvidence ? eventTimeMs(eventEvidence) : null;

    const lastActiveAtMs = Math.max(sessionAtMs ?? 0, eventAtMs ?? 0) || null;
    const lastActiveAt = lastActiveAtMs ? new Date(lastActiveAtMs).toISOString() : null;

    const hasRecentEvidence = lastActiveAtMs != null && (nowMs - lastActiveAtMs) <= workingWindowMs;
    const hasLiveSession = agentSessions.some((session) => session.active && session.lastActiveAtMs != null && (nowMs - session.lastActiveAtMs) <= workingWindowMs);

    const hasBacklog = backlog.backlog.length > 0;

    const status = hasLiveSession || hasRecentEvidence
      ? 'working'
      : (hasBacklog ? 'standby' : 'idle');

    const currentTask = backlog.current;
    const nextTask = backlog.next;

    const currentSummary = currentTask ? summarizeTaskTitle(currentTask.title) : null;
    const nextSummary = nextTask ? summarizeTaskTitle(nextTask.title) : null;

    const currentActivity = currentSummary
      ? (status === 'working' ? `Working: ${currentSummary}` : `Backlog: ${currentSummary}`)
      : (status === 'working' ? 'Working' : null);

    const nextActivity = nextSummary ? `Next: ${nextSummary}` : null;

    const evidenceLink = (
      agentSessions.map((s) => s.link).find(Boolean)
      ?? agentEvents.map((evt) => extractEvidenceLinkFromEvent(evt)).find(Boolean)
      ?? (typeof currentTask?.issue_url === 'string' && currentTask.issue_url.startsWith('http') ? currentTask.issue_url : null)
      ?? null
    );

    return {
      agentId: agent.agentId,
      displayName: agent.displayName,
      emoji: agent.emoji,
      role: agent.role,
      status,
      currentActivity,
      currentActivityDetail: currentTask ? { taskId: currentTask.id ?? null, issueUrl: currentTask.issue_url ?? null } : null,
      nextActivity,
      nextActivityDetail: nextTask ? { taskId: nextTask.id ?? null, issueUrl: nextTask.issue_url ?? null } : null,
      lastEvidenceLink: evidenceLink,
      lastActiveAt,
    };
  });

  const activityDigest = staff.map((entry) => ({
    agentId: entry.agentId,
    status: entry.status,
    currentActivity: entry.currentActivity,
    nextActivity: entry.nextActivity,
    lastEvidenceLink: entry.lastEvidenceLink,
    lastActiveAt: entry.lastActiveAt,
  }));

  return { staff, activityDigest };
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

  const events = mergeNoiseEvents(normalizeEvents(snapshot.events)).slice(0, 200);
  const timeline = buildTimeline(events).slice(-200);
  const staffView = buildStaffView({ snapshot, agents, normalizedEvents: events });

  return {
    data: {
      agents,
      leaderboard,
      staff: staffView.staff,
      activityDigest: staffView.activityDigest,
      // legacy
      recentEvents: snapshot.events.slice(-50),
      // normalized
      events,
      timeline,
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

  // Legacy: keep raw events strictly filtered by agent_id.
  const rawEvents = snapshot.events
    .filter((evt) => evt.agent_id === agentId)
    .sort((a, b) => (toDate(b.at)?.getTime() ?? 0) - (toDate(a.at)?.getTime() ?? 0));

  const recentEvents = rawEvents.slice(0, 50);

  // Normalized: filter by derived agentId (e.g. dispatch events targeted to this agent).
  const normalizedEvents = normalizeEvents(snapshot.events)
    .filter((evt) => evt.agentId === agentId);

  const events = mergeNoiseEvents(normalizedEvents).slice(0, 200);
  const timeline = buildTimeline(events).slice(-200);

  const markdownFiles = await listMarkdownFiles();

  return {
    data: {
      ...summary,
      tasks,
      // legacy
      recentEvents,
      // normalized
      events,
      timeline,
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

// ---- Event stream helpers (SSE) ----

export async function readEventsForStream({ afterMs } = {}) {
  const collectedAtMs = Date.now();
  const runtimeRoot = await resolveRuntimeRoot();
  const events = await loadJson(runtimeRoot, 'events.json');

  const sources = { events };
  const meta = buildMeta(collectedAtMs, sources);

  const items = Array.isArray(events.ok ? events.data : []) ? (events.ok ? events.data : []) : [];
  const filtered = typeof afterMs === 'number'
    ? items.filter((evt) => (toDate(evt?.at)?.getTime() ?? 0) > afterMs)
    : items;

  return {
    data: filtered,
    meta,
  };
}

// ---- Markdown boundaries + allowlist/rollback/audit ----

let cachedBoundaries = null;
let cachedBoundariesMtimeMs = null;

async function loadMarkdownBoundaries() {
  try {
    const stat = await fs.stat(markdownBoundariesPath);
    if (cachedBoundaries && cachedBoundariesMtimeMs === stat.mtimeMs) return cachedBoundaries;
    const raw = await fs.readFile(markdownBoundariesPath, 'utf8');
    const parsed = JSON.parse(raw);
    cachedBoundaries = parsed;
    cachedBoundariesMtimeMs = stat.mtimeMs;
    return parsed;
  } catch {
    // Conservative fallback: nothing writable.
    return {
      version: 0,
      mode: 'deny-all',
      approvedMarkdownRoots: [],
      deniedPathPrefixes: ['.'],
      deniedPathFragments: ['..'],
      deniedExactNames: [],
      allowedExtensions: ['.md', '.markdown'],
      maxFileSizeBytes: 0,
      requireBackupBeforeWrite: false,
      backupDir: '.rollback/markdown-edits',
      requireAuditLog: false,
      auditLogPath: '.audit/markdown-edits.jsonl',
    };
  }
}

function matchApprovedRoot(relPath, patterns = []) {
  const normalized = normalizeSlashes(relPath);
  return patterns.some((pattern) => {
    const normalizedPattern = normalizeSlashes(pattern);
    if (normalizedPattern.endsWith('**')) {
      const prefix = normalizedPattern.slice(0, normalizedPattern.length - 2);
      return normalized.startsWith(prefix);
    }
    if (normalizedPattern.endsWith('*')) {
      const prefix = normalizedPattern.slice(0, normalizedPattern.length - 1);
      return normalized.startsWith(prefix);
    }
    return normalized === normalizedPattern;
  });
}

function createMarkdownForbidden(code, message, details = undefined) {
  return {
    code,
    message,
    retryable: false,
    ...(details ? { details } : {}),
  };
}

async function resolveMarkdownPath(fileId, { forWrite } = {}) {
  const boundaries = await loadMarkdownBoundaries();

  const raw = normalizeSlashes(fileId).trim();
  if (!raw) {
    return { error: createMarkdownForbidden('INVALID_ARGUMENT', "'fileId' is required") };
  }

  // Back-compat: if passing a bare filename, assume docs/<file>.
  const normalized = raw.includes('/') ? raw.replace(/^\/+/, '') : `docs/${raw}`;

  const relPath = normalizeSlashes(normalized);
  if (boundaries.deniedPathFragments?.some((fragment) => relPath.includes(fragment))) {
    return { error: createMarkdownForbidden('FORBIDDEN_PATH', `Markdown path '${fileId}' contains a forbidden fragment`, { fileId }) };
  }

  if (relPath.startsWith('/')) {
    return { error: createMarkdownForbidden('FORBIDDEN_PATH', 'Absolute paths are not allowed', { fileId }) };
  }

  if (boundaries.deniedPathPrefixes?.some((prefix) => relPath.startsWith(normalizeSlashes(prefix)))) {
    return { error: createMarkdownForbidden('FORBIDDEN_PATH', `Markdown path '${fileId}' is denied by prefix rule`, { fileId }) };
  }

  const baseName = path.basename(relPath);
  if (boundaries.deniedExactNames?.includes(baseName)) {
    return { error: createMarkdownForbidden('FORBIDDEN_PATH', `Markdown path '${fileId}' is denied by name rule`, { fileId }) };
  }

  if (!matchApprovedRoot(relPath, boundaries.approvedMarkdownRoots ?? [])) {
    return {
      error: createMarkdownForbidden('FORBIDDEN_PATH', `Markdown path '${fileId}' is outside approved roots`, {
        fileId,
        approvedMarkdownRoots: boundaries.approvedMarkdownRoots ?? [],
      }),
    };
  }

  const ext = path.extname(relPath);
  if (boundaries.allowedExtensions && !boundaries.allowedExtensions.includes(ext)) {
    return {
      error: createMarkdownForbidden('FORBIDDEN_EXTENSION', `Extension '${ext}' is not allowed`, {
        fileId,
        allowedExtensions: boundaries.allowedExtensions,
      }),
    };
  }

  const absolutePath = path.resolve(repoRoot, relPath);
  if (!isWithin(repoRoot, absolutePath)) {
    return { error: createMarkdownForbidden('FORBIDDEN_PATH', 'Resolved path escapes repository root', { fileId }) };
  }

  if (forWrite) {
    const exists = await pathExists(absolutePath);
    if (!exists) {
      return { error: createMarkdownForbidden('NOT_FOUND', `Markdown file '${fileId}' not found`, { fileId }) };
    }
  }

  return { relPath, absolutePath, boundaries };
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

function resolveDataPath(relativePath) {
  const base = process.env.OPENCLAW_DATA_DIR ? path.resolve(process.env.OPENCLAW_DATA_DIR) : repoRoot;
  const absolute = path.resolve(base, relativePath);
  if (!isWithin(base, absolute)) {
    return { error: createMarkdownForbidden('FORBIDDEN_PATH', 'Data path escapes OPENCLAW_DATA_DIR root', { relativePath }) };
  }
  return { base, absolute };
}

async function walkMarkdownFiles(rootRelative) {
  const absolute = path.resolve(repoRoot, rootRelative);
  if (!isWithin(repoRoot, absolute)) return [];
  if (!(await pathExists(absolute))) return [];

  const results = [];
  const queue = [{ rel: rootRelative, abs: absolute }];

  while (queue.length) {
    const next = queue.pop();
    const entries = await fs.readdir(next.abs, { withFileTypes: true });
    for (const entry of entries) {
      const relChild = normalizeSlashes(path.posix.join(next.rel, entry.name));
      const absChild = path.resolve(next.abs, entry.name);
      if (entry.isDirectory()) {
        queue.push({ rel: relChild, abs: absChild });
      } else if (entry.isFile()) {
        results.push({ rel: relChild, abs: absChild });
      }
    }
  }

  return results;
}

export async function listMarkdownFiles() {
  const collectedAtMs = Date.now();
  const boundaries = await loadMarkdownBoundaries();
  const patterns = boundaries.approvedMarkdownRoots ?? [];

  const rootPrefixes = patterns
    .map((pattern) => normalizeSlashes(pattern))
    .filter((pattern) => pattern.endsWith('/**'))
    .map((pattern) => pattern.slice(0, pattern.length - 3));

  const denyPrefixes = (boundaries.deniedPathPrefixes ?? []).map((prefix) => normalizeSlashes(prefix));

  const seen = new Set();
  const files = [];

  for (const prefix of rootPrefixes) {
    const walked = await walkMarkdownFiles(prefix);
    for (const file of walked) {
      const rel = normalizeSlashes(file.rel);
      if (seen.has(rel)) continue;
      seen.add(rel);

      if (denyPrefixes.some((deny) => rel.startsWith(deny))) continue;
      const ext = path.extname(rel);
      if (boundaries.allowedExtensions && !boundaries.allowedExtensions.includes(ext)) continue;

      const stats = await fs.stat(file.abs);
      files.push({
        fileId: rel,
        path: rel,
        name: path.basename(rel),
        sizeBytes: stats.size,
        updatedAt: stats.mtime.toISOString(),
        writable: true,
      });
    }
  }

  files.sort((a, b) => a.fileId.localeCompare(b.fileId));

  return {
    data: files,
    meta: {
      partial: false,
      collectedAt: new Date(collectedAtMs).toISOString(),
      boundariesVersion: boundaries.version ?? null,
      approvedRoots: patterns,
      fileCount: files.length,
    },
  };
}

export async function readMarkdownFile(fileId) {
  const resolved = await resolveMarkdownPath(fileId, { forWrite: false });
  if (resolved.error) return { error: resolved.error, statusCode: resolved.error.code === 'NOT_FOUND' ? 404 : 403, meta: { partial: false, collectedAt: new Date().toISOString() } };

  try {
    const content = await fs.readFile(resolved.absolutePath, 'utf8');
    const stats = await fs.stat(resolved.absolutePath);
    return {
      data: {
        fileId: resolved.relPath,
        path: resolved.relPath,
        content,
        updatedAt: stats.mtime.toISOString(),
        bytes: Buffer.byteLength(content, 'utf8'),
      },
      meta: { partial: false, collectedAt: new Date().toISOString(), boundariesVersion: resolved.boundaries.version ?? null },
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

export async function previewMarkdownSave(fileId, nextContent) {
  const current = await readMarkdownFile(fileId);
  if (current.error) return current;

  return {
    data: {
      fileId: current.data.fileId,
      path: current.data.path,
      changed: current.data.content !== nextContent,
      diff: createUnifiedDiff(current.data.content, nextContent, current.data.fileId),
      previousBytes: current.data.bytes,
      nextBytes: Buffer.byteLength(nextContent, 'utf8'),
    },
    meta: { ...current.meta },
    statusCode: 200,
  };
}

export async function saveMarkdownFile(fileId, nextContent, expectedContent = undefined, { actor } = {}) {
  const resolved = await resolveMarkdownPath(fileId, { forWrite: true });
  if (resolved.error) return { error: resolved.error, statusCode: resolved.error.code === 'NOT_FOUND' ? 404 : 403, meta: { partial: false, collectedAt: new Date().toISOString() } };

  const boundaries = resolved.boundaries;
  const maxSize = boundaries.maxFileSizeBytes ?? 262144;
  if (Buffer.byteLength(nextContent, 'utf8') > maxSize) {
    return {
      error: createMarkdownForbidden('PAYLOAD_TOO_LARGE', `Markdown content exceeds max size (${maxSize} bytes)`, { fileId: resolved.relPath, maxFileSizeBytes: maxSize }),
      meta: { partial: false, collectedAt: new Date().toISOString(), boundariesVersion: boundaries.version ?? null },
      statusCode: 413,
    };
  }

  const current = await readMarkdownFile(resolved.relPath);
  if (current.error) return current;

  if (typeof expectedContent === 'string' && current.data.content !== expectedContent) {
    return {
      error: {
        code: 'CONFLICT',
        message: `Markdown file '${resolved.relPath}' changed since preview`,
        retryable: true,
        details: { fileId: resolved.relPath },
      },
      meta: { partial: true, collectedAt: new Date().toISOString(), degradeReasons: ['stale_expected_content'] },
      statusCode: 409,
    };
  }

  const oldHash = hashContent(current.data.content);
  const newHash = hashContent(nextContent);

  const nowIso = new Date().toISOString();

  let backupPath = null;
  if (boundaries.requireBackupBeforeWrite) {
    const backupTarget = resolveDataPath(boundaries.backupDir ?? '.rollback/markdown-edits');
    if (backupTarget.error) return { error: backupTarget.error, statusCode: 403, meta: { partial: false, collectedAt: nowIso } };
    await ensureDir(backupTarget.absolute);

    const safeRel = resolved.relPath.replaceAll('/', '__');
    const stamp = nowIso.replaceAll(':', '-').replaceAll('.', '-');
    const backupName = `${stamp}__${safeRel}__${oldHash}.bak.md`;
    const backupAbs = path.resolve(backupTarget.absolute, backupName);
    await fs.writeFile(backupAbs, current.data.content, 'utf8');
    backupPath = path.relative(backupTarget.base, backupAbs);
  }

  await fs.writeFile(resolved.absolutePath, nextContent, 'utf8');
  const diff = createUnifiedDiff(current.data.content, nextContent, resolved.relPath);
  const stats = await fs.stat(resolved.absolutePath);

  let auditRecord = null;
  if (boundaries.requireAuditLog) {
    const auditTarget = resolveDataPath(boundaries.auditLogPath ?? '.audit/markdown-edits.jsonl');
    if (auditTarget.error) return { error: auditTarget.error, statusCode: 403, meta: { partial: false, collectedAt: nowIso } };
    await ensureDir(path.dirname(auditTarget.absolute));

    auditRecord = {
      actor: actor ?? 'unknown',
      fileId: resolved.relPath,
      oldHash,
      newHash,
      backupPath,
      timestamp: nowIso,
    };
    await fs.appendFile(auditTarget.absolute, `${JSON.stringify(auditRecord)}\n`, 'utf8');
  }

  return {
    data: {
      fileId: resolved.relPath,
      path: resolved.relPath,
      saved: true,
      changed: current.data.content !== nextContent,
      diff,
      oldHash,
      newHash,
      backupPath,
      audit: auditRecord,
      updatedAt: stats.mtime.toISOString(),
      bytes: Buffer.byteLength(nextContent, 'utf8'),
    },
    meta: { partial: false, collectedAt: nowIso, boundariesVersion: boundaries.version ?? null },
    statusCode: 200,
  };
}
