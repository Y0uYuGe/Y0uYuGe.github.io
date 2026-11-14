// 同一份页面：有 api/state 就是本地工作台（可管理），否则读 data.json 当博客（只读）。
import { MindMap } from './mindmap.js';
import * as NM from './notemap.js';
import { enhance } from './blog/article.js';
import * as AG from './agents.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const store = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem('studio.' + k)) ?? d; } catch { return d; } },
  set: (k, v) => localStorage.setItem('studio.' + k, JSON.stringify(v)),
};

const S = {
  mode: null, data: null, raw: '', sel: null, query: '',
  open: new Set(store.get('open', [''])),
  focus: store.get('focus', ''),
  layout: store.get('layout', 'right'),
  view: store.get('view', 'map'),
  tab: 'note', noteView: store.get('noteView', 'doc'),
  panelKey: '',
};
const index = new Map(); // path -> 工作区节点
const byUrl = new Map(); // 博客：文章页地址 -> 节点 path

const STATUS = { running: '进行中', waiting: '待处理', todo: '待办', done: '已完成' };
const STATUS_ORDER = ['running', 'waiting', 'todo', 'done'];

// ---------- 数据 ----------
async function load() {
  try {
    const r = await fetch('api/state', { cache: 'no-store' });
    if (!r.ok) throw 0;
    S.mode = 'local';
    accept(await r.text());
    setInterval(refresh, 3000);
  } catch {
    S.mode = 'blog';
    document.body.classList.add('blog');
    accept(await (await fetch('data.json')).text());
  }
}

// 轮询：带上手里树的版本号，树没变服务端就不发树（只发几 KB 的 AI 状态等）；页面在后台时不轮询
async function refresh() {
  if (document.hidden) return;
  try { accept(await (await fetch('api/state' + (S.treeV ? '?v=' + encodeURIComponent(S.treeV) : ''), { cache: 'no-store' })).text()); } catch {}
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && S.mode === 'local') refresh(); });

function accept(text) {
  if (text === S.raw) return;
  S.raw = text;
  const d = JSON.parse(text);
  const treeChanged = !!d.tree;
  if (treeChanged) {
    S.treeV = d.v;
    index.clear();
    byUrl.clear();
    const walk = (n, parent) => { n.parent = parent; index.set(n.path, n); if (n.url) byUrl.set(n.url, n.path); n.children.forEach((c) => walk(c, n)); };
    walk(d.tree, null);
  } else d.tree = S.data.tree;
  d.agents = d.agents || [];
  d.moves = d.moves || [];
  const first = !S.data;
  S.data = d;
  // 导图上看得见的才算变化：AI 的增减、状态、标题、位置（时间戳、最后一句回复变了不重画导图）
  const mapKey = JSON.stringify([d.agents.map((a) => [a.id, a.status, a.title, a.path]), d.moves.map((m) => m.to), S.pins]);
  const mapChanged = treeChanged || mapKey !== S.mapKey;
  S.mapKey = mapKey;
  if (first) { $('#brand').textContent = d.site.title; document.title = d.site.title; }
  updateWorkCount();
  renderBanner();
  if (S.sel === null || (S.wantPath && index.has(S.wantPath))) route();
  else { if (mapChanged) renderMap(); renderPanel(); if (S.view === 'work' && mapChanged) renderWork(); }
}

async function getNote(p) {
  return (await fetch('api/note?path=' + encodeURIComponent(p), { cache: 'no-store' })).json();
}

const post = (url, data) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Studio': '1' }, body: JSON.stringify(data) })
  .then(async (r) => { const j = await r.json(); if (!r.ok) throw Object.assign(new Error(j.error || r.status), { status: r.status }); return j; });

// agent 的 cwd 归属到树上最深的那个文件夹节点
function owner(p) {
  while (!index.has(p)) p = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '';
  return p;
}
const agentsUnder = (p) => S.data.agents.filter((a) => p === '' || a.path === p || a.path.startsWith(p + '/'));
const agentsAt = (p) => S.data.agents.filter((a) => owner(a.path) === p);
// 工作区里的路径 -> 本机绝对路径（Windows 用 \\，Mac / Linux 用 /）
const PATH_SEP = () => (S.data.root.includes('\\') ? '\\' : '/');
const absPath = (p) => S.data.root + (p ? PATH_SEP() + p.replaceAll('/', PATH_SEP()) : '');
const vscodeUrl = (abs) => 'vscode://file/' + encodeURI(abs.replaceAll('\\', '/'));

// ---------- 工作区导图 ----------
const nodeClassOf = (v) => (v.a
  ? ['agent', 'agent-' + v.a.status, S.agent === v.a.id && 'agent-on'].filter(Boolean).join(' ')
  : [v.n.note && 'has-note', v.hit && 'hit'].filter(Boolean).join(' '));
const map = new MindMap($('#map'), {
  layout: S.layout,
  render: workspaceNode,
  nodeClass: nodeClassOf,
  onSelect: (v) => (v.a ? openAgent(v.a.id) : openNode(v.id)),
  onToggle: (v) => { if (!v.a) toggle(v.id); },
  onActivate: (v) => { if (!v.a && v.n.children.length && v.id !== S.focus) setFocus(v.id); },
  editText: (v) => v.n?.dir,
  onRename: (v, name) => renameFolder(v.id, name),
  onHelp: () => showHelp(),
  onEscape: () => { if (S.focus) { setFocus(''); return true; } return false; },
  onKey: (e, v) => {
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key.toLowerCase() === 'f') { $('#search').focus(); return true; }
    if (v.a) return ['Tab', 'Enter', 'F2'].includes(e.key); // AI 节点不能新建子文件夹、改名
    if (S.mode !== 'local') return e.key === 'F2'; // 只读模式不能改名
    if (e.key === 'F2' && !v.id) return true; // 根目录不能改名
    if (e.key === 'Tab') { newFolder(v.id); return true; }
    if (e.key === 'Enter' && !e.shiftKey) { newFolder(v.id ? v.n.parent.path : ''); return true; }
    return false;
  },
});

// 新建文件夹（同时建同名笔记），建好后直接进入改名
async function newFolder(parent) {
  try {
    const r = await post('api/folder/create', { parent });
    S.open.add(parent);
    saveOpen();
    await refresh();
    location.hash = '#/' + r.path;
    setTimeout(() => map.edit(r.path), 300);
  } catch (err) { alert(err.message); }
}

// 重命名文件夹：导图的展开状态、工作台里固定的文件夹跟着改路径
async function renameFolder(p, name) {
  try {
    const r = await post('api/folder/rename', { path: p, name });
    const fix = (x) => (x === p ? r.path : x.startsWith(p + '/') ? r.path + x.slice(p.length) : x);
    S.open = new Set([...S.open].map(fix));
    saveOpen();
    S.pins = S.pins.map(fix);
    store.set('pins', S.pins);
    if (S.focus) setFocus(fix(S.focus));
    await refresh();
    location.hash = '#/' + r.path;
  } catch (err) { alert(err.message); renderMap(); }
}

// 节点上的 agent 状态徽标：自己的用实心，折叠起来的子孙用描边
function badges(list, faint) {
  const c = {};
  for (const a of list) c[a.status] = (c[a.status] || 0) + 1;
  return STATUS_ORDER.filter((s) => c[s] && s !== 'done').map((s) => `<span class="ag ag-${s}${faint ? ' faint' : ''}" title="${STATUS[s]}">${c[s]}</span>`).join('');
}

const TOOL = { claude: 'Claude', 'claude-code': 'Claude', codex: 'Codex', sextant: '蜂群', qoder: 'Qoder', gemini: 'Gemini' };
const agentTitle = (a) => a.title || (a.prompt || '').slice(0, 40) || '（无标题）';

// 分隔符：「 - 」要带空格（heap-exploitation-in-real-world 这种词里的连字符不算）；中文破折号、冒号、竖线、间隔号随意
const SEP = /^(?:\s+-\s*|\s*-\s+|\s*(?:—+|：|:|\||｜|·)\s*)/;
function shortName(n) {
  let s = n.name;
  for (let p = n.parent; p && p.path; p = p.parent) {
    for (const head of new Set([p.name, p.note?.title, p.dir].filter(Boolean))) {
      if (!s.startsWith(head)) continue;
      const rest = s.slice(head.length);
      if (SEP.test(rest) && rest.replace(SEP, '')) s = rest.replace(SEP, '');
    }
  }
  return s;
}

function workspaceNode(v) {
  if (v.a) return agentNode(v.a, v.from);
  const n = v.n;
  const short = shortName(n);
  const t = short.length > 34 ? short.slice(0, 33) + '…' : short;
  let h = `${isPinned(n.path) && n.path ? '<span class="pin" title="在工作台里">📌</span>' : ''}<span class="mm-label" title="${esc(n.name)}">${esc(t)}</span>`;
  if (n.note?.status) h += `<span class="status">${esc(n.note.status)}</span>`;
  if (S.mode === 'local') {
    if (n.blog?.on) h += `<span class="pub${n.blog.how === 'self' ? '' : ' faint'}" title="${BLOG_HOW[n.blog.how]}">🌐</span>`;
    if (S.data.moves.some((m) => m.to === n.path)) h += '<span class="moved" title="这个文件夹刚被移动过">↪</span>';
  }
  if (n.children.length && !S.query) h += `<span class="mm-toggle">${v.closed ? n.children.length : '−'}</span>`;
  return h;
}

