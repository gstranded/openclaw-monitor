const collectedAt = '2026-03-08T17:37:05Z';

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
  {
    name: 'session',
    status: 'ok',
    message: 'session snapshot fresh',
    collectedAt,
  },
  {
    name: 'workspace',
    status: 'ok',
    message: 'TASK.md parsed',
    collectedAt,
  },
  {
    name: 'github',
    status: 'degraded',
    message: 'issue metadata cache reused',
    collectedAt,
  },
  {
    name: 'git',
    status: 'ok',
    message: 'branch resolved',
    collectedAt,
  },
  {
    name: 'events',
    status: 'ok',
    message: 'recent events available',
    collectedAt,
  },
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
    links: [
      {
        label: 'Issue #23',
        url: 'https://github.com/gstranded/openclaw-monitor/issues/23',
      },
    ],
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

export function listAgents({ status, role, limit }) {
  let results = [...agents];

  if (status) {
    results = results.filter((item) => item.status === status);
  }

  if (role) {
    results = results.filter((item) => item.role === role);
  }

  if (typeof limit === 'number') {
    results = results.slice(0, limit);
  }

  return {
    data: results,
    meta: baseMeta,
  };
}

export function getAgentDetail(agentId) {
  const summary = agents.find((item) => item.agentId === agentId);

  if (!summary) {
    return null;
  }

  return {
    data: {
      ...summary,
      recentEvents,
      sourceStatus,
    },
    meta: {
      ...baseMeta,
      partial: true,
      degradeReasons: ['github_issue_cache_reused'],
    },
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

  if (typeof limit === 'number') {
    results = results.slice(0, limit);
  }

  return {
    data: results,
    meta: {
      ...baseMeta,
      window,
      sortBy,
    },
  };
}

export function createNotFound(agentId) {
  return {
    error: {
      code: 'NOT_FOUND',
      message: `Agent '${agentId}' not found`,
      retryable: false,
      details: {
        agentId,
      },
    },
    meta: baseMeta,
  };
}
