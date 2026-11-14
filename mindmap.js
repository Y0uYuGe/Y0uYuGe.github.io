// 通用导图组件：工作区导图和"笔记转导图"共用。
// 借鉴 XMind / MindNode / markmap：按节点逐个排布（不按列对齐）、左右平衡布局、分支配色、
// 展开收起动画、滚轮平移 + Ctrl 滚轮缩放、方向键导航、小地图、适应窗口、节点上直接改字。
//
// 数据：{ id, children: [], collapsed?: bool } 组成的树；节点长什么样由 opts.render(node) 决定。

const PALETTE = ['#e8590c', '#1c7ed6', '#2f9e44', '#ae3ec9', '#f08c00', '#0c8599', '#d6336c', '#5c940d', '#4263eb', '#c2255c'];
const GAP_X = 44, GAP_Y = 10, PAD = 40;

export class MindMap {
  constructor(el, opts = {}) {
    this.opts = { layout: 'right', minimap: true, ...opts };
    this.el = el;
    el.classList.add('mm');
    el.tabIndex = 0;
    el.innerHTML = '<div class="mm-canvas"><svg class="mm-links"></svg><div class="mm-nodes"></div></div>' +
      (this.opts.minimap ? '<canvas class="mm-mini" width="180" height="120"></canvas>' : '');
    this.canvas = el.querySelector('.mm-canvas');
    this.svg = el.querySelector('.mm-links');
    this.box = el.querySelector('.mm-nodes');
    this.mini = el.querySelector('.mm-mini');
    this.view = { x: PAD, y: 0, k: 1 };
    this.els = new Map();   // id -> 节点元素
    this.paths = new Map(); // id -> 连线
    this.pos = new Map();   // id -> 上次的位置（新节点从父节点位置长出来）
    this.sel = null;
    this.placed = false;
    this.bind();
  }

  setData(root) { this.root = root; }
  setLayout(layout) { this.opts.layout = layout; this.render(); this.fit(); }

