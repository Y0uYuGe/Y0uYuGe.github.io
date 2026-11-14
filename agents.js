// 导图上的 AI：右侧面板里的终端、蜂群图、新建表单，都由工作台自己画。
// sextant 只当后台引擎：跑 agent、持有终端进程、调度蜂群任务。这里直接调它的接口（它允许跨域）：
//   终端   WebSocket /sessions/{name}/terminal：收发原始终端字节，文本消息 {cols, rows} 表示改窗口大小
//   蜂群图 GET /missions/{id}（里面的 graph：线索 leads、发现 findings、指令 directives）
//   新建   POST /sessions、POST /missions；指令 POST /missions/{id}/directives；运行日志 GET /runs/{id}/log
import { MindMap } from './mindmap.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const dark = () => matchMedia('(prefers-color-scheme: dark)').matches;

async function api(base, method, p, body) {
  const r = await fetch(base + p, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) { let m = `sextant ${r.status}`; try { m = (await r.json()).error || m; } catch {} throw new Error(m); }
  return r.status === 204 ? null : r.json();
}

function loadScript(src) {
  return new Promise((ok, fail) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = fail; document.head.appendChild(s); });
}
let xtermReady;
const loadXterm = () => (xtermReady ||= (async () => {
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.href = 'vendor/xterm/xterm.css';
  document.head.appendChild(l);
  await loadScript('vendor/xterm/xterm.js');
  await loadScript('vendor/xterm/addon-fit.js');
})());

// ---------- 终端 ----------
export function terminalView(el, base, name) {
  el.innerHTML = '<div class="ag-term"></div>';
  const box = el.firstChild;
  let term, ws, ro, gone = false;
  loadXterm().then(() => {
    if (gone) return;
    const d = dark();
    term = new window.Terminal({
      fontFamily: 'Menlo, "SF Mono", Consolas, monospace', fontSize: 13, lineHeight: 1.15, cursorBlink: true, scrollback: 20000,
      theme: d ? { background: '#0e1116', foreground: '#e6edf3', cursor: '#e6edf3', selectionBackground: '#264f78' }
        : { background: '#ffffff', foreground: '#1f2328', cursor: '#1f2328', selectionBackground: '#b6d4fe' },
    });
    const fit = new window.FitAddon.FitAddon();
    term.loadAddon(fit);
    term.open(box);
    try { fit.fit(); } catch {}
    ws = new WebSocket(base.replace(/^http/, 'ws') + '/sessions/' + encodeURIComponent(name) + '/terminal');
    ws.binaryType = 'arraybuffer';
    const enc = new TextEncoder();
    const size = () => ws.readyState === 1 && ws.send(JSON.stringify({ cols: term.cols, rows: term.rows }));
    ws.onopen = () => { size(); term.focus(); };
    ws.onmessage = (e) => term.write(typeof e.data === 'string' ? e.data : new Uint8Array(e.data));
    ws.onclose = () => { if (!gone) term.write('\r\n\x1b[90m[会话已结束]\x1b[0m\r\n'); };
    term.onData((s) => ws.readyState === 1 && ws.send(enc.encode(s)));
    term.onResize(size);
    ro = new ResizeObserver(() => { try { fit.fit(); } catch {} });
    ro.observe(box);
  }).catch(() => { box.innerHTML = '<p class="empty pad">终端组件加载失败</p>'; });
  return { destroy() { gone = true; ro?.disconnect(); try { ws?.close(); } catch {} term?.dispose(); } };
}

// ---------- 蜂群图 ----------
// 任务是根；线索按 parent 挂成树；发现挂在产生它的线索下面。点节点在下面看详情和运行日志；底部给任务下指令。
const LEAD = { open: ['todo', '待办'], claimed: ['running', '已领取'], running: ['running', '进行中'], resolved: ['done', '完成'], dropped: ['done', '放弃'] };
const COLUMN = { queued: ['todo', '排队'], running: ['running', '进行中'], review: ['waiting', '待你验收'], done: ['done', '完成'] };
const ACTIONS = [['note', '补充说明'], ['lead', '新的方向'], ['prioritize', '先做选中的'], ['drop', '别做选中的'], ['retry', '重试选中的'], ['constrain', '全局约束']];
const NEEDS_TARGET = new Set(['prioritize', 'drop', 'retry']);

