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
  tab: 'note', noteView: store.get('noteView', 'doc') === 'map' ? 'map' : 'doc',
  panelKey: '',
};
const index = new Map(); // path -> 工作区节点
const byUrl = new Map(); // 博客：文章页地址 -> 节点 path

const STATUS = { running: '进行中', waiting: '等你回复', todo: '待办', done: '已结束' };
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
  // 在访达里挪动过的文件夹：📌 跟到新位置（导图里改名的已经在 renameFolder 里处理）
  for (const m of d.moves) {
    const fix = (p) => (p === m.from || p.startsWith(m.from + '/') ? m.to + p.slice(m.from.length) : p);
    if (S.pins?.some((p) => fix(p) !== p)) { S.pins = S.pins.map(fix); store.set('pins', S.pins); }
  }
  const first = !S.data;
  S.data = d;
  // 导图上看得见的才算变化：AI 的增减、状态、标题、位置（时间戳、最后一句回复变了不重画导图）
  const mapKey = JSON.stringify([d.agents.map((a) => [a.id, a.status, a.title, a.path]), d.moves.map((m) => m.to), S.pins]);
  const mapChanged = treeChanged || mapKey !== S.mapKey;
  S.mapKey = mapKey;
  if (first) { $('#brand').textContent = d.site.title; document.title = d.site.title; }
  updateWorkCount();
  updateAiBtn();
  renderBanner();
  if (S.sel === null || (S.wantPath && index.has(S.wantPath))) route();
  else { if (mapChanged) renderMap(); renderPanel(); }
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
  minimap: false,
  render: workspaceNode,
  nodeClass: nodeClassOf,
  onSelect: (v) => (v.a ? openAgent(v.a.id) : openNode(v.id)),
  onToggle: (v) => { if (!v.a) toggle(v.id); },
  onActivate: (v) => {
    if (v.a) return;
    if (S.mode === 'blog' && v.n.url) { setReading(true); openNode(v.id); return; } // 博客：双击文章就放大来看
    if (v.n.children.length && v.id !== S.focus) setFocus(v.id);
  },
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

// ---------- 右键菜单（工作台里）：节点相关的操作都在这里 ----------
const ctx = document.createElement('div');
ctx.id = 'ctx';
ctx.hidden = true;
document.body.appendChild(ctx);
const closeCtx = () => { ctx.hidden = true; };
addEventListener('click', closeCtx);
addEventListener('blur', closeCtx);
addEventListener('keydown', (e) => { if (e.key === 'Escape') closeCtx(); });
const setBlogOf = (p, on) => post('api/blog/set', { path: p, on }).then(() => { S.panelKey = ''; refresh(); }).catch((err) => alert(err.message));
function expandAll(p) {
  const walk = (n) => { if (n.children.length) { S.open.add(n.path); n.children.forEach(walk); } };
  walk(index.get(p));
  saveOpen();
  renderMap();
}
function folderMenu(n) {
  const p = n.path, abs = absPath(p), finder = PATH_SEP() === '/' ? '访达' : '资源管理器';
  const cur = n.blog?.how === 'self' ? (n.blog.on ? 'on' : 'off') : '';
  return [
    { label: `在${finder}中显示`, run: () => post('api/open', { path: p }).catch((err) => alert(err.message)) },
    { label: '复制路径', run: () => navigator.clipboard.writeText(abs).then(() => flash('已复制：' + abs)) },
    '-',
    { label: '新建子文件夹', key: 'Tab', run: () => newFolder(p) },
    p && { label: '重命名', key: 'F2', run: () => { map.select(p); map.edit(p); } },
    '-',
    { label: '＋ 在这里开 AI', run: () => openAgent('new:' + p) },
    p && { label: isPinned(p) ? '📌 取消固定' : '📌 固定到「正在做」', run: () => togglePin(p) },
    '-',
    { label: '🌐 公开', on: cur === 'on', run: () => setBlogOf(p, true) },
    { label: '🌐 不公开', on: cur === 'off', run: () => setBlogOf(p, false) },
    { label: `🌐 随上级（${inheritedBlog(n) ? '公开' : '不公开'}）`, on: cur === '', run: () => setBlogOf(p, null) },
    '-',
    n.children.length && { label: '展开全部', run: () => expandAll(p) },
    n.children.length && S.open.has(p) && p && { label: '收起', run: () => toggle(p) },
  ];
}
function agentMenu(a) {
  return [
    { label: '打开', run: () => openAgent(a.id) },
    { label: '写入笔记…', run: () => { openAgent(a.id); agentToNote(); } },
    a.sextant && { label: a.sextant.kind === 'mission' ? '删除任务' : '结束会话', run: () => { openAgent(a.id); endAgent(); } },
  ];
}
$('#map').addEventListener('contextmenu', (e) => {
  if (S.mode !== 'local') return;
  const el = e.target.closest('.mm-node');
  const v = el && map.node(el.dataset.id);
  if (!v) return;
  e.preventDefault();
  showCtx(v.a ? agentMenu(v.a) : folderMenu(v.n), e.clientX, e.clientY);
});
// 在 (x, y) 弹出菜单；items 里 false 会被去掉，'-' 是分隔线
function showCtx(list, x, y) {
  const items = list.filter(Boolean).filter((it, i, arr) => it !== '-' || (i > 0 && arr[i - 1] !== '-'));
  while (items[items.length - 1] === '-') items.pop();
  if (!items.length) return;
  ctx.innerHTML = items.map((it, i) => it === '-' ? '<div class="sep"></div>' : `<div class="it${it.on ? ' on' : ''}" data-i="${i}"><span>${esc(it.label)}</span>${it.key ? `<span class="k">${it.key}</span>` : ''}</div>`).join('');
  ctx.items = items;
  ctx.hidden = false;
  ctx.style.left = Math.min(x, innerWidth - ctx.offsetWidth - 8) + 'px';
  ctx.style.top = Math.min(y, innerHeight - ctx.offsetHeight - 8) + 'px';
}
ctx.addEventListener('click', (e) => {
  e.stopPropagation();
  const it = ctx.items?.[+e.target.closest('[data-i]')?.dataset.i];
  if (!it) return;
  closeCtx();
  it.run();
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
  let h = `${isPinned(n.path) && n.path ? '<span class="pin" title="已固定到「正在做」">📌</span>' : ''}<span class="mm-label" title="${esc(n.name)}">${esc(t)}</span>`;
  if (n.note?.status) h += `<span class="status">${esc(n.note.status)}</span>`;
  if (S.mode === 'local') {
    if (n.blog?.on) h += `<span class="pub${n.blog.how === 'self' ? '' : ' faint'}" title="${BLOG_HOW[n.blog.how]}">🌐</span>`;
    if (S.data.moves.some((m) => m.to === n.path)) h += '<span class="moved" title="这个文件夹刚被移动过">↪</span>';
  }
  // 收起的文件夹：下面的 AI 有几个在跑、几个等你、几个待办（展开时 AI 就挂在下面）
  if (S.mode === 'local' && v.closed) h += badges(agentsUnder(n.path));
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
  // 「📌 正在做」：把大图修剪成只剩通向固定文件夹的路径——上级都展开、共同的上级合并；固定文件夹下面照常展开收起
  if (S.view === 'work' && S.mode === 'local') {
    const pins = S.pins.filter((p) => index.has(p));
    const prune = (n) => {
      if (inPins(n.path)) return conv(n, false);
      if (n.path && !pins.some((x) => x.startsWith(n.path + '/'))) return null;
      return { id: n.path, n, collapsed: false, children: n.children.map(prune).filter(Boolean) };
    };
    const root = prune(S.data.tree);
    if (!pins.length) root.n = { ...S.data.tree, name: '📌 还没有固定的文件夹（导图上右键文件夹 →「📌 固定到正在做」）' };
    return root;
  }
  return conv(index.get(S.focus) || S.data.tree, true);
}

function renderMap() {
  if (!index.has(S.focus)) S.focus = '';
  map.setData(mapTree());
  map.render();
  if (S.sel !== null && index.has(S.sel)) map.select(S.sel, false);
  const chain = [];
  if (S.view !== 'work') for (let c = index.get(S.focus); c && c.path; c = c.parent) chain.unshift(c);
  $('#focus-crumbs').innerHTML = chain.length
    ? `<a data-focus="">${esc(S.data.tree.name)}</a>` + chain.map((c) => ` / <a data-focus="${esc(c.path)}">${esc(c.name)}</a>`).join('')
    : '';
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
  const walk = (n, d) => {
    if (d < level) S.open.add(n.path); else S.open.delete(n.path);
    n.children.forEach((c) => walk(c, d + 1));
  };
  if (S.view === 'work') S.pins.filter((p) => index.has(p)).forEach((p) => walk(index.get(p), 1));
  else walk(index.get(S.focus) || S.data.tree, 0);
  S.level = level;
  saveOpen();
  renderMap();
  map.fit();
}

$('#map-tools').addEventListener('click', (e) => {
  const f = e.target.closest('[data-focus]');
  if (f) setFocus(f.dataset.focus);
});
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
  SR.timer = setTimeout(async () => {
    const my = ++SR.seq;
    let r;
    try { r = S.mode === 'local' ? await (await fetch('api/search?q=' + encodeURIComponent(q))).json() : await blogSearch(q); } catch { return; }
    if (my !== SR.seq || searchBox.value.trim() !== q) return;
    S.contentHits = new Set(r.hits.map((h) => h.path));
    renderMap();
    map.fit();
    renderResults(q, r);
  }, 120);
};