// 导图上的一个 AI：状态点 + 哪个工具 + 在做什么
function agentNode(a, from) {
  const t = agentTitle(a);
  const kind = a.sextant?.kind === 'mission' ? '蜂群' : TOOL[a.tool] || a.tool;
  return `<span class="ag-dot ag-${a.status}" title="${STATUS[a.status]}"></span><span class="ag-tool">${from ? esc(from) + ' · ' : ''}${esc(kind)}</span>` +
    `<span class="mm-label" title="${esc(t)}">${esc(t.length > 24 ? t.slice(0, 23) + '…' : t)}</span>`;
}

// AI 会话 / 蜂群任务挂在它所在文件夹下面，当子节点显示。
// 文件夹收起时，里面（任意深的子文件夹）在跑的 AI 也直接挂在它下面，标上在哪个子文件夹——不管收得多深都看得见
const byStatus = (x, y) => STATUS_ORDER.indexOf(x.status) - STATUS_ORDER.indexOf(y.status) || y.mtime - x.mtime;
function withAgents(v) {
  if (S.mode !== 'local') return v;
  const list = (v.closed ? agentsUnder(v.id) : agentsAt(v.id)).filter((a) => a.status !== 'done').sort(byStatus);
  if (!list.length) return v;
  const ag = list.map((a) => {
    const o = owner(a.path);
    return { id: '@' + a.id, a, from: o !== v.id ? index.get(o)?.name : '', children: [] };
  });
  return { ...v, collapsed: false, children: [...ag, ...(v.closed ? [] : v.children)] };
}

// 工作区树 -> 导图数据（只含展开的部分；搜索时只留命中项和它们的上级）
function mapTree() {
  const q = S.query.toLowerCase();
  const match = (n) => S.contentHits?.has(n.path) || n.name.toLowerCase().includes(q) || (n.dir || '').toLowerCase().includes(q) || (n.note?.title || '').toLowerCase().includes(q);
  const conv = (n, isRoot) => {
    if (!q) {
      const closed = !isRoot && !S.open.has(n.path);
      return withAgents({ id: n.path, n, closed, collapsed: closed, children: n.children.map((c) => conv(c, false)) });
    }
    const kids = n.children.map((c) => conv(c, false)).filter(Boolean);
    return match(n) || kids.length || isRoot ? { id: n.path, n, hit: match(n), collapsed: false, children: kids } : null;
  };
  return conv(index.get(S.focus) || S.data.tree, true);
}

function renderMap() {
  if (!index.has(S.focus)) S.focus = '';
  map.setData(mapTree());
  map.render();
  if (S.sel !== null && index.has(S.sel)) map.select(S.sel, false);
  const chain = [];
  for (let c = index.get(S.focus); c && c.path; c = c.parent) chain.unshift(c);
  $('#focus-crumbs').innerHTML = chain.length
    ? `<a data-focus="">${esc(S.data.tree.name)}</a>` + chain.map((c) => ` / <a data-focus="${esc(c.path)}">${esc(c.name)}</a>`).join('')
    : '';
  document.querySelectorAll('#map-tools [data-level]').forEach((b) => b.classList.toggle('on', +b.dataset.level === S.level));
}

function saveOpen() { store.set('open', [...S.open]); }
function toggle(p) {
  S.open.has(p) ? S.open.delete(p) : S.open.add(p);
  S.level = 0;
  saveOpen();
  renderMap();
}
function setFocus(p) {
  S.focus = p;
  store.set('focus', p);
  map.placed = false;
  renderMap();
}
// 展开到第 L 层（相对当前聚焦的分支）
function expandTo(level) {
  const base = index.get(S.focus) || S.data.tree;
  const walk = (n, d) => {
    if (d < level) S.open.add(n.path); else S.open.delete(n.path);
    n.children.forEach((c) => walk(c, d + 1));
  };
  walk(base, 0);
  S.level = level;
  saveOpen();
  renderMap();
  map.fit();
}

$('#map-tools').addEventListener('click', (e) => {
  const lv = e.target.closest('[data-level]');
  if (lv) return expandTo(+lv.dataset.level);
  const f = e.target.closest('[data-focus]');
  if (f) setFocus(f.dataset.focus);
});
$('#layout-btn').onclick = () => { S.layout = S.layout === 'right' ? 'both' : 'right'; store.set('layout', S.layout); map.setLayout(S.layout); };
$('#fit-btn').onclick = () => map.fit();
$('#help-btn').onclick = () => showHelp();
// ---------- 搜索：节点名字 + 笔记正文 ----------
// 输入时：导图只留命中的节点（名字或正文命中）；下面弹出结果，名字命中马上出，正文命中稍后到。
// 点结果：打开那篇笔记，滚到这个词并高亮。↑↓ 选、Enter 打开、Esc 清空。
const searchBox = $('#search');
const results = document.createElement('div');
results.id = 'search-results';
results.hidden = true;
document.body.appendChild(results);
const SR = { seq: 0, timer: 0, sel: 0, items: [] };
const crumbOf = (n) => { const c = []; for (let p = n.parent; p && p.path; p = p.parent) c.unshift(p.name); return c.join(' / '); };
const markQ = (text, q) => esc(text).replace(new RegExp(esc(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), (m) => `<mark>${m}</mark>`);

searchBox.oninput = () => {
  const q = searchBox.value.trim();
  S.query = q;
  S.contentHits = new Set();
  renderMap();
  if (q) map.fit();
  clearTimeout(SR.timer);
  if (!q) { results.hidden = true; return; }
  renderResults(q, null);
  if (S.mode !== 'local') return;
  SR.timer = setTimeout(async () => {
    const my = ++SR.seq;
    let r;
    try { r = await (await fetch('api/search?q=' + encodeURIComponent(q))).json(); } catch { return; }
    if (my !== SR.seq || searchBox.value.trim() !== q) return;
    S.contentHits = new Set(r.hits.map((h) => h.path));
    renderMap();
    map.fit();
    renderResults(q, r);
  }, 120);
};

function renderResults(q, r) {
  const ql = q.toLowerCase();
  const names = [...index.values()].filter((n) => n.path && (n.name.toLowerCase().includes(ql) || n.dir.toLowerCase().includes(ql))).slice(0, 6);
  SR.items = [...names.map((n) => ({ path: n.path })), ...(r?.hits || []).map((h) => ({ path: h.path, find: q }))];
  SR.sel = 0;
  let h = '';
  if (names.length) h += '<div class="sr-group">节点</div>' + names.map((n, i) =>
    `<div class="sr-item" data-i="${i}"><div class="sr-t">${markQ(n.name, q)}</div><div class="sr-c">${esc(crumbOf(n))}</div></div>`).join('');
  if (r?.hits.length) h += `<div class="sr-group">笔记正文 · ${r.total} 篇</div>` + r.hits.map((x, k) => {
    const n = index.get(x.path);
    return `<div class="sr-item" data-i="${names.length + k}"><div class="sr-t">${esc(n?.name || x.path)}<span class="sr-n">${x.count} 处</span></div>
      <div class="sr-c">${esc(crumbOf(n || { parent: null }))}${x.head ? ' · ' + esc(x.head) : ''}</div><div class="sr-s">${markQ(x.snippet, q)}</div></div>`;
  }).join('');
  if (!h) h = `<div class="sr-empty">${r ? '没有找到' : '搜索中…'}</div>`;
  results.innerHTML = h;
  const b = searchBox.getBoundingClientRect();
  results.style.top = b.bottom + 6 + 'px';
  results.style.right = innerWidth - b.right + 'px';
  results.hidden = false;
  markSel();
}
function markSel() {
  results.querySelectorAll('.sr-item').forEach((el) => el.classList.toggle('on', +el.dataset.i === SR.sel));
  results.querySelector('.sr-item.on')?.scrollIntoView({ block: 'nearest' });
}
function clearSearch() {
  searchBox.value = '';
  S.query = '';
  S.contentHits = new Set();
  results.hidden = true;
  renderMap();
}
function openHit(it) {
  if (!it) return;
  clearSearch();
  if (it.find) { S.find = it.find; S.tab = 'note'; S.noteView = 'doc'; }
  openNode(it.path);
}
searchBox.onkeydown = (e) => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    SR.sel = Math.max(0, Math.min(SR.items.length - 1, SR.sel + (e.key === 'ArrowDown' ? 1 : -1)));
    markSel();
  } else if (e.key === 'Enter') { e.preventDefault(); openHit(SR.items[SR.sel]); }
  else if (e.key === 'Escape') { clearSearch(); searchBox.blur(); }
};
searchBox.onfocus = () => { if (searchBox.value.trim()) results.hidden = false; };
results.addEventListener('mousedown', (e) => { e.preventDefault(); const it = e.target.closest('.sr-item'); if (it) openHit(SR.items[+it.dataset.i]); });
addEventListener('mousedown', (e) => { if (!results.hidden && e.target !== searchBox && !results.contains(e.target)) results.hidden = true; });