  // ---------- 渲染 ----------
  render() {
    if (!this.root) return;
    const flat = [];
    const walk = (n, depth, parent, color) => {
      n._depth = depth; n._parent = parent;
      n._color = depth === 1 ? PALETTE[flat.filter((x) => x._depth === 1).length % PALETTE.length] : color;
      flat.push(n);
      n._kids = n.collapsed ? [] : n.children;
      n._kids.forEach((k) => walk(k, depth + 1, n, n._color));
    };
    walk(this.root, 0, null, null);
    this.flat = flat;

    // 1. 建立/更新节点元素，先量尺寸
    const seen = new Set();
    for (const n of flat) {
      seen.add(n.id);
      let el = this.els.get(n.id);
      const fresh = !el;
      if (fresh) {
        el = document.createElement('div');
        el.dataset.id = n.id;
        this.box.appendChild(el);
        this.els.set(n.id, el);
      }
      const html = this.opts.render(n);
      if (el._html !== html) { el.innerHTML = html; el._html = html; }
      const cls = ['mm-node', n._depth === 0 && 'mm-root', n._depth === 1 && 'mm-main', n.id === this.sel && 'mm-sel', fresh && 'mm-new', this.opts.nodeClass?.(n)].filter(Boolean).join(' ');
      if (el.className !== cls) el.className = cls;
      el.style.setProperty('--c', n._color || 'var(--fg)');
    }
    for (const [id, el] of this.els) if (!seen.has(id)) { el.remove(); this.els.delete(id); this.paths.get(id)?.remove(); this.paths.delete(id); }
    for (const n of flat) { const el = this.els.get(n.id); n._w = el.offsetWidth; n._h = el.offsetHeight; }

    // 2. 布局：子树高度 -> 纵向位置；左右平衡时一级分支按高度分到两侧
    const height = (n) => (n._sh = n._kids.length ? Math.max(n._h, n._kids.reduce((s, k) => s + height(k), 0) + GAP_Y * (n._kids.length - 1)) : n._h);
    height(this.root);
    const r = this.root;
    r._x = 0; r._y = 0; r._side = 1;
    let right = r._kids, left = [];
    if (this.opts.layout === 'both' && r._kids.length > 1) {
      const total = r._kids.reduce((s, k) => s + k._sh, 0);
      let acc = 0; right = []; left = [];
      for (const k of r._kids) (acc + k._sh / 2 <= total / 2 ? right : left).push(k), acc += k._sh;
      if (!left.length) left.push(right.pop());
    }
    const stack = (kids, parent, side) => {
      const sum = kids.reduce((s, k) => s + k._sh, 0) + GAP_Y * (kids.length - 1);
      let y = parent._y - sum / 2;
      for (const k of kids) {
        k._side = side;
        k._y = y + k._sh / 2;
        k._x = side > 0 ? parent._x + parent._w / 2 + GAP_X + k._w / 2 : parent._x - parent._w / 2 - GAP_X - k._w / 2;
        y += k._sh + GAP_Y;
        stack(k._kids, k, side);
      }
    };
    stack(right, r, 1);
    stack(left, r, -1);

    // 3. 放置（CSS 过渡负责动画）；新节点先放在父节点上，下一帧再移到目标位置
    const place = (n) => `translate(${n._x - n._w / 2}px, ${n._y - n._h / 2}px)`;
    const fresh = [];
    for (const n of flat) {
      const el = this.els.get(n.id);
      if (el.classList.contains('mm-new') && n._parent) {
        const p = this.pos.get(n._parent.id) || n._parent;
        el.style.transform = `translate(${p._x - n._w / 2}px, ${p._y - n._h / 2}px)`;
        fresh.push([el, n]);
      } else { el.classList.remove('mm-new'); el.style.transform = place(n); }
      this.pos.set(n.id, { _x: n._x, _y: n._y });
    }
    requestAnimationFrame(() => fresh.forEach(([el, n]) => { el.classList.remove('mm-new'); el.style.transform = place(n); }));

    // 4. 连线：从父节点边缘到子节点边缘的曲线
    for (const n of flat) {
      if (!n._parent) continue;
      const p = n._parent, s = n._side;
      const x1 = p._x + s * p._w / 2, y1 = p._y, x2 = n._x - s * n._w / 2, y2 = n._y, mx = (x1 + x2) / 2;
      let path = this.paths.get(n.id);
      if (!path) {
        path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        this.svg.appendChild(path);
        this.paths.set(n.id, path);
      }
      path.style.d = `path("M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}")`;
      path.style.stroke = n._color || 'var(--line)';
      path.style.strokeWidth = n._depth === 1 ? 2.5 : 1.5;
    }
    for (const [id, path] of this.paths) if (!seen.has(id) || id === this.root.id) { path.remove(); this.paths.delete(id); }

    this.bounds = flat.reduce((b, n) => ({
      x1: Math.min(b.x1, n._x - n._w / 2), x2: Math.max(b.x2, n._x + n._w / 2),
      y1: Math.min(b.y1, n._y - n._h / 2), y2: Math.max(b.y2, n._y + n._h / 2),
    }), { x1: Infinity, x2: -Infinity, y1: Infinity, y2: -Infinity });
    if (!this.placed) { this.placed = true; this.home(); }
    this.apply();
  }

  // ---------- 视图 ----------
  apply() {
    this.canvas.style.transform = `translate(${this.view.x}px, ${this.view.y}px) scale(${this.view.k})`;
    this.drawMini();
    this.opts.onView?.();
  }

  // 根节点放左侧居中（左右平衡时放中间）
  home() {
    const w = this.el.clientWidth, h = this.el.clientHeight;
    this.view = { k: 1, x: this.opts.layout === 'both' ? w / 2 : PAD + this.root._w / 2, y: h / 2 };
    this.apply();
  }

  // 适应窗口。minK：图太大时不缩到看不清，改为按 minK 显示、中心主题放左侧居中
  fit(minK = 0) {
    const b = this.bounds, w = this.el.clientWidth, h = this.el.clientHeight;
    if (!b || !w) return;
    const k = Math.min(1.2, (w - PAD * 2) / (b.x2 - b.x1), (h - PAD * 2) / (b.y2 - b.y1));
    if (k < minK) {
      const r = this.root;
      this.view = { k: minK, x: this.opts.layout === 'both' ? w / 2 : PAD + (r._w / 2) * minK, y: h / 2 - r._y * minK };
    } else {
      this.view = { k, x: w / 2 - ((b.x1 + b.x2) / 2) * k, y: h / 2 - ((b.y1 + b.y2) / 2) * k };
    }
    this.apply();
  }

  // 选中节点不在视野内时平移过去
  reveal(id) {
    const n = this.flat?.find((x) => x.id === id);
    if (!n) return;
    const { x, y, k } = this.view, w = this.el.clientWidth, h = this.el.clientHeight;
    const sx = x + n._x * k, sy = y + n._y * k, m = 60;
    if (sx < m || sx > w - m || sy < m || sy > h - m) { this.view.x += w / 2 - sx; this.view.y += h / 2 - sy; this.apply(); }
  }