export function missionView(el, base, id, { onGone } = {}) {
  el.innerHTML = `<div class="ag-mission">
    <div class="agm-head"></div>
    <div class="agm-map"></div>
    <div class="agm-detail"><p class="hint">点图上的节点看详情</p></div>
    <form class="agm-say"><select>${ACTIONS.map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
      <input placeholder="给这个任务下指令：补充信息、加一个方向、先做哪个…"><button>发送</button></form>
  </div>`;
  const $ = (s) => el.querySelector(s);
  let d = null, sel = 'm', timer = 0, gone = false, sig = '';
  const mm = new MindMap($('.agm-map'), {
    minimap: false,
    render: (n) => n.html,
    nodeClass: (n) => n.cls,
    onSelect: (n) => { sel = n.id; mm.select(n.id, false); detail(); },
    onToggle: () => {},
  });

  const tree = () => {
    const g = d.graph || { leads: [], findings: [] };
    const [cst, clabel] = COLUMN[d.column] || ['waiting', d.column];
    const root = { id: 'm', cls: 'agm-root', children: [], html: `<span class="ag-dot ag-${cst}"></span><span class="mm-label">${esc(d.title)}</span><span class="status">${esc(d.badge || clabel)}</span>` };
    const byId = new Map([['', root]]);
    const leads = [...(g.leads || [])].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
    for (const l of leads) {
      const [st, label] = LEAD[l.status] || ['todo', l.status];
      byId.set(l.id, { id: l.id, lead: l, cls: l.status === 'dropped' ? 'agm-dropped' : '', children: [],
        html: `<span class="ag-dot ag-${st}" title="${label}"></span><span class="mm-label" title="${esc(l.summary)}">${esc(l.summary.length > 36 ? l.summary.slice(0, 35) + '…' : l.summary)}</span>${l.adapter ? `<span class="ag-tool">${esc(l.adapter)}</span>` : ''}` });
    }
    for (const l of leads) (byId.get(l.parent || '') || root).children.push(byId.get(l.id));
    for (const f of g.findings || []) {
      (byId.get(f.source_lead || '') || root).children.push({ id: 'f:' + f.id, finding: f, cls: 'agm-finding', children: [],
        html: `<span class="mm-label" title="${esc(f.summary)}">💡 ${esc(f.summary.length > 36 ? f.summary.slice(0, 35) + '…' : f.summary)}</span>` });
    }
    return root;
  };

  function head() {
    const [cst, clabel] = COLUMN[d.column] || ['waiting', d.column];
    const crit = (d.criteria || []).map((c) => `<li class="${c.met ? 'met' : ''}">${c.met ? '✓' : '○'} ${esc(c.text)}</li>`).join('');
    $('.agm-head').innerHTML = `<div><span class="ag-dot ag-${cst}"></span> <b>${esc(d.badge || clabel)}</b>
      · 运行 ${d.active_runs || 0}/${d.total_runs || 0} · 发现 ${d.findings || 0}${d.progress ? ' · ' + esc(d.progress) : ''}</div>
      ${d.goal_spec?.text ? `<div class="agm-goal">${esc(d.goal_spec.text)}</div>` : ''}${crit ? `<ul class="agm-crit">${crit}</ul>` : ''}`;
  }

  async function detail() {
    const box = $('.agm-detail');
    const n = mm.node(sel);
    if (!n || n.id === 'm') {
      const dirs = (d.graph?.directives || []).slice(-8).reverse();
      box.innerHTML = dirs.length ? `<h4>你下过的指令</h4>${dirs.map((x) => `<div class="agm-dir"><span class="chip">${esc((ACTIONS.find((a) => a[0] === x.action) || [0, x.action])[1])}</span> ${esc(x.text)}</div>`).join('')}` : '<p class="hint">点图上的节点看详情</p>';
      return;
    }
    if (n.finding) {
      const f = n.finding;
      box.innerHTML = `<h4>💡 发现 · 可信度 ${Math.round((f.confidence || 0) * 100)}%</h4><div class="agm-text">${esc(f.summary)}</div>
        ${f.payload ? `<pre>${esc(JSON.stringify(f.payload, null, 2))}</pre>` : ''}`;
      return;
    }
    const l = n.lead;
    const [, label] = LEAD[l.status] || ['', l.status];
    box.innerHTML = `<h4>${esc(label)}${l.adapter ? ' · ' + esc(l.adapter) : ''}${l.attempts ? ` · 尝试 ${l.attempts} 次` : ''}</h4>
      <div class="agm-text">${esc(l.summary)}</div>${l.detail ? `<div class="agm-text hint">${esc(l.detail)}</div>` : ''}
      ${l.outcome ? `<h4>结果</h4><div class="agm-text">${esc(l.outcome)}</div>` : ''}
      ${l.run_id ? '<h4>运行日志</h4><pre class="agm-log">加载中…</pre>' : ''}`;
    if (l.run_id) {
      try {
        const lines = await api(base, 'GET', '/runs/' + encodeURIComponent(l.run_id) + '/log');
        if (gone || sel !== n.id) return;
        const pre = box.querySelector('.agm-log');
        pre.textContent = lines.map((x) => x.line).join('\n').slice(-20000) || '（还没有输出）';
        pre.scrollTop = pre.scrollHeight;
      } catch (e) { box.querySelector('.agm-log').textContent = e.message; }
    }
  }

  async function load(first) {
    try { d = await api(base, 'GET', '/missions/' + encodeURIComponent(id)); }
    catch (e) { if (!gone) { $('.agm-map').innerHTML = `<p class="empty pad">${esc(e.message)}</p>`; onGone?.(); } return; }
    if (gone) return;
    const s = JSON.stringify([d.column, d.badge, d.progress, d.active_runs, d.findings, d.graph]);
    if (s === sig) return;
    sig = s;
    head();
    mm.setData(tree());
    mm.render();
    if (!mm.node(sel)) sel = 'm';
    mm.select(sel, false);
    if (first) requestAnimationFrame(() => mm.fit(0.8)); // 面板窄时不缩得太小，放不下就拖着看
    detail();
  }

  $('.agm-say').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('.agm-say input'), action = $('.agm-say select').value, text = input.value.trim();
    const target = mm.node(sel)?.lead?.id;
    if (NEEDS_TARGET.has(action) && !target) return alert('先在图上选中一条线索');
    if (!text && !NEEDS_TARGET.has(action)) return;
    try {
      await api(base, 'POST', '/missions/' + encodeURIComponent(id) + '/directives', { text, action, author: 'human', targets: target && action !== 'constrain' ? [target] : [] });
      input.value = '';
      sig = '';
      load();
    } catch (err) { alert(err.message); }
  });

  load(true);
  timer = setInterval(() => { if (!document.hidden) load(); }, 3000);
  return { destroy() { gone = true; clearInterval(timer); } };
}

