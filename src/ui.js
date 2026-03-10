function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function layout({ title, body, headExtra = '', bodyAttrs = '', scripts = [] }) {
  const scriptTags = scripts.map((src) => `<script src="${src}" defer></script>`).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root{
      --bg:#0b1020; --panel:#111a33; --panel2:#0f1730;
      --text:#e9edf7; --muted:#9aa7c7; --line:#223055;
      --ok:#19c37d; --warn:#f59e0b; --err:#ef4444; --link:#60a5fa;
      --mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      --sans: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
    }
    *{ box-sizing:border-box; }
    body{ margin:0; font-family:var(--sans); background:radial-gradient(1200px 900px at 20% -10%, #1a2a55 0%, transparent 60%), var(--bg); color:var(--text); }
    a{ color:var(--link); text-decoration:none; }
    a:hover{ text-decoration:underline; }
    header{ padding:18px 18px 12px; border-bottom:1px solid var(--line); background:rgba(17,26,51,.65); backdrop-filter: blur(6px); position:sticky; top:0; z-index:10; }
    header .row{ display:flex; align-items:center; gap:12px; justify-content:space-between; flex-wrap:wrap; }
    header .title{ font-weight:700; letter-spacing:.2px; }
    header .crumbs{ color:var(--muted); font-size:13px; }
    main{ padding:18px; max-width:1200px; margin:0 auto; }
    .grid{ display:grid; gap:14px; }
    .grid.cols-2{ grid-template-columns: 1.2fr .8fr; }
    @media (max-width: 980px){ .grid.cols-2{ grid-template-columns:1fr; } }
    .panel{ background: linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.03)); border:1px solid var(--line); border-radius:14px; padding:14px; }
    .panel h2{ margin:0 0 10px; font-size:14px; color:#cfe0ff; letter-spacing:.25px; }
    .muted{ color:var(--muted); }
    .pill{ display:inline-flex; align-items:center; gap:8px; padding:6px 10px; border-radius:999px; border:1px solid var(--line); background:rgba(0,0,0,.18); font-size:12px; }
    .dot{ width:8px; height:8px; border-radius:999px; background:var(--muted); }
    .dot.ok{ background:var(--ok); }
    .dot.warn{ background:var(--warn); }
    .dot.err{ background:var(--err); }
    .cards{ display:grid; gap:10px; grid-template-columns: repeat(4, minmax(0, 1fr)); }
    @media (max-width: 980px){ .cards{ grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 560px){ .cards{ grid-template-columns: 1fr; } }
    .card{ border:1px solid var(--line); border-radius:14px; padding:12px; background:rgba(15,23,48,.7); }
    .card .name{ font-weight:700; display:flex; gap:8px; align-items:center; }
    .card .sub{ margin-top:4px; color:var(--muted); font-size:12px; }
    .kvs{ display:grid; grid-template-columns: 180px 1fr; gap:6px 10px; font-size:13px; }
    @media (max-width: 560px){ .kvs{ grid-template-columns: 1fr; } }
    pre{ background:rgba(0,0,0,.25); border:1px solid var(--line); border-radius:12px; padding:12px; overflow:auto; font-family:var(--mono); font-size:12px; line-height:1.5; }
    textarea{ width:100%; min-height: 260px; border-radius:12px; border:1px solid var(--line); background:rgba(0,0,0,.22); color:var(--text); padding:10px; font-family:var(--mono); font-size:12px; }
    button{ cursor:pointer; border-radius:12px; border:1px solid var(--line); background:rgba(255,255,255,.06); color:var(--text); padding:10px 12px; font-weight:650; }
    button:hover{ background:rgba(255,255,255,.09); }
    .row{ display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
    .spacer{ flex:1; }
    .status{ padding:10px 12px; border-radius:12px; border:1px solid var(--line); background:rgba(0,0,0,.18); font-size:13px; }
    .status.ok{ border-color: rgba(25,195,125,.45); }
    .status.warn{ border-color: rgba(245,158,11,.45); }
    .status.err{ border-color: rgba(239,68,68,.45); }
    .list{ display:grid; gap:8px; }
    .item{ padding:10px 12px; border-radius:12px; border:1px solid var(--line); background:rgba(15,23,48,.55); }
    .item .top{ display:flex; gap:10px; align-items:center; justify-content:space-between; }
    .item .meta{ margin-top:6px; font-size:12px; color:var(--muted); }
  </style>
  ${headExtra}
</head>
<body ${bodyAttrs}>
<header>
  <div class="row">
    <div>
      <div class="title">openclaw-monitor</div>
      <div class="crumbs">${body.crumbs ?? ''}</div>
    </div>
    <div class="row">
      <a class="pill" href="/"><span class="dot ok"></span>Dashboard</a>
      <a class="pill" href="/markdown"><span class="dot"></span>Markdown</a>
    </div>
  </div>
</header>
<main>
  ${body.content}
</main>
${scriptTags}
</body>
</html>`;
}

export function renderDashboardPage() {
  const content = `
  <div class="grid" style="gap:18px">
    <div class="panel">
      <h2>Agent 状态卡片</h2>
      <div id="agents" class="cards"><div class="muted">加载中…</div></div>
    </div>

    <div class="grid cols-2">
      <div class="panel">
        <h2>积分排行榜</h2>
        <div id="leaderboard" class="list"><div class="muted">加载中…</div></div>
      </div>
      <div class="panel">
        <h2>Markdown allowlist</h2>
        <div id="mdFiles" class="list"><div class="muted">加载中…</div></div>
      </div>
    </div>

    <div class="panel">
      <h2>说明</h2>
      <div class="muted">MVP：Dashboard → Agent 详情 → allowlist Markdown 浏览/预览/保存（受控 API）。</div>
    </div>
  </div>
  `;

  return layout({
    title: 'openclaw-monitor · Dashboard',
    bodyAttrs: 'data-page="dashboard"',
    scripts: ['/static/shared.js', '/static/dashboard.js'],
    body: {
      crumbs: 'Dashboard',
      content,
    },
  });
}

export function renderAgentPage(agentId) {
  const content = `
  <div class="grid" style="gap:18px">
    <div class="panel">
      <h2>Agent 详情</h2>
      <div id="status" class="status">加载中…</div>
      <div style="height:10px"></div>
      <div id="kvs" class="kvs"></div>
    </div>

    <div class="grid cols-2">
      <div class="panel">
        <h2>最近活动 / 事件</h2>
        <div id="events" class="list"><div class="muted">加载中…</div></div>
      </div>
      <div class="panel">
        <h2>数据源状态</h2>
        <div id="sources" class="list"><div class="muted">加载中…</div></div>
      </div>
    </div>

    <div class="panel">
      <h2>Markdown allowlist（受控编辑）</h2>
      <div id="md" class="list"><div class="muted">加载中…</div></div>
    </div>
  </div>
  `;

  return layout({
    title: `openclaw-monitor · Agent · ${agentId}`,
    bodyAttrs: `data-page="agent" data-agent-id="${escapeHtml(agentId)}"`,
    scripts: ['/static/shared.js', '/static/agent.js'],
    body: {
      crumbs: `<a href="/">Dashboard</a> / Agent / ${escapeHtml(agentId)}`,
      content,
    },
  });
}

export function renderMarkdownListPage() {
  const content = `
  <div class="panel">
    <h2>Markdown allowlist</h2>
    <div id="status" class="status">加载中…</div>
    <div style="height:10px"></div>
    <div id="list" class="list"></div>
    <div style="height:10px"></div>
    <div class="muted">只允许编辑 allowlist 中的 docs/*.md 文件；越界路径将返回 FORBIDDEN_PATH。</div>
  </div>
  `;

  return layout({
    title: 'openclaw-monitor · Markdown',
    bodyAttrs: 'data-page="markdown-list"',
    scripts: ['/static/shared.js', '/static/markdown-list.js'],
    body: {
      crumbs: `<a href="/">Dashboard</a> / Markdown`,
      content,
    },
  });
}

export function renderMarkdownEditorPage(fileId) {
  const content = `
  <div class="panel">
    <h2>Markdown 编辑（受控）</h2>
    <div class="row">
      <div class="pill"><span class="dot"></span><span id="file">${escapeHtml(fileId)}</span></div>
      <div class="spacer"></div>
      <a class="pill" href="/markdown"><span class="dot"></span>返回列表</a>
    </div>

    <div style="height:10px"></div>
    <div id="status" class="status">加载中…</div>

    <div style="height:12px"></div>
    <div class="row">
      <button id="preview">Preview diff</button>
      <button id="save">Save</button>
      <div class="spacer"></div>
      <div class="muted" id="meta"></div>
    </div>

    <div style="height:10px"></div>
    <textarea id="content" spellcheck="false"></textarea>

    <div style="height:10px"></div>
    <div class="panel" style="padding:12px; background:rgba(0,0,0,.12)">
      <h2 style="margin:0 0 8px">Diff</h2>
      <pre id="diff">(preview to see diff)</pre>
    </div>

    <div style="height:10px"></div>
    <div class="muted">提示：保存会带上 expectedContent 做并发保护；若返回 CONFLICT，请重新加载后再保存。</div>
  </div>
  `;

  return layout({
    title: `openclaw-monitor · Markdown · ${fileId}`,
    bodyAttrs: `data-page="markdown-editor" data-file-id="${escapeHtml(fileId)}"`,
    scripts: ['/static/shared.js', '/static/markdown-editor.js'],
    body: {
      crumbs: `<a href="/">Dashboard</a> / <a href="/markdown">Markdown</a> / ${escapeHtml(fileId)}`,
      content,
    },
  });
}