  drawMini() {
    const c = this.mini, b = this.bounds;
    if (!c || !b || !this.flat) return;
    const ctx = c.getContext('2d'), W = c.width, H = c.height;
    const s = Math.min((W - 8) / (b.x2 - b.x1), (H - 8) / (b.y2 - b.y1));
    const ox = (W - (b.x2 - b.x1) * s) / 2 - b.x1 * s, oy = (H - (b.y2 - b.y1) * s) / 2 - b.y1 * s;
    this.miniT = { s, ox, oy };
    ctx.clearRect(0, 0, W, H);
    for (const n of this.flat) {
      ctx.fillStyle = n._color || '#888';
      ctx.fillRect(ox + (n._x - n._w / 2) * s, oy + (n._y - n._h / 2) * s, Math.max(2, n._w * s), Math.max(1.5, n._h * s));
    }
    const { x, y, k } = this.view;
    ctx.strokeStyle = '#2f6feb';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(ox + (-x / k) * s, oy + (-y / k) * s, (this.el.clientWidth / k) * s, (this.el.clientHeight / k) * s);
  }

  // ---------- 选择与编辑 ----------
  select(id, reveal = true) {
    if (this.sel === id) return;
    this.els.get(this.sel)?.classList.remove('mm-sel');
    this.sel = id;
    this.els.get(id)?.classList.add('mm-sel');
    if (reveal) this.reveal(id);
  }

  node(id) { return this.flat?.find((n) => n.id === id); }

  // 节点相对于导图容器的位置（屏幕坐标），用于在旁边放浮层
  nodeRect(id) {
    const n = this.node(id);
    if (!n) return null;
    const { x, y, k } = this.view;
    return { left: x + (n._x - n._w / 2) * k, top: y + (n._y - n._h / 2) * k, right: x + (n._x + n._w / 2) * k, bottom: y + (n._y + n._h / 2) * k };
  }