// 打开搜索结果后：在笔记里高亮这个词，滚到第一处（用浏览器的高亮，不改动笔记内容）
function highlightFind(root, q) {
  if (!window.CSS?.highlights) return;
  const ql = q.toLowerCase();
  const ranges = [];
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let t; (t = w.nextNode()) && ranges.length < 500;) {
    const s = t.nodeValue.toLowerCase();
    for (let i = s.indexOf(ql); i >= 0; i = s.indexOf(ql, i + ql.length)) {
      const r = new Range();
      r.setStart(t, i);
      r.setEnd(t, i + q.length);
      if (r.getClientRects().length) ranges.push(r);
    }
  }
  CSS.highlights.set('find', new Highlight(...ranges));
  const go = () => {
    const first = ranges[0];
    if (!first) return;
    const body = $('#panel-body'), rr = first.getBoundingClientRect(), br = body.getBoundingClientRect();
    body.scrollTop += rr.top - br.top - br.height / 3;
  };
  go();
  setTimeout(go, 500); // 图片加载完位置会变，再对一次
}

// 点节点：打开面板显示它（已经选中的节点也要能重新打开被关掉的面板）
function openNode(p) {
  S.panelClosed = false;
  if (S.agent) { S.agent = null; S.panelKey = ''; renderMap(); }
  if (location.hash === '#/' + p || decodeURIComponent(location.hash) === '#/' + p) { S.panelKey = ''; renderPanel(true); }
  else location.hash = '#/' + p;
}

// ---------- 视图切换 ----------
function setView(v) {
  S.view = v;
  store.set('view', v);
  document.querySelectorAll('#views button').forEach((b) => b.classList.toggle('on', b.dataset.view === v));
  $('#map-view').hidden = v !== 'map';
  $('#work-view').hidden = v !== 'work';
  $('#search').hidden = v !== 'map';
  if (!S.data) return;
  // sextant 的同一个会话只能连一个终端：两个视图不同时连
  if (v === 'work') {
    // 工作台需要宽度：先收起右侧面板，点子导图里的节点会再打开
    closePanel();
    renderWork();
  } else {
    panes.forEach((pane) => pane.el.remove());
    panes.clear();
    map.render();
  }
}
$('#views').addEventListener('click', (e) => { const b = e.target.closest('[data-view]'); if (b) setView(b.dataset.view); });

// ---------- 移动提醒 ----------
function renderBanner() {
  const el = $('#banner');
  if (S.mode !== 'local' || !S.data.moves.length) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = S.data.moves.map((m) => {
    const n = agentsUnder(m.to).filter((a) => a.movedFrom).length;
    return `<div class="move">文件夹 <b>${esc(m.from)}</b> 已移动到 <a href="#/${esc(m.to)}">${esc(m.to)}</a>。
      ${n ? `有 ${n} 个 agent 会话还记在旧路径上，导图已按新位置显示。` : ''}
      迁移后在新位置也能继续之前的 Claude Code 对话，sextant 的任务和会话也会跟过去。
      <button data-migrate="${m.id}">迁移 agent 记录</button><button data-dismiss="${m.id}">忽略</button></div>`;
  }).join('') + '<div id="move-report"></div>';
}
$('#banner').addEventListener('click', async (e) => {
  const m = e.target.dataset.migrate, d = e.target.dataset.dismiss;
  if (d) { await post('api/moves/dismiss', { id: d }); return refresh(); }
  if (!m) return;
  e.target.disabled = true;
  e.target.textContent = '迁移中…';
  try {
    const r = await post('api/moves/migrate', { id: m });
    await refresh();
    $('#banner').hidden = false;
    $('#banner').insertAdjacentHTML('beforeend', `<div class="move done">${r.report.map(esc).join('<br>')}${r.failed.length ? '<br><b>未完成：</b>' + r.failed.map(esc).join('<br>') : ''} <button data-close-report>知道了</button></div>`);
  } catch (err) { e.target.textContent = '失败：' + err.message; }
});
$('#banner').addEventListener('click', (e) => { if (e.target.hasAttribute('data-close-report')) { e.target.parentElement.remove(); renderBanner(); } });

// ---------- sextant ----------
const sx = () => S.data.sextant || { up: false };
document.addEventListener('click', async (e) => {
  if (!e.target.hasAttribute?.('data-sx-start')) return;
  e.target.disabled = true; e.target.textContent = '启动中…（第一次要十几秒）';
  await post('api/sextant/start', {}).catch((err) => alert(err.message));
  for (let i = 0; i < 20 && !sx().up; i++) { await new Promise((r) => setTimeout(r, 1500)); await refresh(); }
});

// ---------- 工作台：正在做的几个文件夹 ----------
// 在导图里把文件夹"加入工作台"。每个文件夹一个区域：它那一块子导图，AI 也挂在上面，点了在右边看终端 / 蜂群图。
S.pins = store.get('pins', []);
const panes = new Map(); // 文件夹 -> { el, mm, open, sxKey }

const isPinned = (p) => S.pins.includes(p);
function togglePin(p) {
  S.pins = isPinned(p) ? S.pins.filter((x) => x !== p) : [...S.pins, p];
  store.set('pins', S.pins);
  updateWorkCount();
  renderMap();
  S.panelKey = '';
  renderPanel();
  if (S.view === 'work') renderWork();
}
function updateWorkCount() {
  const live = S.pins.some((p) => agentsUnder(p).some((a) => a.status === 'running'));
  $('#work-count').textContent = S.pins.length ? ` ${S.pins.length}` : '';
  $('#work-count').className = live ? 'live' : '';
}

function renderWork() {
  S.pins = S.pins.filter((p) => index.has(p));
  $('#work-filter').innerHTML = `<b>正在做 ${S.pins.length} 个文件夹</b>
    <span class="hint">在导图里选中文件夹，点「📌 加入工作台」</span>
    ${S.mode === 'local' && !sx().up && sx().canStart ? '<span class="sxhint">sextant 未运行 <button data-sx-start>启动 sextant</button></span>' : ''}`;
  const grid = $('#work-grid');
  grid.className = 'cols-' + Math.min(3, Math.max(1, S.pins.length));
  for (const [p, pane] of panes) if (!isPinned(p)) { pane.el.remove(); panes.delete(p); }
  for (const p of S.pins) {
    const pane = panes.get(p) || createPane(p);
    updatePane(pane);
    if (!pane.el.isConnected) grid.appendChild(pane.el);
  }
  grid.querySelector(':scope > .empty')?.remove();
  if (!S.pins.length) grid.insertAdjacentHTML('beforeend', '<div class="empty pad">还没有固定的文件夹。在导图里点一个文件夹，在右侧面板点「📌 加入工作台」，它就会出现在这里。</div>');
}

function createPane(p) {
  const el = document.createElement('section');
  el.className = 'pane';
  el.dataset.path = p;
  el.innerHTML = '<div class="phead"></div><div class="psub"></div>';
  const pane = { p, el, open: new Set(store.get('paneOpen', {})[p] || [p]), first: true };
  pane.mm = new MindMap(el.querySelector('.psub'), {
    minimap: false,
    render: workspaceNode,
    nodeClass: nodeClassOf,
    onSelect: (v) => (v.a ? openAgent(v.a.id) : openNode(v.id)),
    onToggle: (v) => {
      if (v.a) return;
      pane.open.has(v.id) ? pane.open.delete(v.id) : pane.open.add(v.id);
      store.set('paneOpen', { ...store.get('paneOpen', {}), [p]: [...pane.open] });
      renderSub(pane);
    },
  });
  panes.set(p, pane);
  return pane;
}

function renderSub(pane) {
  const conv = (n) => { const closed = !pane.open.has(n.path); return withAgents({ id: n.path, n, closed, collapsed: closed, children: n.children.map(conv) }); };
  pane.mm.setData(conv(index.get(pane.p)));
  pane.mm.render();
  if (pane.first) { pane.first = false; requestAnimationFrame(() => pane.mm.fit()); }
}

function updatePane(pane) {
  const { p, el } = pane, n = index.get(p);
  const local = S.mode === 'local';
  el.querySelector('.phead').innerHTML = `<span class="pname">📌 ${esc(n.name)}</span><span class="ppath">${esc(p)}</span>
    ${badges(agentsUnder(p))}
    <span class="pacts"><button data-pane-act="locate" title="在导图中定位">定位</button>
    ${local ? `<button data-open="${esc(p)}" title="在资源管理器中打开">资源管理器</button><a href="${vscodeUrl(absPath(p))}"><button>VS Code</button></a>` : ''}
    <button class="icon" data-pane-act="max" title="放大">⤢</button><button class="icon" data-pane-act="unpin" title="移出工作台">✕</button></span>`;
  renderSub(pane);
}

$('#work-grid').addEventListener('click', (e) => {
  const paneEl = e.target.closest('.pane');
  if (!paneEl) return;
  const p = paneEl.dataset.path;
  const act = e.target.closest('[data-pane-act]')?.dataset.paneAct;
  if (act === 'unpin') return togglePin(p);
  if (act === 'max') return paneEl.classList.toggle('max');
  if (act === 'sub') return paneEl.classList.toggle('nosub');
  if (act === 'locate') { setView('map'); location.hash = '#/' + p; return; }
  if (e.target.dataset.open !== undefined) return post('api/open', { path: e.target.dataset.open }).catch((err) => alert(err.message));
});

