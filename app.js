// 同一份页面：有 api/state 就是本地工作台（可管理），否则读 data.json 当博客（只读）。
import { MindMap } from './mindmap.js';
import * as NM from './notemap.js';
import { enhance } from './blog/article.js';
import * as AG from './agents.js';
import { ic } from './icons.js';

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
  tab: 'note', noteView: 'doc',
  heads: null, headSel: null, headOpen: new Set(), // 导图上的笔记标题（见 headsOf）
  panelKey: '',
  panelClosed: store.get('panelClosed', false), panelRequested: false,
};
const index = new Map(); // path -> 工作区节点
const byUrl = new Map(); // 博客：文章页地址 -> 节点 path

const STATUS = { running: '进行中', waiting: '等你回复', todo: '未开始', done: '已结束' };
const STATUS_ORDER = ['running', 'waiting', 'todo', 'done'];

// ---------- 数据 ----------
async function load() {
  try {
    const r = await fetch('api/state', { cache: 'no-store' });
    if (!r.ok) throw 0;
    S.mode = 'local';
    // 全局操作放在稳定的工具栏中，画布与 AI 面板各自保留工作上下文。
    document.body.classList.add('studio', 'local');
    $('#header-tools').append($('#map-tools'));
    $('#canvas-toolbar').prepend(searchBox.closest('.search-box')); // 搜索框在导图里（左上角），搜的就是这张图
    $('#canvas-breadcrumbs').append($('#focus-crumbs'));
    $('#map-tools').append($('#pub-btn'));
    $('[data-view="work"]').innerHTML = ic('pin', 13) + '<span>聚焦</span><span id="work-count"></span>';
    accept(await r.text());
    setInterval(refresh, 3000);
  } catch {
    S.mode = 'blog';
    document.body.classList.add('studio', 'blog');
    accept(await (await fetch('data.json')).text());
    // 手机上博客首页是目录：把搜索框搬到目录最上面
    const mt = $('#m-tree');
    if (mt) {
      const slot = document.createElement('div');
      slot.className = 'm-search';
      mt.prepend(slot);
      const sb = searchBox.closest('.search-box') || searchBox;
      // 电脑上和工作台一样，搜索框挨着左上角的名字；手机上在目录最上面
      const place = () => { if (matchMedia('(max-width: 760px)').matches) slot.prepend(sb); else $('#canvas-toolbar').prepend(sb); };
      addEventListener('resize', place);
      place();
    }
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
  // 文件夹改名 / 移动后，开着的会话在新位置重开了：开着的标签跟到新终端
  for (const [from, to] of Object.entries(d.relocated || {})) {
    if (S.dockAgent === from) S.dockAgent = to;
    if (S.agent === from) S.agent = to;
  }
  // 在访达里挪动过的文件夹：📌 跟到新位置（导图里改名的已经在 renameFolder 里处理）
  for (const m of d.moves) {
    const fix = (p) => (p === m.from || p.startsWith(m.from + '/') ? m.to + p.slice(m.from.length) : p);
    if (S.pins?.some((p) => fix(p) !== p)) { S.pins = S.pins.map(fix); store.set('pins', S.pins); }
  }
  const first = !S.data;
  S.data = d;
  // 导图上看得见的才算变化：AI 的增减、状态、标题、位置（时间戳、最后一句回复变了不重画导图）
  const mapKey = JSON.stringify([d.agents.map((a) => [a.id, a.status, a.title, a.path, a.prompt]), d.moves.map((m) => m.to), S.pins]);
  const mapChanged = treeChanged || mapKey !== S.mapKey;
  S.mapKey = mapKey;
  if (first) { const t = d.mode === 'local' ? 'Work Studio' : d.site.title; $('#brand').textContent = d.mode === 'local' ? d.name || d.tree.name : t; document.title = t; }
  updateWorkCount();
  renderPubBadge(d.pub);
  notifyWaiting(d.agents, first);
  renderBanner();
  if (S.sel === null || (S.wantPath && index.has(S.wantPath))) route();
  else { if (mapChanged) renderMap(); renderPanel(); }
  updateWorkspaceChrome();
}

async function getNote(p) {
  return (await fetch('api/note?path=' + encodeURIComponent(p), { cache: 'no-store' })).json();
}

const post = (url, data) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Studio': '1' }, body: JSON.stringify(data) })
  .then(async (r) => { const j = await r.json(); if (!r.ok) throw Object.assign(new Error(j.error || r.status), { status: r.status, need: j.need }); return j; });

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
// 博客状态：公开设置（自己设 / 跟随上级）+ 和线上比（还没上传 / 有改动没上传 / 线上还有、下次上传会删掉）
function pubState(n) {
  if (S.mode !== 'local' || !n) return null;
  const p = S.data.pub, has = (k) => !!p?.[k]?.some((x) => x.path === n.path);
  const wait = has('added') ? '新文章，还没上传' : has('changed') ? '有改动，还没上传' : '';
  if (n.blog?.on) return { cls: 'pub-on' + (n.blog.how === 'self' ? '' : ' pub-inherit') + (wait ? ' pub-wait' : ''), tip: BLOG_HOW[n.blog.how] + (wait ? '：' + wait : p && n.note ? '：已上传' : '') };
  if (has('removed')) return { cls: 'pub-gone', tip: '已设为不公开：博客上还有，下次上传会删掉' };
  if (n.blog?.how === 'self') return { cls: '', tip: '不在博客显示（这个文件夹设的）' };
  return null;
}
const nodeClassOf = (v) => (v.h ? 'heading' + (v.h.intro ? ' heading-intro' : '') + (v.id === S.headSel ? ' heading-on' : '') : v.a
  ? ['agent', 'agent-' + v.a.status, (S.agent === v.a.id || S.dockAgent === v.a.id) && 'agent-on'].filter(Boolean).join(' ')
  : [v.n.note && 'has-note', v.hit && 'hit', pubState(v.n)?.cls].filter(Boolean).join(' '));
const map = new MindMap($('#map'), {
  layout: S.layout,
  minimap: false,
  render: workspaceNode,
  nodeClass: nodeClassOf,
  dashed: (v) => !!v.h,
  // 点节点：打开它；有子文件夹又是收起的，顺带展开（想看里面有什么）
  // 点文件夹名字：选中；点它上面的笔记 / 子文件夹按钮：分别长出标题 / 子文件夹（两种不混在一起）；点标题：弹出这一节来写（博客里只读）。
  // 博客和工作台一样，只是不能改
  // 子文件夹只靠 📁N 展开
  onSelect: (v, how) => {
    if (v.h) {
      gotoHeading(v);
      if (v.h.intro) { if (how === 'click' || hpop) openFolderPop(S.sel); } else if (how === 'click' || hpop) openHeadPop(v);
      // 用鼠标点的：光标直接进框里，接着打字就是写这一节（不然回车会在导图上新建标题、打的字成了标题名）。
      // 用方向键选的：光标留在导图上，Enter / Tab 还是加标题
      const p = hpop;
      if (how === 'click' && p && S.mode === 'local') p.live.ready.then(() => {
        if (hpop !== p) return;
        const body = p.el.querySelector('.pop-body');
        p.live.focusEnd(body.scrollHeight > body.clientHeight + 4);
      });
      return;
    }
    closeHeadPop(true);
    S.headSel = null;
    if (v.a) return openAgent(v.a.id);
    if (S.sel !== v.id) { S.headsShown = null; S.wantPop = null; }
    // 点文件夹本身只是选中它（工作台里 AI 栏跟着换到这个文件夹）；笔记、子文件夹各点各的按钮（onNote / onToggle）
    S.dockFilter = null; // 点文件夹本身（不是圆点）：AI 栏回到默认，放开着的会话
    openNode(v.id);
  },
  // 文件夹上的笔记按钮：笔记的标题作为分支长出来（和子文件夹二选一：长出标题时子文件夹收起）；再点收回。
  // 只管显示：笔记是空的就提示一句，不长东西（新建标题：右键文件夹）
  onNote: (v) => {
    if (v.h || v.a) return;
    closeHeadPop(true);
    S.headSel = null;
    if (S.headsShown === v.id) { S.headsShown = null; return renderMap(); }
    if (S.mode === 'local' && (!v.n.note || v.n.note.empty)) { map.select(v.id, false); if (S.sel !== v.id) openNode(v.id); return flash('「' + v.n.name + '」的笔记还是空的：右键它「新建标题」'); }
    S.headsShown = v.id;
    if (S.open.has(v.id)) { S.open.delete(v.id); saveOpen(); }
    if (S.sel !== v.id) return openNode(v.id);
    renderMap();
  },
  // 子文件夹按钮：展开 / 收起子文件夹（笔记的标题开着就先收回）
  onToggle: (v) => {
    if (v.h) { S.headOpen.has(v.id) ? S.headOpen.delete(v.id) : S.headOpen.add(v.id); return renderMap(); }
    if (v.a) return;
    if (hpop && (hpop.id === v.id || hpop.id.startsWith('h:' + v.id + '\n'))) closeHeadPop(true);
    if (S.headsShown === v.id) S.headsShown = null;
    if (!v.n.children.length) return renderMap();
    toggle(v.id);
  },
  onActivate: (v) => {
    if (v.a || v.h) return;
    if (v.n.children.length && v.id !== S.focus) setFocus(v.id);
  },
  editText: (v) => (v.h ? v.h.text : v.n?.dir),
  onRename: (v, name) => {
    if (!v.h) return renameFolder(v.id, name);
    if (v.h.intro) return;
    const ed = headEd();
    ed?.run((d) => NM.rename(d, ed.find(v.h.id), name));
  },
  onEditEnd: (v, r) => {
    if (!S.firstHead || v?.id !== S.firstHead) return;
    S.firstHead = null;
    if (r.changed || r.how === 'enter') return;
    // 自动长出的第一节没起名就取消了：撤回这次添加，笔记还是空的，笔记导图收起
    S.headsShown = null;
    headEd()?.undo();
  },
  onHelp: () => showHelp(),
  onEscape: () => { if (closeHeadPop()) return true; if (S.mode === 'blog' && S.sheet && !$('#panel').hidden) { closePanel(); return true; } if (S.focus) { setFocus(''); return true; } return false; },
  onView: () => { placeHeadPop(); paintCanvasZoom(); },
  onKey: (e, v) => {
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key.toLowerCase() === 'f') { $('#search').focus(); return true; }
    if (v.h) {
      if (v.h.intro) {
        if (e.key === 'Enter' || e.key === ' ') {
          openFolderPop(S.sel);
          const editor = hpop?.live;
          editor?.ready.then(() => editor.focus());
          return true;
        }
        if (['Tab', 'F2', 'Delete', 'Backspace'].includes(e.key)) return true;
        const ed = headEd();
        return ed ? commonKeys(e, ed, mapRoot(ed.doc)) : false;
      }
      return headKey(e, v);
    }
    if (v.a) return ['Tab', 'Enter', 'F2'].includes(e.key); // AI 节点不能新建子文件夹、改名
    if (S.mode !== 'local') return e.key === 'F2'; // 只读模式不能改名
    if (e.key === 'F2' && !v.id) return true; // 根目录不能改名
    if (e.key === 'Tab') { newFolder(v.id); return true; }
    if (e.key === 'Enter' && !e.shiftKey) { newFolder(v.id ? v.n.parent.path : ''); return true; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && v.id) { deleteFolder(v.id); return true; }
    return false;
  },
});

// ---------- 右键菜单（工作台里）：节点相关的操作都在这里 ----------
const ctx = document.createElement('div');
ctx.id = 'ctx';
ctx.setAttribute('role', 'menu');
ctx.hidden = true;
document.body.appendChild(ctx);
const closeCtx = () => { ctx.hidden = true; };
const openTrash = () => post('api/open', { path: '.studio/trash' }).catch((err) => flash(err.message === '路径不存在' ? '工作台回收站还是空的' : err.message));
addEventListener('click', closeCtx);
addEventListener('blur', closeCtx);
addEventListener('keydown', (e) => { if (e.key === 'Escape') closeCtx(); });
const setBlogOf = (p, on) => post('api/blog/set', { path: p, on }).then(() => { S.panelKey = ''; refresh(); }).catch((err) => alert(err.message));
// 全部收起：这个文件夹和它下面所有展开的都收起（根目录收起到只剩第一层）
function collapseAll(p) {
  for (const x of [...S.open]) if (x === p || !p || x.startsWith(p + '/')) S.open.delete(x);
  S.level = 0;
  saveOpen();
  renderMap();
}
function expandAll(p) {
  const walk = (n) => { if (n.children.length) { S.open.add(n.path); n.children.forEach(walk); } };
  walk(index.get(p));
  saveOpen();
  renderMap();
}
function folderMenu(n) {
  const p = n.path, abs = absPath(p), finder = PATH_SEP() === '/' ? '访达' : '资源管理器';
  const cur = n.blog?.how === 'self' ? (n.blog.on ? 'on' : 'off') : '';
  const anyOpen = (x) => x.children.some((c) => S.open.has(c.path) || anyOpen(c));
  // 按常用程度排：建、改名 > 开 AI > 聚焦 > 展开收起 > 打开位置 > 公开设置（很少改）
  return [
    { icon: 'folderPlus', label: '新建子文件夹', key: 'Tab', run: () => newFolder(p) },
    p && { icon: 'pencil', label: '重命名', key: 'F2', run: () => { map.select(p); map.edit(p); } },
    { icon: 'plus', label: '新建标题', run: () => newSection(p) },
    '-',
    { icon: 'sparkles', label: '在这里开 AI', run: () => openAgent('new:' + p) },
    p && { icon: isPinned(p) ? 'pinOff' : 'pin', label: isPinned(p) ? '移出聚焦' : '加入聚焦', run: () => togglePin(p) },
    '-',
    n.children.length && { icon: 'expand', label: '展开全部', run: () => expandAll(p) },
    n.children.length && (anyOpen(n) || (p && S.open.has(p))) && { icon: 'collapse', label: '全部收起', run: () => collapseAll(p) },
    '-',
    { icon: 'folderOpen', label: `在${finder}中显示`, run: () => post('api/open', { path: p }).catch((err) => alert(err.message)) },
    { icon: 'terminal', label: '在终端中打开', run: () => post('api/launch', { path: p, tool: '终端' }).catch((err) => alert(err.message)) },
    { icon: 'copy', label: '复制路径', run: () => navigator.clipboard.writeText(abs).then(() => flash('已复制：' + abs)) },
    !p && { icon: 'archive', label: '打开工作台回收站', run: openTrash },
    '-',
    { head: '博客' },
    { label: '公开', on: cur === 'on', run: () => setBlogOf(p, true) },
    { label: '不公开', on: cur === 'off', run: () => setBlogOf(p, false) },
    { label: `跟随上级（${inheritedBlog(n) ? '公开' : '不公开'}）`, on: cur === '', run: () => setBlogOf(p, null) },
    p && '-',
    p && { icon: 'trash', label: '删除文件夹…', key: '⌫', danger: true, run: () => deleteFolder(p) },
  ];
}
function agentMenu(a) {
  return [
    { label: '打开', run: () => openAgent(a.id) },
    { label: '重命名', run: () => renameAgent(a) },
    { label: '写入笔记…', run: () => agentToNote(a.id) },
    '-',
    a.term && { label: '关掉终端（以后可以接着聊）', run: () => closeSession(a) },
    { label: '删除会话…', run: () => deleteAgent(a.id) },
  ];
}
// 点文件夹上的 AI 圆点：右下 AI 栏只列这一类会话，并打开最近的一个（捕获阶段拦下，不当成点节点）
$('#map').addEventListener('click', (e) => {
  const dot = e.target.closest('.ai-dot[data-cat]');
  if (!dot) return;
  e.stopPropagation(); e.preventDefault();
  const path = dot.closest('.mm-node').dataset.id, cat = dot.dataset.cat, deep = !!dot.dataset.deep;
  S.dockFilter = { path, cat, deep };
  const first = (deep ? agentsUnder : agentsAt)(path).filter((a) => catOf(a) === cat && !isHidden(a)).sort((x, y) => y.mtime - x.mtime)[0];
  S.panelClosed = false;
  S.panelRequested = true;
  store.set('panelClosed', false);
  S.dockAgent = first?.id || null;
  if (S.sel !== path) { location.hash = '#/' + path; return; }
  renderMap(); renderDock(index.get(path), true);
}, true);
$('#map').addEventListener('contextmenu', (e) => {
  if (S.mode !== 'local') return;
  const el = e.target.closest('.mm-node');
  const v = el && map.node(el.dataset.id);
  if (!v) return;
  e.preventDefault();
  if (v.h) {
    gotoHeading(v);
    if (v.h.intro) return showCtx([
      { icon: 'file', label: '编辑概述', run: () => openFolderPop(S.sel) },
    ], e.clientX, e.clientY);
    return showCtx([
      { icon: 'file', label: '编辑这一节', run: () => openHeadPop(v) },
      { icon: 'pencil', label: '重命名', key: 'F2', run: () => map.edit(v.id) },
      '-',
      { icon: 'plus', label: '新建下级标题', key: 'Tab', run: () => headKey({ key: 'Tab' }, v) },
      { icon: 'plus', label: '新建同级标题', key: 'Enter', run: () => headKey({ key: 'Enter' }, v) },
      '-',
      { icon: 'trash', label: '删除标题', key: 'Delete', danger: true, run: () => removeHeading(v) },
    ], e.clientX, e.clientY);
  }
  showCtx(v.a ? agentMenu(v.a) : folderMenu(v.n), e.clientX, e.clientY);
});
// 在 (x, y) 弹出菜单；items 里 false 会被去掉，'-' 是分隔线
// 主题：右上角按钮弹出列表（色块是这套主题的底色），选了马上换、记住
const THEMES = [
  ['system', '跟随系统', 'linear-gradient(135deg, #f5f6f8 50%, #17191f 50%)'],
  ['light', '浅色', '#f5f6f8'],
  ['soft', '柔和', '#e8e7e2'],
  ['paper', '纸张', '#ede4cf'],
  ['dim', '深灰', '#25272e'],
  ['dark', '深色', '#17191f'],
];
function themeMenu(e) {
  e.stopPropagation();
  const cur = window.studioTheme?.get() || 'system', r = e.currentTarget.getBoundingClientRect();
  showCtx([{ head: '主题' }, ...THEMES.map(([id, label, sw]) => ({ label, sw, on: id === cur, key: id === cur ? '✓' : '', run: () => window.studioTheme?.set(id) }))], r.right - 180, r.bottom + 6);
}
function showCtx(list, x, y) {
  const items = list.filter(Boolean).filter((it, i, arr) => it !== '-' || (i > 0 && arr[i - 1] !== '-'));
  while (items[items.length - 1] === '-') items.pop();
  if (!items.length) return;
  // 每行：图标列（勾选项是 ✓）· 文字 · 快捷键；「博客」这类小节标题不能点
  ctx.returnFocus = document.activeElement;
  ctx.innerHTML = items.map((it, i) => it === '-' ? '<div class="sep" role="separator"></div>' : it.head ? `<div class="hd">${esc(it.head)}</div>`
    : `<div class="it${it.on ? ' on' : ''}${it.danger ? ' danger' : ''}" role="menuitem" tabindex="-1" data-i="${i}"><span class="ci">${it.sw ? `<span class="sw" style="background:${it.sw}"></span>` : it.on ? ic('check') : it.icon ? ic(it.icon) : ''}</span><span class="cl">${esc(it.label)}</span>${it.key ? `<span class="k">${it.key}</span>` : ''}</div>`).join('');
  ctx.items = items;
  ctx.hidden = false;
  ctx.style.left = Math.max(8, Math.min(x, innerWidth - ctx.offsetWidth - 8)) + 'px';
  ctx.style.top = Math.max(8, Math.min(y, innerHeight - ctx.offsetHeight - 8)) + 'px';
  ctx.querySelector('[role="menuitem"]')?.focus({ preventScroll: true });
}
ctx.addEventListener('click', (e) => {
  e.stopPropagation();
  const it = ctx.items?.[+e.target.closest('[data-i]')?.dataset.i];
  if (!it) return;
  closeCtx();
  it.run();
});
ctx.addEventListener('keydown', (e) => {
  const rows = [...ctx.querySelectorAll('[role="menuitem"]')];
  const i = rows.indexOf(document.activeElement);
  if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
    e.preventDefault(); e.stopPropagation();
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? rows.length - 1 : (i + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
    rows[next]?.focus();
  } else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault(); e.stopPropagation(); rows[i]?.click();
  } else if (e.key === 'Escape') {
    e.preventDefault(); e.stopPropagation(); closeCtx();
    if (ctx.returnFocus?.isConnected) ctx.returnFocus.focus({ preventScroll: true });
  } else if (e.key === 'Tab') closeCtx();
});

