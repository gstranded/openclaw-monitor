(function initShared() {
  function byId(id) {
    return document.getElementById(id);
  }

  function setText(el, text) {
    if (el) el.textContent = text;
  }

  function setHtml(el, html) {
    if (el) el.innerHTML = html;
  }

  function statusClass(level) {
    if (level === 'error' || level === 'err') return 'err';
    if (level === 'warning' || level === 'warn') return 'warn';
    return 'ok';
  }

  function fmtTime(value) {
    if (!value) return '—';
    try {
      return new Date(value).toLocaleString();
    } catch {
      return String(value);
    }
  }

  function esc(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  async function fetchJson(url, options) {
    const res = await fetch(url, options);
    const text = await res.text();
    let payload;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = { error: { code: 'INVALID_JSON', message: 'Response was not JSON' }, raw: text };
    }
    return { ok: res.ok, status: res.status, payload };
  }

  window.oc = {
    byId,
    setText,
    setHtml,
    statusClass,
    fmtTime,
    fetchJson,
    esc,
  };
})();