// ---------- 详情面板 ----------
function resolveRel(base, href) {
  const parts = (base ? base.split('/') : []);
  for (const seg of href.split('/')) {
    if (seg === '..') parts.pop(); else if (seg && seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

// 旧博客文章里的 Jekyll 写法：{{ '/x' | relative_url }} 换成 /x，去掉 {% raw %} 这类标签
const liquid = (s) => s
  .replace(/\{\{\s*['"]([^'"]+)['"]\s*\|\s*(?:relative_url|absolute_url)\s*\}\}/g, '$1')
  .replace(/\{%-?\s*(?:raw|endraw)\s*-?%\}/g, '');

const isInboxSel = () => S.mode === 'local' && S.sel === S.data.inboxPath;

function panelKeyOf(n, sessions, inbox) {
  return JSON.stringify([n.path, n.note?.mtime, sessions.length, inbox.length, S.tab, S.noteView]);
}

async function renderPanel(force) {
  if (S.agent) return renderAgentPanel(force);
  if (S.agentView) { S.agentView = null; S.agentLive?.destroy(); S.agentLive = null; force = true; }
  const n = index.get(S.sel) || (isInboxSel() && { name: '收件箱', dir: S.sel, path: S.sel, children: [], parent: S.data.tree });
  if (!n) return;
  const local = S.mode === 'local';
  if (!local) return renderBlogPanel(n, force);
  const sessions = local ? agentsUnder(n.path) : [];
  const inbox = !local ? [] : isInboxSel() ? S.data.inbox : S.data.inbox.filter((e) => n.path && (e.tags.includes(n.dir) || e.tags.includes(n.name)));
  // 轮询时只有内容变了才重画；正在导图上改字、或终端开着时不打断
  const key = panelKeyOf(n, sessions, inbox);
  const typing = S.noteMap?.editing || S.editingNote || S.liveEditing;
  if (!force && (key === S.panelKey || (typing && S.panelNode === n.path))) return;
  const sameNode = S.panelNode === n.path;
  S.panelKey = key;
  CSS.highlights?.delete('find');
  S.panelNode = n.path;

  [...editors].forEach((e) => e.destroy());
  await S.pendingSave;
  let { note, files = [] } = await getNote(n.path);
  if (!note && local && n.path && !isInboxSel()) {
    note = { meta: { title: n.name }, body: '', file: absPath(n.path) + PATH_SEP() + n.dir + '.md', mtime: 0, offset: 4, virtual: true };
  }
  S.note = note ? { ...note, path: n.path } : null;

  const chain = [];
  for (let c = n; c; c = c.parent) chain.unshift(c);
  $('#crumbs').innerHTML = chain.slice(0, -1).map((c) => `<a href="#/${esc(c.path)}">${esc(c.name)}</a>`).join(' / ');

  // 标题、元信息、操作按钮
  const m = note?.meta || {};
  let top = `<div class="titlerow"><h1 class="title">${esc(m.title || n.name)}</h1><div class="meta">`;
  if (m.status) top += `<span class="chip">${esc(m.status)}</span>`;
  top += (n.note?.tags || []).map((t) => `<span class="chip">#${esc(t)}</span>`).join('');
  if (n.note?.date) top += `<span>${esc(n.note.date)}</span>`;
  top += '</div></div>';
  if (local) {
    const dirPath = n.path;
    // 一行小按钮：新建 AI（蜂群 / 任意 agent 的会话，在 sextant 的表单里选）+ 打开方式 + 工作台
    top += '<div class="actions">';
    top += '<button class="primary" data-newmission title="在这个文件夹新建：蜂群任务（多个 agent 协作）或一个 agent 的会话">＋ 新建</button>';
    top += `<a href="${vscodeUrl(absPath(n.path))}"><button title="用 VS Code 打开这个文件夹">VS Code</button></a>`;
    top += `<button data-open="${esc(dirPath)}" title="在资源管理器中打开 ${esc(absPath(dirPath))}">资源管理器</button>`;
    if (S.data.launchers.includes('终端')) top += '<button data-launch="终端" title="在这个文件夹打开终端">终端</button>';
    top += blogSelect(n);
    if (n.path) top += `<button data-pin="${esc(n.path)}" class="${isPinned(n.path) ? 'pinned' : ''}" title="${isPinned(n.path) ? '已在工作台，点击移出' : '加入工作台'}">📌${isPinned(n.path) ? ' 已固定' : ' 工作台'}</button>`;
    top += '</div>';
  }
  $('#panel-top').innerHTML = top;

  // 视图切换：文档 / 导图 / 附件，放在按钮行右边（不再单独占两行）
  if (S.tab === 'files' && !files.length) S.tab = 'note';
  if (S.noteView !== 'map') S.noteView = 'doc';
  const cur = S.tab === 'files' ? 'files' : S.noteView;
  const pv = (k, label, tip) => `<button data-pv="${k}" class="${cur === k ? 'on' : ''}" title="${tip}">${label}</button>`;
  const views = note || files.length ? `<span class="seg pv">${note ? pv('doc', '文档', '直接编辑，停下 0.8 秒自动保存') + pv('map', '导图', '标题就是主题：点主题在旁边打开它的笔记 · Tab 子主题 · Enter 同级 · F2 改字 · ? 全部快捷键') : ''}${files.length ? pv('files', `附件 ${files.length}`, '文件夹里的图片、PDF 等') : ''}</span>` : '';
  $('#panel-top').querySelector('.actions')?.insertAdjacentHTML('beforeend', views);
  if (!local && views) $('#panel-top').insertAdjacentHTML('beforeend', `<div class="actions">${views}</div>`);
  $('#tabs').hidden = true;

  $('#panel').hidden = !!S.panelClosed;
  $('#resizer').hidden = !!S.panelClosed;
  const body = $('#panel-body');
  const scroll = sameNode ? body.scrollTop : 0;
  [...editors].forEach((e) => e.destroy());
  body.className = '';
  S.noteMap = null;
  body.innerHTML = '';

  if (S.tab === 'note') {
    if (note) {
      if (S.noteView === 'map') return renderNoteMap(n, note);
      const ed = noteEditor(n, note, () => {});
      const editor = mdEditor({
        md: note.body,
        base: n.path,
        editable: local,
        empty: note.virtual ? `这个文件夹还没有笔记。直接在这里写关于「${n.name}」的内容，会自动保存为 ${n.dir}.md` : '写点什么…',
        onSave: (md) => ed.run(() => ({ body: '\n' + md + '\n', line: 0 }), { keepPop: true }),
      });
      editor.el.classList.add('doc-editor');
      if (S.find) { const q = S.find; S.find = null; editor.ready.then(() => highlightFind(editor.el, q)); }
      body.appendChild(editor.el);
    }
    if (local && isInboxSel()) body.insertAdjacentHTML('beforeend', captureHTML());
    if (inbox.length) body.insertAdjacentHTML('beforeend', `<div class="section"><h4>${isInboxSel() ? '收件箱' : '收件箱中的相关记录'}</h4>${entriesHTML(inbox.slice(0, 50))}</div>`);
    if (!n.path) body.insertAdjacentHTML('beforeend', recentList());
  } else if (S.tab === 'files') {
    renderFiles(n, files);
  }
  body.scrollTop = scroll;
  const draft = S.draft;
  if (draft && $('#cap-text')) $('#cap-text').value = draft;
}

// ---------- 博客 ----------
const BLOG_HOW = { self: '在博客显示（这个文件夹设的）', inherit: '在博客显示（跟随上级文件夹）' };
// 去掉这个文件夹自己的设置后会怎样：看上级里最近的设置，都没有就不公开
function inheritedBlog(n) {
  for (let c = n.parent; c; c = c.parent) if (c.blog?.how === 'self') return c.blog.on;
  return false;
}
function blogSelect(n) {
  const cur = n.blog?.how === 'self' ? (n.blog.on ? 'on' : 'off') : '';
  const inh = inheritedBlog(n) ? '显示' : '不显示';
  const o = (v, label) => `<option value="${v}"${cur === v ? ' selected' : ''}>${label}</option>`;
  return `<select data-blog="${esc(n.path)}" title="这个文件夹和下面所有子文件夹在博客里显示吗">${o('', '🌐 跟随上级（' + inh + '）')}${o('on', '🌐 在博客显示')}${o('off', '🌐 不在博客显示')}</select>`;
}
$('#panel').addEventListener('change', async (e) => {
  const sel = e.target.closest('[data-blog]');
  if (!sel) return;
  const on = sel.value === '' ? null : sel.value === 'on';
  try { await post('api/blog/set', { path: sel.dataset.blog, on }); S.panelKey = ''; await refresh(); }
  catch (err) { alert(err.message); }
});
$('#blog-btn').onclick = async () => {
  const b = $('#blog-btn'), w = window.open('about:blank', '_blank');
  b.disabled = true; b.textContent = '生成中…';
  try {
    const r = await post('api/blog/build', {});
    if (w) w.location = r.preview;
    flash(`博客已生成：${r.notes} 篇文章${r.broken ? `，${r.broken} 个坏链接` : ''}`);
  } catch (err) { w?.close(); alert(err.message); }
  b.disabled = false; b.textContent = '🌐 博客预览';
};

// 博客模式的右侧面板：文章正文取自文章页（构建时已渲染好），只读；「整页阅读」打开文章页
async function renderBlogPanel(n, force) {
  const key = 'b:' + n.path;
  if (!force && S.panelKey === key) return;
  S.panelKey = key;
  S.panelNode = n.path;
  const chain = [];
  for (let c = n; c; c = c.parent) chain.unshift(c);
  $('#crumbs').innerHTML = chain.slice(0, -1).map((c) => `<a href="#/${esc(c.path)}">${esc(c.name)}</a>`).join(' / ');
  const m = n.note || {};
  let top = `<div class="titlerow"><h1 class="title">${esc(n.path ? m.title || n.name : S.data.site.title)}</h1><div class="meta">`;
  top += (m.tags || []).map((t) => `<span class="chip">#${esc(t)}</span>`).join('');
  if (m.date) top += `<span>${esc(m.date)}</span>`;
  top += '</div></div>';
  if (n.url) top += `<div class="actions"><a href="${esc(n.url)}"><button class="primary">整页阅读 ↗</button></a></div>`;
  else if (!n.path && S.data.site.subtitle) top += `<div class="hint">${esc(S.data.site.subtitle)}</div>`;
  $('#panel-top').innerHTML = top;
  $('#tabs').hidden = true;
  $('#panel').hidden = !!S.panelClosed;
  $('#resizer').hidden = !!S.panelClosed;
  const body = $('#panel-body');
  body.className = '';
  body.scrollTop = 0;
  const kids = n.children.filter((c) => c.url || c.children.length);
  const list = kids.length && n.path ? `<div class="section list"><h4>本节文章</h4>${kids.map((c) =>
    `<a href="#/${esc(c.path)}"><span class="t">${esc(c.name)}</span>${c.note?.date ? `<span class="d">${esc(c.note.date)}</span>` : ''}
     ${c.note?.excerpt ? `<div class="e">${esc(c.note.excerpt)}</div>` : ''}</a>`).join('')}</div>` : '';
  if (!n.url) { body.innerHTML = list + (n.path ? '' : recentList()); return; }
  body.innerHTML = '<p class="empty">加载中…</p>';
  let html = '';
  try {
    const doc = new DOMParser().parseFromString(await (await fetch(n.url)).text(), 'text/html');
    html = doc.querySelector('.post-body')?.innerHTML || '';
  } catch {}
  if (S.panelNode !== n.path) return;
  body.innerHTML = `<div class="post-body blog-body">${html || '<p class="empty">加载失败</p>'}</div>` + list;
  enhance(body.querySelector('.blog-body'));
}
// 面板正文里点到别的文章：在导图上跳过去，不离开首页
$('#panel-body').addEventListener('click', (e) => {
  if (S.mode !== 'blog') return;
  const a = e.target.closest('a[href]');
  if (!a || a.target === '_blank') return;
  const u = new URL(a.href, location.href);
  const p = u.origin === location.origin ? byUrl.get(u.pathname) : undefined;
  if (p === undefined) return;
  e.preventDefault();
  location.hash = '#/' + p;
});

function recentList() {
  const all = [...index.values()].filter((n) => n.note && n.path).sort((a, b) => (b.note.date > a.note.date ? 1 : b.note.date < a.note.date ? -1 : b.note.mtime - a.note.mtime));
  if (!all.length) return '';
  return `<div class="section list"><h4>最近更新</h4>${all.slice(0, 20).map((n) =>
    `<a href="#/${esc(n.path)}"><span class="t">${esc(n.note.title || n.name)}</span><span class="d">${esc(n.note.date)}</span>
     ${n.note.excerpt ? `<div class="e">${esc(n.note.excerpt)}</div>` : ''}</a>`).join('')}</div>`;
}

// ---------- 导图上的 AI：点了在右边只看它的终端 / 蜂群图（工作台自己画，见 agents.js） ----------
// S.agent：选中的 AI 的 id；'new:<文件夹>' 表示在这个文件夹新建会话或蜂群任务
const SX_AGENT = { claude: 'claude-code', 'claude-code': 'claude-code', codex: 'codex', qoder: 'qoder' };
function openAgent(id) {
  S.agent = id;
  S.panelClosed = false;
  S.panelKey = '';
  renderMap();
  if (S.view === 'work') renderWork();
  renderPanel(true);
}
function closeAgent() { S.agent = null; S.panelKey = ''; renderMap(); renderPanel(true); }

function renderAgentPanel(force) {
  const id = S.agent;
  const isNew = id.startsWith('new:');
  const a = isNew ? null : S.data.agents.find((x) => x.id === id);
  const folder = isNew ? id.slice(4) : a ? owner(a.path) : S.sel || '';
  // 终端 / 蜂群图只在换了对象时才重建，状态变化只更新标题栏（不然终端会断开重连）
  const view = isNew ? 'new:' + folder : a?.sextant ? a.sextant.kind + ':' + a.sextant.ref : a ? 'log:' + a.id + ':' + (a.status === 'running') : 'gone';
  const key = JSON.stringify([id, view, sx().up]);
  const head = JSON.stringify([key, a?.status, a?.title]);
  if (!force && head === S.panelKey) return;
  const rebuild = force || S.agentView !== key;
  S.panelKey = head;
  S.agentView = key;
  S.panelNode = null;
  [...editors].forEach((e) => e.destroy());
  if (rebuild) { S.agentLive?.destroy(); S.agentLive = null; }

  const chain = [];
  for (let c = index.get(folder); c; c = c.parent) chain.unshift(c);
  $('#crumbs').innerHTML = chain.map((c) => `<a href="#/${esc(c.path)}">${esc(c.name)}</a>`).join(' / ') + ' / <b>' + (isNew ? '新建' : 'AI') + '</b>';
  let top;
  if (isNew) top = `<h1 class="title">新建</h1><div class="meta"><span>蜂群任务，或者一个 agent 的会话 · 在「${esc(index.get(folder)?.name || folder)}」里</span></div>`;
  else if (!a) top = `<h1 class="title">这个 AI 已经结束</h1>`;
  else {
    const kind = a.sextant?.kind === 'mission' ? '蜂群任务' : (TOOL[a.tool] || a.tool) + ' 会话';
    top = `<h1 class="title">${esc(agentTitle(a))}</h1><div class="meta"><span class="ag-dot ag-${a.status}"></span><span>${STATUS[a.status]}</span><span class="chip">${esc(kind)}</span><span>${new Date(a.mtime).toLocaleString('zh-CN', { hour12: false })}</span></div>`;
  }
  top += `<div class="actions"><button data-agent-back>← 回到「${esc(index.get(folder)?.name || '工作区')}」</button>`;
  if (a?.sextant?.kind === 'session') top += '<button data-agent-end title="结束这个 agent 进程">结束会话</button>';
  if (a?.sextant?.kind === 'mission') top += '<button data-agent-end title="从 sextant 里删除这个任务">删除任务</button>';
  top += '</div>';
  $('#panel-top').innerHTML = top;
  $('#tabs').hidden = true;
  $('#panel').hidden = !!S.panelClosed;
  $('#resizer').hidden = !!S.panelClosed;
  if (!rebuild) return;

  const body = $('#panel-body');
  body.className = 'has-sx';
  const needSx = (isNew || a?.sextant) && !sx().up;
  if (needSx) body.innerHTML = `<div class="empty pad center">AI 的终端和蜂群任务由后台的 sextant 运行，它现在没在运行。${sx().canStart ? '<br><br><button data-sx-start>启动 sextant</button>' : ''}</div>`;
  else if (isNew) S.agentLive = AG.newForm(body, sx().url, absPath(folder), index.get(folder)?.name || folder, { onDone: async (nid) => { await refresh(); openAgent(nid); }, onCancel: closeAgent });
  else if (!a) body.innerHTML = '<div class="empty pad center">会话已经结束，或者已经从 sextant 里删掉了。</div>';
  else if (a.sextant?.kind === 'mission') S.agentLive = AG.missionView(body, sx().url, a.sextant.ref);
  else if (a.sextant) S.agentLive = AG.terminalView(body, sx().url, a.sextant.ref);
  else {
    // 命令行里开的 Claude / Codex：没有终端可看。没在跑的可以交给 sextant 接着跑，之后就有终端了
    const can = SX_AGENT[a.tool] && a.sessionId && a.status !== 'running' && sx().up;
    body.className = '';
    body.innerHTML = `<div class="ag-log">
      ${a.status === 'running' ? '<p class="hint">这个会话正在别的终端里跑（不是从这里开的），这里看不到它的终端。等它停下后可以在这里接着聊。</p>'
        : can ? '<p><button data-agent-resume>在这里打开终端，接着这个会话</button></p>' : ''}
      ${a.prompt ? `<h4>最后的提问</h4><div class="q">${esc(a.prompt)}</div>` : ''}
      ${a.reply ? `<h4>最后的回复</h4><div class="r">${esc(a.reply)}</div>` : ''}
    </div>`;
  }
}

async function resumeAgent(a) {
  try {
    const s = await post('api/agent/resume', { agent: SX_AGENT[a.tool], id: a.sessionId, cwd: a.cwd, title: a.title });
    await refresh();
    openAgent('sx-session:' + s.name);
  } catch (err) { alert(err.message); }
}
async function endAgent() {
  const a = S.data.agents.find((x) => x.id === S.agent);
  if (!a?.sextant) return;
  const mission = a.sextant.kind === 'mission';
  if (!confirm(mission ? `删除蜂群任务「${agentTitle(a)}」？` : `结束会话「${agentTitle(a)}」？agent 进程会被关掉。`)) return;
  try { await (mission ? AG.deleteMission(sx().url, a.sextant.ref) : AG.endSession(sx().url, a.sextant.ref)); closeAgent(); refresh(); }
  catch (err) { alert(err.message); }
}

function renderFiles(n, files) {
  const body = $('#panel-body');
  const base = n.path ? n.path + '/' : '';
  const isImg = (f) => /\.(png|jpe?g|gif|svg|webp)$/i.test(f);
  body.insertAdjacentHTML('beforeend', `<div class="files">${files.map((f) => {
    const url = 'files/' + encodeURI(base + f.name);
    const size = f.size > 1 << 20 ? (f.size / (1 << 20)).toFixed(1) + ' MB' : Math.ceil(f.size / 1024) + ' KB';
    return `<div class="file">${isImg(f.name) ? `<a href="${url}" target="_blank"><img src="${url}" loading="lazy"></a>` : ''}
      <div class="fname">${esc(f.name)} <span class="d">${size}</span></div>
      <div class="factions">${/\.pdf$/i.test(f.name) ? `<button data-preview="${url}">预览</button>` : ''}
        <button data-open="${esc(base + f.name)}">用默认程序打开</button></div></div>`;
  }).join('')}</div><div id="preview"></div>`);
}

// ---------- 笔记编辑（导图） ----------
// 所有改动都是改 md 里对应的行，然后写回文件；支持撤销/重做、复制/剪切/粘贴。
const HELP = {
  map: [
    ['导航', '方向键 移动　Home 回到中心主题　空格 展开/收起　Ctrl+/ 展开/收起'],
    ['视图', 'Ctrl+= 放大　Ctrl+- 缩小　Ctrl+0 适应窗口　滚轮平移　Ctrl+滚轮缩放　Ctrl+F 搜索'],
    ['分支', '双击 只看这个分支　Esc 退出'],
    ['搜索', 'Ctrl+F 到搜索框　节点名字和笔记正文都搜　↑↓ 选　Enter 打开并跳到这个词（高亮）　Esc 清空'],
    ['文件夹', 'Tab 新建子文件夹　Enter 新建同级文件夹　F2 重命名（同时改同名笔记）'],
    ['AI', '虚线小胶囊是 AI：绿点在跑、橙点等你回复　点它右边只显示它的终端（会话）或蜂群图（任务）　文件夹收起时，里面在跑的 AI 也挂在它下面　面板上「＋ Claude / ＋ Codex / ＋ 蜂群任务」在这个文件夹开新的'],
  ],
  notemap: [
    ['编辑', 'Tab 加子主题　Enter 加同级（后面）　Shift+Enter 加同级（前面）　F2 / 空格 / 双击 改字　Delete 删除'],
    ['笔记', '点主题 在旁边打开它的笔记，直接在里面写（即时渲染，停下 0.8 秒自动保存）　Ctrl+Enter 从主题进入笔记　点导图空白处 或 Esc 关闭笔记'],
    ['写笔记', '所见即所得（像 XMind 的笔记）：看不到 md 符号，点进去编辑时上方出现工具条　也可以直接打 # 标题、- 列表、> 引用　Ctrl+B 加粗　Ctrl+I 斜体　Ctrl+K 链接　Ctrl+Z / Ctrl+Y 撤销 / 重做'],
    ['整理', 'Alt+↑/↓ 上下移动　Ctrl+C / Ctrl+X / Ctrl+V 复制 / 剪切 / 粘贴为子主题'],
    ['撤销', 'Ctrl+Z 撤销　Ctrl+Y / Ctrl+Shift+Z 重做'],
    ['导航与视图', '方向键 移动　Home 中心主题　Ctrl+/ 展开/收起　Ctrl+= / Ctrl+- / Ctrl+0 缩放/适应'],
  ],
};
function showHelp(kind) {
  const old = $('#help');
  if (old) { old.remove(); return; }
  const rows = (k, title) => `<h4>${title}</h4>` + HELP[k].map(([a, b]) => `<div class="hrow"><b>${a}</b><span>${b}</span></div>`).join('');
  document.body.insertAdjacentHTML('beforeend', `<div id="help"><div class="hbox"><button class="icon hclose" title="关闭">×</button>
    ${rows('map', '工作区导图')}${rows('notemap', '笔记 · 导图')}
    <p class="hint">按 ? 打开 / 关闭这个列表</p></div></div>`);
  $('#help').onclick = (e) => { if (e.target.id === 'help' || e.target.classList.contains('hclose')) $('#help').remove(); };
}
addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && $('#help')) $('#help').remove();
  if (e.key === '?' && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && !e.target.isContentEditable && !e.target.closest?.('.mm')) showHelp();
});