  // 在节点上直接改字：Enter 确认，Esc 取消
  edit(id) {
    const el = this.els.get(id), label = el?.querySelector('.mm-label');
    if (!label) return;
    const shown = label.textContent;
    // 改字时显示的文字可以和节点上显示的不同（例如文件夹显示中文别名，改的是真实文件夹名）
    const old = this.opts.editText?.(this.node(id)) ?? shown;
    label.textContent = old;
    label.contentEditable = 'plaintext-only';
    label.focus();
    document.getSelection().selectAllChildren(label);
    this.editing = true;
    const done = (ok) => {
      label.removeEventListener('keydown', key);
      label.removeEventListener('blur', blur);
      label.contentEditable = 'false';
      this.editing = false;
      this.el.focus();
      const text = label.textContent.replace(/\s+/g, ' ').trim();
      if (ok && text && text !== old) this.opts.onRename?.(this.node(id), text);
      else label.textContent = shown;
    };
    const key = (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); done(true); }
      if (e.key === 'Escape') { e.preventDefault(); done(false); }
    };
    const blur = () => done(true);
    label.addEventListener('keydown', key);
    label.addEventListener('blur', blur);
  }

  // ---------- 交互 ----------
  bind() {
    const el = this.el;
    let drag = null;
    el.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.mm-node, .mm-mini, .mm-pop') || this.editing) return;
      drag = { x: e.clientX - this.view.x, y: e.clientY - this.view.y };
      el.classList.add('mm-drag');
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => { if (drag) { this.view.x = e.clientX - drag.x; this.view.y = e.clientY - drag.y; this.apply(); } });
    el.addEventListener('pointerup', () => { drag = null; el.classList.remove('mm-drag'); });
    // 滚轮平移，Ctrl/触控板捏合缩放
    el.addEventListener('wheel', (e) => {
      if (e.target.closest('.mm-pop') && !e.ctrlKey) return;
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const r = el.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
        const k = Math.min(2.5, Math.max(0.2, this.view.k * Math.exp(-e.deltaY * 0.0025)));
        this.view.x = mx - (mx - this.view.x) * (k / this.view.k);
        this.view.y = my - (my - this.view.y) * (k / this.view.k);
        this.view.k = k;
      } else {
        this.view.x -= e.shiftKey ? e.deltaY : e.deltaX;
        this.view.y -= e.shiftKey ? 0 : e.deltaY;
      }
      this.apply();
    }, { passive: false });
    // 小地图：点或拖动跳到那里
    if (this.mini) {
      const jump = (e) => {
        const t = this.miniT, r = this.mini.getBoundingClientRect();
        if (!t) return;
        const wx = (e.clientX - r.left - t.ox) / t.s, wy = (e.clientY - r.top - t.oy) / t.s;
        this.view.x = el.clientWidth / 2 - wx * this.view.k;
        this.view.y = el.clientHeight / 2 - wy * this.view.k;
        this.apply();
      };
      this.mini.addEventListener('pointerdown', (e) => { e.stopPropagation(); jump(e); this.mini.setPointerCapture(e.pointerId); this.mini.onpointermove = jump; });
      this.mini.addEventListener('pointerup', () => { this.mini.onpointermove = null; });
    }
    el.addEventListener('click', (e) => {
      const nodeEl = e.target.closest('.mm-node');
      if (!nodeEl) return;
      const n = this.node(nodeEl.dataset.id);
      if (e.target.closest('.mm-toggle')) { this.opts.onToggle?.(n); return; }
      this.select(n.id, false);
      this.opts.onSelect?.(n, 'click');
    });
    el.addEventListener('dblclick', (e) => {
      const nodeEl = e.target.closest('.mm-node');
      if (nodeEl) this.opts.onActivate?.(this.node(nodeEl.dataset.id), e);
    });
    el.addEventListener('keydown', (e) => this.key(e));
  }

  // 方向键在节点间移动；其它键交给使用方（opts.onKey 返回 true 表示已处理）
  zoom(f) {
    const w = this.el.clientWidth / 2, h = this.el.clientHeight / 2;
    const k = Math.min(2.5, Math.max(0.2, this.view.k * f));
    this.view.x = w - (w - this.view.x) * (k / this.view.k);
    this.view.y = h - (h - this.view.y) * (k / this.view.k);
    this.view.k = k;
    this.apply();
  }

  // XMind 式快捷键。使用方的 opts.onKey 先处理（返回 true 表示已处理），剩下的是通用的导航和视图操作
  key(e) {
    if (this.editing || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.closest?.('.mm-pop')) return;
    const n = this.node(this.sel) || this.root;
    if (this.opts.onKey?.(e, n)) { e.preventDefault(); return; }
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && (e.key === '=' || e.key === '+')) { e.preventDefault(); return this.zoom(1.2); }
    if (ctrl && e.key === '-') { e.preventDefault(); return this.zoom(1 / 1.2); }
    if (ctrl && e.key === '0') { e.preventDefault(); return this.fit(); }
    if (ctrl && e.key === '/') { e.preventDefault(); if (n.children.length) this.opts.onToggle?.(n); return; }
    if (e.key === 'Home') { e.preventDefault(); this.select(this.root.id); this.opts.onSelect?.(this.root); return; }
    if (e.key === 'Escape') { if (this.opts.onEscape?.()) e.preventDefault(); return; }
    if (e.key === '?') { e.preventDefault(); this.opts.onHelp?.(); return; }
    if (e.key === 'F2' && this.opts.onRename) { e.preventDefault(); if (n !== this.root || this.opts.rootEditable) this.edit(n.id); return; }
    const go = (m) => { if (m) { e.preventDefault(); this.select(m.id); this.opts.onSelect?.(m, 'key'); } };
    const sibs = n._parent?._kids || [n];
    const i = sibs.indexOf(n);
    const out = (side) => (n === this.root ? this.root._kids.find((k) => k._side === side) : n._side === side ? n._kids[0] : n._parent);
    if (e.key === 'ArrowRight') {
      if (n.collapsed && n.children.length && (n === this.root || n._side > 0)) { e.preventDefault(); this.opts.onToggle?.(n); return; }
      go(out(1));
    } else if (e.key === 'ArrowLeft') {
      if (n.collapsed && n.children.length && n._side < 0) { e.preventDefault(); this.opts.onToggle?.(n); return; }
      go(out(-1));
    } else if (e.key === 'ArrowUp') go(sibs[i - 1]);
    else if (e.key === 'ArrowDown') go(sibs[i + 1]);
    else if (e.key === ' ' && n.children.length) { e.preventDefault(); this.opts.onToggle?.(n); }
    else if (e.key === 'Enter') { e.preventDefault(); this.opts.onActivate?.(n, e); }
  }
}
