// 同一份页面：有 api/state 就是本地导图（可管理），否则读 data.json 当博客（只读）。
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const S = {
  mode: null, data: null, raw: '', sel: null, query: '',
  open: new Set(JSON.parse(localStorage.getItem('studio.open') || '[""]')),
  view: { x: 40, y: 0, k: 1 }, fitted: false, panelKey: '',
};
const index = new Map(); // path -> node

// ---------- 数据 ----------
async function load() {
  try {
    const r = await fetch('api/state', { cache: 'no-store' });
    if (!r.ok) throw 0;
    S.mode = 'local';
    accept(await r.text());
    setInterval(async () => { try { accept(await (await fetch('api/state', { cache: 'no-store' })).text()); } catch {} }, 3000);
  } catch {
    S.mode = 'blog';
    accept(await (await fetch('data.json')).text());
  }
}

function accept(text) {
  if (text === S.raw) return;
  S.raw = text;
  S.data = JSON.parse(text);
  index.clear();
  const walk = (n, parent) => { n.parent = parent; index.set(n.path, n); n.children.forEach((c) => walk(c, n)); };
  walk(S.data.tree, null);
  S.data.agents = S.data.agents || [];
  $('#brand').textContent = S.data.site.title;
  $('#subtitle').textContent = S.data.site.subtitle;
  document.title = S.data.site.title;
  const live = S.data.agents.filter((a) => a.active).length;
  const pill = $('#agents-pill');
  pill.hidden = !S.data.agents.length;
  pill.textContent = live ? `● ${live} 运行中` : `○ ${S.data.agents.length} 最近`;
  if (S.sel === null) route(); else { renderMap(); renderPanel(); }
}

async function getNote(p) {
  if (S.mode === 'blog') return S.data.notes[p] || null;
  return (await (await fetch('api/note?path=' + encodeURIComponent(p), { cache: 'no-store' })).json()).note;
}

const agentsUnder = (p) => S.data.agents.filter((a) => p === '' || a.path === p || a.path.startsWith(p + '/'));
const agentsAt = (p) => S.data.agents.filter((a) => owner(a.path) === p);
// agent 的 cwd 归属到树上最深的那个节点
function owner(p) {
  while (!index.has(p)) p = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '';
  return p;
}

// ---------- 导图 ----------
const COL_GAP = 56, ROW_H = 40;

function visibleTree() {
  const q = S.query.toLowerCase();
  const match = (n) => n.name.toLowerCase().includes(q) || (n.note?.title || '').toLowerCase().includes(q);
  const keep = (n) => {
    if (!q) return { n, kids: S.open.has(n.path) ? n.children.map(keep) : [] };
    const kids = n.children.map(keep).filter(Boolean);
    return match(n) || kids.length || !n.path ? { n, kids, hit: match(n) } : null;
  };
  return keep(S.data.tree);
}

function nodeHTML(v) {
  const n = v.n, live = agentsAt(n.path), sub = agentsUnder(n.path);
  let h = `<span>${esc(n.name)}</span>`;
  if (n.note?.status) h += `<span class="status">${esc(n.note.status)}</span>`;
  if (S.mode === 'local' && n.note?.blog) h += `<span class="pub" title="会发布到博客">◎</span>`;
  if (live.length) h += live.map((a) => `<span class="agent ${a.active ? 'on' : ''}">${esc(a.tool)}</span>`).join('');
  else if (sub.length && !v.kids.length) h += `<span class="agent ${sub.some((a) => a.active) ? 'on' : ''}">${sub.length}</span>`;
  if (n.children.length && !S.query) h += `<span class="toggle" data-toggle="${esc(n.path)}">${S.open.has(n.path) ? '−' : n.children.length}</span>`;
  return h;
}

