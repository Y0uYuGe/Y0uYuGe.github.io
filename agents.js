// 导图上的 AI：右侧面板下面的终端、新建会话的表单。
// 终端由工作台自己托管（lib/terminals.mjs）：WebSocket /api/terminal/<会话名> 收发原始终端字节，文本消息 {cols, rows} 表示改窗口大小

import { ic } from './icons.js?v=4edcbab53d';
import { handleTerminalWheel, viewportPosition, restoreViewport } from './terminal-scroll.js?v=4edcbab53d';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
async function post(p, body) {
  const r = await fetch(p, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Studio': '1' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.status);
  return j;
}

function loadScript(src) {
  return new Promise((ok, fail) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = fail; document.head.appendChild(s); });
}
// 选中的那几行：粗体的字记成 **字**（AI 把标题、重点画成粗体，复制成纯文字就丢了）；终端自己折的行接回去
const MARKS = /[⏺●•◦▪⎿└│┃─━┌┐├┤┬┴┼╭╮╰╯┏┓┗┛┣┫┳┻╋›❯]/;
function richSelection(term) {
  const r = term.getSelectionPosition?.();
  if (!r) return null;
  const b = term.buffer.active, rows = [];
  for (let y = r.start.y; y <= r.end.y; y++) {
    const line = b.getLine(y);
    if (!line) continue;
    const x0 = y === r.start.y ? r.start.x : 0, x1 = y === r.end.y ? r.end.x : term.cols;
    let s = '', bold = false;
    const close = () => { const m = s.match(/\s*$/)[0]; s = s.slice(0, s.length - m.length) + '**' + m; bold = false; };
    for (let x = x0; x < x1 && x < line.length; x++) {
      const c = line.getCell(x);
      if (!c || c.getWidth() === 0) continue;
      const ch = c.getChars() || ' ';
      if (ch.trim() && !MARKS.test(ch)) {
        const on = !!c.isBold();
        if (on && !bold) { s += '**'; bold = true; } else if (!on && bold) close();
      }
      s += ch;
    }
    if (bold) close();
    s = s.replace(/\s+$/, '');
    if (line.isWrapped && y > r.start.y && rows.length) rows[rows.length - 1] += s; else rows.push(s);
  }
  return rows.join('\n');
}

let xtermReady;
const loadXterm = () => (xtermReady ||= (async () => {
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.href = 'vendor/xterm/xterm.css';
  document.head.appendChild(l);
  await loadScript('vendor/xterm/xterm.js');
  await loadScript('vendor/xterm/addon-fit.js');
  await loadScript('vendor/xterm/addon-webgl.js').catch(() => {});
})());

