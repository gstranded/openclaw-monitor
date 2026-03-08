import { createNotFound, getAgentDetail, getLeaderboard, listAgents } from './data.js';

const AGENT_STATUSES = new Set(['active', 'idle', 'blocked', 'offline', 'unknown']);
const LEADERBOARD_WINDOWS = new Set(['24h', '7d']);
const LEADERBOARD_SORT_FIELDS = new Set(['score', 'throughput', 'stability']);

function json(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(payload, null, 2));
}

function createMeta() {
  return {
    partial: false,
    collectedAt: new Date().toISOString(),
    degradeReasons: [],
  };
}

function createInvalidArgument(message, details = undefined) {
  return {
    error: {
      code: 'INVALID_ARGUMENT',
      message,
      retryable: false,
      ...(details ? { details } : {}),
    },
    meta: createMeta(),
  };
}

function parseInteger(value, { name, min, max } = {}) {
  if (value == null || value === '') {
    return { value: undefined };
  }

  if (!/^-?\d+$/.test(value)) {
    return {
      error: createInvalidArgument(`Query parameter '${name}' must be an integer`, {
        parameter: name,
        value,
      }),
    };
  }

  const parsed = Number.parseInt(value, 10);

  if (typeof min === 'number' && parsed < min) {
    return {
      error: createInvalidArgument(`Query parameter '${name}' must be >= ${min}`, {
        parameter: name,
        value: parsed,
        min,
      }),
    };
  }

  if (typeof max === 'number' && parsed > max) {
    return {
      error: createInvalidArgument(`Query parameter '${name}' must be <= ${max}`, {
        parameter: name,
        value: parsed,
        max,
      }),
    };
  }

  return { value: parsed };
}

function parseEnum(value, allowedValues, name) {
  if (value == null || value === '') {
    return { value: undefined };
  }

  if (!allowedValues.has(value)) {
    return {
      error: createInvalidArgument(
        `Query parameter '${name}' must be one of: ${Array.from(allowedValues).join(', ')}`,
        {
          parameter: name,
          value,
          allowedValues: Array.from(allowedValues),
        },
      ),
    };
  }

  return { value };
}

export function route(request, response, url) {
  if (request.method !== 'GET') {
    json(response, 405, createInvalidArgument('Only GET is supported in this MVP'));
    return;
  }

  if (url.pathname === '/health') {
    json(response, 200, { ok: true });
    return;
  }

  if (url.pathname === '/api/v1/agents') {
    const limit = parseInteger(url.searchParams.get('limit'), {
      name: 'limit',
      min: 1,
      max: 200,
    });
    const status = parseEnum(url.searchParams.get('status'), AGENT_STATUSES, 'status');

    if (limit.error) {
      json(response, 400, limit.error);
      return;
    }

    if (status.error) {
      json(response, 400, status.error);
      return;
    }

    json(response, 200, listAgents({
      status: status.value,
      role: url.searchParams.get('role') ?? undefined,
      limit: limit.value,
    }));
    return;
  }

  if (url.pathname.startsWith('/api/v1/agents/')) {
    const agentId = decodeURIComponent(url.pathname.replace('/api/v1/agents/', ''));
    const payload = getAgentDetail(agentId);

    if (!payload) {
      json(response, 404, createNotFound(agentId));
      return;
    }

    json(response, 200, payload);
    return;
  }

  if (url.pathname === '/api/v1/leaderboard') {
    const limit = parseInteger(url.searchParams.get('limit'), {
      name: 'limit',
      min: 1,
      max: 100,
    });
    const window = parseEnum(url.searchParams.get('window'), LEADERBOARD_WINDOWS, 'window');
    const sortBy = parseEnum(url.searchParams.get('sortBy'), LEADERBOARD_SORT_FIELDS, 'sortBy');

    if (limit.error) {
      json(response, 400, limit.error);
      return;
    }

    if (window.error) {
      json(response, 400, window.error);
      return;
    }

    if (sortBy.error) {
      json(response, 400, sortBy.error);
      return;
    }

    json(response, 200, getLeaderboard({
      window: window.value ?? '24h',
      sortBy: sortBy.value ?? 'score',
      limit: limit.value,
    }));
    return;
  }

  json(response, 404, {
    error: {
      code: 'NOT_FOUND',
      message: `Route '${url.pathname}' not found`,
      retryable: false,
    },
    meta: createMeta(),
  });
}