function renderMap() {
  const root = visibleTree();
  const flat = [];
  const walk = (v, d) => { v.d = d; flat.push(v); v.kids.forEach((k) => walk(k, d + 1)); };
  walk(root, 0);

  const box = $('#nodes');
  box.innerHTML = flat.map((v, i) => {
    const cls = ['node', v.n.note && 'has-note', !v.n.path && 'root', v.n.path === S.sel && 'sel', v.hit && 'hit'].filter(Boolean).join(' ');
    return `<div class="${cls}" data-i="${i}" data-path="${esc(v.n.path)}">${nodeHTML(v)}</div>`;
  }).join('');
  const els = box.children;

  const colW = [];
  flat.forEach((v, i) => { v.w = els[i].offsetWidth; v.h = els[i].offsetHeight; colW[v.d] = Math.max(colW[v.d] || 0, v.w); });
  const colX = [0];
  for (let d = 1; d < colW.length; d++) colX[d] = colX[d - 1] + colW[d - 1] + COL_GAP;
  let row = 0;
  const place = (v) => {
    v.x = colX[v.d];
    if (!v.kids.length) v.y = row++ * ROW_H;
    else { v.kids.forEach(place); v.y = (v.kids[0].y + v.kids[v.kids.length - 1].y) / 2; }
  };
  place(root);

  let paths = '';
  flat.forEach((v, i) => {
    els[i].style.transform = `translate(${v.x}px, ${v.y - v.h / 2}px)`;
    for (const k of v.kids) {
      const x1 = v.x + v.w, x2 = k.x, mx = (x1 + x2) / 2;
      paths += `<path d="M${x1},${v.y} C${mx},${v.y} ${mx},${k.y} ${x2},${k.y}"/>`;
    }
  });
  $('#links').innerHTML = paths;
  if (!S.fitted) { S.fitted = true; S.view = { x: 40, y: $('#map').clientHeight / 2 - root.y, k: 1 }; }
  applyView();
}

function applyView() { $('#canvas').style.transform = `translate(${S.view.x}px, ${S.view.y}px) scale(${S.view.k})`; }
function saveOpen() { localStorage.setItem('studio.open', JSON.stringify([...S.open])); }

$('#nodes').addEventListener('click', (e) => {
  const t = e.target.closest('[data-toggle]');
  if (t) {
    const p = t.dataset.toggle;
    S.open.has(p) ? S.open.delete(p) : S.open.add(p);
    saveOpen(); renderMap(); return;
  }
  const n = e.target.closest('.node');
  if (n) location.hash = '#/' + n.dataset.path;
});