// 新建文件夹（同时建同名笔记），建好后直接进入改名
async function newFolder(parent) {
  try {
    const r = await post('api/folder/create', { parent });
    S.noteView = 'doc'; // 新建的笔记是空的：直接打开文档，可以马上写
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

// 文件夹就是用户的数据：删除前保存编辑内容，整棵移到工作台回收站，不直接抹掉文件。
function deleteFolder(p) {
  const n = index.get(p);
  if (S.mode !== 'local' || !p || !n || $('#pub-dlg')) return;
  const dlg = document.createElement('div');
  dlg.id = 'pub-dlg';
  dlg.setAttribute('role', 'dialog');
  dlg.setAttribute('aria-modal', 'true');
  dlg.setAttribute('aria-labelledby', 'folder-delete-title');
  dlg.innerHTML = `<div class="box"><h3 id="folder-delete-title">删除「${esc(n.name)}」？</h3>
    <p>这个文件夹、里面的笔记和全部子文件夹会一起移到<b>工作台回收站</b>，可以从中找回。</p>
    <p class="hint">AI 对话记录会保留。如果里面还有开着的 AI 会话，请先关掉终端再删除。</p>
    <div class="row"><button class="primary danger" data-delete-folder>移到回收站</button><button data-cancel>取消</button></div>
    <p class="msg" role="status"></p></div>`;
  document.body.appendChild(dlg);
  let busy = false;
  const cancel = dlg.querySelector('[data-cancel]');
  const close = () => { if (!busy) { dlg.remove(); map.el.focus({ preventScroll: true }); } };
  cancel.onclick = close;
  cancel.focus();
  dlg.onclick = (e) => { if (e.target === dlg) close(); };
  dlg.onkeydown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    if (e.key === 'Tab') {
      const buttons = [...dlg.querySelectorAll('button:not(:disabled)')];
      const first = buttons[0], last = buttons.at(-1);
      if (!first) e.preventDefault();
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };
  dlg.querySelector('[data-delete-folder]').onclick = async () => {
    if (busy) return;
    busy = true;
    dlg.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    const msg = dlg.querySelector('.msg');
    try {
      msg.textContent = '正在保存笔记…';
      [...editors].forEach((ed) => ed.flush());
      if ((await S.pendingSave) === false) throw new Error('笔记没有保存成功，请先保留刚才的改动，再删除文件夹。');
      msg.textContent = '正在移到回收站…';
      const r = await post('api/folder/delete', { path: p });
      const under = (x) => typeof x === 'string' && (x === p || x.startsWith(p + '/'));
      const selected = under(S.sel);
      if (selected) {
        [...editors].forEach((ed) => ed.destroy());
        S.dockAgent = null;
        S.agent = null;
      }
      S.open = new Set([...S.open].filter((x) => !under(x)));
      saveOpen();
      S.pins = S.pins.filter((x) => !under(x));
      store.set('pins', S.pins);
      if (under(S.focus)) { S.focus = ''; store.set('focus', ''); map.placed = false; }
      if (under(S.wantPath)) S.wantPath = null;
      if (under(S.dockFilter?.path)) S.dockFilter = null;
      for (const key of ['history', 'noteSel', 'noteCollapsed', 'noteMapView']) if (under(S[key]?.path)) S[key] = null;
      S.panelKey = '';
      if (S.query) { ++SR.seq; clearTimeout(SR.timer); clearSearch(); }
      await refresh();
      if (selected) {
        const next = '#/' + r.parent;
        if (decodeURIComponent(location.hash) === next) route(); else location.hash = next;
      }
      else { renderMap(); renderPanel(true); }
      busy = false;
      close();
      const t = toast('已移到工作台回收站 <button data-open-trash>打开回收站</button><button data-x>关闭</button>', 8000);
      t.querySelector('[data-open-trash]').onclick = openTrash;
    } catch (err) {
      busy = false;
      msg.textContent = err.message;
      dlg.querySelectorAll('button').forEach((b) => { b.disabled = false; });
    }
  };
}

// 节点上的 AI 圆点：三类各一个带数字的圆点——绿 = 正在干活，橙 = 开着但没在干活（等你回复 / 还没给任务），灰 = 没开着（已结束，可以接着聊）
// 展开的文件夹只算自己的，收起的算上里面所有的。点圆点：下面的 AI 栏只列这一类会话
const CAT = { run: '正在进行', idle: '开着、没在干活', off: '没开着（历史）' };
const CAT_ORDER = ['run', 'idle', 'off'];
const catOf = (a) => (a.status === 'running' ? 'run' : a.status === 'done' ? 'off' : 'idle');
function aiDot(list, deep) {
  const c = {};
  for (const a of list) if (!isHidden(a)) c[catOf(a)] = (c[catOf(a)] || 0) + 1;
  return CAT_ORDER.filter((k) => c[k]).map((k) =>
    `<span class="ai-dot cat-${k}" data-cat="${k}"${deep ? ' data-deep="1"' : ''} title="${c[k]} 个会话${CAT[k]}${deep ? '（含子文件夹）' : ''}，点开看">${c[k]}</span>`).join('');
}

// 节点上的 agent 状态徽标：自己的用实心，折叠起来的子孙用描边
function badges(list, faint) {
  const c = {};
  for (const a of list) c[a.status] = (c[a.status] || 0) + 1;
  return STATUS_ORDER.filter((s) => c[s] && s !== 'done').map((s) => `<span class="ag ag-${s}${faint ? ' faint' : ''}" title="${STATUS[s]}">${c[s]}</span>`).join('');
}

// 记录里的工具名 -> 工作台能开的 agent（接着聊、删除对话记录用）；名字和 Shift+Enter 换行键都由服务端给（lib/terminals.mjs 的 AGENTS）
const agentDef = (tool) => termInfo().agents.find((x) => x.id === (tool === 'claude-code' ? 'claude' : tool));
const AGENT_ID = new Proxy({}, { get: (_, tool) => agentDef(tool)?.id });
const TOOL = new Proxy({}, { get: (_, tool) => agentDef(tool)?.label.replace(/ Code$| CLI$/, '') || ({ qoder: 'Qoder' })[tool] });
// 会话名：你改过的名字优先（按对话 id 记，接着聊、会话结束后都跟着）；其次是建会话时写的任务标题
const titleKey = (a) => (a.convoId || a.sessionId ? 'c:' + (a.convoId || a.sessionId) : a.id);
const agentTitle = (a) => store.get('agentTitles', {})[titleKey(a)] || a.title || (a.prompt || '').slice(0, 40) || '（无标题）';
function renameAgent(a) {
  const t = prompt('会话名字（任务变了就改一下）', agentLabel(a));
  if (t === null) return;
  const all = store.get('agentTitles', {});
  if (t.trim()) all[titleKey(a)] = t.trim(); else delete all[titleKey(a)];
  store.set('agentTitles', all);
  S.mapKey = ''; renderMap(); renderDock(index.get(S.sel), true);
}
// 删除过的会话不再显示：按会话 id，也按对话 id（同一段对话接着聊开的新终端、会话结束后的历史记录，都算删了）
const convoOf = (a) => a.convoId || a.sessionId || '';
const isHidden = (a) => { const h = store.get('hiddenAgents', []); return h.includes(a.id) || (!!convoOf(a) && h.includes('c:' + convoOf(a))); };

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
  if (v.h) {
    const t = NM.plain(v.h.text) || '（未命名）';
    if (v.h.intro) return `<span class="node-icon">${ic('file', 12)}</span><span class="mm-label">${esc(t)}</span>`;
    return `<span class="mm-label"${t.length > 30 ? ` title="${esc(t)}"` : ''}>${esc(t.length > 30 ? t.slice(0, 29) + '…' : t)}</span>`
      + (v.h.children.length ? `<span class="mm-toggle">${v.collapsed ? '+' + v.h.children.length : '−'}</span>` : '');
  }
  const n = v.n;
  const short = shortName(n);
  const t = short.length > 34 ? short.slice(0, 33) + '…' : short;
  // 聚焦里平铺的文件夹：前面淡淡带上所在位置，不然好几个「web」分不清
  const where = v.where ? `<span class="mm-where">${esc(v.where)} /</span>` : '';
  // 节点上只放要紧的：名字、状态；文件夹图标不放（导图上都是文件夹），根节点除外
  const icon = !n.path ? `<span class="node-icon">${ic(n.path ? 'folder' : 'network', n.path ? 14 : 17)}</span>` : '';
  let h = `${icon}${isPinned(n.path) && n.path ? `<span class="pin" title="已加入「聚焦」">${ic('pin', 12)}</span>` : ''}${where}<span class="mm-label" title="${esc(n.path || n.name)}${pubState(n) ? '&#10;' + esc(pubState(n).tip) : ''}">${esc(t)}</span>`;
  if (S.mode === 'local') {
    if (S.data.moves.some((m) => m.to === n.path && Date.now() - m.at < 864e5)) h += `<span class="moved" title="这个文件夹刚从「${esc(S.data.moves.find((m) => m.to === n.path).from)}」改名 / 移动过来（AI 会话已跟过来）">↪</span>`;
    // 收起的文件夹：下面的 AI 有几个在跑、几个等你、几个待办（展开时 AI 就挂在下面）
    h += aiDot(v.closed ? agentsUnder(n.path) : agentsAt(n.path), v.closed);
  }
  if (S.qOn) return h;
  // 两个按钮，长得一样、各管各的：📄N = 笔记分成 N 节（点开长出笔记导图），📁N = N 个子文件夹（点开长出子文件夹）。
  // 开着的那个高亮；没写笔记的 📄 淡一些、不带数字。「+N」只留给笔记里标题的展开收起，不和这两个混
  if (S.mode === 'local' || n.url) { // 博客：只有文章（公开、有笔记的）才有 📄
    const on = S.headsShown === n.path && headsReady(n), k = n.note?.heads || 0, empty = !n.note || n.note.empty;
    h += `<button type="button" class="mm-chip mm-note${on ? ' on' : ''}${empty ? ' empty' : ''}" aria-expanded="${on}" title="${on ? '收起笔记导图' : empty ? '笔记是空的（右键文件夹「新建标题」）' : `笔记导图${k ? `：${k} 个标题` : ''}`}">${ic('file', 12)}${k ? `<b>${k}</b>` : ''}</button>`;
  }
  if (n.children.length && n.path) h += `<button type="button" class="mm-chip mm-toggle mm-kids${v.closed ? '' : ' on'}" aria-expanded="${!v.closed}" title="${v.closed ? `展开 ${n.children.length} 个子文件夹` : '收起子文件夹'}">${ic('folder', 12)}<b>${n.children.length}</b></button>`;
  return h;
}

const byStatus = (x, y) => STATUS_ORDER.indexOf(x.status) - STATUS_ORDER.indexOf(y.status) || y.mtime - x.mtime;
const liveAgents = () => S.data.agents.filter((a) => a.status !== 'done' && !isHidden(a));
// 会话不单独占导图节点（多了图装不下）：文件夹上只显示三类圆点（见 aiDot），点圆点在 AI 栏里看具体会话。
// 聚焦里会出现有会话的文件夹（开着的和历史的都算；删除过的不算）
const mapAgents = () => S.data.agents.filter((a) => !isHidden(a));
const withAgents = (v) => v;

// 笔记的标题长在导图上：只有选中的那个文件夹，它笔记里的标题作为浅色小节点挂在它下面（选别的文件夹就收回去），
// 一级标题都显示，再往下默认收起（点「+3」展开）；点标题，右边笔记跳到那一节
const HEAD_MAX = 40;
// 点了文件夹上的笔记按钮才长出标题，再点收起（S.headsShown 置空）
const headsReady = (n) => !!S.heads && S.heads.path === n.path;
// 分支 = 笔记里 md 的各级标题；标题前面还有一段话，最前面多一个「概述」。📄 只管显示；新建标题走右键
function headsOf(n) {
  if (!headsReady(n) || S.headsShown !== n.path) return [];
  const conv = (x) => {
    const id = 'h:' + n.path + '\n' + x.id;
    return { id, h: x, collapsed: !S.headOpen.has(id), children: x.children.map(conv) };
  };
  const out = S.heads.kids.slice(0, HEAD_MAX).map(conv);
  const doc = S.heads.doc;
  {
    if (doc && NM.sectionOf(doc, mapRoot(doc)).md.trim()) out.unshift({ id: 'h:' + n.path + '\n@intro', h: { id: '@intro', text: '概述', children: [], intro: true }, collapsed: true, children: [] });
  }
  return out;
}
// 右边笔记加载完 / 改了之后，更新导图上的标题节点（标题没变就不重画导图）
function setHeads(path, note) {
  const doc = note?.body ? NM.parse(note.body, note.meta?.title || index.get(path)?.name || '') : null;
  const kids = doc ? mapRoot(doc).children : [];
  const sig = path + '|' + JSON.stringify(kids, (k, v) => (k === 'parent' || k === 'end' || k === 'line' ? undefined : v));
  if (S.heads?.sig === sig) { S.heads.doc = doc; return; }
  // 标题节点按行号起名：上面多写几行，下面的标题名字就变了。展开、选中的状态按标题文字跟过去，不然会自己收起来
  if (S.heads?.path === path && S.heads.doc && doc) {
    const pre = 'h:' + path + '\n', moved = new Map();
    const walk = (x) => x.children.forEach((c) => { const y = NM.locate(doc, c); if (y && y.id !== c.id) moved.set(pre + c.id, pre + y.id); walk(c); });
    walk(S.heads.doc.root);
    if (moved.size) {
      const open = [...S.headOpen];
      S.headOpen = new Set(open.map((id) => moved.get(id) || id));
      if (moved.has(S.headSel)) S.headSel = moved.get(S.headSel);
      if (hpop && hpop.folder === null && moved.has(hpop.id)) { hpop.id = moved.get(hpop.id); hpop.hid = hpop.id.slice(pre.length); }
    }
  }
  S.heads = { path, kids, doc, sig };
  if (S.data) renderMap();
}
// 选中导图上的标题
function gotoHeading(v) {
  S.headSel = v.id;
  renderMap();
}

// ---------- 导图上的笔记标题：点一下，旁边弹出这一节的编辑框（像 XMind 的主题笔记）----------
// 框跟着标题走：旁边放得下（≥520px）就放旁边，不然铺满导图宽度、贴在标题下面（下面太挤就放上面）；直接写，自动保存进笔记的这一节。
// 点导图空白处、Esc、× 关闭。标题节点上：Tab 加子标题、Enter 加同级、F2 改字、Delete 删除、Alt+↑↓ 移动、Ctrl+Z 撤销
let hpop = null; // { id: 导图上的 id, hid: 笔记里的标题 id, el, live, dirty }
const headEd = () => (S.noteEd && S.noteEd.path === S.sel ? S.noteEd.ed : null);
const headMapId = (hid) => 'h:' + S.sel + '\n' + hid;
const openHeadPop = (v) => openPop(v.id, v.h.id);
// 文件夹自己：弹出笔记开头那段（第一个标题之前；笔记里没有标题就是整篇）
function openFolderPop(path) {
  const ed = headEd();
  if (!ed || S.sel !== path || !map.node(path)) return;
  const n = index.get(path);
  openPop(path, mapRoot(ed.doc).id, ed.doc.root.children.length ? '写「' + (n?.name || '') + '」的概述…' : `写「${n?.name || ''}」的笔记，自动保存。用 ## 标题 分节，每节长成一个分支`);
}
function openPop(mapId, hid, empty = '写这一节的内容…') {
  const ed = headEd();
  if (!ed) return;
  if (hpop && hpop.id === mapId) return placeHeadPop();
  closeHeadPop(true);
  const v = { id: mapId, h: ed.find(hid) || mapRoot(ed.doc) };
  // 按标题文字认这一节（行号会被别处的改动带着变）；own = 这个框上次写进去的那几行
  const at = v.h.kind === 'root' ? { root: true } : { line: v.h.line, level: v.h.level, text: v.h.text };
  let own = null;
  const el = document.createElement('div');
  el.className = 'mm-pop';
  el.innerHTML = '<div class="pop-head"><span class="pop-note-icon">' + ic('file', 15) + '</span><span class="pop-title"></span><span class="pop-save" role="status">自动保存</span><button class="icon" data-pop="close" title="关闭笔记（Esc）" aria-label="关闭笔记">' + ic('x') + '</button></div><div class="pop-body"></div>';
  map.el.appendChild(el);
  const live = mdEditor({
    md: NM.sectionOf(ed.doc, v.h).md,
    base: S.sel,
    editable: S.mode === 'local',
    empty,
    // 每次都用最新的那份笔记（右边可能刚重新载入过）
    onSave: (md) => {
      const e2 = headEd();
      if (!e2) return false;
      let gone = false, wrote = null, theirs = null;
      return e2.run((d, how) => {
        const x = NM.locate(d, at);
        if (!x) { gone = true; return null; }
        // 别处（AI）也改了正在写的这一节：用框里的，把它那版留着可以复制
        const now = NM.sectionOf(d, x).md;
        if (how?.stale && hpop?.live === live && now !== hpop.base && now !== md.trim()) theirs = now;
        at.line = x.line;
        const r = NM.setSection(d, x, md, own);
        wrote = r.own;
        return r;
      }, { keepPop: true }).then((ok) => {
        if (gone) { lostWriting(md, '这一节的标题已经不在了（被删掉或改了），框里的内容没有存进去。'); return false; }
        if (theirs !== null && ok) lostWriting(theirs, '这一节刚被别处（比如 AI）改过，留的是你框里写的。', '复制别处改的那版');
        if (ok) { own = wrote; const x = NM.locate(headEd()?.doc || e2.doc, at); if (x && hpop?.live === live) hpop.base = NM.sectionOf(headEd()?.doc || e2.doc, x).md; }
        return ok;
      });
    },
    onLayout: () => placeHeadPop(),
    onEscape: () => closeHeadPop(),
  });
  el.querySelector('.pop-body').appendChild(live.el);
  el.querySelector('[data-pop="close"]').onclick = () => closeHeadPop();
  const art = S.mode === 'blog' && index.get(S.sel)?.url;
  if (art) el.querySelector('[data-pop="close"]').insertAdjacentHTML('beforebegin', `<a class="icon pop-full" href="${esc(art)}" target="_blank" rel="noopener" title="打开全文（单独的文章页）" aria-label="打开全文">${ic('external')}</a>`);
  hpop = { id: v.id, hid, at, el, live, base: NM.sectionOf(ed.doc, v.h).md, folder: !index.has(mapId) ? null : mapId };
  makeRoomForPop();
  placeHeadPop();
  return hpop;
}
function closeHeadPop(silent) {
  if (!hpop) return false;
  const p = hpop;
  hpop = null;
  p.live.destroy(); // 会先把没存的存掉
  p.el.remove();
  S.liveEditing = false;
  if (!silent) map.el.focus({ preventScroll: true });
  return true;
}
const POP_SIDE = 380, POP_MIN = 300, POP_G = 8, POP_M = 6; // 旁边有 300px（最好 380）就放旁边（挡住的分支少），不然放下面
// 没存上的内容别丢：提示里给个按钮复制下来
function lostWriting(md, why, what = '复制框里的内容') {
  const t = toast(`${esc(why)} <button data-copy-lost>${what}</button><button data-x>知道了</button>`, 0);
  t.querySelector('[data-copy-lost]').onclick = (e) => navigator.clipboard.writeText(md).then(() => { e.target.textContent = '已复制，粘贴回去就行'; });
}
function placeHeadPop() {
  if (!hpop) return;
  const ed = headEd();
  // 笔记改过后标题的行号可能变了：按文字重新找到它，框继续跟着它
  const x = ed && !hpop.at.root && NM.locate(ed.doc, hpop.at);
  if (x && x.id !== hpop.hid) {
    hpop.hid = x.id;
    if (hpop.folder === null) {
      const old = hpop.id;
      hpop.id = headMapId(x.id);
      if (S.headSel === old) { S.headSel = hpop.id; map.select(hpop.id, false); }
    }
  }
  if (x) hpop.at.line = x.line;
  const t = ed?.find(hpop.hid);
  hpop.el.querySelector('.pop-title').textContent = hpop.folder !== null ? (index.get(hpop.folder)?.name || '') + ' · 笔记' : NM.plain(t?.text || '') || '（空）';
  const r = branchRect(hpop.id);
  if (!r) { hpop.el.hidden = true; return; }
  hpop.el.hidden = false;
  // 框会越写越高：放旁边时让开这份笔记的所有标题（不只是这一个分支），不然盖住相邻标题的右半边
  if (hpop.folder === null) for (const el of map.el.querySelectorAll('.mm-node')) {
    if (!el.dataset.id.startsWith('h:' + S.sel + '\n')) continue;
    const q = map.nodeRect(el.dataset.id);
    if (q) { r.right = Math.max(r.right, q.right); r.left = Math.min(r.left, q.left); }
  }
  const W = map.el.clientWidth, H = map.el.clientHeight, st = hpop.el.style;
  const right = W - r.right - POP_G - POP_M, left = popLeftRoom(r);
  if (right >= POP_MIN || left >= POP_MIN) {
    const onRight = right >= POP_MIN, w = Math.min(560, onRight ? right : left);
    st.width = w + 'px'; st.maxHeight = H - 2 * POP_M + 'px';
    st.left = (onRight ? r.right + POP_G : r.left - POP_G - w) + 'px';
    st.top = Math.max(POP_M, Math.min(H - hpop.el.offsetHeight - POP_M, r.nodeTop - 6)) + 'px';
    return;
  }
  const below = H - r.bottom - POP_G - POP_M, above = r.top - POP_G - POP_M, down = below >= Math.min(above, 160);
  const w = Math.min(560, W - 2 * POP_M);
  st.width = w + 'px'; st.left = Math.max(POP_M, Math.min(W - w - POP_M, r.nodeLeft)) + 'px';
  st.maxHeight = Math.max(100, down ? below : above) + 'px';
  st.top = (down ? r.bottom + POP_G : r.top - POP_G - hpop.el.offsetHeight) + 'px';
}
// 节点连同它下面展开的分支占的范围（屏幕坐标）：框放在整个分支旁边，不挡住它下面的标题、子文件夹
function branchRect(id) {
  const v = map.node(id);
  if (!v) return null;
  const r = { ...map.nodeRect(id), nodeTop: 0 };
  r.nodeTop = r.top; r.nodeLeft = r.left;
  const walk = (x) => (x._kids || []).forEach((k) => {
    const q = map.nodeRect(k.id);
    if (q) { r.left = Math.min(r.left, q.left); r.right = Math.max(r.right, q.right); r.top = Math.min(r.top, q.top); r.bottom = Math.max(r.bottom, q.bottom); }
    walk(k);
  });
  walk(v);
  return r;
}
// 刚打开时：两边放不下、下面又不够，就把导图挪一下，让标题到导图上方，下面整块给框
// 程序挪导图时滑过去（拖动、滚轮不滑，跟手）
const glide = () => { map.canvas.classList.add('mm-glide'); clearTimeout(glide.t); glide.t = setTimeout(() => map.canvas.classList.remove('mm-glide'), 320); };
// 框放左边：只有这个分支本身就在图的最左边时才行（不然会盖住它的上级、根节点和别的分支）
function popLeftRoom(r) {
  const treeLeft = map.view.x + map.bounds.x1 * map.view.k;
  return treeLeft < r.left - 2 ? 0 : r.left - POP_G - POP_M;
}
function makeRoomForPop() {
  const r = branchRect(hpop.id);
  if (!r) return;
  const W = map.el.clientWidth, H = map.el.clientHeight;
  if (W - r.right - POP_G - POP_M >= POP_MIN || popLeftRoom(r) >= POP_MIN) return; // 旁边放得下就不动图
  // 分支不太宽：把导图往左挪，右边让出一个框的位置（像 XMind，框总在主题旁边，不盖住图）
  // 把导图往左挪，右边让出框的位置（像 XMind，框总在主题旁边、不盖住图）；但整张图最左边（根节点）不挪出画面
  const treeLeft = map.view.x + map.bounds.x1 * map.view.k;
  const shift = Math.min(r.right - (W - POP_MIN - POP_G - POP_M), Math.max(0, treeLeft - 16));
  if (shift > 0 && W - (r.right - shift) - POP_G - POP_M >= POP_MIN) { glide(); map.view.x -= shift; map.apply(); return; }
  if (H - r.bottom >= H * 0.6) return;
  glide();
  map.view.y += 70 - r.top;
  if (r.left < 0 || r.right > W) map.view.x += W / 2 - (r.left + r.right) / 2;
  map.apply();
}
// 打开搜索结果：笔记导图展开，找到那个标题（at.n = 笔记里第几个标题，-1 = 第一个标题之前那段），
// 选中它、弹出它这一节，并高亮这个词；没给 at（博客的结果）就找第一个含这个词的那一节
function openFindPop(path, q, at) {
  const ed = headEd();
  if (!ed || S.sel !== path) return;
  const lq = q.toLowerCase(), center = mapRoot(ed.doc), all = [];
  const walk = (x) => x.children.forEach((c) => { all.push(c); walk(c); });
  walk(ed.doc.root);
  let hit = at && at.n >= 0 ? all[at.n] : at ? center : null;
  if (hit && at.head && NM.plain(hit.text) !== NM.plain(at.head)) hit = all.find((x) => NM.plain(x.text) === NM.plain(at.head)) || null; // 笔记刚改过，序号对不上就按文字找
  if (!hit || (hit !== center && !all.includes(hit))) {
    const order = [center, ...all.filter((x) => x !== center)];
    hit = order.find((x) => (NM.sectionOf(ed.doc, x).md + '\n' + (x === center ? '' : x.text)).toLowerCase().includes(lq)) || center;
  }
  S.headsShown = path;
  if (S.open.has(path)) { S.open.delete(path); saveOpen(); }
  let p;
  if (hit === center || hit.kind !== 'h') { S.headSel = null; renderMap(); openFolderPop(path); p = hpop; } else {
    for (let a = hit.parent; a && a.kind === 'h' && a !== center; a = a.parent) S.headOpen.add(headMapId(a.id));
    S.headSel = headMapId(hit.id);
    renderMap();
    p = openPop(S.headSel, hit.id);
  }
  p?.live.ready.then(() => highlightFind(p.el, q));
}
// 点导图空白处（不是拖动画布）：关掉框
{
  let down = null;
  $('#map').addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
  $('#map').addEventListener('click', (e) => {
    if (!hpop || e.target.closest('.mm-node, .mm-pop') || !down) return;
    if (Math.abs(e.clientX - down[0]) + Math.abs(e.clientY - down[1]) < 5) closeHeadPop();
  });
}
// 标题节点上的快捷键（和原来的笔记导图一样）
function removeHeading(v) {
  const ed = headEd(), x = ed?.find(v.h.id);
  if (!x || S.mode !== 'local') return;
  if (x.text !== v.h.text || x.level !== v.h.level) return flash('标题刚发生了变化，请重新选中后删除。');
  const trail = [];
  for (let t = x; t.parent; t = t.parent) trail.unshift({ i: t.parent.children.indexOf(t), text: t.text, level: t.level });
  closeHeadPop(true);
  ed.run((d) => {
    let target = d.root;
    for (const t of trail) {
      target = target.children[t.i];
      if (!target || target.text !== t.text || target.level !== t.level) return { error: '主题刚发生了变化，请重新选中后删除。' };
    }
    return NM.remove(d, target);
  });
  // 标题只是笔记里的一节，删了随时能撤销：不弹确认，提示里给「撤销」
  const t = toast(`已删除「${esc(NM.plain(x.text))}」${x.children.length ? '和下面的子标题' : ''} <button data-undo>撤销</button><button data-x>关闭</button>`, 6000);
  t.querySelector('[data-undo]').onclick = () => { t.hidden = true; headEd()?.undo(); };
}
// 右键文件夹「新建标题」：笔记导图展开，在最后加一节，马上改名（还没选中就先打开它，笔记载入后再加，见 renderPanel 的 autoHead）
function newSection(p) {
  S.headsShown = p;
  if (S.open.has(p)) { S.open.delete(p); saveOpen(); }
  if (S.sel !== p || !headEd()) { S.autoHead = p; return openNode(p); }
  renderMap();
  addHeading(!S.heads?.doc);
}
// 在笔记最后加一节，马上改名。first = 空笔记的第一节（没起名就 Esc / 点走：撤回，不留空标题，笔记导图收起）
function addHeading(first) {
  const ed = headEd();
  if (!ed || S.mode !== 'local') return;
  closeHeadPop(true);
  ed.run((d) => NM.addChild(d, mapRoot(d)), { editNew: true, first: !!first });
}

function headKey(e, v) {
  const ed = headEd(), x = ed?.find(v.h.id);
  if (!ed || !x || S.mode !== 'local') return ['Tab', 'Enter', 'Delete', 'Backspace'].includes(e.key);
  const add = (fn) => ed.run((d) => fn(d, ed.find(x.id) || d.root), { editNew: true });
  if (e.key === 'Tab') { S.headOpen.add(v.id); add(NM.addChild); return true; }
  if (e.key === 'Enter' && e.shiftKey) { add(NM.addSiblingBefore); return true; }
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { openHeadPop(v); hpop?.live.focus(); return true; }
  if (e.key === 'Enter') { add(NM.addSibling); return true; }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    removeHeading(v);
    return true;
  }
  return commonKeys(e, ed, x);
}
// 笔记改了（导图上加 / 删 / 改标题、撤销，或者框里、右边写字）：更新导图上的标题；不是在右边全文里改的，右边换成最新的
function onNoteChange(n, note, line, opts) {
  setHeads(n.path, note);
  if (opts.keepPop) { placeHeadPop(); return; }
  // 框开着时结构变了（加 / 删 / 移动 / 撤销）：框里的内容可能不是最新的了，关掉，在新选中的标题上重新打开
  const wasOpen = !!hpop;
  closeHeadPop(true);
  const doc = S.heads?.doc;
  const target = doc && NM.findByLine(doc.root, line);
  if (target && target.kind === 'h') {
    for (let p = target.parent; p && p.kind === 'h'; p = p.parent) S.headOpen.add(headMapId(p.id));
    S.headSel = headMapId(target.id);
    renderMap();
    if (opts.editNew) { S.firstHead = opts.first ? S.headSel : null; setTimeout(() => map.edit(S.headSel), 260); }
    else map.el.focus({ preventScroll: true });
  }
  if (wasOpen && !opts.editNew && S.headSel && map.node(S.headSel)) openHeadPop(map.node(S.headSel));
}