// ---------- 终端 ----------
// 拖进终端的文件：插入路径，特殊字符用反斜杠转义（和 macOS「终端」一样）
const shellPath = (p) => p.replace(/([^A-Za-z0-9_\-.,:\/@+=%\u0080-\uffff])/g, '\\$1');
const terminalViewports = new Map(); // 标签切走再回来时，继续看刚才的历史位置。
// newline：这种 agent「换行不发送」认的按键（服务端给，见 lib/terminals.mjs 的 AGENTS）；Shift+Enter 发它
export function terminalView(el, name, { newline } = {}) {
  el.innerHTML = '<div class="ag-term"></div>';
  const box = el.firstChild;
  // 终端颜色跟着主题走：底色 = 卡片色，字 = 正文色（换主题时马上换）
  const theme = () => {
    const css = getComputedStyle(document.body), v = (k, d) => css.getPropertyValue(k).trim() || d;
    const dark = document.documentElement.dataset.scheme === 'dark';
    const bg = v('--card', dark ? '#0e1116' : '#ffffff'), fg = v('--fg', dark ? '#e6edf3' : '#1f2328');
    return { background: bg, foreground: fg, cursor: fg, cursorAccent: bg, selectionBackground: dark ? '#264f78' : '#b6d4fe', selectionForeground: fg };
  };
  const applyTheme = () => {
    const colors = theme();
    box.style.setProperty('--terminal-background', colors.background);
    box.style.setProperty('--terminal-foreground', colors.foreground);
    if (term) term.options.theme = colors;
  };
  let term, ws, ro, gone = false;
  // replayed：历史已经重放完、回到了上次看的位置。没放完就又切走，不能把「还在底部」当成你看的位置记下来。
  // hold：刚切回来的两秒内，终端又改了大小、程序又整屏重画，位置会被冲掉——这段时间里按记住的那几行再找回去；
  // 你一滚、一点、一打字就不再管
  let replayed = false, hold = null;
  applyTheme();
  addEventListener('studio-theme', applyTheme);
  loadXterm().then(() => {
    if (gone) return;
    term = new window.Terminal({
      fontFamily: 'Menlo, "SF Mono", Consolas, monospace', fontSize: 13, lineHeight: 1.15, cursorBlink: true, scrollback: 20000,
      // CLI 会为输入行单独设置 ANSI 背景；默认前景色遇到它可能变成黑底黑字。
      // 由渲染器按每个单元格的实际前景/背景保证可读，不改终端收到的内容。
      minimumContrastRatio: 4.5,
      theme: theme(),
    });
    const fit = new window.FitAddon.FitAddon();
    term.loadAddon(fit);
    term.open(box);
    const wheelState = { lines: 0 };
    term.attachCustomWheelEventHandler((event) => { hold = null; return handleTerminalWheel(term, event, wheelState); });
    box.addEventListener('pointerdown', () => { hold = null; }, true);
    box.addEventListener('keydown', () => { hold = null; }, true);
    term.onWriteParsed(() => { if (hold && Date.now() < hold.until) restoreViewport(term, hold.pos); else hold = null; });
    // 用 WebGL 画：每个字都放进它该占的格子里。默认的 DOM 画法按字体自己的宽度排中文，一个字比两格宽一点点，
    // 一行字多了就累积起来，把行尾一两个字挤到右边看不见的地方。WebGL 用不了（显卡上下文丢了）就退回 DOM 画法
    try {
      const gl = new window.WebglAddon.WebglAddon();
      gl.onContextLoss(() => gl.dispose());
      term.loadAddon(gl);
    } catch {}
    const fitNow = () => {
      const d = fit.proposeDimensions();
      if (!d?.cols || !d?.rows) return;
      const position = hold && Date.now() < hold.until ? hold.pos : viewportPosition(term);
      term.resize(Math.max(20, d.cols), d.rows);
      restoreViewport(term, position);
    };
    try { fitNow(); } catch {}
    const enc = new TextEncoder();
    const size = () => ws?.readyState === 1 && ws.send(JSON.stringify({ cols: term.cols, rows: term.rows }));
    // 连接断了（服务重启、电脑睡眠唤醒、网络抖动）不等于会话结束：会话还在就自动连回去。
    // 连回去时服务端会重发整屏和历史，所以先清空，再按原来的滚动位置恢复；真的结束了才写「会话已结束」
    const connect = (again) => {
      ws = new WebSocket(location.origin.replace(/^http/, 'ws') + '/api/terminal/' + encodeURIComponent(name));
      ws.binaryType = 'arraybuffer';
      let fresh = again;
      ws.onopen = () => { size(); if (!again) term.focus(); };
      ws.onmessage = (e) => {
        if (gone) return;
        if (fresh) { fresh = false; terminalViewports.set(name, viewportPosition(term)); term.reset(); replayed = false; }
        term.write(typeof e.data === 'string' ? e.data : new Uint8Array(e.data), () => {
          if (!replayed && !gone) {
            replayed = true;
            const pos = terminalViewports.get(name);
            restoreViewport(term, pos);
            hold = pos?.offset ? { pos, until: Date.now() + 2000 } : null;
          }
        });
      };
      ws.onclose = () => { if (!gone) reconnect(); };
    };
    const reconnect = async () => {
      for (let i = 0; !gone; i++) {
        await new Promise((r) => setTimeout(r, Math.min(500 * 2 ** i, 5000)));
        if (gone) return;
        let alive;
        try { alive = (await (await fetch('api/state', { cache: 'no-store' })).json()).agents.some((a) => a.term === name); } catch { continue; } // 服务还没起来，接着等
        if (gone) return;
        if (alive) return connect(true);
        term.write('\r\n\x1b[90m[会话已结束]\x1b[0m\r\n');
        return;
      }
    };
    connect(false);
    // 复制时顺便记下带粗体的版本和终端宽度：粘进笔记时按这个整理成 md（见 termpaste.js）
    box.addEventListener('copy', () => {
      if (!term.hasSelection()) return;
      window.studioTermCopy = { plain: term.getSelection(), rich: richSelection(term), cols: term.cols };
    }, true);
    const send = (s) => ws?.readyState === 1 && ws.send(enc.encode(s));
    term.onData(send);
    // Shift+Enter：换行，不发送（和装过 /terminal-setup 的终端一样）
    term.attachCustomKeyEventHandler((e) => {
      if (e.key === 'Enter' && e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey && newline) {
        if (e.type === 'keydown') send(newline);
        return false;
      }
      return true;
    });
    // 输出里的网址可以点（在浏览器里打开）
    // 网址：长网址会折成好几行（终端自己折的，或 agent 按窗口宽度自己换的行），所以把连着的几行拼起来再找，
    // 一个网址跨几行也能整个点开。中文等宽字符占两格：记下每个字在第几行第几格，链接的范围才对得上
    const rowText = (yy) => {
      const line = term.buffer.active.getLine(yy);
      if (!line) return null;
      let text = '';
      const pos = [];
      for (let x = 0; x < line.length; x++) {
        const c = line.getCell(x);
        if (!c || c.getWidth() === 0) continue;
        const ch = c.getChars() || ' ';
        for (let k = 0; k < ch.length; k++) pos.push([x, yy, c.getWidth()]);
        text += ch;
      }
      return { text, pos, line };
    };
    // 这一行和下一行是不是连着的：下一行是终端折出来的，或者这一行一直写到了最右一格
    const joined = (yy) => {
      const next = term.buffer.active.getLine(yy + 1), cur = term.buffer.active.getLine(yy);
      if (!next || !cur) return false;
      if (next.isWrapped) return true;
      const last = cur.getCell(term.cols - 1);
      const first = next.getCell(0);
      return !!(last?.getChars().trim() && first?.getChars().trim());
    };
    const URL_RE = /https?:\/\/[^\s"'<>()\[\]{}，。、；：！？]+[^\s"'<>()\[\]{}，。、；：！？.,;:!?]/g;
    term.registerLinkProvider({
      provideLinks(y, cb) {
        let top = y - 1, bottom = y - 1;
        while (top > 0 && joined(top - 1) && y - 1 - top < 20) top--;
        while (joined(bottom) && bottom - (y - 1) < 20) bottom++;
        let text = '';
        const pos = [];
        for (let r = top; r <= bottom; r++) {
          const t = rowText(r);
          if (!t) break;
          // 拼接时去掉行尾空白（agent 自己换行时右边补的空格）
          const keep = r < bottom ? t.text.replace(/\s+$/, '').length : t.text.length;
          text += t.text.slice(0, keep);
          pos.push(...t.pos.slice(0, keep));
        }
        const links = [];
        for (const m of text.matchAll(URL_RE)) {
          const a = pos[m.index], b = pos[m.index + m[0].length - 1];
          if (!a || !b || b[1] < y - 1 || a[1] > y - 1) continue; // 只要经过这一行的
          links.push({ text: m[0], range: { start: { x: a[0] + 1, y: a[1] + 1 }, end: { x: b[0] + b[2], y: b[1] + 1 } }, activate: () => window.open(m[0], '_blank') });
        }
        cb(links.length ? links : undefined);
      },
    });
    // 把文件拖进终端：插入它的路径（桌面应用里才拿得到完整路径）
    box.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
    box.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const paths = [...(e.dataTransfer?.files || [])].map((f) => window.studio?.pathOf?.(f)).filter(Boolean);
      if (paths.length) send(paths.map(shellPath).join(' ') + ' ');
      term.focus();
    });
    term.onResize(size);
    // 框的大小真的变了才重新量（最多一帧一次）；面板收起（宽高为 0）时不量，不然 xterm 会报错。
    // 万一还是来回跳（一秒内量了很多次），先停一下，免得 agent 不停整屏重画
    let last = '', raf = 0, times = [];
    const refit = () => {
      raf = 0;
      if (gone || !box.offsetWidth || !box.offsetHeight) return;
      const k = box.clientWidth + 'x' + box.clientHeight;
      if (k === last) return;
      const now = performance.now();
      times = times.filter((t) => now - t < 1000);
      if (times.length >= 6) { setTimeout(() => { if (!raf) raf = requestAnimationFrame(refit); }, 1000); return; } // 停一秒再量最后一次
      times.push(now);
      last = k;
      try { fitNow(); } catch {}
    };
    ro = new ResizeObserver(() => { if (!raf) raf = requestAnimationFrame(refit); });
    ro.observe(box);
  }).catch(() => { box.innerHTML = '<p class="empty pad">终端组件加载失败</p>'; });
  // 等 xterm 手上的刷新做完再销毁，不然它会报错
  return { destroy() {
    if (gone) return;
    if (term && replayed) {
      terminalViewports.delete(name);
      terminalViewports.set(name, viewportPosition(term));
      if (terminalViewports.size > 200) terminalViewports.delete(terminalViewports.keys().next().value);
    }
    gone = true; removeEventListener('studio-theme', applyTheme); ro?.disconnect();
    try { ws?.close(); } catch {}
    const t = term; setTimeout(() => { try { t?.dispose(); } catch {} }, 300);
  } };
}