// 拖动平移 + 滚轮缩放
const map = $('#map');
let drag = null;
map.addEventListener('pointerdown', (e) => {
  if (e.target.closest('.node')) return;
  drag = { x: e.clientX - S.view.x, y: e.clientY - S.view.y };
  map.classList.add('dragging'); map.setPointerCapture(e.pointerId);
});
map.addEventListener('pointermove', (e) => { if (drag) { S.view.x = e.clientX - drag.x; S.view.y = e.clientY - drag.y; applyView(); } });
map.addEventListener('pointerup', () => { drag = null; map.classList.remove('dragging'); });
map.addEventListener('wheel', (e) => {
  e.preventDefault();
  const r = map.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
  const k = Math.min(2.5, Math.max(0.3, S.view.k * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
  S.view.x = mx - (mx - S.view.x) * (k / S.view.k);
  S.view.y = my - (my - S.view.y) * (k / S.view.k);
  S.view.k = k; applyView();
}, { passive: false });
$('#fit').onclick = () => { S.fitted = false; renderMap(); };
$('#search').oninput = (e) => { S.query = e.target.value.trim(); renderMap(); };
$('#agents-pill').onclick = () => { location.hash = '#/'; };
$('#close').onclick = () => { $('#panel').hidden = true; };

// ---------- 详情面板 ----------
const ago = (t) => {
  const s = (Date.now() - t) / 1000;
  return s < 60 ? '刚刚' : s < 3600 ? `${Math.floor(s / 60)} 分钟前` : `${Math.floor(s / 3600)} 小时前`;
};
const absPath = (p) => S.data.root + (p ? '\\' + p.replaceAll('/', '\\') : '');
const vscodeUrl = (abs) => 'vscode://file/' + encodeURI(abs.replaceAll('\\', '/'));

function resolveRel(base, href) {
  const parts = (base ? base.split('/') : []);
  for (const seg of href.split('/')) {
    if (seg === '..') parts.pop(); else if (seg && seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

// 笔记里的相对路径：图片/附件 -> files/...；指向其它文件夹笔记 (x/x.md) -> 导图节点
function fixLinks(el, base) {
  const rel = (u) => u && !/^([a-z][a-z0-9+.-]*:|\/|#)/i.test(u);
  el.querySelectorAll('img[src]').forEach((img) => {
    const u = img.getAttribute('src');
    if (rel(u)) img.src = 'files/' + encodeURI(resolveRel(base, decodeURI(u)));
  });
  el.querySelectorAll('a[href]').forEach((a) => {
    const u = a.getAttribute('href');
    if (!rel(u)) { if (/^https?:/.test(u)) a.target = '_blank'; return; }
    const p = resolveRel(base, decodeURI(u.split('#')[0]));
    const m = /^(?:(.*)\/)?([^/]+)\.md$/i.exec(p);
    if (m && (m[1] || '').split('/').pop() === m[2] && index.has(m[1] || '')) a.href = '#/' + m[1];
    else if (S.mode === 'local' && /\.md$/i.test(p)) a.href = vscodeUrl(absPath(p));
    else a.href = 'files/' + encodeURI(p);
  });
}

function sessionHTML(a) {
  return `<div class="session">
    <div class="head"><span class="agent ${a.active ? 'on' : ''}">${esc(a.tool)} · ${a.active ? '运行中' : '空闲'}</span>
      <span class="where" data-go="${esc(owner(a.path))}">${esc(a.path || '/')}</span><span class="time">${ago(a.mtime)}</span></div>
    ${a.prompt ? `<div class="q">${esc(a.prompt)}</div>` : ''}
    ${a.reply ? `<div class="a">${esc(a.reply)}</div>` : ''}</div>`;
}

function recentList() {
  const all = [...index.values()].filter((n) => n.note && n.path).sort((a, b) => (b.note.date > a.note.date ? 1 : b.note.date < a.note.date ? -1 : b.note.mtime - a.note.mtime));
  if (!all.length) return '';
  return `<div class="section list"><h4>最近更新</h4>${all.slice(0, 20).map((n) =>
    `<a href="#/${esc(n.path)}"><span class="t">${esc(n.note.title || n.name)}</span><span class="d">${esc(n.note.date)}</span>
     ${n.note.excerpt ? `<div class="e">${esc(n.note.excerpt)}</div>` : ''}</a>`).join('')}</div>`;
}

async function renderPanel() {
  const isInbox = S.mode === 'local' && S.sel === S.data.inboxPath;
  const n = index.get(S.sel) || (isInbox && { name: S.sel, path: S.sel, children: [], parent: S.data.tree });
  if (!n) return;
  const sessions = S.mode === 'local' ? agentsUnder(n.path) : [];
  const inbox = S.mode !== 'local' ? [] : isInbox ? S.data.inbox : S.data.inbox.filter((e) => n.path && e.tags.includes(n.name));
  // 轮询时只有笔记、agent 或收件箱变化才重画，避免打断阅读
  const key = JSON.stringify([n.path, n.note?.mtime, sessions.map((a) => [a.id, a.mtime, a.active]), inbox.length]);
  if (key === S.panelKey) return;
  S.panelKey = key;
  const draft = $('#cap-text') && { value: $('#cap-text').value, focused: document.activeElement === $('#cap-text') };

  const note = n.note ? await getNote(n.path) : null;
  const chain = [];
  for (let c = n; c; c = c.parent) chain.unshift(c);
  $('#crumbs').innerHTML = chain.map((c) => `<a href="#/${esc(c.path)}">${esc(c.name)}</a>`).join(' / ');

  const m = note?.meta || {};
  const tags = n.note?.tags || [];
  let h = `<h1 class="title">${esc(m.title || n.name)}</h1><div class="meta">`;
  if (m.status) h += `<span class="chip">${esc(m.status)}</span>`;
  h += tags.map((t) => `<span class="chip">#${esc(t)}</span>`).join('');
  if (n.note?.date) h += `<span>${esc(n.note.date)}</span>`;
  if (S.mode === 'local' && n.note) h += `<span>${n.note.blog ? '◎ 公开到博客' : '私密'}</span>`;
  h += '</div>';

  if (S.mode === 'local') {
    const abs = absPath(n.path);
    h += `<div class="actions"><a href="${vscodeUrl(abs)}"><button>VS Code 打开</button></a>`;
    h += note ? `<a href="${vscodeUrl(note.file)}"><button>编辑笔记</button></a>` : `<button data-create>新建笔记</button>`;
    h += S.data.launchers.map((l) => `<button data-launch="${esc(l)}">${esc(l)}</button>`).join('') + '</div>';
    if (sessions.length) h += `<div class="section"><h4>AGENT 会话</h4>${sessions.map(sessionHTML).join('')}</div>`;
    if (isInbox) h += captureHTML();
    if (inbox.length) h += `<div class="section"><h4>${isInbox ? '收件箱' : '收件箱中的相关记录'}</h4>${entriesHTML(inbox.slice(0, 50))}</div>`;
  }

  if (note) h += `<div class="md">${marked.parse(note.body)}</div>`;
  else if (n.path && !isInbox) h += `<p class="empty">这个文件夹还没有笔记${S.mode === 'local' ? `（${esc(n.name)}.md）` : ''}。</p>`;
  if (!n.path) h += recentList();

  const body = $('#panel-body');
  body.innerHTML = h;
  fixLinks(body, n.path);
  $('#panel').hidden = false;
  if (draft && $('#cap-text')) { $('#cap-text').value = draft.value; if (draft.focused) $('#cap-text').focus(); }
}

$('#panel-body').addEventListener('click', async (e) => {
  const t = e.target;
  const post = (url, data) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Studio': '1' }, body: JSON.stringify(data) }).then((r) => r.json());
  if (t.dataset.cap) return onCapture(t.dataset.cap);
  if (t.dataset.go !== undefined) location.hash = '#/' + t.dataset.go;
  if (t.dataset.launch) await post('api/launch', { path: S.sel, tool: t.dataset.launch });
  if (t.hasAttribute('data-create')) {
    const r = await post('api/note/create', { path: S.sel });
    if (r.file) location.href = vscodeUrl(r.file);
    setTimeout(() => fetch('api/state').then((x) => x.text()).then(accept), 300);
  }
});

// ---------- 收件箱（快速记录） ----------
// 本地：经本地服务写入 workspace/inbox 并 git 同步。博客（手机）：用 GitHub API 直接写私有仓库，token 只存在本机浏览器。
const pad = (n) => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const ghCfg = () => JSON.parse(localStorage.getItem('studio.inbox') || 'null');
const b64enc = (s) => { const b = new TextEncoder().encode(s); let r = ''; for (let i = 0; i < b.length; i += 0x8000) r += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(r); };
const b64dec = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s/g, '')), (c) => c.charCodeAt(0)));

async function ghFile(cfg, file) {
  const url = `https://api.github.com/repos/${cfg.repo}/contents/${file}`;
  const headers = { Authorization: 'Bearer ' + cfg.token, Accept: 'application/vnd.github+json' };
  const r = await fetch(`${url}?t=${Date.now()}`, { headers });
  if (r.status === 404) return { url, headers, sha: null, text: '' };
  if (!r.ok) throw new Error(r.status === 401 ? 'token 无效或已过期' : `GitHub ${r.status}`);
  const j = await r.json();
  return { url, headers, sha: j.sha, text: b64dec(j.content) };
}

function parseEntries(text, date) {
  const parts = text.split(/^### (\d{1,2}:\d{2})[^\n]*\n/m), out = [];
  for (let i = parts.length - 2; i >= 1; i -= 2) if (parts[i + 1].trim()) out.push({ date, time: parts[i], text: parts[i + 1].trim() });
  return out;
}

async function capture(text) {
  if (S.mode === 'local') {
    const r = await fetch('api/inbox', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Studio': '1' }, body: JSON.stringify({ text }) });
    if (!r.ok) throw new Error((await r.json()).error);
    return;
  }
  const cfg = ghCfg(), d = new Date();
  const block = `### ${pad(d.getHours())}:${pad(d.getMinutes())}\n${text.trim()}\n\n`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const f = await ghFile(cfg, today() + '.md');
    const r = await fetch(f.url, { method: 'PUT', headers: f.headers, body: JSON.stringify({ message: 'note from phone', content: b64enc(f.text + block), sha: f.sha || undefined }) });
    if (r.ok) return;
    if (r.status !== 409 && r.status !== 422) throw new Error(`GitHub ${r.status}`);
  }
  throw new Error('写入冲突，请重试');
}

const entriesHTML = (list) => list.map((e) => `<div class="entry"><div class="when">${esc(e.date)} ${esc(e.time)}</div><div class="text">${esc(e.text)}</div></div>`).join('');

function captureHTML() {
  if (S.mode === 'blog' && !ghCfg()) {
    // 首次使用：两个按钮直达预填好的 GitHub 页面，回来粘贴 token 即可
    const [owner, name] = S.data.site.inbox.repo.split('/');
    const newRepo = `https://github.com/new?name=${encodeURIComponent(name)}&visibility=private&description=${encodeURIComponent('手机记录收件箱')}`;
    const newToken = `https://github.com/settings/personal-access-tokens/new?name=${encodeURIComponent('studio-inbox')}&description=${encodeURIComponent('work_studio 手机记录')}&target_name=${encodeURIComponent(owner)}&expires_in=none&contents=write`;
    return `<div class="section capture"><h4>第一次使用：连接收件箱（只需一次）</h4>
      <ol class="steps">
        <li><a href="${newRepo}" target="_blank"><button>① 创建私有仓库 ${esc(name)}</button></a><div class="msg">打开后直接点 Create repository（已建好可跳过）</div></li>
        <li><a href="${newToken}" target="_blank"><button>② 生成 token</button></a><div class="msg">Repository access 选 Only select repositories → ${esc(name)}，其它已预填，点 Generate 后复制</div></li>
        <li>③ 粘贴 token：<input id="cap-token" type="password" placeholder="github_pat_…"></li>
      </ol>
      <input id="cap-repo" type="hidden" value="${esc(S.data.site.inbox.repo)}">
      <div class="row"><button data-cap="save">保存，开始记录</button><span class="msg">token 只保存在这台手机的浏览器里</span></div></div>`;
  }
  return `<div class="section capture"><h4>快速记录</h4>
    <textarea id="cap-text" placeholder="想到什么写什么。写 #文件夹名 可以归到对应节点"></textarea>
    <div class="row"><button data-cap="send">记录</button><span class="msg" id="cap-msg"></span>
    ${S.mode === 'blog' ? '<span class="link" data-cap="reset">断开</span>' : ''}</div></div>`;
}

async function renderCapturePanel() {
  $('#crumbs').innerHTML = '<a href="#/">首页</a> / 快速记录';
  const body = $('#panel-body');
  body.innerHTML = captureHTML() + '<div class="section"><h4>今天</h4><div id="cap-list" class="empty">…</div></div>';
  $('#panel').hidden = false;
  $('#cap-text')?.focus();
  const list = $('#cap-list');
  if (!ghCfg()) { list.textContent = ''; return; }
  try {
    const entries = parseEntries((await ghFile(ghCfg(), today() + '.md')).text, today());
    list.className = '';
    list.innerHTML = entriesHTML(entries) || '<span class="empty">还没有记录</span>';
  } catch (e) { list.textContent = e.message; }
}

async function onCapture(action) {
  if (action === 'save') {
    const repo = $('#cap-repo').value.trim(), token = $('#cap-token').value.trim();
    if (!repo || !token) return;
    localStorage.setItem('studio.inbox', JSON.stringify({ repo, token }));
    return renderCapturePanel();
  }
  if (action === 'reset') { localStorage.removeItem('studio.inbox'); return renderCapturePanel(); }
  const ta = $('#cap-text'), msg = $('#cap-msg'), text = ta.value.trim();
  if (!text) return;
  msg.textContent = '保存中…';
  try {
    await capture(text);
    ta.value = '';
    msg.textContent = '已记录 ' + new Date().toLocaleTimeString().slice(0, 5);
    if (S.mode === 'blog') renderCapturePanel();
    else { S.panelKey = ''; accept(await (await fetch('api/state', { cache: 'no-store' })).text()); }
  } catch (e) { msg.textContent = '失败：' + e.message; }
}

$('#capture-btn').onclick = () => { location.hash = '#capture'; };
$('#panel-body').addEventListener('keydown', (e) => { if (e.target.id === 'cap-text' && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) onCapture('send'); });

// ---------- 路由 ----------
function route() {
  if (location.hash === '#capture') {
    // 本地模式下收件箱就是工作区里的 inbox 文件夹节点
    if (S.mode === 'local') { location.replace('#/' + S.data.inboxPath); return; }
    S.sel = '#capture';
    renderMap();
    return renderCapturePanel();
  }
  let p = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
  if (S.mode === 'local' && p === S.data.inboxPath && !index.has(p)) {
    // inbox 文件夹还不存在时也能记录
    S.sel = p; renderMap(); S.panelKey = ''; return renderPanel();
  }
  if (!index.has(p)) p = '';
  S.sel = p;
  for (let c = index.get(p)?.parent; c; c = c.parent) S.open.add(c.path);
  saveOpen();
  renderMap();
  S.panelKey = '';
  renderPanel();
}
addEventListener('hashchange', route);
load();