// 一份笔记的编辑器：保存、撤销/重做；改动成功后回调 onChange(新文档, 要选中的行)
function noteEditor(n, note, onChange) {
  const title = note.meta?.title || n.name;
  const hist = S.history?.path === n.path ? S.history : (S.history = { path: n.path, undo: [], redo: [] });
  const ed = {
    title,
    doc: NM.parse(note.body, title),
    busy: Promise.resolve(),
    // 按行号找当前文档里的节点
    find: (id) => { let r = null; const w = (x) => { if (x.id === id) r = x; x.children.forEach(w); }; w(ed.doc.root); return r; },
    async save(body, line, opts = {}) {
      S.editingNote = true;
      try {
        const r = await post('api/note/save', { path: n.path, body, mtime: note.mtime, title: note.meta?.title });
        if (!opts.history) { hist.undo.push(note.body); hist.redo = []; if (hist.undo.length > 100) hist.undo.shift(); }
        note.body = body;
        note.mtime = r.mtime;
        if (note.virtual) { note.virtual = false; note.file = r.file || note.file; }
        if (n.note) n.note.mtime = r.mtime;
        ed.doc = NM.parse(body, title);
        S.panelKey = panelKeyOf(n, S.mode === 'local' ? agentsUnder(n.path) : [], S.mode === 'local' && n.path ? S.data.inbox.filter((e) => e.tags.includes(n.dir) || e.tags.includes(n.name)) : []);
        onChange(ed.doc, line, opts);
      } catch (err) {
        S.editingNote = false;
        S.panelKey = '';
        await renderPanel(true);
        document.querySelector('.note-tools')?.insertAdjacentHTML('beforeend', `<span class="warn">${esc(err.message)}</span>`);
        return;
      }
      S.editingNote = false;
    },
    // 依次执行（上一个保存完再做下一个），op 拿到最新的文档
    run(op, opts = {}) {
      ed.busy = ed.busy.then(() => {
        const res = op(ed.doc);
        if (!res) return;
        if (res.error) { flash(res.error); return; }
        return ed.save(res.body, res.line, opts);
      });
      S.pendingSave = ed.busy.catch(() => {});
      return ed.busy;
    },
    undo() { ed.busy = ed.busy.then(() => { const b = hist.undo.pop(); if (b === undefined) return flash('没有可以撤销的了'); hist.redo.push(note.body); return ed.save(b, ed.selLine ?? 0, { history: true }); }); },
    redo() { ed.busy = ed.busy.then(() => { const b = hist.redo.pop(); if (b === undefined) return flash('没有可以重做的了'); hist.undo.push(note.body); return ed.save(b, ed.selLine ?? 0, { history: true }); }); },
  };
  return ed;
}
function flash(msg) {
  const t = document.querySelector('.note-tools');
  if (!t) return;
  t.querySelector('.warn')?.remove();
  t.insertAdjacentHTML('beforeend', `<span class="warn">${esc(msg)}</span>`);
  setTimeout(() => t.querySelector('.warn')?.remove(), 2500);
}

