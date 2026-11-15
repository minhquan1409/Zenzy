// Zenzy admin dashboard (UC-17 to UC-20). Calls the same REST API as the app with an ADMIN account.
// Tokens live in sessionStorage, so closing the tab logs out.
(() => {
  const API = '/v1';
  const app = document.getElementById('app');
  const tabs = document.getElementById('tabs');
  const who = document.getElementById('who');
  const logoutBtn = document.getElementById('logout');
  let tab = 'reports';
  let reportStatus = 'OPEN';
  let shopStatus = 'PENDING';

  const store = {
    get: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch { /* ignore */ } },
  };

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const when = (iso) => (iso ? new Date(iso).toLocaleString() : '');
  const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content; };

  async function api(method, path, body, retry = true) {
    const res = await fetch(API + path, {
      method,
      headers: { 'content-type': 'application/json', ...(store.get('access') ? { authorization: 'Bearer ' + store.get('access') } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 401 && retry && store.get('refresh')) {
      const r = await fetch(API + '/auth/refresh', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refresh_token: store.get('refresh') }) });
      if (r.ok) {
        const t = await r.json();
        store.set('access', t.access_token);
        store.set('refresh', t.refresh_token);
        return api(method, path, body, false);
      }
      logout();
      throw new Error('Session expired, please log in again');
    }
    const text = await res.text();
    const json = text ? JSON.parse(text) : null;
    if (!res.ok) throw new Error((json && json.message) || res.statusText);
    return json;
  }

  function logout() {
    const refresh = store.get('refresh');
    if (refresh && store.get('access')) api('POST', '/auth/logout', { refresh_token: refresh }, false).catch(() => {});
    ['access', 'refresh', 'name'].forEach((k) => store.set(k, null));
    render();
  }
  logoutBtn.addEventListener('click', logout);

  tabs.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tab]');
    if (!b) return;
    tab = b.dataset.tab;
    tabs.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
    render();
  });

  function renderLogin(error) {
    tabs.hidden = true;
    logoutBtn.hidden = true;
    who.textContent = '';
    app.replaceChildren(h(`
      <form class="card login" id="login">
        <h2 style="margin-top:0">Admin login</h2>
        <input name="username" placeholder="Username" autocomplete="username" required>
        <input name="password" type="password" placeholder="Password" autocomplete="current-password" required>
        <button class="btn primary" style="width:100%">Log in</button>
        ${error ? `<div class="error">${esc(error)}</div>` : ''}
      </form>`));
    document.getElementById('login').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      try {
        // Admin-only sign-in: 3 wrong tries block this network for a while and alert the administrator.
        const r = await api('POST', '/admin/login', { username: f.get('username'), password: f.get('password') }, false);
        store.set('access', r.tokens.access_token);
        store.set('refresh', r.tokens.refresh_token);
        store.set('name', r.user.display_name);
        render();
      } catch (err) {
        renderLogin(err.message);
      }
    });
  }

  function targetHtml(item) {
    const t = item.target;
    if (!t) return '<div class="target muted">The content was already deleted by its owner.</div>';
    const owner = t.owner ? `${esc(t.owner.display_name)} (@${esc(t.owner.username)})` : 'unknown';
    let body = '';
    if (item.target_type === 'POST') body = `${esc(t.text)}${t.photo_urls?.length ? `\n[${t.photo_urls.length} photo(s)]` : ''}`;
    if (item.target_type === 'EVENT') body = `<b>${esc(t.title)}</b> · ${esc(t.type)}\n${esc(t.description)}\n${esc(t.place_name)} · ${when(t.start_time)}`;
    if (item.target_type === 'SHOP') body = `<b>${esc(t.name)}</b>\n${esc(t.description)}\n${esc(t.address)}`;
    if (item.target_type === 'USER') body = `Bio: ${esc(t.bio)}\nWarnings: ${t.warnings}`;
    return `<div class="target">${body}</div><div class="muted">Owner: ${owner} · status ${esc(t.status)}${t.hidden ? ' · hidden' : ''}</div>`;
  }

  async function renderReports() {
    const data = await api('GET', `/admin/reports?status=${reportStatus}`);
    const frag = h(`
      <div class="row" style="margin-bottom:16px">
        <h2 class="grow" style="margin:0">Report queue</h2>
        <select id="rstatus"><option value="OPEN">Open</option><option value="RESOLVED">Resolved</option></select>
        <button class="btn ghost" id="reload">Refresh</button>
      </div>`);
    frag.getElementById('rstatus').value = reportStatus;
    const list = document.createElement('div');
    if (!data.items.length) list.append(h('<div class="card empty">No reports here. 🎉</div>'));
    for (const item of data.items) {
      const card = h(`
        <div class="card">
          <div class="row">
            <span class="pill">${esc(item.target_type)}</span>
            <span class="pill red">${item.report_count} report${item.report_count > 1 ? 's' : ''}</span>
            <span class="muted grow">${esc(item.reasons.join(', '))} · first ${when(item.first_reported_at)}</span>
          </div>
          ${targetHtml(item)}
          ${item.notes.length ? `<div class="muted">Notes: ${item.notes.map(esc).join(' · ')}</div>` : ''}
          ${reportStatus === 'OPEN' ? `<input class="reason" placeholder="Reason (required, sent to the owner)" style="width:100%;margin-top:8px">
          <div class="error" data-err></div>
          <div class="actions">
            <button class="btn" data-a="DISMISS">Dismiss</button>
            <button class="btn" data-a="REMOVE">Remove</button>
            <button class="btn" data-a="REMOVE_WARN">Remove + warn</button>
            <button class="btn primary" data-a="REMOVE_SUSPEND">Remove + suspend account</button>
          </div>` : ''}
        </div>`);
      const reasonInput = card.querySelector('.reason');
      const err = card.querySelector('[data-err]');
      card.querySelectorAll('button[data-a]').forEach((b) => b.addEventListener('click', async () => {
        const reason = reasonInput.value.trim();
        if (!reason) { err.textContent = 'Enter a reason first.'; reasonInput.focus(); return; }
        try {
          await api('PATCH', `/admin/reports/${item.report_id}`, { action: b.dataset.a, reason });
          render();
        } catch (e) { err.textContent = e.message; }
      }));
      list.append(card);
    }
    frag.append(list);
    app.replaceChildren(frag);
    document.getElementById('rstatus').addEventListener('change', (e) => { reportStatus = e.target.value; render(); });
    document.getElementById('reload').addEventListener('click', render);
  }

  async function renderShops() {
    const data = await api('GET', `/admin/shops?status=${shopStatus}`);
    const frag = h(`
      <div class="row" style="margin-bottom:16px">
        <h2 class="grow" style="margin:0">Shop approval</h2>
        <select id="sstatus"><option value="PENDING">Pending</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option></select>
      </div>`);
    frag.getElementById('sstatus').value = shopStatus;
    if (!data.items.length) frag.append(h('<div class="card empty">No shops in this list.</div>'));
    for (const s of data.items) {
      const card = h(`
        <div class="card">
          <div class="row"><b class="grow">${esc(s.name)}</b><span class="pill ${s.status === 'APPROVED' ? 'green' : s.status === 'REJECTED' ? 'red' : ''}">${esc(s.status)}</span></div>
          <div class="muted">${esc(s.address)} · ${s.latitude.toFixed(5)}, ${s.longitude.toFixed(5)} · owner ${esc(s.owner?.display_name)} (@${esc(s.owner?.username)}) · ${when(s.created_at)}</div>
          <div class="target">${esc(s.description) || '<span class="muted">No description</span>'}</div>
          ${s.menu.length ? `<table><tr><th>Menu item</th><th>Price (VND)</th></tr>${s.menu.map((m) => `<tr><td>${esc(m.name)}</td><td>${Number(m.price).toLocaleString()}</td></tr>`).join('')}</table>` : ''}
          ${s.reject_reason ? `<div class="muted">Reject reason: ${esc(s.reject_reason)}</div>` : ''}
          ${s.status === 'PENDING' ? `<input class="reason" placeholder="Reason (required to reject)" style="width:100%;margin-top:8px"><div class="error" data-err></div>
          <div class="actions"><button class="btn primary" data-d="APPROVE">Approve</button><button class="btn" data-d="REJECT">Reject</button></div>` : ''}
        </div>`);
      const err = card.querySelector('[data-err]');
      const reasonInput = card.querySelector('.reason'); // a fragment empties once appended: keep the element
      card.querySelectorAll('button[data-d]').forEach((b) => b.addEventListener('click', async () => {
        const reason = reasonInput.value.trim() || undefined;
        if (b.dataset.d === 'REJECT' && !reason) { err.textContent = 'Enter the reason the owner will see.'; return; }
        try { await api('PATCH', `/admin/shops/${s.id}`, { decision: b.dataset.d, reason }); render(); } catch (e) { err.textContent = e.message; }
      }));
      frag.append(card);
    }
    app.replaceChildren(frag);
    document.getElementById('sstatus').addEventListener('change', (e) => { shopStatus = e.target.value; render(); });
  }

  async function renderUsers(q = '') {
    const data = await api('GET', `/admin/users?q=${encodeURIComponent(q)}`);
    const frag = h(`
      <div class="row" style="margin-bottom:16px">
        <h2 class="grow" style="margin:0">Accounts</h2>
        <input id="q" placeholder="Search username" value="${esc(q)}">
      </div>
      <div class="card"><table><thead><tr><th>User</th><th>Status</th><th>Reports (open)</th><th>Warnings</th><th></th></tr></thead><tbody id="rows"></tbody></table></div>`);
    const rows = frag.getElementById('rows');
    for (const u of data.items) {
      const tr = h(`<tr>
        <td><b>${esc(u.display_name)}</b><div class="muted">@${esc(u.username)} · ${esc(u.role)}</div></td>
        <td><span class="pill ${u.status === 'ACTIVE' ? 'green' : 'red'}">${esc(u.status)}</span>${u.suspend_reason ? `<div class="muted">${esc(u.suspend_reason)}</div>` : ''}</td>
        <td>${u.report_counts.profile + u.report_counts.content} (${u.report_counts.open})</td>
        <td>${u.warnings}</td>
        <td>${u.role === 'ADMIN' ? '' : `<input class="reason" placeholder="Reason" style="width:140px"> <button class="btn ${u.status === 'ACTIVE' ? 'primary' : ''}">${u.status === 'ACTIVE' ? 'Suspend' : 'Restore'}</button><div class="error" data-err></div>`}</td>
      </tr>`);
      const reasonInput = tr.querySelector('.reason');
      const err = tr.querySelector('[data-err]');
      tr.querySelector('button')?.addEventListener('click', async () => {
        const status = u.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
        const reason = reasonInput.value.trim();
        if (!reason) { err.textContent = 'Enter a reason.'; return; }
        try { await api('PATCH', `/admin/users/${u.id}/status`, { status, reason }); renderUsers(q); } catch (e) { err.textContent = e.message; }
      });
      rows.append(tr);
    }
    app.replaceChildren(frag);
    const input = document.getElementById('q');
    let timer;
    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => renderUsers(input.value.trim()), 300); });
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }

  async function render() {
    if (!store.get('access')) return renderLogin();
    tabs.hidden = false;
    logoutBtn.hidden = false;
    who.textContent = store.get('name') || '';
    app.replaceChildren(h('<div class="empty">Loading…</div>'));
    try {
      if (tab === 'reports') await renderReports();
      if (tab === 'shops') await renderShops();
      if (tab === 'users') await renderUsers();
    } catch (e) {
      if (store.get('access')) app.replaceChildren(h(`<div class="card error">${esc(e.message)}</div>`));
    }
  }

  render();
})();