// ---------- 新会话 ----------
// 一个会话 = 一个任务 = 一个终端：写清楚要做什么（就是会话的名字），选一个 agent。
// 勾上「带上笔记」：把「先读笔记、再做任务」作为第一句话交给 agent（命令行参数），它启动好、你确认信任文件夹之后自己开始
// info：服务端的 terminal 信息 {ok, why, agents: [{id, label, found}]}
export function newForm(el, info, rel, dirName, { onDone, onCancel, note }) {
  if (!info.ok || !info.agents?.length) {
    el.innerHTML = `<div class="ag-unavailable"><span class="ag-form-symbol">${ic('terminal', 20)}</span><h3>暂时无法开启会话</h3><p>${esc(info.why || '还没有可用的 AI 助手。')}</p></div>`;
    return { destroy() {} };
  }
  const installed = info.agents.filter((a) => a.found);
  const saved = localStorage.getItem('studio.lastAgent');
  const selected = info.agents.some((a) => a.id === saved) ? saved : (installed[0] || info.agents[0]).id;
  // 常用区只放两位：上次使用的已安装助手优先，其余按原顺序。
  // 即使本机装了很多 CLI，也不让选择区挤走任务和「开始」按钮。
  const chosenInstalled = installed.find((a) => a.id === selected);
  const available = (chosenInstalled ? [chosenInstalled, ...installed.filter((a) => a !== chosenInstalled)] : installed).slice(0, 2);
  const primaryIds = new Set(available.map((a) => a.id));
  const more = info.agents.filter((a) => !primaryIds.has(a.id));
  const marks = { claude: 'C', codex: 'CX', opencode: 'OC', copilot: 'CP', gemini: 'G', vibe: 'V', qwen: 'Q', cline: 'CL', kilo: 'K' };
  const choice = (a) => `<label class="ag-pick ag-choice${a.found ? '' : ' off'}">
    <input type="radio" name="agent" value="${esc(a.id)}"${a.id === selected ? ' checked' : ''}>
    <span class="ag-choice-mark" aria-hidden="true">${esc(marks[a.id] || a.label.slice(0, 2))}</span>
    <span class="ag-choice-copy"><span class="ag-choice-name">${esc(a.label)}</span><span class="ag-choice-state${a.found ? ' ready' : ''}">${a.found ? '已安装' : '启动时安装'}</span></span>
    <span class="ag-choice-check" aria-hidden="true">${ic('check', 12)}</span>
  </label>`;
  const modifier = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';
  el.innerHTML = `<form class="ag-new ag-compose">
    <div class="ag-form-content">
    <header class="ag-form-head">
      <span class="ag-form-symbol">${ic('terminal', 20)}</span>
      <h2>新会话</h2>
      <p>开起来后，直接在终端里跟它说要做什么。</p>
      <span class="ag-workdir" title="${esc(rel || dirName)}">${ic('folderOpen', 13)}<span>${esc(dirName)}</span></span>
    </header>
    <label class="ag-task-field"><span class="ag-field-label">标题</span>
      <input name="title" type="text" maxlength="120" placeholder="可以不填，例如：整理这周的研究笔记" autocomplete="off">
      <span class="ag-field-help">只用来在标签和导图上认出这个会话，不会发给助手。</span>
    </label>
    <fieldset class="ag-assistants"><legend class="ag-field-label">AI 助手</legend>
      ${!installed.length ? '<p class="ag-install-hint">首次使用会先安装所选助手。</p>' : ''}
      ${available.length ? `<div class="ag-choice-grid">${available.map(choice).join('')}</div>` : ''}
      ${more.length ? `<details class="ag-more"${more.some((a) => a.id === selected) ? ' open' : ''}><summary><span>其他助手</span><span class="ag-more-count">${more.length} 个可选</span></summary><div class="ag-choice-grid">${more.map(choice).join('')}</div></details>` : ''}
    </fieldset>
    ${note ? `<label class="ag-context"><input type="checkbox" name="ctx" checked><span><b>开场先读文件夹笔记</b><span class="ag-context-file">${esc(note)} · 读完等你吩咐</span></span></label>` : ''}
    </div>
    <footer class="ag-form-footer"><div class="ag-form-actions"><button type="button" data-cancel>取消</button><button type="submit" class="primary"><span data-submit-label>开始</span>${ic('corner', 14)}</button></div><span class="ag-submit-shortcut">Enter 开始</span><p class="msg" role="status" aria-live="polite"></p></footer>
  </form>`;
  const f = el.querySelector('form');
  let busy = false, gone = false;
  const selectedAgent = () => info.agents.find((a) => a.id === f.elements.agent.value);
  const syncBtn = () => { f.querySelector('[data-submit-label]').textContent = selectedAgent()?.found ? '开始' : '安装并开始'; };
  const cancel = () => { if (!busy) onCancel?.(); };
  f.addEventListener('change', syncBtn);
  f.querySelector('[data-cancel]').onclick = cancel;
  f.onkeydown = (e) => {
    if (e.key === 'Enter' && !e.isComposing && (e.metaKey || e.ctrlKey || e.target.name === 'title')) { e.preventDefault(); f.requestSubmit(); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(); }
  };
  syncBtn();
  f.elements.title.focus();
  f.onsubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const msg = f.querySelector('.msg'), title = f.elements.title.value.trim(), agent = selectedAgent();
    if (!agent) return;
    busy = true;
    f.setAttribute('aria-busy', 'true');
    msg.dataset.state = 'loading';
    msg.textContent = agent.found ? '正在启动会话…' : '正在准备安装，请稍候…';
    const controls = [...f.querySelectorAll('input, textarea, button, fieldset')];
    controls.forEach((c) => { c.disabled = true; });
    try {
      localStorage.setItem('studio.lastAgent', agent.id);
      // 不替你发任务：开起来后你自己在终端里说。勾了「先读笔记」就只让它读一遍、读完等你
      const prompt = note && f.elements.ctx?.checked ? `先读一下 ./${note}：它是「${dirName}」这个文件夹的笔记，记着这件事的背景、导图和进展。读完用一两句话说你了解到了什么，然后等我说这次要做什么，先不要动手。` : '';
      const s = await post('api/session/new', { agent: agent.id, path: rel, title, prompt, install: !agent.found });
      if (!gone) onDone('term:' + s.name);
    } catch (err) {
      if (gone) return;
      busy = false;
      f.removeAttribute('aria-busy');
      controls.forEach((c) => { c.disabled = false; });
      msg.dataset.state = 'error';
      msg.textContent = '没能启动会话：' + err.message;
      syncBtn();
    }
  };
  return { destroy() { gone = true; } };
}

// 结束会话（关掉终端和 agent 进程）；删除对话记录（agent 存在本机的那份）
export const endSession = (name) => post('api/session/end', { name });
export const wipeConversation = (tool, id) => post('api/session/wipe', { tool, id });