// 编辑快捷键：撤销/重做、移动、复制/剪切/粘贴
function commonKeys(e, ed, x) {
  const ctrl = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
  if (ctrl && k === 'z' && !e.shiftKey) { ed.undo(); return true; }
  if (ctrl && (k === 'y' || (k === 'z' && e.shiftKey))) { ed.redo(); return true; }
  if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { ed.run((d) => NM.move(d, ed.find(x.id) || x, e.key === 'ArrowUp' ? -1 : 1)); return true; }
  if (ctrl && k === 'c' && x.kind !== 'root') { S.clip = NM.copy(ed.doc, x); flash('已复制'); return true; }
  if (ctrl && k === 'x' && x.kind !== 'root') { S.clip = NM.copy(ed.doc, x); ed.run((d) => NM.remove(d, ed.find(x.id))); return true; }
  if (ctrl && k === 'v') { if (!S.clip) flash('还没有复制任何主题'); else ed.run((d) => NM.paste(d, ed.find(x.id) || d.root, S.clip)); return true; }
  return false;
}

// ---------- md 编辑器（Vditor 即时渲染模式，和 VS Code 的 Office Viewer 插件同一套）：文档视图和主题笔记框共用 ----------
// 整篇是一个连续的编辑区：光标所在的地方才露出 md 符号，其它地方都是渲染后的样子；停止输入 0.8 秒自动保存。
let vditorReady;
function loadVditor() {
  vditorReady ||= new Promise((ok, fail) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'vendor/vditor/dist/index.css';
    document.head.appendChild(css);
    const s = document.createElement('script');
    s.src = 'vendor/vditor/dist/index.min.js';
    s.onload = ok;
    s.onerror = fail;
    document.head.appendChild(s);
  });
  return vditorReady;
}
const editors = new Set(); // 还开着的编辑器：面板重画前先保存并销毁
(window.requestIdleCallback || setTimeout)(() => loadVditor().catch(() => {}), { timeout: 4000 });