// 博客的全文搜索：第一次搜索时下载 search.json（每篇的纯文本），之后都在浏览器里搜；结果格式和本地服务的一样
let blogIndex;
async function blogSearch(q) {
  blogIndex ||= fetch('search.json').then((r) => r.json()).then((list) => list.map((d) => ({ ...d, low: d.x.toLowerCase() })));
  const list = await blogIndex, ql = q.toLowerCase(), hits = [];
  for (const d of list) {
    let i = d.low.indexOf(ql);
    if (i < 0) continue;
    const first = i;
    let count = 0;
    while (i >= 0 && count < 999) { count++; i = d.low.indexOf(ql, i + ql.length); }
    const head = (d.x.slice(0, first).match(/^#{1,6}\s+(.+)$/gm) || []).pop()?.replace(/^#+\s+/, '').slice(0, 40) || '';
    const st = Math.max(0, first - 36);
    const snippet = (st ? '…' : '') + d.x.slice(st, first + ql.length + 70).replace(/[#*`>|]+/g, ' ').replace(/\s+/g, ' ').trim();
    hits.push({ path: d.p, count, head, snippet });
  }
  hits.sort((a, b) => b.count - a.count);
  return { q, hits: hits.slice(0, 80), total: hits.length };
}

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
  results.style.left = Math.max(8, Math.min(b.left, b.right - results.offsetWidth)) + 'px'; // 和搜索框右边对齐
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
  const h = '#/' + p;
  if (location.hash === h || decodeURIComponent(location.hash) === h) { S.panelKey = ''; renderPanel(true); }
  else location.hash = h;
}

// ---------- 视图切换 ----------
function setView(v) {
  S.view = v;
  store.set('view', v);
  document.querySelectorAll('#views button').forEach((b) => b.classList.toggle('on', b.dataset.view === v));
  applyWidths();
  if (!S.data) return;
  // 两个视图是同一张导图，只是根不同：「全部笔记」是整个工作区，「📌 正在做」是固定的几个分支
  map.placed = false;
  renderMap();
  requestAnimationFrame(() => map.fit());
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

// ---------- 📌 正在做：从大图里把固定的几个分支拎出来，放在同一张导图里 ----------
S.pins = store.get('pins', []);

const isPinned = (p) => S.pins.includes(p);
const inPins = (p) => S.pins.some((x) => p === x || p.startsWith(x + '/'));
const onPinPath = (p) => inPins(p) || S.pins.some((x) => p === '' || x.startsWith(p + '/'));
function togglePin(p) {
  S.pins = isPinned(p) ? S.pins.filter((x) => x !== p) : [...S.pins, p];
  store.set('pins', S.pins);
  updateWorkCount();
  renderMap();
  S.panelKey = '';
  renderPanel();
}
function updateWorkCount() {
  const live = S.pins.some((p) => agentsUnder(p).some((a) => a.status === 'running'));
  $('#work-count').textContent = S.pins.length ? ` ${S.pins.length}` : '';
  $('#work-count').className = live ? 'live' : '';
}

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


function panelKeyOf(n, sessions) {
  return JSON.stringify([n.path, n.note?.mtime, sessions.map((a) => a.id + a.status + a.title), S.tab, S.noteView, !!S.reading]);
}

async function renderPanel(force) {
  if (S.agent) return renderAgentPanel(force);
  if (S.agentView) { S.agentView = null; S.agentLive?.destroy(); S.agentLive = null; force = true; }
  const n = index.get(S.sel);
  if (!n) return;
  const local = S.mode === 'local';
  if (!local) return renderBlogPanel(n, force);
  const sessions = local ? agentsUnder(n.path) : [];
  // 轮询时只有内容变了才重画；正在导图上改字、或终端开着时不打断
  const key = panelKeyOf(n, sessions);
  const typing = S.noteMap?.editing || S.editingNote || S.liveEditing;
  if (!force && (key === S.panelKey || (typing && S.panelNode === n.path))) return;
  const sameNode = S.panelNode === n.path;
  S.panelKey = key;
  CSS.highlights?.delete('find');
  S.panelNode = n.path;

  [...editors].forEach((e) => e.destroy());
  await S.pendingSave;
  let { note, files = [] } = await getNote(n.path);
  if (!note && local && n.path) {
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
  // 状态小标签：博客里公开吗、是否固定（操作都在导图的右键菜单里）
  if (local && n.path) {
    const tags = (n.blog?.on ? '<span class="chip" title="会出现在博客里">🌐 公开</span>' : '') + (isPinned(n.path) ? '<span class="chip" title="已固定到「📌 正在做」">📌</span>' : '');
    if (tags) top = top.replace('<div class="meta">', '<div class="meta">' + tags);
  }
  $('#panel-top').innerHTML = top;
  inlineCrumbs();

  // 视图切换：文档 / 导图 / 附件，放在按钮行右边（不再单独占两行）
  if (S.noteView !== 'map') S.noteView = 'doc';
  const cur = S.tab === 'files' ? 'files' : S.noteView;
  const pv = (k, label, tip) => `<button data-pv="${k}" class="${cur === k ? 'on' : ''}" title="${tip}">${label}</button>`;
  const views = `<span class="seg pv">${note ? pv('doc', '文档', '直接编辑，停下 0.8 秒自动保存') + pv('map', '导图', '标题就是主题：点主题在旁边打开它的笔记 · Tab 子主题 · Enter 同级 · F2 改字 · ? 全部快捷键') : ''}${local ? pv('ai', aiTabLabel(n), '这个文件夹（含子文件夹）里的 AI：在跑的、等你回复的、已结束的') : ''}</span>`;
  // 「文档 / 导图 / 附件」放在标题这一行的右边（和博客一样），工具按钮在下一行
  const wide = n.path ? `${S.reading ? '<button data-wide title="还原宽度（Esc）">⤡</button>' : '<button data-wide title="放大：右边拉宽，导图留在左边（也可以在导图上双击）">⤢</button>'}` : '';
  const finder = local ? `<button data-reveal="${esc(n.path)}" title="在${PATH_SEP() === '/' ? '访达' : '资源管理器'}中打开${''}">📂</button>` : '';
  $('#panel-top .titlerow').insertAdjacentHTML('beforeend', `<span class="bacts">${views}${finder}${wide}</span>`);
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
    // 有内容的笔记先显示笔记、下面列出本节内容；没有笔记或笔记是空的，先列本节内容，下面留着可以直接写
    const list = childList(n);
    const empty = !note || note.virtual || !note.body.trim();
    if (note && S.noteView === 'map') return renderNoteMap(n, note);
    if (empty && list) body.insertAdjacentHTML('beforeend', list);
    if (note) {
      const ed = noteEditor(n, note, () => {});
      const editor = mdEditor({
        md: note.body,
        base: n.path,
        editable: local,
        empty: note.virtual ? `${list ? '这个文件夹还没有笔记，' : ''}在这里写关于「${n.name}」的内容，会自动保存为 ${n.dir}.md` : '写点什么…',
        onSave: (md) => ed.run(() => ({ body: '\n' + md + '\n', line: 0 }), { keepPop: true }),
      });
      editor.el.classList.add('doc-editor');
      editor.ready.then(() => hideDupTitle(editor.el.querySelector('.vditor-reset'), m.title || n.name));
      if (S.find) { const q = S.find; S.find = null; editor.ready.then(() => highlightFind(editor.el, q)); }
      body.appendChild(editor.el);
    }
    if (!empty && list) body.insertAdjacentHTML('beforeend', list);
    if (!n.path) body.insertAdjacentHTML('beforeend', recentList());
  } else if (S.tab === 'ai') {
    renderAiList(n);
  }
  body.scrollTop = scroll;
}

// ---------- 博客 ----------
const BLOG_HOW = { self: '在博客显示（这个文件夹设的）', inherit: '在博客显示（跟随上级文件夹）' };
// 去掉这个文件夹自己的设置后会怎样：看上级里最近的设置，都没有就不公开
function inheritedBlog(n) {
  for (let c = n.parent; c; c = c.parent) if (c.blog?.how === 'self') return c.blog.on;
  return false;
}
// 「🌐 博客」：先生成并打开本机预览；看满意了再点「检查改动并上传」，列出这次改了哪些文章，确认后才上传
$('#pub-btn').onclick = async () => {
  const tab = window.open('about:blank', '_blank'); // 先开标签页（等生成完再开会被浏览器拦）
  const dlg = document.createElement('div');
  dlg.id = 'pub-dlg';
  dlg.innerHTML = '<div class="box"><h3>博客</h3><p class="msg">正在按 🌐 设置生成…</p></div>';
  document.body.appendChild(dlg);
  const box = dlg.firstChild, close = () => { clearInterval(dlg.timer); dlg.remove(); };
  dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target.dataset.close !== undefined) close(); });
  let b;
  try { b = await post('api/blog/build', {}); }
  catch (err) { tab?.close(); box.innerHTML = `<h3>博客</h3><p>没法生成：</p><pre>${esc(err.message)}</pre><div class="row"><button data-close>关闭</button></div>`; return; }
  if (tab) tab.location = b.preview;
  box.innerHTML = `<h3>博客</h3><p>已生成 ${b.notes} 篇文章，${tab ? '本机预览已在新标签页打开' : `<a href="${esc(b.preview)}" target="_blank">打开本机预览 ↗</a>`}（和上传后的样子一样）。</p>
    ${b.broken ? `<p class="msg">注意：有 ${b.broken} 个坏链接，修好之前不能上传</p>` : ''}
    <div class="row"><button class="primary" data-check${b.broken ? ' disabled' : ''}>检查改动并上传…</button><button data-close>关闭</button></div>`;
  await new Promise((ok) => { box.querySelector('[data-check]').onclick = ok; });
  box.innerHTML = '<h3>博客</h3><p class="msg">正在和线上对比…</p>';
  let r;
  try { r = await post('api/blog/publish/prepare', {}); }
  catch (err) { box.innerHTML = `<h3>博客</h3><p>没法生成：</p><pre>${esc(err.message)}</pre><div class="row"><button data-close>关闭</button></div>`; return; }
  const pv = `<p class="grp">已生成。<a href="${esc(r.preview)}" target="_blank">在本机预览 ↗</a>（和上传后的样子一样）</p>`;
  if (!r.total) { box.innerHTML = `<h3>博客</h3>${pv}<p>和线上完全一样，没有要上传的。</p><div class="row"><a href="${esc(r.url)}" target="_blank">打开线上博客 ↗</a><button data-close>关闭</button></div>`; return; }
  const list = (k, label) => r[k].length ? `<h4>${label} ${r[k].length} 篇</h4><ul>${r[k].slice(0, 200).map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : '';
  const grp = Object.entries(r.groups).sort().map(([top, c]) => `${esc(top)}：${Object.entries(c).filter(([, v]) => v).map(([k, v]) => k + ' ' + v).join('，')}`).join('<br>');
  box.innerHTML = `<h3>博客</h3>${pv}
    <p>公开的文章共 ${r.notes} 篇。这次相对线上：</p>
    <div class="arts">${list('added', '新增文章') + list('changed', '修改文章') + list('removed', '删除文章') || '<p class="msg">文章没有变化（只有页面文件变了）</p>'}</div>
    <details><summary class="grp">共 ${r.total} 个文件</summary><p class="grp">${grp}</p></details>
    <div class="row"><button class="primary" data-push>确认上传</button><button data-close>取消</button><span class="msg">上传到 ${esc(r.remote)}</span></div>`;
  box.querySelector('[data-push]').onclick = async () => {
    try { await post('api/blog/publish/push', {}); } catch (err) { box.querySelector('.msg').textContent = '失败：' + err.message; return; }
    box.querySelector('.row').innerHTML = '<span class="msg">上传中…</span>';
    dlg.timer = setInterval(async () => {
      const st = await (await fetch('api/blog/publish/status')).json();
      const row = box.querySelector('.row');
      if (st.state === 'pushing') row.innerHTML = `<span class="msg">上传中… 已用 ${Math.round((Date.now() - st.started) / 1000)} 秒</span>`;
      else if (st.state === 'done') { clearInterval(dlg.timer); row.innerHTML = `<span>✅ 已上传，一两分钟后生效：<a href="${esc(st.url)}" target="_blank">${esc(st.url)}</a></span><button data-close>关闭</button>`; }
      else if (st.state === 'error') { clearInterval(dlg.timer); row.innerHTML = `<span>上传失败</span><button data-close>关闭</button>`; row.insertAdjacentHTML('afterend', `<pre>${esc(st.log)}</pre>`); }
    }, 2000);
  };
};

function setReading(on) {
  if (S.reading === on) return;
  S.reading = on;
  document.body.classList.toggle('reading', on);
  if (on) { S.panelClosed = false; S.panelKey = ''; }
  else S.panelKey = '';
  applyWidths();
  if (S.data && S.sel !== null) renderPanel(true);
  // 导图区域变宽 / 变窄了：让选中的节点留在视野里
  requestAnimationFrame(() => { map.drawMini(); if (S.sel !== null) map.reveal(S.sel); });
}

// 博客模式的右侧面板：文章正文取自文章页（构建时已渲染好），只读；右上角 ⤢ 放大 / ⤡ 还原
async function renderBlogPanel(n, force) {
  const key = 'b:' + n.path + (S.reading ? ':read' : '');
  if (!force && S.panelKey === key) return;
  S.panelKey = key;
  S.panelNode = n.path;
  const chain = [];
  for (let c = n; c; c = c.parent) chain.unshift(c);
  $('#crumbs').innerHTML = chain.slice(0, -1).map((c) => `<a href="#/${esc(c.path)}">${esc(c.name)}</a>`).join(' / ');
  const m = n.note || {};
  // 一行放下：标题、标签、日期，右边是「文档 / 导图」和 ⤢ 放大
  if (S.noteView !== 'map') S.noteView = 'doc';
  const pv = (k, label) => `<button data-pv="${k}" class="${S.noteView === k ? 'on' : ''}">${label}</button>`;
  const meta = (m.tags || []).map((t) => `<span class="chip">#${esc(t)}</span>`).join('') + (m.date ? `<span>${esc(m.date)}</span>` : '');
  const acts = n.path ? `<span class="bacts">${n.url ? `<span class="seg pv">${pv('doc', '文档')}${pv('map', '导图')}</span>` : ''}${S.reading ? '<button data-wide title="还原宽度（Esc）">⤡</button>' : '<button data-wide title="放大：右边拉宽，导图留在左边（也可以在导图上双击）">⤢</button>'}</span>` : '';
  let top = `<div class="titlerow"><h1 class="title" title="${esc(n.path ? m.title || n.name : S.data.site.title)}">${esc(n.path ? m.title || n.name : S.data.site.title)}</h1><div class="meta">${meta}</div>${acts}</div>`;
  if (!n.path && S.data.site.subtitle) top += `<div class="hint">${esc(S.data.site.subtitle)}</div>`;
  $('#panel-top').innerHTML = top;
  inlineCrumbs();
  $('#tabs').hidden = true;
  $('#panel').hidden = !!S.panelClosed;
  $('#resizer').hidden = !!S.panelClosed;
  const body = $('#panel-body');
  body.className = '';
  body.scrollTop = 0;
  const list = childList(n);
  if (!n.url) { body.innerHTML = list + (n.path ? '' : recentList()); return; }
  body.innerHTML = '<p class="empty">加载中…</p>';
  if (S.noteView === 'map' && n.file) {
    // 文章导图：取笔记原文，标题就是主题（和工作台里的「导图」同一套，只读）
    let md = '';
    try { md = await (await fetch(n.url + encodeURIComponent(n.file))).text(); } catch {}
    if (S.panelNode !== n.path) return;
    const m = /^\uFEFF?---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(md);
    body.innerHTML = '';
    return renderNoteMap(n, { body: m ? md.slice(m[0].length) : md, meta: {}, offset: 0 });
  }
  let html = '';
  try {
    const doc = new DOMParser().parseFromString(await (await fetch(n.url)).text(), 'text/html');
    html = doc.querySelector('.post-body')?.innerHTML || '';
  } catch {}
  if (S.panelNode !== n.path) return;
  {
    // 正文 + 右边的本文目录（够宽才显示）+ 底部同一节的上一篇 / 下一篇
    const sibs = (n.parent?.children || []).filter((c) => c.url);
    const i = sibs.indexOf(n), prev = sibs[i - 1], next = sibs[i + 1];
    const pn = (x, label) => x ? `<a href="#/${esc(x.path)}"><span class="l">${label}</span>${esc(x.name)}</a>` : '<span></span>';
    body.innerHTML = `<div class="read-wrap"><div class="read-main"><div class="post-body blog-body">${html || '<p class="empty">加载失败</p>'}</div>${list}
      <nav class="read-pn">${pn(prev, '上一篇')}${pn(next, '下一篇')}</nav></div><aside class="read-toc"></aside></div>`;
    const heads = [...body.querySelectorAll('.blog-body h2[id], .blog-body h3[id]')];
    if (heads.length > 2) body.querySelector('.read-toc').innerHTML = '<div class="toc-h">目录</div>' + heads.map((h) => `<a data-anchor="${esc(h.id)}" class="d${h.tagName[1]}">${esc(h.textContent)}</a>`).join('');
  }
  enhance(body.querySelector('.blog-body'));
  hideDupTitle(body.querySelector('.blog-body'), m.title || n.name);
  if (S.find) { const q = S.find; S.find = null; highlightFind(body.querySelector('.blog-body'), q); }
}
// 面板正文里点到别的文章：在导图上跳过去，不离开首页
$('#panel-body').addEventListener('click', (e) => {
  if (S.mode !== 'blog') return;
  // 目录和文内的 #锚点：在面板里滚动过去（不能改地址栏的 #，那是导图的路由）
  const anchor = e.target.closest('[data-anchor], a[href^="#"]:not([href^="#/"])');
  if (anchor) {
    e.preventDefault();
    const id = anchor.dataset.anchor || decodeURIComponent(anchor.getAttribute('href').slice(1));
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  const a = e.target.closest('a[href]');
  if (!a || a.target === '_blank') return;
  const u = new URL(a.href, location.href);
  const p = u.origin === location.origin ? byUrl.get(u.pathname) : undefined;
  if (p === undefined) return;
  e.preventDefault();
  location.hash = '#/' + p;
});

// 「本节内容」：文件夹下面的子文件夹 / 文章。没有笔记（或笔记是空的）时它就是主要内容，有笔记时放在笔记下面。工作台和博客一样
function childList(n) {
  const kids = S.mode === 'blog' ? n.children.filter((c) => c.url || c.children.length) : n.children;
  if (!kids.length || !n.path) return '';
  return `<div class="section list"><h4>本节内容 · ${kids.length}</h4>${kids.map((c) =>
    `<a href="#/${esc(c.path)}"><span class="t">${esc(c.name)}</span><span class="d">${c.note?.date && (S.mode === 'local' || c.url) ? esc(c.note.date) : c.children.length ? c.children.length + ' 项' : ''}</span>
     ${c.note?.excerpt && (S.mode === 'local' || c.url) ? `<div class="e">${esc(c.note.excerpt)}</div>` : ''}</a>`).join('')}</div>`;
}

function recentList() {
  const all = [...index.values()].filter((n) => n.note && n.path).sort((a, b) => (b.note.date > a.note.date ? 1 : b.note.date < a.note.date ? -1 : b.note.mtime - a.note.mtime));
  if (!all.length) return '';
  return `<div class="section list"><h4>最近更新</h4>${all.slice(0, 20).map((n) =>
    `<a href="#/${esc(n.path)}"><span class="t">${esc(n.note.title || n.name)}</span><span class="d">${esc(n.note.date)}</span>
     ${n.note.excerpt ? `<div class="e">${esc(n.note.excerpt)}</div>` : ''}</a>`).join('')}</div>`;
}

// ---------- AI 的状态管理：每个文件夹的「AI」标签页 + 顶栏总览 ----------
const ago = (t) => {
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? '刚刚' : m < 60 ? m + ' 分钟前' : m < 1440 ? Math.round(m / 60) + ' 小时前' : new Date(t).toLocaleDateString('zh-CN');
};
const active = (list) => list.filter((a) => a.status === 'running' || a.status === 'waiting');
function aiTabLabel(n) {
  const a = active(agentsUnder(n.path)).length;
  return a ? `AI <b class="ai-n">${a}</b>` : 'AI';
}
function renderAiList(n) {
  const list = agentsUnder(n.path).sort(byStatus);
  const groups = [['running', '进行中'], ['waiting', '等你回复'], ['todo', '待办'], ['done', '已结束（最近 24 小时）']];
  let h = `<div class="ai-head"><button class="primary" data-ai-new>＋ 新建</button><span class="hint">在「${esc(n.path ? n.name : S.data.tree.name)}」里开一个 AI 会话或蜂群任务</span></div>`;
  if (!list.length) h += '<p class="empty pad">这里还没有 AI。</p>';
  for (const [st, label] of groups) {
    const g = list.filter((a) => a.status === st);
    if (!g.length) continue;
    h += `<div class="section ai-group"><h4><span class="ag-dot ag-${st}"></span>${label} · ${g.length}</h4>${g.map((a) => {
      const where = owner(a.path), sub = where !== n.path ? index.get(where)?.name || where : '';
      const kind = a.sextant?.kind === 'mission' ? '蜂群' : TOOL[a.tool] || a.tool;
      return `<div class="ai-row" data-ai="${esc(a.id)}" title="${esc(a.reply || a.prompt || '')}"><span class="ag-tool">${esc(kind)}</span><span class="t">${esc(agentTitle(a))}</span>${sub ? `<span class="sub">${esc(sub)}</span>` : ''}<span class="d">${ago(a.mtime)}</span></div>`;
    }).join('')}</div>`;
  }
  $('#panel-body').innerHTML = h;
}
$('#panel-body').addEventListener('click', (e) => {
  if (e.target.closest('[data-ai-new]')) return openAgent('new:' + (S.sel || ''));
  const r = e.target.closest('[data-ai]');
  if (r) openAgent(r.dataset.ai);
});
$('#panel-body').addEventListener('contextmenu', (e) => {
  const r = e.target.closest('[data-ai]');
  const a = r && S.data.agents.find((x) => x.id === r.dataset.ai);
  if (!a) return;
  e.preventDefault();
  showCtx(agentMenu(a), e.clientX, e.clientY);
});
// 顶栏：整个工作区有 AI 在跑或等你时显示，点了打开全部 AI 的列表
function updateAiBtn() {
  const b = $('#ai-btn');
  const run = S.data.agents.filter((a) => a.status === 'running').length, wait = S.data.agents.filter((a) => a.status === 'waiting').length;
  b.hidden = S.mode !== 'local' || !(run + wait);
  b.innerHTML = [run && `<span class="ag-dot ag-running"></span>${run} 在跑`, wait && `<span class="ag-dot ag-waiting"></span>${wait} 等你`].filter(Boolean).join('　');
}
$('#ai-btn').onclick = () => {
  if (S.view !== 'map') setView('map');
  if (S.agent) closeAgent();
  if (S.sel === '') { S.tab = 'ai'; S.panelClosed = false; S.panelKey = ''; renderPanel(true); }
  else { S.wantTab = 'ai'; location.hash = '#/'; }
};

// ---------- 导图上的 AI：点了在右边只看它的终端 / 蜂群图（工作台自己画，见 agents.js） ----------
// S.agent：选中的 AI 的 id；'new:<文件夹>' 表示在这个文件夹新建会话或蜂群任务
const SX_AGENT = { claude: 'claude-code', 'claude-code': 'claude-code', codex: 'codex', qoder: 'qoder' };
function openAgent(id) {
  S.agent = id;
  S.panelClosed = false;
  S.panelKey = '';
  renderMap();
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
  $('#crumbs').innerHTML = chain.map((c) => `<a href="#/${esc(c.path)}">${esc(c.name)}</a>`).join(' / ');
  // 和笔记面板同一个样子：面包屑（点文件夹名回去）；标题、状态、类型、时间一行，右边是操作
  let title, meta = '', acts = '';
  if (isNew) { title = '新建 AI'; meta = `<span>会话或蜂群任务 · 在「${esc(index.get(folder)?.name || folder || S.data.tree.name)}」里</span>`; }
  else if (!a) title = '这个 AI 已经结束';
  else {
    const kind = a.sextant?.kind === 'mission' ? '蜂群任务' : (TOOL[a.tool] || a.tool) + ' 会话';
    title = agentTitle(a);
    // 一行放不下所有信息：状态最要紧，类型和时间放到悬停提示里
    meta = `<span class="ag-status" title="${esc(kind)} · ${ago(a.mtime)}"><span class="ag-dot ag-${a.status}"></span>${STATUS[a.status]}</span>`;
    acts += '<button data-agent-note title="把它的结论追加到这个文件夹笔记的「记录」里（先给你看、可以改）">写入笔记</button>';
    if (a.sextant?.kind === 'session') acts += '<button data-agent-end title="结束这个 agent 进程">结束会话</button>';
    if (a.sextant?.kind === 'mission') acts += '<button data-agent-end title="从 sextant 里删除这个任务">删除任务</button>';
  }
  acts += `<button data-reveal="${esc(folder)}" title="在${PATH_SEP() === '/' ? '访达' : '资源管理器'}中打开${'它的工作目录'}">📂</button>`;
  let top = `<div class="titlerow agent"><h1 class="title" title="${esc(title)}">${esc(title)}</h1><div class="meta">${meta}</div><span class="bacts">${acts}</span></div>`;
  $('#panel-top').innerHTML = top;
  inlineCrumbs();
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
// AI 结论写入笔记：会话取最后的提问和回复，蜂群任务取目标、发现和进度；先在小窗里给你改
async function agentToNote() {
  const a = S.data.agents.find((x) => x.id === S.agent);
  if (!a) return;
  const folder = owner(a.path);
  const kind = a.sextant?.kind === 'mission' ? '蜂群任务' : TOOL[a.tool] || a.tool;
  let content = '';
  if (a.sextant?.kind === 'mission') {
    try {
      const d = await (await fetch(sx().url + '/missions/' + encodeURIComponent(a.sextant.ref))).json();
      const fs = (d.graph?.findings || []).map((f) => '- ' + f.summary);
      content = [d.goal_spec?.text && '目标：' + d.goal_spec.text, d.progress && '进度：' + d.progress, fs.length && '发现：\n' + fs.join('\n')].filter(Boolean).join('\n\n');
    } catch { content = a.prompt || ''; }
  } else content = [a.prompt && '> ' + a.prompt.trim().split('\n').join('\n> '), a.reply].filter(Boolean).join('\n\n');
  const d = new Date(), pad = (x) => String(x).padStart(2, '0');
  const head = `### ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${kind}：${agentTitle(a)}`;
  editDialog(`写入「${index.get(folder)?.name || folder || S.data.tree.name}」的笔记`, head + '\n\n' + (content || '（这里写结论）'), async (text) => {
    await post('api/note/append', { path: folder, text });
    flash('已写入笔记的「记录」');
    S.panelKey = '';
    refresh();
  });
}

async function endAgent() {
  const a = S.data.agents.find((x) => x.id === S.agent);
  if (!a?.sextant) return;
  const mission = a.sextant.kind === 'mission';
  if (!confirm(mission ? `删除蜂群任务「${agentTitle(a)}」？` : `结束会话「${agentTitle(a)}」？agent 进程会被关掉。`)) return;
  try { await (mission ? AG.deleteMission(sx().url, a.sextant.ref) : AG.endSession(sx().url, a.sextant.ref)); closeAgent(); refresh(); }
  catch (err) { alert(err.message); }
}

// ---------- 笔记编辑（导图） ----------
// 所有改动都是改 md 里对应的行，然后写回文件；支持撤销/重做、复制/剪切/粘贴。
const HELP = {
  map: [
    ['导航', '方向键 移动　Home 回到中心主题　空格 展开/收起　Ctrl+/ 展开/收起'],
    ['视图', 'Ctrl+= 放大　Ctrl+- 缩小　Ctrl+0 适应窗口　滚轮平移　Ctrl+滚轮缩放　Ctrl+F 搜索'],
    ['层级', '数字键 1 / 2 / 3 展开到第几层　0 全部展开'],
    ['分支', '双击 只看这个分支　Esc 退出'],
    ['右键', '节点上右键：在访达中显示、复制路径、新建、重命名、开 AI、📌 固定、🌐 公开设置'],
    ['搜索', 'Ctrl+F 到搜索框　节点名字和笔记正文都搜　↑↓ 选　Enter 打开并跳到这个词（高亮）　Esc 清空'],
    ['文件夹', 'Tab 新建子文件夹　Enter 新建同级文件夹　F2 重命名（同时改同名笔记）'],
    ['AI', '虚线小胶囊是 AI：绿点在跑、橙点等你回复　点它右边是它的终端（会话）或蜂群图（任务）　右键文件夹「＋ 在这里开 AI」'],
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
  // 展开到第几层：1 / 2 / 3，0 = 全部（不在输入框里、没按修饰键时）
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
  if (!typing && !e.ctrlKey && !e.metaKey && !e.altKey && /^[0-3]$/.test(e.key) && S.data && !S.agent) { expandTo(+e.key || 99); return; }
  if (e.key === 'Escape' && S.reading && !$('#help') && !typing) { setReading(false); return; }
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
        S.panelKey = panelKeyOf(n, S.mode === 'local' ? agentsUnder(n.path) : []);
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
// 工作台里提前在空闲时加载编辑器；博客用不着（只有文章导图的主题浮层用到时才加载）
(window.requestIdleCallback || setTimeout)(() => { if (S.mode === 'local') loadVditor().catch(() => {}); }, { timeout: 4000 });

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
  else if (S.mode === 'blog') window.open((index.get(base || '')?.url || '/') + url, '_blank'); // 博客：笔记旁边的附件
  else post('api/open', { path: p }).catch(fail);
}

function mdEditor({ md, base, editable, onSave, onLayout = () => {}, onEscape = () => {}, empty = '写笔记…' }) {
  const el = document.createElement('div');
  el.className = 'mde';
  let vd = null, saved = md.trim(), timer = 0, gone = false;
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  // 笔记里的相对路径图片按笔记所在文件夹找
  const linkBase = S.mode === 'blog' ? index.get(base)?.url || '' : 'files/' + (base ? base.split('/').map(encodeURIComponent).join('/') + '/' : '');
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
    layout: 'both', // 左右两边展开（像 XMind），同样的内容宽度减半，窄面板里也能看到深层标题
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
  if (S.noteMapFitted !== n.path) { S.noteMapFitted = n.path; requestAnimationFrame(() => { mm.fit(0.55); mm.reveal(sel.id); }); } // 尽量整张图都放得下
  mm.el.focus({ preventScroll: true });
  S.noteMap = mm;
}

$('#panel-body').addEventListener('click', async (e) => {
  const t = e.target;
  if (t.hasAttribute('data-help')) return showHelp();
  if (t.dataset.nv) { S.noteView = t.dataset.nv; store.set('noteView', S.noteView); return renderPanel(true); }
});

$('#panel').addEventListener('click', async (e) => {
  const t = e.target;
  if (t.dataset.tab) { S.tab = t.dataset.tab; return renderPanel(true); }
  // 标题行的「文档 / 导图 / AI」：AI 是单独的标签页，文档 / 导图是笔记的两种看法（按钮里可能有数字，所以用 closest）
  const pvb = t.closest('[data-pv]');
  if (pvb) {
    const v = pvb.dataset.pv;
    if (v === 'ai') S.tab = 'ai';
    else { S.tab = 'note'; S.noteView = v; store.set('noteView', v); }
    return renderPanel(true);
  }
  if (t.dataset.open !== undefined) return post('api/open', { path: t.dataset.open }).catch((err) => alert(err.message));
  if (t.dataset.launch) return post('api/launch', { path: S.sel, tool: t.dataset.launch });
  if (t.closest('[data-wide]')) return setReading(!S.reading);
  const rv = t.closest('[data-reveal]');
  if (rv) return post('api/open', { path: rv.dataset.reveal }).catch((err) => alert(err.message));
  if (t.hasAttribute('data-agent-end')) return endAgent();
  if (t.hasAttribute('data-agent-note')) return agentToNote();
  if (t.hasAttribute('data-agent-resume')) { const a = S.data.agents.find((x) => x.id === S.agent); if (a) resumeAgent(a); return; }
  if (t.hasAttribute('data-create')) {
    const r = await post('api/note/create', { path: S.sel });
    if (r.file) location.href = vscodeUrl(r.file);
    setTimeout(refresh, 300);
  }
});
// 正文第一行的标题如果和面板顶上的名字一样，就不重复显示（只是不显示，文件不改）
const normTitle = (t) => String(t || '').replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase();
function hideDupTitle(root, title) {
  const first = root?.querySelector(':scope > h1, :scope > h2, :scope > .vditor-reset > h1, :scope > .vditor-reset > h2');
  if (first && !first.previousElementSibling && normTitle(first.textContent) === normTitle(title)) first.classList.add('dup-title');
}

// 面板顶部两行：第一行是路径（点哪一级就去哪）、标签、日期、按钮；第二行是标题，像博客文章一样单独一行
function inlineCrumbs() {
  const c = $('#crumbs').innerHTML.trim(), row = $('#panel-top .titlerow');
  $('#crumbs').innerHTML = '';
  if (!row) return;
  row.insertAdjacentHTML('afterbegin', `<span class="tcrumbs">${c}</span>`);
  const h1 = row.querySelector('h1');
  if (h1) { h1.classList.add('ptitle'); row.after(h1); }
}

function closePanel() {
  if (S.reading) { setReading(false); return; }
  S.panelClosed = true; $('#panel').hidden = true; $('#resizer').hidden = true; }
$('#close').onclick = closePanel;
$('#panel-top').addEventListener('click', (e) => {
  const link = e.target.closest('.tcrumbs a[href^="#/"]');
  if (!link || !S.agent) return;
  // 在 AI 面板里点面包屑：回到那个文件夹（地址没变时 hashchange 不会触发，要自己关掉）
  e.preventDefault();
  const p = decodeURIComponent(link.getAttribute('href').slice(2));
  S.agent = null;
  if (S.sel === p) closeAgent(); else location.hash = '#/' + p;
});
$('#wide').onclick = () => $('#panel').classList.toggle('wide');

// 中间的分隔条：任何时候都能拖
function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
function applyWidths() {
  const panel = $('#panel');
  // ⤢ 最大化：右边撑到只给导图留一条窄边；平时用你拖出来的宽度
  const w = S.reading ? innerWidth - 260 : store.get('panelWidth', 0);
  panel.style.width = w ? clamp(w, 320, innerWidth - 200) + 'px' : '';
}
{
  const panel = $('#panel'), bar = $('#resizer');
  applyWidths();
  bar.addEventListener('pointerdown', (e) => {
    bar.setPointerCapture(e.pointerId);
    document.body.classList.add('resizing');
    bar.onpointermove = (ev) => { panel.style.width = clamp(innerWidth - ev.clientX, 320, innerWidth - 200) + 'px'; };
  });
  bar.addEventListener('pointerup', () => {
    bar.onpointermove = null;
    document.body.classList.remove('resizing');
    // 拖动后的宽度就是新的日常宽度；最大化时拖动等于退出最大化
    store.set('panelWidth', panel.offsetWidth);
    if (S.reading) setReading(false);
    S.noteMap?.render();
  });
  addEventListener('resize', applyWidths);
}

// ---------- 小窗：先改再保存（AI 结论写入笔记用） ----------
function editDialog(title, text, onSave) {
  const dlg = document.createElement('div');
  dlg.id = 'pub-dlg';
  dlg.innerHTML = `<div class="box"><h3>${esc(title)}</h3><textarea class="note-edit"></textarea>
    <div class="row"><button class="primary" data-ok>写入</button><button data-close>取消</button><span class="msg">会追加到这个文件夹笔记的「记录」一节</span></div></div>`;
  dlg.querySelector('textarea').value = text;
  document.body.appendChild(dlg);
  dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target.dataset.close !== undefined) dlg.remove(); });
  dlg.querySelector('[data-ok]').onclick = async () => {
    try { await onSave(dlg.querySelector('textarea').value); dlg.remove(); } catch (err) { dlg.querySelector('.msg').textContent = '失败：' + err.message; }
  };
  dlg.querySelector('textarea').focus();
}

// ---------- 路由 ----------
function route() {
  // #ai/<id>：直接打开某个 AI（会话的终端 / 任务的蜂群图），#ai/new:<文件夹> 打开新建表单
  if (location.hash.startsWith('#ai/') && S.mode === 'local') {
    const id = decodeURIComponent(location.hash.slice(4));
    const folder = id.startsWith('new:') ? id.slice(4) : owner(S.data.agents.find((x) => x.id === id)?.path || '');
    if (S.sel === null) { S.sel = index.has(folder) ? folder : ''; renderMap(); }
    return openAgent(id);
  }
  let p = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
  if (p.endsWith('?read')) p = p.slice(0, -5); // 以前的「整页阅读」链接
  // 地址里的节点暂时不在树上（比如刚新建的文件夹还没扫描到）：先显示根节点，扫描到后再跳过去
  S.wantPath = index.has(p) ? null : p;
  if (!index.has(p)) p = '';
  // 在「📌 正在做」里打开不属于固定分支的节点（比如搜索结果）：回到「全部笔记」，不然图上找不到它
  if (S.view === 'work' && p && !onPinPath(p)) setView('map');
  if (S.sel !== p) S.tab = 'note';
  if (S.wantTab) { S.tab = S.wantTab; S.wantTab = null; }
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