// 工作区树 -> 导图数据（只含展开的部分；搜索时只留命中项和它们的上级）
function mapTree() {
  let q = S.query.toLowerCase();
  S.qOn = !!q;
  const match = (n) => S.contentHits?.has(n.path) || n.name.toLowerCase().includes(q) || (n.dir || '').toLowerCase().includes(q) || (n.note?.title || '').toLowerCase().includes(q);
  const conv = (n, isRoot) => {
    if (!q) {
      // 一个节点下面要么是笔记的标题（点了它），要么是子文件夹（点了 📁N），不混在一起
      const notesOpen = S.headsShown === n.path;
      const foldersOpen = !notesOpen && S.open.has(n.path);
      const heads = notesOpen ? headsOf(n) : [];
      // Retain collapsed folder children in the data model so ArrowRight/Space can still expand them.
      return withAgents({ id: n.path, n, closed: !foldersOpen, collapsed: notesOpen ? !heads.length : !foldersOpen, children: notesOpen ? heads : n.children.map((c) => conv(c, false)) });
    }
    const kids = n.children.map((c) => conv(c, false)).filter(Boolean);
    return match(n) || kids.length || isRoot ? { id: n.path, n, hit: match(n), collapsed: false, children: kids } : null;
  };
  // 聚焦：只显示你固定的文件夹 + 有 AI 在跑 / 等你的文件夹，平铺挂在根下，不再带出一路上级。
  // 固定文件夹里面的照常展开收起；已经在某个固定文件夹里的，不再单独列一遍
  if (S.view === 'work' && S.mode === 'local') {
    const pins = S.pins.filter((p) => index.has(p));
    const ais = mapAgents().map((a) => owner(a.path)).filter((p) => p && index.has(p));
    const all = [...new Set([...pins, ...ais])].filter((p) => !pins.some((x) => x !== p && p.startsWith(x + '/')));
    const root = withAgents({ id: '', n: S.data.tree, collapsed: false, children: all.map((p) => {
      const v = conv(index.get(p), false), up = p.split('/').slice(0, -1);
      if (up.length) v.where = up.length > 2 ? '…/' + up.slice(-2).join('/') : up.join('/');
      return v;
    }) });
    if (!all.length) root.n = { ...S.data.tree, name: '聚焦' };
    return root;
  }
  const top = index.get(S.focus) || S.data.tree;
  let root = conv(top, true);
  if (q && !root.hit && !root.children.length) { q = ''; S.qOn = false; root = conv(top, true); } // 一个都没命中：照常显示
  return root;
}