// 笔记里点链接：网址开新标签；file:/// 本地资料用资源管理器 / 默认程序打开；
// 相对路径：指向别的笔记就跳到那个节点，其它文件用默认程序打开
function openLink(url, base) {
  if (!url || url.startsWith('#')) return;
  const fail = (err) => alert(err.message);
  if (/^file:\/\//i.test(url)) return post('api/open', { abs: decodeURI(url.replace(/^file:\/+/i, '')) }).catch(fail);
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return window.open(url, '_blank');
  const p = resolveRel(base || '', decodeURI(url.split('#')[0]).replace(/\/$/, ''));
  const m = /^(?:(.*)\/)?([^/]+)\.md$/i.exec(p);
  if (m && (m[1] || '').split('/').pop() === m[2] && index.has(m[1] || '')) location.hash = '#/' + m[1];
  else if (index.has(p)) location.hash = '#/' + p;
  else post('api/open', { path: p }).catch(fail);
}

function mdEditor({ md, base, editable, onSave, onLayout = () => {}, onEscape = () => {}, empty = '写笔记…' }) {
  const el = document.createElement('div');
  el.className = 'mde';
  let vd = null, saved = md.trim(), timer = 0, gone = false;
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  // 笔记里的相对路径图片按笔记所在文件夹找
  const linkBase = 'files/' + (base ? base.split('/').map(encodeURIComponent).join('/') + '/' : '');
  const flush = () => {
    clearTimeout(timer);
    if (!vd || !editable) return;
    const v = vd.getValue().trim();
    if (v === saved) return;
    saved = v;
    onSave(v);
  };
  // 看不见内容的块（XMind 导入留下的 <!-- 注释 -->、<a id> 锚点）不占位置；文件里照样保留
  const visibleText = (b) => {
    const c = b.cloneNode(true);
    c.querySelectorAll('.vditor-wysiwyg__pre, [data-type="html-block"] > pre:not(.vditor-wysiwyg__preview), [data-type="html-inline"], .vditor-ir__marker, .vditor-ir__marker--pre').forEach((m) => m.remove());
    return c.textContent.replace(/​/g, '').trim();
  };
  const hideGhosts = () => {
    for (const b of el.querySelectorAll('.vditor-wysiwyg > .vditor-reset > *, .vditor-ir > .vditor-reset > *')) {
      const ghost = (b.dataset.type === 'html-block' || (b.tagName === 'P' && b.querySelector('[data-type="html-inline"]')))
        && !visibleText(b) && !b.querySelector('img, iframe, video, svg');
      b.classList.toggle('mde-ghost', ghost);
    }
  };
  let readyOk;
  const ready = new Promise((ok) => (readyOk = ok)); // 编辑器渲染完
  loadVditor().then(() => {
    if (gone) return;
    vd = new Vditor(el, {
      // 所见即所得（像 XMind 的笔记）：任何时候都看不到 md 符号；编辑时上方浮出一条小工具条；文件存的还是 md
      mode: 'wysiwyg',
      value: liquid(md),
      cdn: 'vendor/vditor',
      lang: 'zh_CN',
      theme: dark ? 'dark' : 'classic',
      height: 'auto',
      minHeight: 60,
      placeholder: empty,
      cache: { enable: false },
      counter: { enable: false },
      toolbar: ['headings', 'bold', 'italic', 'strike', '|', 'list', 'ordered-list', 'check', 'quote', '|', 'code', 'inline-code', 'link', 'table', '|', 'undo', 'redo'],
      toolbarConfig: { pin: true },
      preview: {
        theme: { current: dark ? 'dark' : 'light' },
        hljs: { style: dark ? 'native' : 'github' },
        math: { engine: 'KaTeX' },
        markdown: { linkBase, autoSpace: false, fixTermTypo: false, toc: false, mark: true },
        actions: [],
      },
      input: () => { clearTimeout(timer); timer = setTimeout(() => { flush(); hideGhosts(); }, 800); },
      focus: () => { S.liveEditing = true; },
      blur: () => { S.liveEditing = false; flush(); },
      esc: () => onEscape(),
      // 所见即所得模式传进来的是 <a>，即时渲染模式传的是放网址的标记
      link: { isOpen: false, click: (m) => openLink((m.getAttribute('href') || m.textContent).trim(), base) },
      after: () => { saved = vd.getValue().trim(); if (!editable) vd.disabled(); hideGhosts(); onLayout(); readyOk(); },
    });
  }).catch(() => { el.innerHTML = '<p class="empty">编辑器加载失败</p>'; });
  // 内容变高变矮时（输入、图片加载完）通知外面重新定位
  const ro = new ResizeObserver(() => onLayout());
  ro.observe(el);
  const api = {
    el,
    ready,
    flush,
    focus() { vd?.focus(); },
    destroy() {
      if (gone) return;
      gone = true;
      flush();
      ro.disconnect();
      try { vd?.destroy(); } catch {}
      editors.delete(api);
      S.liveEditing = false;
    },
  };
  editors.add(api);
  return api;
}

// ---------- 笔记导图 ----------
function renderNoteMap(n, note) {
  const body = $('#panel-body');
  body.className = 'has-notemap';
  body.insertAdjacentHTML('beforeend', '<div class="notemap"></div>');
  const box = body.querySelector('.notemap');
  const editable = S.mode === 'local';
  const base = n.path;
  const collapsed = S.noteCollapsed?.path === n.path ? S.noteCollapsed.set : new Set();
  S.noteCollapsed = { path: n.path, set: collapsed };
  const conv = (x) => ({ id: x.id, x, collapsed: collapsed.has(x.id), children: x.children.map(conv) });
  let mm;

  // ---------- 主题笔记浮层：像 XMind，点主题就在它旁边打开；点哪段改哪段，自动保存 ----------
  let pop = null; // { id, el, live }
  function openPop(x) {
    if (pop && pop.id === x.id) return placePop();
    closePop(true);
    const el = document.createElement('div');
    el.className = 'mm-pop';
    box.appendChild(el);
    const line = (note.offset || 0) + NM.sectionOf(ed.doc, x).from + 1;
    el.innerHTML = `<div class="pop-acts">
        ${editable && !note.virtual ? `<a href="${vscodeUrl(note.file)}:${line}" title="在 VS Code 里打开到这一段"><button class="icon">↗</button></a>` : ''}
        <button class="icon" data-pop="close" title="关闭（Esc）">×</button></div>
      <div class="pop-body"></div>`;
    const id = x.id;
    const live = mdEditor({
      md: NM.sectionOf(ed.doc, x).md,
      base,
      editable,
      empty: '写这个主题的笔记…',
      onSave: (md) => ed.run((d) => NM.setSection(d, ed.find(id) || d.root, md), { keepPop: true }),
      onLayout: () => placePop(),
      onEscape: () => closePop(),
    });
    el.querySelector('.pop-body').appendChild(live.el);
    el.querySelector('[data-pop="close"]').onclick = () => closePop();
    pop = { id, el, live };
    placePop();
  }
  function closePop(silent) {
    if (!pop) return false;
    pop.live.destroy();
    pop.el.remove();
    pop = null;
    S.liveEditing = false;
    if (!silent) mm.el.focus({ preventScroll: true });
    return true;
  }

  // 贴着节点放：优先放右边，放不下放下面，再不行放上面；始终留在导图区域里
  function placePop() {
    if (!pop) return;
    const r = mm.nodeRect(pop.id);
    if (!r) { pop.el.hidden = true; return; }
    pop.el.hidden = false;
    const W = box.clientWidth, H = box.clientHeight, w = pop.el.offsetWidth, h = pop.el.offsetHeight, g = 10;
    let left, top;
    if (r.right + g + w <= W) { left = r.right + g; top = r.top - 6; }
    else if (r.bottom + g + h <= H) { left = r.left; top = r.bottom + g; }
    else { left = r.left; top = r.top - g - h; }
    pop.el.style.left = Math.max(6, Math.min(W - w - 6, left)) + 'px';
    pop.el.style.top = Math.max(6, Math.min(H - h - 6, top)) + 'px';
  }

  const ed = noteEditor(n, note, (doc, line, opts) => {
    if (opts.keepPop) { mm.setData(conv(doc.root)); mm.render(); placePop(); return; }
    const target = NM.findByLine(doc.root, line);
    S.noteSel = { path: n.path, id: target.id };
    ed.selLine = target.line;
    mm.setData(conv(doc.root));
    mm.render();
    mm.select(target.id);
    if (pop) openPop(target);
    if (!opts.editNew) mm.el.focus({ preventScroll: true });
    if (opts.editNew) setTimeout(() => mm.edit(target.id), 260);
  });
  const op = (fn, editNew) => (v) => ed.run((d) => fn(d, ed.find(v.id) || d.root), { editNew });
  mm = new MindMap(box, {
    layout: 'right',
    minimap: false,
    render: (v) => `<span class="mm-label">${esc(NM.plain(v.x.text) || '（空）')}</span>${v.collapsed ? `<span class="mm-toggle">${v.children.length}</span>` : ''}`,
    nodeClass: (v) => 'note-' + v.x.kind,
    editText: (v) => v.x.text,
    // 点主题打开它的笔记；用方向键换主题时，笔记开着就跟过去
    onSelect: (v, how) => { S.noteSel = { path: n.path, id: v.id }; ed.selLine = v.x.line; if (how === 'click' || pop) openPop(v.x); },
    onView: () => placePop(),
    onEscape: () => closePop(),
    onToggle: (v) => { collapsed.has(v.id) ? collapsed.delete(v.id) : collapsed.add(v.id); mm.setData(conv(ed.doc.root)); mm.render(); },
    onActivate: (v) => editable && v.x.kind !== 'root' && mm.edit(v.id),
    onRename: editable ? (v, text) => ed.run((d) => NM.rename(d, ed.find(v.id), text)) : null,
    onHelp: () => showHelp(),
    onKey: (e, v) => {
      if (!editable) return false;
      const x = v.x;
      if (commonKeys(e, ed, x)) return true;
      if (e.key === 'Tab') { op(NM.addChild, true)(v); return true; }
      if (e.key === 'Enter' && e.shiftKey) { op(NM.addSiblingBefore, true)(v); return true; }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { openPop(x); pop.live.focus(); return true; }
      if (e.key === 'Enter') { op(NM.addSibling, true)(v); return true; }
      if (e.key === ' ' && x.kind !== 'root') { mm.edit(v.id); return true; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && x.kind !== 'root') {
        if (v.children.length && !confirm(`删除「${NM.plain(x.text)}」和它下面的 ${v.children.length} 项？`)) return true;
        ed.run((d) => NM.remove(d, ed.find(v.id)));
        return true;
      }
      return false;
    },
  });

  // 点导图空白处关掉笔记框（拖动画布不算）
  let down = null;
  box.addEventListener('pointerdown', (e) => { down = e.target.closest('.mm-pop, .mm-node') ? null : [e.clientX, e.clientY]; });
  box.addEventListener('pointerup', (e) => { if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 5) closePop(); down = null; });

  mm.setData(conv(ed.doc.root));
  mm.render();
  const sel = (S.noteSel && S.noteSel.path === n.path && ed.find(S.noteSel.id)) || ed.doc.root;
  mm.select(sel.id, false);
  // 第一次打开这份笔记的导图时适应窗口（太大就按能看清的大小显示）
  if (S.noteMapFitted !== n.path) { S.noteMapFitted = n.path; requestAnimationFrame(() => { mm.fit(0.75); mm.reveal(sel.id); }); }
  mm.el.focus({ preventScroll: true });
  S.noteMap = mm;
}

