#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

function parseArgs(argv) {
  const args = { baseUrl: process.env.BASE_URL || 'http://127.0.0.1:5173', outDir: 'artifacts/viewport-smoke' };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--base-url') args.baseUrl = argv[++i];
    else if (token === '--out') args.outDir = argv[++i];
    else if (token === '--help') args.help = true;
  }
  return args;
}

function slugifyRoute(route) {
  if (route === '/' || route === '') return 'home';
  return route.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'route';
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function waitForOk(url, { timeoutMs = 60_000, intervalMs = 1_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  // Node 22 has global fetch.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const res = await fetch(url, { redirect: 'follow' });
      if (res.ok) return;
    } catch {
      // ignore
    }
    if (Date.now() > deadline) {
      throw new Error(`Timeout waiting for OK: ${url}`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log('Usage: node scripts/viewport_smoke.mjs [--base-url http://127.0.0.1:5173] [--out artifacts/viewport-smoke]');
    process.exit(0);
  }

  // Lazy import so the script can be present without requiring playwright at install-time.
  const { chromium } = await import('playwright');

  const routes = ['/', '/staff', '/markdown'];
  const viewports = [
    { name: '1440', width: 1440, height: 900 },
    { name: '1024', width: 1024, height: 768 },
    { name: '375', width: 375, height: 812 },
  ];

  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const outRoot = path.resolve(args.outDir, runId);
  await ensureDir(outRoot);

  // Best-effort readiness gate.
  await waitForOk(`${args.baseUrl}/`);

  const browser = await chromium.launch({ headless: true });

  const results = [];
  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
      const page = await context.newPage();

      const consoleErrors = [];
      const pageErrors = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push({ text: msg.text() });
      });
      page.on('pageerror', (err) => {
        pageErrors.push({ message: err?.message ?? String(err) });
      });

      for (const route of routes) {
        const url = new URL(route, args.baseUrl).toString();
        const routeSlug = slugifyRoute(route);
        const screenshotPath = path.join(outRoot, `${routeSlug}.${viewport.name}.png`);

        const startedAt = Date.now();
        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        await page.waitForTimeout(1_000);

        const navDurationMs = await page.evaluate(() => {
          const entry = performance.getEntriesByType('navigation')[0];
          if (entry && typeof entry.duration === 'number') return entry.duration;
          return null;
        });

        await page.screenshot({ path: screenshotPath, fullPage: true });

        results.push({
          route,
          url,
          viewport,
          status: response?.status() ?? null,
          navDurationMs,
          wallTimeMs: Date.now() - startedAt,
          screenshotPath: path.relative(process.cwd(), screenshotPath),
          consoleErrorCount: consoleErrors.length,
          pageErrorCount: pageErrors.length,
        });
      }

      await page.close();
      await context.close();
    }

    const summary = {
      baseUrl: args.baseUrl,
      outDir: path.relative(process.cwd(), outRoot),
      generatedAt: new Date().toISOString(),
      routes,
      viewports,
      results,
    };

    await fs.writeFile(path.join(outRoot, 'summary.json'), JSON.stringify(summary, null, 2));

    const hadErrors = results.some((r) => (r.status && r.status >= 400) || r.consoleErrorCount > 0 || r.pageErrorCount > 0);
    console.log(JSON.stringify({ ok: !hadErrors, outDir: summary.outDir, resultCount: results.length }, null, 2));

    if (hadErrors) process.exitCode = 2;
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