// ---------- 新建：会话 或 蜂群任务 ----------
export function newForm(el, base, dir, dirName, { onDone, onCancel }) {
  el.innerHTML = '<div class="pad empty">读取可用的 agent…</div>';
  let gone = false;
  api(base, 'GET', '/adapters').then((list) => {
    if (gone) return;
    const ok = list.filter((a) => a.available);
    if (!ok.length) { el.innerHTML = '<div class="pad empty">sextant 没找到可用的 agent（Claude Code、Codex…）</div>'; return; }
    const opts = ok.map((a) => `<option value="${esc(a.name)}">${esc(a.name)}</option>`).join('');
    el.innerHTML = `<form class="ag-new">
      <div class="seg"><button type="button" data-k="session" class="on">会话</button><button type="button" data-k="mission">蜂群任务</button></div>
      <p class="hint" data-hint>在「${esc(dirName)}」里开一个 agent，右边直接是它的终端</p>
      <label>Agent <select name="agent">${opts}</select></label>
      <label>标题 <input name="title" placeholder="可以不写"></label>
      <div data-m hidden>
        <label>目标 <textarea name="goal" rows="5" placeholder="要它们完成什么；越具体越好"></textarea></label>
        <label class="row"><input type="checkbox" name="start" checked> 建好就开始</label>
        <div class="hint">可以参与的 agent：${ok.map((a) => `<label class="row"><input type="checkbox" name="agents" value="${esc(a.name)}" checked> ${esc(a.name)}</label>`).join('')}</div>
      </div>
      <div class="row"><button class="primary">创建</button><button type="button" data-cancel>取消</button><span class="msg"></span></div>
    </form>`;
    const f = el.querySelector('form');
    let kind = 'session';
    f.querySelectorAll('[data-k]').forEach((b) => b.onclick = () => {
      kind = b.dataset.k;
      f.querySelectorAll('[data-k]').forEach((x) => x.classList.toggle('on', x === b));
      f.querySelector('[data-m]').hidden = kind !== 'mission';
      f.querySelector('select[name=agent]').closest('label').hidden = kind === 'mission';
      f.querySelector('[data-hint]').textContent = kind === 'mission'
        ? `在「${dirName}」里开一个蜂群任务：多个 agent 分头探索，右边是它的蜂群图` : `在「${dirName}」里开一个 agent，右边直接是它的终端`;
    });
    f.querySelector('[data-cancel]').onclick = () => onCancel?.();
    f.onsubmit = async (e) => {
      e.preventDefault();
      const msg = f.querySelector('.msg'), v = (n) => f.elements[n].value.trim();
      msg.textContent = '创建中…';
      try {
        if (kind === 'session') {
          const s = await api(base, 'POST', '/sessions', { agent: v('agent'), dir, title: v('title') || undefined });
          return onDone('sx-session:' + s.name);
        }
        const agents = [...f.querySelectorAll('input[name=agents]:checked')].map((x) => x.value);
        if (!agents.length) { msg.textContent = '至少选一个 agent'; return; }
        const title = v('title') || v('goal').slice(0, 30);
        if (!title) { msg.textContent = '写一下目标'; return; }
        const m = await api(base, 'POST', '/missions', {
          title, input: { path: dir }, goal_spec: { text: v('goal') || title },
          budget: { usd_limit: 0, token_limit: 0, wall_clock_limit: 0 },
          agent_policy: { default: agents[0], allowed: agents }, start: f.elements.start.checked,
        });
        onDone('sx-mission:' + m.id);
      } catch (err) { msg.textContent = '失败：' + err.message; }
    };
  }).catch((e) => { if (!gone) el.innerHTML = `<div class="pad empty">${esc(e.message)}</div>`; });
  return { destroy() { gone = true; } };
}

// 结束会话 / 删除任务
export const endSession = (base, name) => api(base, 'DELETE', '/sessions/' + encodeURIComponent(name));
export const deleteMission = (base, id) => api(base, 'DELETE', '/missions/' + encodeURIComponent(id));