$('#panel-body').addEventListener('click', async (e) => {
  const t = e.target;
  if (t.dataset.cap) return onCapture(t.dataset.cap);
  if (t.hasAttribute('data-help')) return showHelp();
  if (t.dataset.nv) { S.noteView = t.dataset.nv; store.set('noteView', S.noteView); return renderPanel(true); }
  if (t.dataset.preview) { $('#preview').innerHTML = `<iframe src="${t.dataset.preview}"></iframe>`; return; }
});

$('#panel').addEventListener('click', async (e) => {
  const t = e.target;
  if (t.dataset.tab) { S.tab = t.dataset.tab; return renderPanel(true); }
  if (t.dataset.pv) {
    if (t.dataset.pv === 'files') S.tab = 'files';
    else { S.tab = 'note'; S.noteView = t.dataset.pv; store.set('noteView', S.noteView); }
    return renderPanel(true);
  }
  if (t.dataset.pin) return togglePin(t.dataset.pin);
  if (t.dataset.open !== undefined) return post('api/open', { path: t.dataset.open }).catch((err) => alert(err.message));
  if (t.dataset.launch) return post('api/launch', { path: S.sel, tool: t.dataset.launch });
  if (t.hasAttribute('data-newmission')) return openAgent('new:' + S.sel);
  if (t.hasAttribute('data-agent-back')) return closeAgent();
  if (t.hasAttribute('data-agent-end')) return endAgent();
  if (t.hasAttribute('data-agent-resume')) { const a = S.data.agents.find((x) => x.id === S.agent); if (a) resumeAgent(a); return; }
  if (t.hasAttribute('data-create')) {
    const r = await post('api/note/create', { path: S.sel });
    if (r.file) location.href = vscodeUrl(r.file);
    setTimeout(refresh, 300);
  }
});
function closePanel() { S.panelClosed = true; $('#panel').hidden = true; $('#resizer').hidden = true; }
$('#close').onclick = closePanel;
$('#wide').onclick = () => $('#panel').classList.toggle('wide');

// 拖动分隔条调整面板宽度
{
  const panel = $('#panel'), bar = $('#resizer');
  const w = store.get('panelWidth', 0);
  if (w) panel.style.width = w + 'px';
  bar.addEventListener('pointerdown', (e) => {
    bar.setPointerCapture(e.pointerId);
    document.body.classList.add('resizing');
    bar.onpointermove = (ev) => { panel.style.width = Math.max(320, Math.min(innerWidth - 200, innerWidth - ev.clientX)) + 'px'; };
  });
  bar.addEventListener('pointerup', () => {
    bar.onpointermove = null;
    document.body.classList.remove('resizing');
    store.set('panelWidth', panel.offsetWidth);
    S.noteMap?.render();
  });
}

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
  if (S.mode === 'local') return post('api/inbox', { text });
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
    const [ghOwner, name] = S.data.site.inbox.repo.split('/');
    const newRepo = `https://github.com/new?name=${encodeURIComponent(name)}&visibility=private&description=${encodeURIComponent('手机记录收件箱')}`;
    const newToken = `https://github.com/settings/personal-access-tokens/new?name=${encodeURIComponent('studio-inbox')}&description=${encodeURIComponent('work_studio 手机记录')}&target_name=${encodeURIComponent(ghOwner)}&expires_in=none&contents=write`;
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
  $('#panel-top').innerHTML = '';
  $('#tabs').hidden = true;
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
    S.draft = '';
    msg.textContent = '已记录 ' + new Date().toLocaleTimeString().slice(0, 5);
    if (S.mode === 'blog') renderCapturePanel();
    else { S.panelKey = ''; refresh(); }
  } catch (e) { msg.textContent = '失败：' + e.message; }
}

$('#capture-btn').onclick = () => { if (S.view !== 'map') setView('map'); location.hash = '#capture'; };
$('#panel-body').addEventListener('keydown', (e) => { if (e.target.id === 'cap-text' && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) onCapture('send'); });
$('#panel-body').addEventListener('input', (e) => { if (e.target.id === 'cap-text') S.draft = e.target.value; });

// ---------- 路由 ----------
function route() {
  // #ai/<id>：直接打开某个 AI（会话的终端 / 任务的蜂群图），#ai/new:<文件夹> 打开新建表单
  if (location.hash.startsWith('#ai/') && S.mode === 'local') {
    const id = decodeURIComponent(location.hash.slice(4));
    const folder = id.startsWith('new:') ? id.slice(4) : owner(S.data.agents.find((x) => x.id === id)?.path || '');
    if (S.sel === null) { S.sel = index.has(folder) ? folder : ''; renderMap(); }
    return openAgent(id);
  }
  if (location.hash === '#capture') {
    // 本地模式下收件箱就是工作区里的 inbox 文件夹节点
    if (S.mode === 'local') { location.replace('#/' + S.data.inboxPath); return; }
    S.sel = '#capture';
    renderMap();
    return renderCapturePanel();
  }
  let p = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
  if (S.mode === 'local' && p === S.data.inboxPath && !index.has(p)) {
    S.sel = p; renderMap(); S.panelKey = ''; return renderPanel();
  }
  // 地址里的节点暂时不在树上（比如刚新建的文件夹还没扫描到）：先显示根节点，扫描到后再跳过去
  S.wantPath = index.has(p) ? null : p;
  if (!index.has(p)) p = '';
  if (S.sel !== p) S.tab = 'note';
  if (S.sel !== null) S.panelClosed = false; // 用户选了节点：打开面板
  S.agent = null; // 选了文件夹：右边回到文件夹
  S.sel = p;
  // 选中的节点不在当前聚焦的分支里时退出聚焦；把上级都展开
  if (S.focus && p !== S.focus && !p.startsWith(S.focus + '/')) setFocus('');
  for (let c = index.get(p)?.parent; c; c = c.parent) S.open.add(c.path);
  saveOpen();
  renderMap();
  map.select(p);
  S.panelKey = '';
  renderPanel();
}
addEventListener('hashchange', route);
addEventListener('resize', () => map.drawMini());
setView(S.view);
load();