function renderMap() {
  if (!S.data) return; // 数据还没到（刚打开时地址栏里的 # 先触发了一次）
  if (!index.has(S.focus)) S.focus = '';
  map.setData(mapTree());
  map.render();
  if (S.headSel && map.node(S.headSel)) map.select(S.headSel, false);
  else if (S.sel !== null && index.has(S.sel)) { S.headSel = null; map.select(S.sel, false); }
  placeHeadPop();
  const chain = [];
  if (S.view !== 'work') for (let c = index.get(S.focus); c && c.path; c = c.parent) chain.unshift(c);
  $('#focus-crumbs').innerHTML = chain.length
    ? `<a data-focus="">${esc(S.data.tree.name)}</a>` + chain.map((c) => ` / <a data-focus="${esc(c.path)}">${esc(c.name)}</a>`).join('')
    : '';
  updateWorkspaceChrome();
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
  if (p) { S.open.add(p); saveOpen(); }
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

$('#map-view').addEventListener('click', (e) => {
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
    S.contentHits = new Set([...r.hits, ...(r.heads || [])].map((h) => h.path)); // 标题命中的文件夹也留在导图上
    renderMap();
    map.fit();
    renderResults(q, r);
  }, 120);
};

// 博客的全文搜索：第一次搜索时下载 search.json（每篇的纯文本），之后都在浏览器里搜；结果格式和本地服务的一样
let blogIndex;
async function blogSearch(q) {
  blogIndex ||= fetch('search.json').then((r) => r.json());
  const list = await blogIndex, ql = q.toLowerCase(), heads = [], hits = [];
  for (const d of list) {
    if (!d.x.toLowerCase().includes(ql)) continue;
    let fence = false, n = -1, head = '', body = [];
    const flush = () => {
      const text = body.join('\n'), low = text.toLowerCase();
      let i = low.indexOf(ql);
      if (i < 0) return;
      const first = i;
      let count = 0;
      while (i >= 0 && count < 999) { count++; i = low.indexOf(ql, i + ql.length); }
      const st = Math.max(0, first - 36);
      hits.push({ path: d.p, n, head, count, snippet: (st ? '…' : '') + text.slice(st, first + ql.length + 70).replace(/[#*`>|]+/g, ' ').replace(/\s+/g, ' ').trim() });
    };
    for (const line of d.x.split(/\r?\n/)) {
      if (/^\s*(```|~~~)/.test(line)) fence = !fence;
      const m = !fence && /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
      if (!m) { body.push(line); continue; }
      flush();
      n++; head = m[2].slice(0, 60); body = [];
      if (head.toLowerCase().includes(ql)) heads.push({ path: d.p, n, head, level: m[1].length });
    }
    flush();
  }
  hits.sort((a, b) => b.count - a.count);
  return { q, heads: heads.slice(0, 40), hits: hits.slice(0, 80), total: hits.length };
}

function renderResults(q, r) {
  const ql = q.toLowerCase();
  const names = [...index.values()].filter((n) => n.path && (n.name.toLowerCase().includes(ql) || n.dir.toLowerCase().includes(ql))).slice(0, 6);
  const heads = r?.heads || [], body = r?.hits || [];
  // 三层：文件夹 → 文章标题 → 标题下面的正文；点标题 / 正文都在导图上展开笔记、弹出那一节
  SR.items = [...names.map((n) => ({ path: n.path })), ...heads.map((x) => ({ path: x.path, find: q, at: { n: x.n, head: x.head } })), ...body.map((x) => ({ path: x.path, find: q, at: x.n === undefined ? null : { n: x.n, head: x.head } }))];
  SR.sel = 0;
  let h = '', k = 0;
  if (names.length) h += '<div class="sr-group">文件夹</div>' + names.map((n) =>
    `<div class="sr-item" data-i="${k++}"><div class="sr-t">${markQ(n.name, q)}</div><div class="sr-c">${esc(crumbOf(n))}</div></div>`).join('');
  if (heads.length) h += '<div class="sr-group">标题</div>' + heads.map((x) => {
    const n = index.get(x.path);
    return `<div class="sr-item" data-i="${k++}"><div class="sr-t"><span class="sr-h">${'#'.repeat(x.level || 2)}</span> ${markQ(x.head, q)}</div><div class="sr-c">${esc(n?.name || x.path)}</div></div>`;
  }).join('');
  if (body.length) h += `<div class="sr-group">正文 · ${r.total} 处</div>` + body.map((x) => {
    const n = index.get(x.path);
    return `<div class="sr-item" data-i="${k++}"><div class="sr-t">${esc(n?.name || x.path)}${x.head ? ' <span class="sr-h">›</span> ' + esc(x.head) : ''}<span class="sr-n">${x.count} 处</span></div>
      <div class="sr-s">${markQ(x.snippet, q)}</div></div>`;
  }).join('');
  if (!h) h = `<div class="sr-empty">${r ? '没有找到' : '搜索中…'}</div>`;
  results.innerHTML = h;
  const b = searchBox.getBoundingClientRect();
  results.style.top = b.bottom + 6 + 'px';
  results.style.left = Math.max(8, Math.min(b.left, innerWidth - results.offsetWidth - 8)) + 'px'; // 和搜索框左边对齐
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
  // 手机上的博客首页没有导图和侧栏：直接去文章页（找不到对应的文章链接，就去目录里那一项）
  if (S.mode === 'blog' && matchMedia('(max-width: 760px)').matches) {
    const a = [...document.querySelectorAll('#m-tree a')].find((x) => decodeURIComponent(x.pathname).replace(/\/$/, '').endsWith('/' + it.path));
    if (a) { location.href = a.href; return; }
  }
  if (it.find) { S.find = it.find; S.findAt = it.at || null; S.tab = 'note'; S.noteView = 'doc'; }
  // 已经选中的文件夹：面板不会重画，直接在导图上弹出
  if (it.find && S.sel === it.path && headEd()) { const q = S.find, at = S.findAt; S.find = S.findAt = null; return openFindPop(it.path, q, at); }
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
  if (S.mode !== 'local') S.panelClosed = false;
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
  // 两个视图是同一张导图，只是根不同：「全景」是整个工作区，「📌 聚焦」是加入聚焦的几个分支
  map.placed = false;
  renderMap();
  requestAnimationFrame(() => map.fit());
}
$('#views').addEventListener('click', (e) => { const b = e.target.closest('[data-view]'); if (b) setView(b.dataset.view); });

// ---------- 移动提醒 ----------
// 改名 / 移动之后会话自动跟着走、接着聊照常（见 studio.mjs 的 relocate、terminals.mjs 的 claudeFollow），不再需要提醒和手动迁移
function renderBanner() { $('#banner').hidden = true; }
$('#banner').addEventListener('click', (e) => { if (e.target.hasAttribute('data-close-report')) { e.target.parentElement.remove(); renderBanner(); } });

// ---------- 📌 聚焦：从大图里把固定的几个分支拎出来，放在同一张导图里 ----------
S.pins = store.get('pins', []);

const isPinned = (p) => S.pins.includes(p);
const inPins = (p) => S.pins.some((x) => p === x || p.startsWith(x + '/'));
const onPinPath = (p) => p === '' || inPins(p) || mapAgents().some((a) => owner(a.path) === p);
function togglePin(p) {
  S.pins = isPinned(p) ? S.pins.filter((x) => x !== p) : [...S.pins, p];
  store.set('pins', S.pins);
  updateWorkCount();
  renderMap();
  S.panelKey = '';
  renderPanel();
}
function updateWorkCount() {
  const ag = liveAgents(), wait = ag.filter((a) => a.status === 'waiting').length;
  const n = S.pins.length + ag.length;
  $('#work-count').textContent = n ? ` ${n}` : '';
  $('#work-count').className = wait ? 'wait' : ag.some((a) => a.status === 'running') ? 'live' : '';
  $('#work-count').title = ag.length ? `${S.pins.length} 个文件夹 · ${ag.length} 个 AI${wait ? `（${wait} 个等你回复）` : ''}` : '';
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
  return JSON.stringify([n.path, n.note?.mtime, S.tab === 'ai' ? sessions.map((a) => a.id + a.status + a.title) : 0, S.tab, S.noteView, !!S.reading]);
}

async function renderPanel(force) {
  if (S.agent) return renderAgentPanel(force);
  renderDock(index.get(S.sel));
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

  [...editors].forEach((e) => e !== hpop?.live && e.destroy()); // 导图上标题的编辑框不跟着面板重画
  await S.pendingSave;
  let { note, files = [] } = await getNote(n.path);
  if (!note && local) {
    note = { meta: { title: n.name }, body: '', file: absPath(n.path) + PATH_SEP() + n.dir + '.md', mtime: 0, offset: 4, virtual: true };
  }
  S.note = note ? { ...note, path: n.path } : null;
  if (!sameNode) { S.headSel = null; closeHeadPop(true); }
  S.noteEd = null;
  setHeads(n.path, note);

  const chain = [];
  for (let c = n; c; c = c.parent) chain.unshift(c);
  $('#crumbs').innerHTML = chain.slice(0, -1).map((c) => `<a href="#/${esc(c.path)}">${esc(c.name)}</a>`).join(' / ');

  // 标题、元信息、操作按钮
  const m = note?.meta || {};
  let top = `<div class="titlerow"><h1 class="title">${esc(m.title || n.name)}</h1><div class="meta">`;
  top += (n.note?.tags || []).map((t) => `<span class="chip">#${esc(t)}</span>`).join('');
  if (n.note?.date) top += `<span>${esc(n.note.date)}</span>`;
  top += '</div></div>';
  // 只标出「会公开到博客」（这个要一眼看到；其他操作都在导图的右键菜单里）
  if (local && n.path) {
    const tags = n.blog?.on ? '<span class="chip" title="会出现在博客里">🌐 公开</span>' : '';
    if (tags) top = top.replace('<div class="meta">', '<div class="meta">' + tags);
  }
  $('#panel-top').innerHTML = top;
  inlineCrumbs();
  // 工作台里右边只放会话：顶上压成一行小字（路径 / 名字 · 🌐 · 📂），大标题、日期都不要，地方留给终端
  // 工作台里右边只放会话：顶上那一行（路径、名字、按钮）都不要，会话标签直接顶到最上面
  document.body.classList.toggle('sessions-only', local);

  // 笔记的标题结构不再单独画一张导图：选中的文件夹，标题直接长在左边导图上它的下面（见 mapTree）
  S.noteView = 'doc';
  const views = '';
  const wide = n.path ? `${S.reading ? '<button data-wide title="还原宽度（Esc）">⤡</button>' : '<button data-wide title="放大：右边拉宽，导图留在左边（也可以在导图上双击）">⤢</button>'}` : '';
  const finder = local ? `<button data-reveal="${esc(n.path)}" title="在${PATH_SEP() === '/' ? '访达' : '资源管理器'}中打开${''}">📂</button>` : '';
  $('#panel-top .titlerow').insertAdjacentHTML('beforeend', `<span class="bacts">${views}${finder}${wide}</span>`);
  $('#tabs').hidden = true;

  syncAIPanel(n);
  updateWorkspaceChrome();
  if (!S.didFitCanvas) { S.didFitCanvas = true; requestAnimationFrame(() => requestAnimationFrame(() => map.fit(.7))); }
  const body = $('#panel-body');
  const scroll = sameNode ? body.scrollTop : 0;
  [...editors].forEach((e) => e !== hpop?.live && e.destroy()); // 导图上标题的编辑框不跟着面板重画
  body.className = '';
  S.noteMap = null;
  body.innerHTML = '';

  // 右边不再放笔记：笔记在左边导图上看、改（点文件夹或它下面的标题，旁边弹出编辑框）。这里只准备好改笔记用的对象
  if (note) {
    const ed = noteEditor(n, note, (doc, line, opts) => onNoteChange(n, note, line, opts));
    S.noteEd = { path: n.path, ed };
  }
  body.hidden = true;
  // 框开着、笔记在别处被改了（AI 改的、另一个编辑器）：没在框里打字就换成最新内容；这一节没了就关掉
  if (hpop && S.noteEd && !S.liveEditing) {
    const x = NM.locate(S.noteEd.ed.doc, hpop.at);
    if (!x) closeHeadPop(true);
    else if (NM.sectionOf(S.noteEd.ed.doc, x).md !== hpop.base) { const id = hpop.folder ?? headMapId(x.id); closeHeadPop(true); requestAnimationFrame(() => map.node(id) && openPop(id, x.id)); }
  }
  if (S.wantPop === n.path) { S.wantPop = null; requestAnimationFrame(() => openFolderPop(n.path)); }
  if (S.autoHead === n.path) { S.autoHead = null; requestAnimationFrame(() => addHeading(!note?.body?.trim())); }
  if (S.find) { const q = S.find, at = S.findAt; S.find = S.findAt = null; requestAnimationFrame(() => openFindPop(n.path, q, at)); }
  body.scrollTop = scroll;
}

// ---------- 博客 ----------
const BLOG_HOW = { self: '在博客显示（这个文件夹设的）', inherit: '在博客显示（跟随上级文件夹）' };
// 去掉这个文件夹自己的设置后会怎样：看上级里最近的设置，都没有就不公开
function inheritedBlog(n) {
  for (let c = n.parent; c; c = c.parent) if (c.blog?.how === 'self') return c.blog.on;
  return false;
}
// 「🌐 博客」按钮上的数字 = 还没上传的文章（新增 + 修改 + 删除）。公开设置、改文章都不会自动上传，靠这个提醒
const pubCount = (p) => (p ? p.added.length + p.changed.length + p.removed.length : 0);
const pubSummary = (p) => [['新增', p.added], ['修改', p.changed], ['删除', p.removed]].filter(([, l]) => l.length).map(([k, l]) => `${k} ${l.length}`).join(' · ');
function renderPubBadge(p) {
  const n = pubCount(p), btn = $('#pub-btn');
  btn.innerHTML = ic('globe') + '<span>博客</span>' + (n ? `<span class="pub-n">${n}</span>` : '');
  btn.title = n ? `${n} 篇待上传（${pubSummary(p)}）` : p ? '博客已是最新' : '上传博客';
}
// 博客弹框：只放必要的——增删改各几篇、是哪几篇；有改动就「上传」，没改动就「打开博客」。
// 不生成、不预览：点开就是现成的结果（数字后台一直在算）；真正上传时才生成
const pubRows = (p) => `<ul class="pub-list">${[['新增', 'add', p.added], ['修改', 'mod', p.changed], ['删除', 'del', p.removed]]
  .filter(([, , l]) => l.length)
  .map(([k, c, l]) => `<li><span class="pub-k ${c}">${k} ${l.length}</span>${l.slice(0, 6).map((x) => `<span class="pub-a" title="${esc(x.path)}">${esc(x.name)}</span>`).join('')}${l.length > 6 ? `<span class="pub-more">…</span>` : ''}</li>`).join('')}</ul>`;
$('#pub-btn').onclick = async () => {
  await refresh();
  const p = S.data.pub, n = pubCount(p);
  const dlg = document.createElement('div');
  dlg.id = 'pub-dlg';
  dlg.innerHTML = '<div class="box"></div>';
  document.body.appendChild(dlg);
  const box = dlg.firstChild, close = () => { clearInterval(dlg.timer); dlg.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg || e.target.dataset.close !== undefined) return close();
    const s = e.target.closest('[data-site]');
    if (s) { window.open(s.dataset.site, '_blank'); close(); }
  });
  const fail = (title, msg) => { box.innerHTML = `<h3>${title}</h3><pre>${esc(msg)}</pre><div class="row"><button data-close>关闭</button></div>`; };
  const row = (html) => { box.querySelector('.row').innerHTML = html; };
  // 没设过上传仓库：还没上传过，公开的文章都是新的
  const pubs = p ? 0 : [...index.values()].filter((x) => x.blog?.on && x.note).length;
  if (p && !n) {
    box.innerHTML = `<p class="pub-ok">✓ 已是最新</p><div class="row"><button class="primary" data-site="${esc(p.url)}">打开博客</button></div>`;
    return;
  }
  box.innerHTML = `${p ? pubRows(p) : `<ul class="pub-list"><li><span class="pub-k add">新增 ${pubs}</span><span class="pub-more">第一次上传</span></li></ul>`}
    <div class="row"><button class="primary" data-up>上传</button></div>`;
  await new Promise((ok) => { box.querySelector('[data-up]').onclick = ok; });
  row('<span class="msg">上传中…</span>');
  let r;
  for (;;) {
    try { r = await post('api/blog/publish/prepare', {}); break; }
    catch (err) {
      if (err.need !== 'remote') return fail('没法上传', err.message);
      box.innerHTML = `<h3>上传到哪个仓库？</h3>
        <p class="grp">在 GitHub 新建一个名为 <b>用户名.github.io</b> 的仓库（空的就行），把地址填在这里。博客地址就是 https://用户名.github.io/</p>
        <p><input class="remote" placeholder="git@github.com:用户名/用户名.github.io.git" style="width:100%"></p>
        <p class="msg"></p>
        <div class="row"><button class="primary" data-save>上传</button><button data-close>取消</button></div>`;
      const inp = box.querySelector('.remote');
      inp.focus();
      await new Promise((ok) => {
        const save = async () => {
          try { await post('api/blog/remote', { remote: inp.value }); ok(); } catch (e) { box.querySelector('.msg').textContent = e.message; }
        };
        box.querySelector('[data-save]').onclick = save;
        inp.onkeydown = (e) => { if (e.key === 'Enter') save(); };
      });
      box.innerHTML = '<div class="row"><span class="msg">上传中…</span></div>';
    }
  }
  const done = (url) => `<span class="pub-ok">✓ 已上传，约 1 分钟后生效</span>${url ? `<a class="pub-site" data-site="${esc(url)}">打开博客</a>` : ''}`;
  if (!r.total) { row(done(r.url)); refresh(); return; }
  try { await post('api/blog/publish/push', {}); } catch (err) { return fail('上传失败', err.message); }
  dlg.timer = setInterval(async () => {
    const st = await (await fetch('api/blog/publish/status')).json();
    if (st.state === 'pushing') row(`<span class="msg">上传中… ${Math.round((Date.now() - st.started) / 1000)} 秒</span>`);
    else if (st.state === 'done') { clearInterval(dlg.timer); row(done(st.url)); refresh(); }
    else if (st.state === 'error') { clearInterval(dlg.timer); fail('上传失败', st.log); }
  }, 1500);
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
// 博客（电脑上）：导图占满整个窗口，文章不常驻右边——点文章（或它在导图上的标题）才从右边滑出一张阅读卡片，× / Esc 收起
const sheetMode = () => S.mode === 'blog' && !S.reading && !matchMedia('(max-width: 760px)').matches;
const blogHeadCache = new Map();
function blogHeadsFrom(root) {
  const kids = [];
  let cur = null;
  for (const h of root.querySelectorAll('h2[id], h3[id]')) {
    const x = { id: h.id, text: h.textContent.trim(), children: [] };
    if (h.tagName === 'H2' || !cur) { kids.push(x); if (h.tagName === 'H2') cur = x; } else cur.children.push(x);
  }
  return kids;
}
function setBlogHeads(path, kids) {
  const sig = 'b|' + path + '|' + JSON.stringify(kids);
  if (S.heads?.sig === sig) return;
  S.heads = { path, kids, doc: null, sig };
  if (S.data) renderMap();
}
async function articleHtml(n) {
  if (!blogHeadCache.has(n.url)) blogHeadCache.set(n.url, fetch(n.url).then((r) => r.text()).then((t) => new DOMParser().parseFromString(t, 'text/html').querySelector('.post-body')?.innerHTML || '').catch(() => ''));
  return blogHeadCache.get(n.url);
}
async function loadBlogHeads(n) {
  const html = await articleHtml(n);
  const d = document.createElement('div');
  d.innerHTML = html;
  if (S.sel === n.path) setBlogHeads(n.path, blogHeadsFrom(d));
}
// 在导图上点了文章的某个标题：打开阅读卡片，滚到这一节
function readAt(id) {
  S.readAnchor = id;
  if (!S.sheet || $('#panel').hidden) { S.sheet = true; S.panelClosed = false; S.panelKey = ''; return renderPanel(true); }
  scrollToAnchor();
}
function scrollToAnchor() {
  const id = S.readAnchor;
  if (!id) return;
  const el = $('#panel-body').querySelector('#' + CSS.escape(id));
  if (!el) return;
  S.readAnchor = null;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
// 博客（电脑上）和工作台一样只有导图：取文章的 md 原文，做成只读的笔记对象，标题长在导图上、点标题弹出只读的框
const blogMd = new Map();
async function loadBlogNote(n) {
  if (!n.url || !n.file) { if (S.heads?.path !== n.path) setHeads(n.path, null); return; }
  if (!blogMd.has(n.url)) blogMd.set(n.url, fetch(n.url + encodeURIComponent(n.file)).then((r) => (r.ok ? r.text() : '')).catch(() => ''));
  const md = await blogMd.get(n.url);
  if (S.sel !== n.path) return;
  const fm = /^\uFEFF?---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(md);
  const note = { body: fm ? md.slice(fm[0].length) : md, meta: { title: n.note?.title || '' }, mtime: 0 };
  const title = note.meta.title || n.name;
  const ed = { title, doc: NM.parse(note.body, title), busy: Promise.resolve(), run: () => Promise.resolve(), undo() {}, redo() {} };
  ed.find = (id) => { let r = null; const w = (x) => { if (x.id === id) r = x; x.children.forEach(w); }; w(ed.doc.root); return r; };
  S.noteEd = { path: n.path, ed };
  setHeads(n.path, note);
  if (S.find) { const q = S.find, at = S.findAt; S.find = S.findAt = null; requestAnimationFrame(() => openFindPop(n.path, q, at)); }
}
async function renderBlogPanel(n, force) {
  if (!matchMedia('(max-width: 760px)').matches) {
    document.body.classList.remove('blog-sheet');
    $('#panel').hidden = true;
    $('#resizer').hidden = true;
    S.panelNode = n.path;
    return loadBlogNote(n);
  }
  const sheet = sheetMode();
  document.body.classList.toggle('blog-sheet', sheet);
  const key = 'b:' + n.path + (S.reading ? ':read' : '') + (sheet && !S.sheet ? ':shut' : '');
  if (!force && S.panelKey === key) return;
  S.panelKey = key;
  S.panelNode = n.path;
  if (n.url) loadBlogHeads(n); else if (S.heads?.path !== n.path) setBlogHeads(n.path, []);
  if (sheet && (!n.url || !S.sheet)) { $('#panel').hidden = true; $('#resizer').hidden = true; return; }
  const chain = [];
  for (let c = n; c; c = c.parent) chain.unshift(c);
  $('#crumbs').innerHTML = chain.slice(0, -1).map((c) => `<a href="#/${esc(c.path)}">${esc(c.name)}</a>`).join(' / ');
  const m = n.note || {};
  // 一行放下：标题、标签、日期，右边是「文档 / 导图」和 ⤢ 放大
  const meta = (m.tags || []).map((t) => `<span class="chip">#${esc(t)}</span>`).join('') + (m.date ? `<span>${esc(m.date)}</span>` : '');
  S.noteView = 'doc'; // 文章的标题直接长在左边导图上，不再单独切「导图」
  const acts = n.path ? `<span class="bacts">${S.reading ? '<button data-wide title="还原宽度（Esc）">⤡</button>' : '<button data-wide title="放大：右边拉宽，导图留在左边（也可以在导图上双击）">⤢</button>'}</span>` : '';
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
  const html = await articleHtml(n);
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
  if (sheet) $('#resizer').hidden = true;
  requestAnimationFrame(scrollToAnchor);
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
  if (!all.length) {
    if (S.mode !== 'local' || S.data.tree.children.length) return '';
    // 空的工作台：告诉新用户怎么开始
    return `<div class="section welcome"><h4>开始</h4>
      <p>导图就是这个文件夹：<b>每个子文件夹是一个节点</b>，里面的同名 <code>.md</code> 就是它的笔记。</p>
      <p><button class="primary" data-new-root>＋ 新建第一个文件夹</button></p>
      <ul>
        <li>选中节点按 <kbd>Tab</kbd> 建子文件夹，<kbd>Enter</kbd> 建同级，<kbd>F2</kbd> 改名，右键看全部操作</li>
        <li>已有的文件夹直接放进 <code>${esc(S.data.root || '')}</code>，就会出现在导图上</li>
        <li>想公开到博客的文件夹，右键选 🌐 公开，再点右上角「🌐 博客」</li>
      </ul></div>`;
  }
  return `<div class="section list"><h4>最近更新</h4>${all.slice(0, 20).map((n) =>
    `<a href="#/${esc(n.path)}"><span class="t">${esc(n.note.title || n.name)}</span><span class="d">${esc(n.note.date)}</span>
     ${n.note.excerpt ? `<div class="e">${esc(n.note.excerpt)}</div>` : ''}</a>`).join('')}</div>`;
}

// ---------- AI：导图上的小圆点 + 面板下面的 AI 栏 ----------
// 会话的名字：你起的名字 / 任务标题；都没有（比如命令行里开的、还没提问）就叫「新会话 14:05」
const agentLabel = (a) => {
  const t = agentTitle(a);
  if (t && t !== '（无标题）' && t !== a.tool && !agentDef(t)) return t;
  // 没名字：工作台里刚开的叫「新会话」；别处的、一句话没问过的叫「空会话」（带上日期，方便认）
  const d = new Date(a.mtime), pad = (x) => String(x).padStart(2, '0');
  const when = (new Date().toDateString() === d.toDateString() ? '' : `${d.getMonth() + 1}-${d.getDate()} `) + `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return `${!a.term && !a.prompt ? '空会话' : '新会话'} ${when}`;
};
const ago = (t) => {
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? '刚刚' : m < 60 ? m + ' 分钟前' : m < 1440 ? Math.round(m / 60) + ' 小时前' : new Date(t).toLocaleDateString('zh-CN');
};
const active = (list) => list.filter((a) => a.status === 'running' || a.status === 'waiting');
// AI 停下来等你回复时发系统通知；点通知直接打开这个会话（第一次加载不提醒以前的）
function notifyWaiting(agents, first) {
  const prev = S.prevStatus || new Map();
  S.prevStatus = new Map(agents.map((a) => [a.id, a.status]));
  if (first || S.mode !== 'local' || !('Notification' in window)) return;
  for (const a of agents) {
    if (a.status !== 'waiting' || prev.get(a.id) === 'waiting' || (!prev.has(a.id) && a.mtime < Date.now() - 60000)) continue;
    const go = () => {
      if (Notification.permission !== 'granted') return;
      const folder = index.get(owner(a.path));
      const n = new Notification(`${TOOL[a.tool] || a.tool} 等你回复`, { body: `${folder?.path ? folder.name : S.data.tree.name} · ${agentLabel(a)}`, tag: a.id });
      n.onclick = () => { window.focus(); openAgent(a.id); };
    };
    Notification.permission === 'default' ? Notification.requestPermission().then(go) : go();
  }
}

// ---------- 导图上的 AI：点了在右边看它的终端（工作台自己托管，见 agents.js 和 lib/terminals.mjs） ----------
// S.agent：选中的 AI 的 id；'new:<文件夹>' 表示在这个文件夹新建会话
const termInfo = () => S.data.terminal || { ok: false, why: '', agents: [] };
// 能不能在这里接着聊：Claude / Codex 的对话、这台电脑能开终端；在别处跑着的不行——
// 除非是 Claude 且知道开着它的进程（openPid），那可以「关掉那边，在这里接着聊」
const canResume = (a) => !a.term && AGENT_ID[a.tool] && a.sessionId && termInfo().ok && (a.status !== 'running' || !!a.openPid);
// 接着聊：开着它的那个进程要先关掉（问过你），不然两边同时往一份对话记录里写会乱
async function resumeSession(a) {
  if (a.openPid && !confirm(`这段对话正开在别的终端里（进程 ${a.openPid}）${a.status === 'running' ? '，而且正在干活，关掉会打断它' : ''}。\n\n关掉那边，在这里接着聊？`)) return null;
  const s = await post('api/session/new', { agent: AGENT_ID[a.tool], path: a.path, title: agentLabel(a), resume: a.sessionId, takeover: !!a.openPid });
  await refresh();
  return 'term:' + s.name;
}
// 不是在这里开的会话（这里没有它的终端）：说明它在哪，最后的提问和回复；能接着聊就给按钮（attr：按钮的 data 属性）
function logView(a, attr) {
  const busy = a.status === 'running';
  const gone = a.gonePath ? `它的文件夹「${esc(a.gonePath)}」已经不在了，先挂在上级这里。` : '';
  const where = a.orphan ? `${gone}⚠ 失联：这个 AI 进程（进程 ${a.openPid}${a.cpu ? `，正占着 ${Math.round(a.cpu)}% CPU` : ''}）开它的终端已经关掉了，但它自己没退出。没人能再和它对话，留着只会占资源。`
    : a.openPid ? `${gone}这段对话正开在别的终端里（进程 ${a.openPid}${busy ? '，正在干活' : ''}），这里看不到那边的终端。`
    : busy ? '这个会话正在别的终端里跑，这里看不到它的终端。等它停下、在那边退出后，可以在这里接着聊。'
    : a.status === 'waiting' ? '如果它还开在别的终端里，先在那边退出，再在这里接着聊（两边同时用，对话记录会乱）。' : '';
  // 程序调起的一次性运行（claude -p / SDK、codex exec），和一句话都没问过的会话：说一声是怎么回事
  const what = a.via === 'sdk' ? '这是程序调起的一次性运行（claude -p / SDK 或 codex exec），不是在终端里开的会话。'
    : !a.prompt && !a.orphan ? '这个会话里没问过话（可能只是打开过、或者只用过 /resume 之类的命令）。' : '';
  const kill = a.openPid && !a.term ? `<p><button class="${a.orphan ? 'primary danger' : 'danger'}" data-kill-pid="${a.openPid}">结束这个进程</button></p>` : '';
  const btn = kill + (canResume(a) && !a.orphan ? `<p><button ${attr}>${a.openPid ? '关掉那边，在这里接着聊' : '在这里打开终端，接着这个会话'}</button></p>` : '');
  return (what ? `<p class="hint">${what}</p>` : '') + (where ? `<p class="hint">${where}</p>` : '') + btn
    + (a.prompt ? `<h4>最后的提问</h4><div class="q">${esc(a.prompt)}</div>` : '') + (a.reply ? `<h4>最后的回复</h4><div class="r">${esc(a.reply)}</div>` : '');
}
// AI 栏里放哪些会话（每类有几个只在导图上显示）。范围：从导图圆点点进来的和那个圆点一样（展开的文件夹只算自己的），否则算上子文件夹。
// 放哪几类：点了导图上的某类圆点就只放这一类；点文件夹本身回到默认——放开着的（🟢 🟠），一个开着的都没有就放历史的（⚪）
function dockList(n) {
  const F = S.dockFilter;
  const all = (F && !F.deep ? agentsAt : agentsUnder)(n.path).filter((x) => !isHidden(x));
  const count = { run: 0, idle: 0, off: 0 };
  for (const x of all) count[catOf(x)]++;
  const anyOpen = count.run + count.idle > 0;
  const showCat = (k) => (F ? F.cat === k : !anyOpen || k !== 'off');
  const list = all.filter((x) => showCat(catOf(x))).sort((x, y) => (catOf(x) === 'off' && catOf(y) === 'off' ? y.mtime - x.mtime : byStatus(x, y)));
  return { all, count, showCat, list };
}
// 打开一个 AI：工作台里在面板下半部分打开（上半部分的笔记留着，可以边看边写）
function openAgent(id) {
  S.panelClosed = false;
  S.panelRequested = true;
  store.set('panelClosed', false);
  if (S.mode === 'local') {
    const a = S.data.agents.find((x) => x.id === id);
    const folder = id.startsWith('new:') ? id.slice(4) : a ? owner(a.path) : S.sel || '';
    S.dockAgent = id;
    if (S.sel !== folder) { location.hash = '#/' + folder; return; }
    renderMap();
    return renderDock(index.get(folder), true);
  }
  S.agent = id;
  S.panelKey = '';
  renderMap();
  renderPanel(true);
}
function closeAgent() { S.agent = null; S.panelKey = ''; renderMap(); renderPanel(true); }

// ---------- 右边的标签：「笔记」+ 这个文件夹的 AI 会话 ----------
// 标题下面一排标签，第一个固定是这个文件夹的笔记，后面每个会话一个；选中哪个，下面整栏就是哪个（终端占满高度）。
// 会话标签显示它的终端（命令行里开的显示最后的提问和回复），「＋」新开一个。
// 只有换了选中的会话才重建终端，状态变化只更新标签，所以不会断线重连
function showNoteBody(on) {
  $('#panel-body').hidden = !on;
  $('#dock-body').hidden = on;
}
function renderDock(n, force) {
  updateWorkspaceChrome();
  const dock = $('#dock');
  if (S.mode !== 'local' || !n || S.agent || S.tab === 'ai') {
    dock.hidden = true;
    showNoteBody(true);
    S.dockLive?.destroy(); S.dockLive = null; S.dockKey = '';
    return;
  }
  // 选中的文件夹里没有会话：AI 栏留在刚才那个文件夹的会话上（不能点个文件夹看笔记，终端就没了）；「+」还是在选中的文件夹里新建
  const sel = n;
  const keep = S.dockPath !== undefined && S.dockPath !== n.path && index.get(S.dockPath);
  if (keep && !S.dockFilter && S.dockAgent !== 'new:' + n.path && !dockList(n).list.length && dockList(keep).list.length) n = keep;
  else S.dockPath = n.path;
  if (S.dockFilter && S.dockFilter.path !== n.path) S.dockFilter = null;
  // 只看的那一类已经一个都不剩了（比如刚把唯一一个开着的关掉）：回到默认，不然 AI 栏空着，像是会话没了
  if (S.dockFilter && !dockList(n).list.length) S.dockFilter = null;
  const { all, list } = dockList(n);
  let cur = S.dockAgent;
  if (cur && !cur.startsWith('new:') && !all.some((x) => x.id === cur)) cur = null;
  if (cur?.startsWith('new:') && cur.slice(4) !== n.path) cur = null;
  if (!cur && list.length) cur = S.dockAgent = list[0].id;
  const a = cur && !cur.startsWith('new:') ? S.data.agents.find((x) => x.id === cur) : null;
  // 正在看的会话不在这一类里（比如刚接着聊、状态变了），也留在标签里
  const tabs = a && !list.includes(a) ? [...list, a] : list;
  dock.hidden = false;
  showNoteBody(false);
  // 每个会话一个标签：状态点、名字、×（关掉 / 删除）；双击改名，右键更多，中键关掉
  const tab = (x) => {
    const kind = (TOOL[x.tool] || x.tool) + (x.via === 'sdk' ? '（程序调起）' : '');
    const where = owner(x.path) !== n.path ? ` · 在「${index.get(owner(x.path))?.name || ''}」里` : '';
    const label = agentLabel(x);
    return `<div class="dtab${x.id === cur ? ' on' : ''}" data-dock="${esc(x.id)}" title="${esc(label)}&#10;${esc(kind)} · ${CAT[catOf(x)]}${esc(where)}&#10;双击改名 · 右键更多 · 中键关掉"><span class="ag-dot cat-${catOf(x)}"></span><span class="dt-name">${x.orphan ? '⚠ ' : ''}${esc(label)}</span><button class="dt-x" data-dock-close="${esc(x.id)}" title="${x.term ? '关掉或删除这个会话' : '删除这个会话'}">${ic('x', 12)}</button></div>`;
  };
  const where = sel.path ? sel.name : S.data.tree.name;
  $('#dock-tabs').innerHTML = `<div class="dtabs">${tabs.map(tab).join('')}<button class="dt-new" data-dock-act="new" title="在「${esc(where)}」里开一个新会话"${cur?.startsWith('new:') ? ' disabled' : ''}>${ic('plus')}</button></div><button class="icon dt-close" data-workspace-close title="收起 AI 栏" aria-label="收起 AI 栏">${ic('x', 14)}</button>`;
  dock.classList.toggle('no-tabs', !tabs.length);
  // 标签多了放不下时横着滚：正在看的那个滚到看得见的地方
  $('#dock-tabs .dtab.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  const key = cur ? cur + (a ? ':' + (a.term ? 'term' : 'log:' + a.status + ':' + (a.openPid || '')) : '') : 'empty:' + n.path;
  if (!force && key === S.dockKey) return;
  S.dockKey = key;
  S.dockLive?.destroy(); S.dockLive = null;
  const body = $('#dock-body');
  body.innerHTML = '';
  if (!cur) {
    body.innerHTML = `<div class="dock-empty"><p class="de-s">${n.path ? `在「${esc(where)}」里还没有 AI 会话` : '选一个文件夹，在那里开 AI 会话'}</p><button class="primary" data-dock-act="new">${ic('plus')}新建会话</button></div>`;
    return;
  }
  if (cur.startsWith('new:')) {
    S.dockLive = AG.newForm(body, termInfo(), n.path, n.path ? n.name : S.data.tree.name, { note: n.note ? n.dir + '.md' : '', onDone: async (id) => { S.dockAgent = id; S.dockFilter = null; await refresh(); renderDock(index.get(S.sel), true); }, onCancel: () => { S.dockAgent = null; renderDock(n, true); } });
  } else if (a?.term) S.dockLive = AG.terminalView(body, a.term, { newline: agentDef(a.tool)?.newline });
  else if (a) {
    // 自己在终端里开的 Claude / Codex：这里没有它的终端，显示最后的提问和回复；可以在这里接着聊
    body.innerHTML = `<div class="ag-log pad">${logView(a, 'data-dock-act="resume"')}</div>`;
  }
}
$('#panel-body').addEventListener('click', (e) => { if (e.target.closest('[data-new-root]')) newFolder(''); });
const onDockClick = async (e) => {
  const n = index.get(S.sel);
  if (e.target.closest('[data-workspace-close]')) return closePanel();
  const x = e.target.closest('[data-dock-close]');
  if (x) { e.stopPropagation(); return deleteAgent(x.dataset.dockClose); }
  const t = e.target.closest('[data-dock], [data-dock-act]');
  if (!t) return;
  if (t.dataset.dock) {
    // 双击改名：第一下会重画标签栏（换了选中的），浏览器就不认双击了，所以自己按「同一个标签、两下挨得很近」来认
    const now = Date.now(), last = S.lastTabClick;
    S.lastTabClick = { id: t.dataset.dock, at: now };
    if (last?.id === t.dataset.dock && now - last.at < 450) { S.lastTabClick = null; return renameAgent(S.data.agents.find((y) => y.id === t.dataset.dock)); }
    if (S.dockAgent === t.dataset.dock) return;
    S.dockAgent = t.dataset.dock;
    return renderDock(n);
  }
  const act = t.dataset.dockAct, id = S.dockAgent;
  if (act === 'new') { S.panelClosed = false; S.panelRequested = true; S.dockAgent = 'new:' + n.path; return renderDock(n, true); }
  if (act === 'note') return agentToNote(id);
  if (act === 'resume') {
    const a = S.data.agents.find((y) => y.id === id);
    try { const nid = await resumeSession(a); if (!nid) return; S.dockAgent = nid; S.dockFilter = null; renderDock(index.get(S.sel), true); }
    catch (err) { alert(err.message); }
  }
};
$('#dock').addEventListener('click', onDockClick);
// 结束本机上一个 AI 进程（别处开着的、终端没了的）：工作台只认它自己扫到的 AI 进程
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-kill-pid]');
  if (!b) return;
  const a = S.data.agents.find((x) => x.openPid === Number(b.dataset.killPid));
  if (!a?.orphan && !confirm(`它还开在别的终端里（进程 ${b.dataset.killPid}），结束后那边的会话也会停下。\n\n结束这个进程？`)) return;
  b.disabled = true; b.textContent = '正在结束…';
  try { await post('api/agent/kill', { pid: Number(b.dataset.killPid) }); S.dockAgent = null; refresh(); }
  catch (err) { alert(err.message); b.disabled = false; b.textContent = '结束这个进程'; }
});
$('#dock-body').addEventListener('click', onDockClick);
// 标签栏放不下时：鼠标滚轮上下滚 = 标签左右滚
$('#dock-tabs').addEventListener('wheel', (e) => {
  const strip = e.target.closest('.dtabs');
  if (!strip || Math.abs(e.deltaY) <= Math.abs(e.deltaX) || strip.scrollWidth <= strip.clientWidth) return;
  strip.scrollLeft += e.deltaY;
  e.preventDefault();
}, { passive: false });
// 标签：中键关掉、右键更多（和浏览器标签页一样；双击改名在上面的点击里）
$('#dock-tabs').addEventListener('auxclick', (e) => {
  const t = e.target.closest('.dtab');
  if (e.button === 1 && t) { e.preventDefault(); deleteAgent(t.dataset.dock); }
});
$('#dock-tabs').addEventListener('contextmenu', (e) => {
  const t = e.target.closest('.dtab');
  const a = t && S.data.agents.find((y) => y.id === t.dataset.dock);
  if (!a) return;
  e.preventDefault();
  showCtx(agentMenu(a), e.clientX, e.clientY);
});

function renderAgentPanel(force) {
  const id = S.agent;
  const isNew = id.startsWith('new:');
  const a = isNew ? null : S.data.agents.find((x) => x.id === id);
  const folder = isNew ? id.slice(4) : a ? owner(a.path) : S.sel || '';
  // 终端只在换了对象时才重建，状态变化只更新标题栏（不然终端会断开重连）
  const view = isNew ? 'new:' + folder : a?.term ? 'term:' + a.term : a ? 'log:' + a.id + ':' + a.status + ':' + (a.openPid || '') : 'gone';
  const key = JSON.stringify([id, view]);
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
  if (isNew) { title = '新会话'; meta = `<span>在「${esc(index.get(folder)?.name || folder || S.data.tree.name)}」里</span>`; }
  else if (!a) title = '这个 AI 已经结束';
  else {
    const kind = (TOOL[a.tool] || a.tool) + ' 会话';
    title = agentTitle(a);
    // 一行放不下所有信息：状态最要紧，类型和时间放到悬停提示里
    meta = `<span class="ag-status" title="${esc(kind)} · ${ago(a.mtime)}"><span class="ag-dot ag-${a.status}"></span>${STATUS[a.status]}</span>`;
    acts += '<button data-agent-note title="把它的结论追加到这个文件夹笔记的「记录」里（先给你看、可以改）">写入笔记</button>';
    acts += '<button data-agent-end title="关掉它的终端，从图上拿掉">删除</button>';
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
  if (isNew) S.agentLive = AG.newForm(body, termInfo(), folder, index.get(folder)?.name || folder, { onDone: async (nid) => { await refresh(); openAgent(nid); }, onCancel: closeAgent });
  else if (!a) body.innerHTML = '<div class="empty pad center">会话已经结束，或者已经删掉了。</div>';
  else if (a.term) S.agentLive = AG.terminalView(body, a.term, { newline: agentDef(a.tool)?.newline });
  else {
    // 命令行里开的 Claude / Codex：没有终端可看，可以在这里接着聊，之后就有终端了
    body.className = '';
    body.innerHTML = `<div class="ag-log">${logView(a, 'data-agent-resume')}</div>`;
  }
}

async function resumeAgent(a) {
  try { const id = await resumeSession(a); if (id) openAgent(id); } catch (err) { alert(err.message); }
}
// AI 结论写入笔记：取会话最后的提问和回复；先在小窗里给你改
async function agentToNote(id = S.agent) {
  const a = S.data.agents.find((x) => x.id === id);
  if (!a) return;
  const folder = owner(a.path);
  const kind = TOOL[a.tool] || a.tool;
  const content = [a.prompt && '> ' + a.prompt.trim().split('\n').join('\n> '), a.reply].filter(Boolean).join('\n\n');
  const d = new Date(), pad = (x) => String(x).padStart(2, '0');
  const head = `### ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${kind}：${agentTitle(a)}`;
  editDialog(`写入「${index.get(folder)?.name || folder || S.data.tree.name}」的笔记`, head + '\n\n' + (content || '（这里写结论）'), async (text) => {
    await post('api/note/append', { path: folder, text });
    flash('已写入笔记的「记录」');
    S.panelKey = '';
    refresh();
  });
}

// 标签上的 ×、右键菜单：两种处理，和你想的一样——
//   关掉终端：agent 进程关掉，会话留在历史里（⚪），以后可以接着聊
//   删除会话：连 Claude / Codex 存在这台电脑上的对话记录一起删，找不回来
// 开在别的终端里的会话：从这里关不掉也不能删记录（那边还在写），只能「不在这里显示」
async function deleteAgent(id = S.agent) {
  const a = S.data.agents.find((x) => x.id === id);
  if (!a) return;
  const convo = convoOf(a), agent = AGENT_ID[a.tool], elsewhere = !a.term && !!a.openPid;
  const canWipe = !!(convo && agent && agentDef(a.tool).wipe) && !elsewhere;
  const ok = await new Promise((done) => {
    const dlg = document.createElement('div');
    dlg.id = 'pub-dlg';
    const close = a.term ? '<button class="primary" data-close-only>关掉终端</button>' : '';
    const del = elsewhere ? `<button class="primary danger" data-kill-pid="${a.openPid}">结束这个进程</button><button data-ok>不在这里显示</button>` : `<button class="${a.term ? 'danger' : 'primary danger'}" data-ok>删除会话</button>`;
    dlg.innerHTML = `<div class="box"><h3>「${esc(agentLabel(a))}」</h3>
      ${a.term ? '<p><b>关掉终端</b>：AI 停下，会话留在历史里（⚪），以后可以接着聊。</p>' : ''}
      ${elsewhere ? `<p>${a.orphan ? `⚠ 它已经失联（开它的终端没了，进程 ${a.openPid} 还在）。` : `它正开在别的终端里（进程 ${a.openPid}）。`}可以<b>结束这个进程</b>；也可以只让它不在这里显示，${a.orphan ? '但它会一直占着资源' : '那边不受影响'}。</p>`
        : `<p><b>删除会话</b>：${canWipe ? `连同 ${esc(TOOL[a.tool] || a.tool)} 存在这台电脑上的对话记录一起删掉，<b>删了找不回来</b>。` : '从导图和 AI 栏里拿掉。'}</p>`}
      <div class="row">${close}${del}<button data-no>取消</button></div></div>`;
    document.body.appendChild(dlg);
    const end = (v) => { dlg.remove(); done(v); };
    dlg.querySelector('[data-close-only]')?.addEventListener('click', () => end({ close: true }));
    dlg.querySelector('[data-ok]').onclick = () => end({ wipe: canWipe });
    dlg.querySelector('[data-no]').onclick = () => end(null);
    dlg.onclick = (e) => { if (e.target === dlg) end(null); };
    dlg.querySelector('[data-kill-pid]')?.addEventListener('click', () => setTimeout(() => end(null)));
  });
  if (!ok) return;
  if (ok.close) return closeSession(a);
  const next = neighborTab(a.id);
  try {
    if (a.term) await AG.endSession(a.term).catch(() => {});
    if (ok.wipe) await AG.wipeConversation(agent, convo).catch((err) => { throw new Error('对话记录没删掉：' + err.message); });
  } catch (err) { alert(err.message); }
  // 会话本身和它关联的对话记录都不再显示
  const ids = [a.id, convo && 'c:' + convo].filter(Boolean);
  store.set('hiddenAgents', [...new Set([...store.get('hiddenAgents', []), ...ids])].slice(-2000));
  if (S.dockAgent === a.id) S.dockAgent = next;
  S.mapKey = '';
  await refresh();
  renderMap();
  renderDock(index.get(S.sel), true);
}
// 只关掉：终端和 agent 进程关掉，会话留在历史里
async function closeSession(a) {
  const next = neighborTab(a.id);
  await AG.endSession(a.term).catch((err) => alert(err.message));
  if (S.dockAgent === a.id) S.dockAgent = next;
  S.mapKey = '';
  await refresh();
  renderMap();
  renderDock(index.get(S.sel), true);
}
// 关掉一个标签后看哪个：和浏览器一样，右边那个，没有就左边那个
function neighborTab(id) {
  const ids = [...document.querySelectorAll('#dock-tabs .dtab')].map((e) => e.dataset.dock);
  const i = ids.indexOf(id);
  return i < 0 ? null : ids[i + 1] || ids[i - 1] || null;
}

// ---------- 笔记编辑（导图） ----------
// 所有改动都是改 md 里对应的行，然后写回文件；支持撤销/重做、复制/剪切/粘贴。
// 博客里只列这几行（其它是工作台才有的操作）
const HELP_BLOG = ['导航', '视图', '层级', '分支', '搜索'];
const HELP = {
  map: [
    ['导航', '方向键 移动　Home 回到中心主题　空格 展开/收起　Ctrl+/ 展开/收起'],
    ['视图', 'Ctrl+= 放大　Ctrl+- 缩小　Ctrl+0 适应窗口　滚轮平移　Ctrl+滚轮缩放　Ctrl+F 搜索'],
    ['层级', '数字键 1 / 2 / 3 展开到第几层　0 全部展开'],
    ['分支', '双击 只看这个分支　Esc 退出'],
    ['右键', '节点上右键：在访达中显示、复制路径、新建、重命名、删除到回收站、开 AI、📌 加入聚焦、展开全部 / 全部收起、🌐 公开设置'],
    ['搜索', 'Ctrl+F 到导图左上角的搜索框　结果分三层：文件夹、标题、正文　↑↓ 选　Enter 打开（展开到那个标题、弹出这一节，词高亮）　Esc 清空'],
    ['文件夹', 'Tab 新建子文件夹　Enter 新建同级文件夹　F2 重命名（同时改同名笔记）　Delete 删除到回收站'],
    ['标题', '右键文件夹「新建标题」　标题上：Tab 新建下级　Enter 新建同级　F2 改名　Delete 删除（可撤销）　Alt+↑↓ 移动　Ctrl+Z 撤销'],
  ],
  note: [
    ['写笔记', '像飞书 / Notion：点哪儿就在哪儿打字，停下 0.8 秒自动保存　# 标题、- 列表、> 引用、``` 代码块　Tab / Shift+Tab 列表缩进、退回　Ctrl+B 加粗　Ctrl+I 斜体　Ctrl+K 链接　Ctrl+Z / Ctrl+Y 撤销 / 重做'],
  ],
};
// 图例：导图上每种图标、颜色是什么意思（画成和导图上一样的样子）；博客只列看得到的那几种
function legend() {
  const chip = (icon, n, cls = '') => `<span class="lg-chip ${cls}">${ic(icon, 12)}${n ? `<b>${n}</b>` : ''}</span>`;
  const bar = (cls) => `<span class="lg-bar ${cls}"></span>`;
  const row = (sample, text) => `<div class="lg-row"><span class="lg-s">${sample}</span><span>${text}</span></div>`;
  const local = S.mode === 'local';
  return `<h4>图例</h4><div class="lg">`
    + row(chip('file', 3), '笔记有 3 个标题（md 的 # 标题），点它长出笔记导图')
    + (local ? row(chip('file', 0, 'faint'), '淡色：笔记是空的（右键文件夹「新建标题」）') : '')
    + row(chip('folder', 2), '有 2 个子文件夹，点它展开')
    + row(chip('file', 3, 'on'), '高亮：这一种分支正开着（笔记导图和子文件夹二选一）')
    + row('<span class="lg-head">标题</span><span class="lg-plus">+2</span>', '笔记里的标题（虚线连着）；+2 = 下面还有 2 个下级标题，点开')
    + row(`<span class="lg-head">${ic('file', 11)} 概述</span>`, '第一个标题前面的那段话')
    + (local ? row('<span class="ai-dot cat-run">1</span><span class="ai-dot cat-idle">1</span><span class="ai-dot cat-off">1</span>', 'AI 会话：绿 = 正在干活，橙 = 开着、等你，灰 = 历史会话（可以接着聊）；数字是几个，点它在右边打开')
      + row(`<span class="lg-ic">${ic('pin', 12)}</span>`, '加入了「聚焦」')
      + row(bar('pub') + bar('pub inherit'), '在博客公开：深绿 = 这个文件夹自己设的，浅绿 = 跟着上级')
      + row(bar('pub wait') + bar('gone'), '断续 = 还没上传（新文章或有改动）；红色断续 = 不公开了、下次上传从博客删掉；没有条 = 不公开')
      + row('<span class="lg-ic">↪</span>', '这个文件夹一天内改过名或移动过（AI 会话自动跟过来，接着聊照常）') : '')
    + '</div>';
}
function showHelp(kind) {
  const old = $('#help');
  if (old) { old.remove(); return; }
  const rows = (k, title) => `<h4>${title}</h4>` + HELP[k].filter(([a]) => S.mode === 'local' || HELP_BLOG.includes(a)).map(([a, b]) => `<div class="hrow"><b>${a}</b><span>${b}</span></div>`).join('');
  document.body.insertAdjacentHTML('beforeend', `<div id="help"><div class="hbox"><button class="icon hclose" title="关闭">×</button>
    ${legend()}${rows('map', '快捷键')}${S.mode === 'local' ? rows('note', '写笔记') : ''}
    <p class="hint">按 ? 打开 / 关闭</p></div></div>`);
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
        if (opts.merge && err.status === 409) return 'stale';
        S.panelKey = '';
        // 没保存上（比如 AI 同时改了这份笔记）：换成最新的，你刚才写的那一版给个按钮复制下来，别丢了。
        // 重画面板要等这条保存的链走完（renderPanel 会等 S.pendingSave），在链里直接等就互相卡死了，所以放到下一轮
        setTimeout(async () => {
          await renderPanel(true);
          const t = toast(`${esc(err.message)} <button data-copy-lost>复制我刚才写的</button><button data-x>知道了</button>`, 0);
          t.querySelector('[data-copy-lost]').onclick = (e) => navigator.clipboard.writeText(body.trim()).then(() => { e.target.textContent = '已复制，粘贴回去就行'; });
        }, 0);
        return false;
      }
      S.editingNote = false;
      return true;
    },
    // 依次执行（上一个保存完再做下一个），op 拿到最新的文档
    run(op, opts = {}) {
      ed.busy = ed.busy.then(async () => {
        const res = op(ed.doc);
        if (!res) return;
        if (res.error) { flash(res.error); return; }
        if (!opts.keepPop) return ed.save(res.body, res.line, opts);
        // 框里只改自己那一节：笔记刚被别处改过（AI 改了别的地方）就拿最新的再放一次，两边的改动都留着
        const ok = await ed.save(res.body, res.line, { ...opts, merge: true });
        if (ok !== 'stale') return ok;
        const fresh = (await getNote(n.path).catch(() => null))?.note;
        if (fresh) { note.body = fresh.body; note.mtime = fresh.mtime; ed.doc = NM.parse(note.body, title); }
        const again = op(ed.doc, { stale: true });
        return again && !again.error ? ed.save(again.body, again.line, opts) : undefined;
      });
      S.pendingSave = ed.busy.catch(() => {});
      return ed.busy;
    },
    undo() { ed.busy = ed.busy.then(() => { const b = hist.undo.pop(); if (b === undefined) return flash('没有可以撤销的了'); hist.redo.push(note.body); return ed.save(b, ed.selLine ?? 0, { history: true }); }); },
    redo() { ed.busy = ed.busy.then(() => { const b = hist.redo.pop(); if (b === undefined) return flash('没有可以重做的了'); hist.undo.push(note.body); return ed.save(b, ed.selLine ?? 0, { history: true }); }); },
  };
  return ed;
}
// 窗口底部中间的一条提示（ms = 0 就一直留着，等你点「知道了」）；html 里可以放按钮
function toast(html, ms = 2500) {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  clearTimeout(t.timer);
  t.innerHTML = html;
  t.hidden = false;
  t.querySelector('[data-x]')?.addEventListener('click', () => { t.hidden = true; });
  if (ms) t.timer = setTimeout(() => { t.hidden = true; }, ms);
  return t;
}
function flash(msg) {
  toast(esc(msg));
}

// 编辑快捷键：撤销/重做、移动、复制/剪切/粘贴
function commonKeys(e, ed, x) {
  const ctrl = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
  if (ctrl && k === 'z' && !e.shiftKey) { ed.undo(); return true; }
  if (ctrl && (k === 'y' || (k === 'z' && e.shiftKey))) { ed.redo(); return true; }
  if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { ed.run((d) => NM.move(d, ed.find(x.id) || x, e.key === 'ArrowUp' ? -1 : 1)); return true; }
  if (ctrl && k === 'c' && !isCenter(ed, x)) { S.clip = NM.copy(ed.doc, x); flash('已复制'); return true; }
  if (ctrl && k === 'x' && !isCenter(ed, x)) { S.clip = NM.copy(ed.doc, x); ed.run((d) => NM.remove(d, ed.find(x.id))); return true; }
  if (ctrl && k === 'v') { if (!S.clip) flash('还没有复制任何标题'); else ed.run((d) => NM.paste(d, ed.find(x.id) || d.root, S.clip)); return true; }
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

// 编辑器存出来的 md 和常见写法不一样的地方改回来（代码块里不动）：完成的待办写成 [x]
function tidyMd(md) {
  let fence = false;
  return md.split('\n').map((l) => {
    if (/^\s*(```|~~~)/.test(l)) { fence = !fence; return l; }
    return fence ? l : l.replace(/^(\s*(?:[-*+]|\d+[.)])\s+)\[X\]/, '$1[x]');
  }).join('\n');
}
function mdEditor({ md, base, editable, onSave, onLayout = () => {}, onEscape = () => {}, empty = '写笔记…' }) {
  const el = document.createElement('div');
  el.className = 'mde';
  let vd = null, saved = md.trim(), timer = 0, gone = false;
  const dark = document.documentElement.dataset.scheme === 'dark';
  // 笔记里的相对路径图片按笔记所在文件夹找
  const linkBase = S.mode === 'blog' ? index.get(base)?.url || '' : 'files/' + (base ? base.split('/').map(encodeURIComponent).join('/') + '/' : '');
  let saveSequence = 0;
  const reportSave = (state) => {
    el.dataset.saveState = state;
    const status = el.closest('.mm-pop')?.querySelector('.pop-save');
    if (!status) return;
    status.dataset.state = state;
    status.textContent = { unsaved: '待保存', saving: '保存中…', saved: '已保存', error: '未保存' }[state] || '自动保存';
  };
  const flush = () => {
    clearTimeout(timer);
    if (!vd || !editable) return;
    const v = tidyMd(vd.getValue().trim());
    if (v === saved) { reportSave('saved'); return; }
    saved = v;
    const sequence = ++saveSequence;
    reportSave('saving');
    let pending;
    try { pending = onSave(v); } catch { reportSave('error'); return; }
    Promise.resolve(pending).then((ok) => {
      if (sequence === saveSequence) reportSave(ok === false ? 'error' : 'saved');
    }).catch(() => { if (sequence === saveSequence) reportSave('error'); });
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
      input: () => { ++saveSequence; reportSave('unsaved'); clearTimeout(timer); timer = setTimeout(() => { flush(); hideGhosts(); }, 800); },
      focus: () => { S.liveEditing = true; },
      blur: () => { S.liveEditing = false; flush(); },
      esc: () => onEscape(),
      // 所见即所得模式传进来的是 <a>，即时渲染模式传的是放网址的标记
      link: { isOpen: false, click: (m) => openLink((m.getAttribute('href') || m.textContent).trim(), base) },
      after: () => { saved = tidyMd(vd.getValue().trim()); if (!editable) vd.disabled(); hideGhosts(); onLayout(); readyOk(); },
    });
  }).catch(() => { el.innerHTML = '<p class="empty">编辑器加载失败</p>'; });
  // 点代码块：光标落在点的那个字上（编辑器默认放到代码开头），像 Notion 那样点哪改哪
  let codeAt = null;
  el.addEventListener('mousedown', (e) => {
    codeAt = null;
    const code = e.target.closest?.('.vditor-wysiwyg__preview > code');
    const r = code && document.caretRangeFromPoint(e.clientX, e.clientY);
    if (!r || !code.contains(r.startContainer)) return;
    const before = document.createRange();
    before.selectNodeContents(code);
    before.setEnd(r.startContainer, r.startOffset);
    codeAt = { block: code.closest('.vditor-wysiwyg__block'), offset: before.toString().length };
  }, true);
  el.addEventListener('click', () => {
    const at = codeAt;
    codeAt = null;
    if (at) setTimeout(() => {
      const code = at.block?.isConnected && at.block.querySelector(':scope > pre:not(.vditor-wysiwyg__preview) > code');
      if (!code) return;
      const w = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
      for (let n, left = at.offset; (n = w.nextNode()); left -= n.length) {
        if (left > n.length) continue;
        const r = document.createRange();
        r.setStart(n, left);
        getSelection().removeAllRanges();
        getSelection().addRange(r);
        return;
      }
    });
  });
  // Tab 留在编辑器里，不把光标跳到别的按钮上：
  // 列表里任何位置都是缩进（Shift+Tab 退回）；代码块里插入缩进；表格里编辑器自己跳格；其它地方不做事
  let tabList = false; // 缩进前光标在这一行的第几个字，缩进后放回去
  const caretAt = (li, n) => {
    const w = li && document.createTreeWalker(li, NodeFilter.SHOW_TEXT, { acceptNode: (t) => t.parentElement.closest('li') === li ? 1 : 2 });
    for (let t; w && (t = w.nextNode()); n -= t.length) {
      if (n > t.length) continue;
      const r = document.createRange(); r.setStart(t, n); r.collapse(true);
      getSelection().removeAllRanges(); getSelection().addRange(r);
      return;
    }
  };
  el.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || e.isComposing || !editable) return;
    const sel = getSelection(), r = sel.rangeCount && sel.getRangeAt(0);
    const li = r && r.collapsed && r.startContainer.parentElement?.closest('li');
    if (!li || !el.contains(li) || r.startContainer.parentElement.closest('.vditor-wysiwyg__pre')) return;
    // 编辑器只在行首缩进：把行首到光标选上，它就当成整行缩进
    const head = document.createRange();
    head.setStart(li, 0); head.setEnd(r.startContainer, r.startOffset);
    if (!head.toString()) return;
    sel.removeAllRanges(); sel.addRange(head);
    tabList = head.toString().length;
  }, true);
  el.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || e.isComposing || !editable) return;
    if (tabList !== false) { caretAt(getSelection().anchorNode?.parentElement?.closest('li'), tabList); tabList = false; }
    if (e.defaultPrevented) return;
    e.preventDefault();
    if (e.shiftKey) return;
    if (getSelection().anchorNode?.parentElement?.closest('.vditor-wysiwyg__pre')) document.execCommand('insertText', false, '  ');
  });
  // 内容变高变矮时（输入、图片加载完）通知外面重新定位
  const ro = new ResizeObserver(() => onLayout());
  ro.observe(el);
  const api = {
    el,
    ready,
    flush,
    // 光标放到正文最后（点正文下面的空白处时用，像飞书 / Notion 那样接着写）
    // atStart：内容长、框里要滚动时，光标放开头、不滚走（点开是为了先看）
    focusEnd: (atStart) => {
      const r = el.querySelector('.vditor-reset');
      if (!r || !el.isConnected || r.getAttribute('contenteditable') !== 'true') return;
      r.focus({ preventScroll: !!atStart });
      const range = document.createRange();
      range.selectNodeContents((atStart ? r.firstElementChild : r.lastElementChild) || r);
      range.collapse(!!atStart);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
    },
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
// 笔记导图的中心：md 里只有一个一级标题、而且和文章名一样时，就用它当中心，不画两层一样的节点
const mapRoot = (doc) => (doc.root.children.length === 1 && normTitle(doc.root.children[0].text) === normTitle(doc.root.text) ? doc.root.children[0] : doc.root);
// 导图中心（文档本身或和标题同名的那个一级标题）：不能删、不能改名、回车加的是子主题
const isCenter = (ed, x) => x.kind === 'root' || x.id === mapRoot(ed.doc).id;

const bareNote = (note) => S.mode === 'local' && !/^#{1,6}\s/m.test(note?.body || '');
function renderNoteMap(n, note) {
  const body = $('#panel-body');
  body.className = 'has-notemap';
  // 笔记里还没有标题：导图只有一个中心，说一句怎么长出分支
  const bare = bareNote(note);
  body.insertAdjacentHTML('beforeend', (bare ? '<p class="hint notemap-hint">笔记里的每个标题就是一个分支。点中心按 Tab 加一个分支，或者在「文档」里写个 ## 标题</p>' : '') + '<div class="notemap"></div>');
  const box = body.querySelector('.notemap');
  const editable = S.mode === 'local';
  const base = n.path;
  const collapsed = S.noteCollapsed?.path === n.path ? S.noteCollapsed.set : new Set();
  S.noteCollapsed = { path: n.path, set: collapsed };
  const conv = (x) => ({ id: x.id, x, collapsed: collapsed.has(x.id), children: x.children.map(conv) });
  let mm, viewReady = false;

  // ---------- 主题笔记：点主题，它的笔记铺在导图下面、占满宽度（不挡导图）；点哪段改哪段，自动保存 ----------
  let pop = null; // { id, el, live }
  function openPop(x) {
    if (pop && pop.id === x.id) return placePop();
    closePop(true);
    // 框浮在导图上（不占 AI 栏的地方）：面板窄时铺满导图宽度、贴在主题下面，主题先挪到导图上方，始终看得见
    const el = document.createElement('div');
    el.className = 'mm-pop';
    box.appendChild(el);
    el.innerHTML = `<div class="pop-head"><span class="pop-title"></span>
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
    makeRoom();
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

  // 框放在哪：主题旁边有 ≥520px 就放旁边（面板放大时）；否则铺满导图宽度，放在主题下面（下面太挤就放上面）
  const SIDE = 520, G = 8, M = 6;
  function placePop() {
    if (!pop) return;
    const t = ed.find(pop.id);
    if (t) pop.el.querySelector('.pop-title').textContent = NM.plain(t.text) || '（空）';
    const r = mm.nodeRect(pop.id);
    if (!r) { pop.el.hidden = true; return; }
    pop.el.hidden = false;
    const W = box.clientWidth, H = box.clientHeight, st = pop.el.style;
    const right = W - r.right - G - M, left = r.left - G - M;
    if (right >= SIDE || left >= SIDE) {
      const onRight = right >= SIDE, w = Math.min(640, onRight ? right : left);
      st.width = w + 'px'; st.maxHeight = H - 2 * M + 'px';
      st.left = (onRight ? r.right + G : r.left - G - w) + 'px';
      st.top = Math.max(M, Math.min(H - pop.el.offsetHeight - M, r.top - 6)) + 'px';
      return;
    }
    const below = H - r.bottom - G - M, above = r.top - G - M, down = below >= Math.min(above, 160);
    st.width = W - 2 * M + 'px'; st.left = M + 'px';
    st.maxHeight = Math.max(100, down ? below : above) + 'px';
    st.top = (down ? r.bottom + G : r.top - G - pop.el.offsetHeight) + 'px';
  }
  // 刚打开时：两边放不下、下面又不够一半高，就把导图往上挪，让主题到导图顶部，下面整块给笔记
  function makeRoom() {
    const r = mm.nodeRect(pop.id);
    if (!r) return;
    const W = box.clientWidth, H = box.clientHeight;
    if (W - r.right - G - M >= SIDE || r.left - G - M >= SIDE) return;
    if (H - r.bottom >= H * 0.6) return;
    mm.view.y += 36 - r.top;
    if (r.left < 0 || r.right > W) mm.view.x += W / 2 - (r.left + r.right) / 2;
    mm.apply();
  }

  const ed = noteEditor(n, note, (doc, line, opts) => {
    if (opts.keepPop) { mm.setData(conv(mapRoot(doc))); mm.render(); placePop(); return; }
    const target = NM.findByLine(doc.root, line);
    S.noteSel = { path: n.path, id: target.id };
    ed.selLine = target.line;
    mm.setData(conv(mapRoot(doc)));
    mm.render();
    mm.select(target.id);
    if (pop) openPop(target);
    if (!opts.editNew) mm.el.focus({ preventScroll: true });
    if (opts.editNew) setTimeout(() => mm.edit(target.id), 260);
  });
  const op = (fn, editNew) => (v) => ed.run((d) => fn(d, ed.find(v.id) || d.root), { editNew });
  const removeTopic = (x, confirmAlways = false) => {
    if (!x || isCenter(ed, x)) return;
    if ((confirmAlways || x.children.length) && !confirm(`删除主题「${NM.plain(x.text)}」及其笔记${x.children.length ? '和下面的子主题' : ''}？\n可以用撤销恢复。`)) return;
    // 保存浮层会改变后续标题的行号；按主题层级重新定位，避免删错主题。
    const trail = [];
    for (let t = x; t.parent; t = t.parent) trail.unshift({ i: t.parent.children.indexOf(t), text: t.text, level: t.level });
    closePop(true);
    ed.run((d) => {
      let target = d.root;
      for (const t of trail) {
        target = target.children[t.i];
        if (!target || target.text !== t.text || target.level !== t.level) return { error: '主题刚发生了变化，请重新选中后删除。' };
      }
      return NM.remove(d, target);
    });
  };
  mm = new MindMap(box, {
    layout: S.noteMapView?.path === n.path ? S.noteMapView.layout : 'both', // 第一次打开时 autoCollapse 会挑：左右两边展开或只往右展开
    minimap: false,
    render: (v) => `<span class="mm-label">${esc(NM.plain(v.x.text) || '（空）')}</span>${v.collapsed ? `<span class="mm-toggle">+${v.children.length}</span>` : ''}`,
    nodeClass: (v) => 'note-' + v.x.kind,
    editText: (v) => v.x.text,
    // 点主题打开它的笔记；用方向键换主题时，笔记开着就跟过去
    onSelect: (v, how) => { S.noteSel = { path: n.path, id: v.id }; ed.selLine = v.x.line; if (how === 'click' || pop) openPop(v.x); },
    onView: () => { placePop(); if (viewReady && S.noteMapView?.path === n.path) S.noteMapView.view = { ...mm.view }; },
    onEscape: () => closePop(),
    onToggle: (v) => { collapsed.has(v.id) ? collapsed.delete(v.id) : collapsed.add(v.id); mm.setData(conv(mapRoot(ed.doc))); mm.render(); },
    onActivate: (v) => editable && !isCenter(ed, v.x) && mm.edit(v.id),
    onRename: editable ? (v, text) => ed.run((d) => NM.rename(d, ed.find(v.id), text)) : null,
    onHelp: () => showHelp(),
    onKey: (e, v) => {
      if (!editable) return false;
      const x = v.x;
      if (commonKeys(e, ed, x)) return true;
      if (e.key === 'Tab') { op(NM.addChild, true)(v); return true; }
      if (e.key === 'Enter' && e.shiftKey) { op(NM.addSiblingBefore, true)(v); return true; }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { openPop(x); pop.live.focus(); return true; }
      if (e.key === 'Enter') { op(isCenter(ed, x) ? NM.addChild : NM.addSibling, true)(v); return true; }
      if (e.key === ' ' && !isCenter(ed, x)) { mm.edit(v.id); return true; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && !isCenter(ed, x)) {
        removeTopic(x);
        return true;
      }
      return false;
    },
  });

  if (editable) box.addEventListener('contextmenu', (e) => {
    const el = e.target.closest('.mm-node');
    if (!el || e.target.closest('.mm-pop') || mm.editing) return;
    const v = mm.node(el.dataset.id);
    if (!v) return;
    e.preventDefault();
    e.stopPropagation();
    mm.select(v.id, false);
    showCtx([
      { label: '新建子主题', key: 'Tab', run: () => op(NM.addChild, true)(v) },
      !isCenter(ed, v.x) && { label: '重命名', key: 'F2', run: () => mm.edit(v.id) },
      !isCenter(ed, v.x) && '-',
      !isCenter(ed, v.x) && { label: '删除主题…', key: 'Delete', danger: true, run: () => removeTopic(v.x, true) },
    ], e.clientX, e.clientY);
  });

  // 点导图空白处关掉笔记框（拖动画布不算）
  let down = null;
  box.addEventListener('pointerdown', (e) => { down = e.target.closest('.mm-pop, .mm-node') ? null : [e.clientX, e.clientY]; });
  box.addEventListener('pointerup', (e) => { if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 5) closePop(); down = null; });

  mm.setData(conv(mapRoot(ed.doc)));
  mm.render();
  const sel = (S.noteSel && S.noteSel.path === n.path && ed.find(S.noteSel.id)) || ed.doc.root;
  mm.select(sel.id, false);
  // 第一次打开这份笔记的导图时适应窗口（太大就按能看清的大小显示）
  // 同一篇笔记重画（切到文档再切回来、保存后刷新）时恢复原来的视角；第一次打开才自动收起、适应窗口
  // （刚建好的导图会先按默认视角画一次，那次不能记下来，所以等恢复完才开始记）
  if (S.noteMapView?.path === n.path) { mm.view = { ...S.noteMapView.view }; mm.apply(); viewReady = true; }
  else requestAnimationFrame(() => { autoCollapse(); mm.fit(0.55); mm.reveal(sel.id); S.noteMapView = { path: n.path, view: { ...mm.view }, layout: mm.opts.layout }; viewReady = true; });
  // 大笔记第一次打开：整张图在面板里放不下（字会小到看不清）时，从最深的层开始收起，直到能放下；
  // 收起的主题显示数字，点一下就展开。正在看的那个主题所在的分支不收
  function autoCollapse() {
    const W = box.clientWidth - 40, H = box.clientHeight - 40;
    const kOf = () => { const b = mm.bounds; return b ? Math.min(1, W / (b.x2 - b.x1), H / (b.y2 - b.y1)) : 1; };
    // 左右两边展开 / 只往右展开：哪种在这个面板里显示得大就用哪种（窄面板通常是往右展开）
    const pick = () => {
      let best = null;
      for (const L of ['both', 'right']) { mm.opts.layout = L; mm.render(); const k = kOf(); if (!best || k > best.k + 0.02) best = { L, k }; }
      mm.opts.layout = best.L;
      mm.render();
      return best.k;
    };
    if (collapsed.size || pick() >= 0.8) return;
    const root = mapRoot(ed.doc), keep = new Set();
    const mark = (x) => { if (x === sel || x.children.some(mark)) { keep.add(x.id); return true; } return false; };
    mark(root);
    let max = 0;
    const depth = (x, d) => { max = Math.max(max, d); x.children.forEach((c) => depth(c, d + 1)); };
    depth(root, 0);
    for (let d = max - 1; d >= 1; d--) {
      collapsed.clear();
      const walk = (x, k) => { if (k >= d && x.children.length && !keep.has(x.id)) collapsed.add(x.id); x.children.forEach((c) => walk(c, k + 1)); };
      walk(root, 0);
      mm.setData(conv(root));
      if (pick() >= 0.8) return;
    }
  }

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
  if (t.hasAttribute('data-agent-end')) return deleteAgent();
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
  S.sheet = false;
  S.panelClosed = true; S.panelRequested = false; store.set('panelClosed', true); $('#panel').hidden = true; $('#resizer').hidden = true; updateWorkspaceChrome(); }
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
function paintCanvasZoom() {
  const zoom = $('#canvas-zoom');
  if (zoom) zoom.textContent = Math.round(map.view.k * 100) + '%';
}

// 一开始没有会话时把宽度还给导图；有会话或你打开过 AI 栏就占右栏，之后不会自己收起。
function syncAIPanel(n = index.get(S.sel)) {
  if (S.mode !== 'local' || !n) return;
  const composing = S.dockAgent === 'new:' + n.path;
  const sessions = agentsUnder(n.path).some((a) => !isHidden(a) && (a.term || a.openPid || a.status === 'running' || a.status === 'waiting'));
  const visible = !S.panelClosed && (S.panelRequested || composing || sessions);
  // 打开了就一直开着，直到你自己收起：点到一个还没有会话的文件夹，终端不能突然消失
  if (visible) S.panelRequested = true;
  $('#panel').hidden = !visible;
  $('#resizer').hidden = !visible;
  $('#assistant-toggle').setAttribute('aria-expanded', String(visible));
}

function updateWorkspaceChrome() {
  if (S.mode !== 'local' || !S.data) return;
  const n = index.get(S.sel) || S.data.tree;
  syncAIPanel(n);
  const folders = [...index.values()].filter((x) => x.path);
  $('#canvas-title').textContent = S.query ? '搜索工作区' : S.view === 'work' ? '聚焦工作' : S.focus ? index.get(S.focus)?.name || '分支视图' : '工作区全景';
  $('#canvas-summary').textContent = `${folders.length} 个文件夹 · ${folders.filter((x) => x.note).length} 篇笔记`;
  $('#agent-context').textContent = (n.path ? n.path.replaceAll('/', ' / ') : '整个工作台') + ' · ' + agentsUnder(n.path).filter((a) => !isHidden(a)).length + ' 个会话';
  $('#agent-context').title = n.path || S.data.tree.name;
  $('#assistant-toggle').setAttribute('aria-expanded', String(!$('#panel').hidden));
  const focusEmpty = S.view === 'work' && !S.pins.some((p) => index.has(p)) && !mapAgents().some((a) => a.path && owner(a.path));
  const kind = focusEmpty ? 'focus' : !folders.length ? 'workspace' : '';
  const empty = $('#canvas-empty');
  empty.hidden = !kind;
  $('#map').classList.toggle('canvas-is-empty', !!kind);
  if (kind && empty.dataset.kind !== kind) {
    empty.dataset.kind = kind;
    empty.innerHTML = kind === 'focus'
      ? `<span class="canvas-empty-mark">${ic('pin', 23)}</span><h2>给重要的工作留个位置</h2><p>在文件夹上右键「加入聚焦」，<br>把手头的几个项目放在一起。</p><button data-canvas-act="all">${ic('network')}浏览全部文件夹</button>`
      : `<span class="canvas-empty-mark">${ic('folderPlus', 23)}</span><h2>从一个文件夹开始</h2><p>每个文件夹，都是一个想法的起点。<br>笔记和 AI 任务，都可以在这里继续。</p><button class="primary" data-canvas-act="new">${ic('plus')}新建第一个文件夹</button>`;
  }
}

function initWorkspaceChrome() {
  $('[data-view="map"]').innerHTML = ic('network', 13) + '<span>全景</span>';
  $('#assistant-toggle').innerHTML = ic('terminal', 16);
  $('.agent-head-icon').innerHTML = ic('sparkles', 16);
  $('[data-workspace-new]').innerHTML = ic('plus', 16);
  $('[data-workspace-close]').innerHTML = ic('x', 15);
  $('[data-canvas-act="out"]').innerHTML = ic('minus', 13);
  $('[data-canvas-act="in"]').innerHTML = ic('plus', 13);
  $('.canvas-controls .icon[data-canvas-act="fit"]').innerHTML = ic('fit', 13);
  $('[data-canvas-act="help"]').innerHTML = ic('help', 13) + '<span>图例 · 快捷键</span>';
  $('#theme-btn').innerHTML = ic('palette', 14);
  $('#theme-btn').onclick = themeMenu;
  $('#assistant-toggle').onclick = () => {
    if (!$('#panel').hidden) closePanel();
    else { S.panelClosed = false; S.panelRequested = true; store.set('panelClosed', false); renderPanel(true); }
  };
  $('[data-workspace-close]').onclick = closePanel;
  $('[data-workspace-new]').onclick = () => openAgent('new:' + (index.has(S.sel) ? S.sel : ''));
  $('#map-view').addEventListener('click', (e) => {
    const action = e.target.closest('[data-canvas-act]')?.dataset.canvasAct;
    if (!action || (S.mode !== 'local' && (action === 'new' || action === 'all'))) return; // 博客：缩放、图例照常
    if (action === 'new') newFolder(index.has(S.sel) ? S.sel : '');
    else if (action === 'in') map.zoom(1.15);
    else if (action === 'out') map.zoom(1 / 1.15);
    else if (action === 'fit') { closeHeadPop(true); map.fit(.6); }
    else if (action === 'all') setView('map');
    else if (action === 'help') showHelp();
  });
  addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'f' || e.target.closest('.mde, .ag-term, .ag-new')) return;
    e.preventDefault(); $('#search').focus(); $('#search').select();
  });
  // Preserve the position relative to the viewport when the window or divider moves.
  let size = null;
  new ResizeObserver(() => {
    const next = { w: map.el.clientWidth, h: map.el.clientHeight };
    if (!map.root || !next.w || !next.h) { size = next; return; }
    if (size && size.w && size.h) {
      map.view.x += (next.w - size.w) / 2;
      map.view.y += (next.h - size.h) / 2;
      map.apply();
      if (!hpop) map.reveal(map.sel);
    }
    size = next;
    placeHeadPop();
  }).observe(map.el);
}

function route() {
  // #ai/<id>：直接打开某个 AI（会话的终端），#ai/new:<文件夹> 打开新建表单
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
  // 在「📌 聚焦」里打开不属于聚焦分支的节点（比如搜索结果）：回到「全景」，不然图上找不到它
  if (S.view === 'work' && p && !onPinPath(p)) setView('map');
  if (S.sel !== p) S.tab = 'note';
  if (S.wantTab) { S.tab = S.wantTab; S.wantTab = null; }
  if (S.sel !== null && S.mode !== 'local') S.panelClosed = false;
  if (S.mode === 'blog' && S.sel === null && index.get(p)?.url) S.headsShown = p; // 博客：从文章页「在导图中看」或分享的链接进来，直接长出它的标题
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
// 文件拖到终端以外的地方：什么也不做（默认会把窗口换成那个文件）；拖进终端的由终端自己处理（插入路径），编辑器有自己的处理
addEventListener('dragover', (e) => e.preventDefault());
addEventListener('drop', (e) => e.preventDefault());
addEventListener('resize', () => map.drawMini());
initWorkspaceChrome();
setView(S.view);
load();
