import fs from 'node:fs/promises';
import path from 'node:path';

const collectedAt = '2026-03-08T17:37:05Z';
const docsDir = path.resolve(process.cwd(), 'docs');
const markdownAllowlist = new Set([
  'dashboard-agent-aggregation.examples.md',
  'self-monitoring-mvp-backend-contract.md',
]);

const baseMeta = {
  partial: false,
  collectedAt,
  sourceLagMs: 2100,
  degradeReasons: [],
};

const agents = [
  {
    agentId: 'buding',
    displayName: '布丁',
    emoji: '🍮',
    role: '后端开发',
    title: '接口与服务实现者',
    status: 'active',
    healthScore: 92,
    currentModel: 'openai/gpt-5.4',
    currentBranch: 'claw/buding/实现-dashboard-与-agent-详情页的后端聚合接口',
    activeTask: {
      title: '实现 Dashboard 与 Agent 详情页的后端聚合接口',
      issueNumber: 23,
      issueUrl: 'https://github.com/gstranded/openclaw-monitor/issues/23',
      priority: 'high',
      state: 'in_progress',
      notes: '先交前端可接入的最小真实接口',
    },
    lastActivityAt: '2026-03-08T17:37:00Z',
    throughput24h: 1,
    stabilityScore: 95,
    degraded: false,
    degradeReasons: [],
    collectedAt,
    sourceLagMs: 2100,
  },
];

const sourceStatus = [
  { name: 'session', status: 'ok', message: 'session snapshot fresh', collectedAt },
  { name: 'workspace', status: 'ok', message: 'TASK.md parsed', collectedAt },
  { name: 'github', status: 'degraded', message: 'issue metadata cache reused', collectedAt },
  { name: 'git', status: 'ok', message: 'branch resolved', collectedAt },
  { name: 'events', status: 'ok', message: 'recent events available', collectedAt },
];

const recentEvents = [
  {
    eventId: 'evt_task_progress_001',
    timestamp: '2026-03-08T17:36:12Z',
    agentId: 'buding',
    kind: 'task.progressed',
    title: '更新聚合接口契约',
    summary: '补充 Dashboard 与 Agent 详情页的 OpenAPI 定义',
    severity: 'info',
    source: 'git',
    links: [{ label: 'Issue #23', url: 'https://github.com/gstranded/openclaw-monitor/issues/23' }],
    metadata: {
      branch: 'claw/buding/实现-dashboard-与-agent-详情页的后端聚合接口',
    },
    degraded: false,
  },
];

const leaderboard = [
  {
    agentId: 'buding',
    displayName: '布丁',
    role: '后端开发',
    rank: 1,
    leaderboardScore: 88.4,
    completedCount7d: 1,
    throughput24h: 1,
    stabilityScore: 95,
    healthScore: 92,
    lastActivityAt: '2026-03-08T17:37:00Z',
    trend: 'up',
    degraded: false,
  },
];

function buildMeta(overrides = {}) {
  return { ...baseMeta, ...overrides };
}

export function listAgents({ status, role, limit }) {
  let results = [...agents];
  if (status) results = results.filter((item) => item.status === status);
  if (role) results = results.filter((item) => item.role === role);
  if (typeof limit === 'number') results = results.slice(0, limit);
  return { data: results, meta: baseMeta };
}

export function getAgentDetail(agentId) {
  const summary = agents.find((item) => item.agentId === agentId);
  if (!summary) return null;
  return {
    data: {
      ...summary,
      recentEvents,
      sourceStatus,
    },
    meta: buildMeta({ partial: true, degradeReasons: ['github_issue_cache_reused'] }),
  };
}

export function getLeaderboard({ limit, sortBy = 'score', window = '24h' }) {
  let results = [...leaderboard];
  const sorters = {
    score: (a, b) => b.leaderboardScore - a.leaderboardScore,
    throughput: (a, b) => b.throughput24h - a.throughput24h,
    stability: (a, b) => b.stabilityScore - a.stabilityScore,
  };
  results.sort(sorters[sortBy] ?? sorters.score);
  results = results.map((item, index) => ({ ...item, rank: index + 1 }));
  if (typeof limit === 'number') results = results.slice(0, limit);
  return {
    data: results,
    meta: buildMeta({ window, sortBy }),
  };
}

export function createNotFound(agentId) {
  return {
    error: {
      code: 'NOT_FOUND',
      message: `Agent '${agentId}' not found`,
      retryable: false,
      details: { agentId },
    },
    meta: baseMeta,
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
    meta: buildMeta({ allowlistRoot: 'docs', allowlistCount: files.length }),
  };
}

export async function readMarkdownFile(fileId) {
  const resolved = resolveAllowedMarkdown(fileId);
  if (resolved.error) return { error: resolved.error, statusCode: 403 };

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
      meta: buildMeta({ allowlistRoot: 'docs' }),
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
        meta: baseMeta,
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
    meta: buildMeta({ allowlistRoot: 'docs' }),
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
      meta: buildMeta({ partial: true, degradeReasons: ['stale_expected_content'] }),
      statusCode: 409,
    };
  }

  const resolved = resolveAllowedMarkdown(fileId);
  if (resolved.error) return { error: resolved.error, statusCode: 403 };

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
    meta: buildMeta({ allowlistRoot: 'docs' }),
    statusCode: 200,
  };
}
