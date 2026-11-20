// 通用导图组件：工作区导图和"笔记转导图"共用。
// 借鉴 XMind / MindNode / markmap：按节点逐个排布（不按列对齐）、左右平衡布局、分支配色、
// 展开收起动画、滚轮平移 + Ctrl 滚轮缩放、方向键导航、小地图、适应窗口、节点上直接改字。
//
// 数据：{ id, children: [], collapsed?: bool } 组成的树；节点长什么样由 opts.render(node) 决定。

const PALETTE = ['#b68b68', '#7787b2', '#7b9b85', '#9a88b0', '#b09b69', '#6c9a9b', '#ac8192', '#8b9b72', '#8b8bc2', '#ac8a86'];
const GAP_X = 44, GAP_Y = 12, PAD = 40;

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
    this.picks = new Set(); // 框选 / Shift、⌘ 点出来的一组（两个以上才算）；sel 是其中最后点的那个
    this.placed = false;
    this.bind();
  }

  setData(root) { this.root = root; }
  setLayout(layout) { this.opts.layout = layout; this.render(); this.fit(); }

  // ---------- 渲染 ----------
  render() {
    if (!this.root) return;
    const activeAction = document.activeElement?.closest?.('.mm-note, .mm-kids');
    const actionFocus = activeAction && this.el.contains(activeAction)
      ? { id: activeAction.closest('.mm-node')?.dataset.id, selector: activeAction.classList.contains('mm-note') ? '.mm-note' : '.mm-kids' } : null;
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
      const cls = ['mm-node', n._depth === 0 && 'mm-root', n._depth === 1 && 'mm-main', n.id === this.sel && 'mm-sel', this.picks.has(n.id) && 'mm-pick', fresh && 'mm-new', this.opts.nodeClass?.(n)].filter(Boolean).join(' ');
      if (el.className !== cls) el.className = cls;
      el.style.setProperty('--c', n._color || 'var(--fg)');
    }
    for (const id of this.picks) if (!seen.has(id)) this.picks.delete(id);
    if (this.picks.size < 2) this.unpick();
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

    // 3. 放置（CSS 过渡负责动画）；新节点先放在父节点上，下一帧再移到目标位置。
    //    目标位置记在元素上（_target），下一帧取「那时最新的」目标：一帧里连着重排好几次（连点展开、刚好赶上定时刷新）时，
    //    不会被前一次排版的旧位置盖回去（以前会这样：节点叠在一起、连线连到空处）
    const place = (n) => `translate(${n._x - n._w / 2}px, ${n._y - n._h / 2}px)`;
    const fresh = [];
    for (const n of flat) {
      const el = this.els.get(n.id);
      el._target = place(n);
      if (el.classList.contains('mm-new') && n._parent) {
        const p = this.pos.get(n._parent.id) || n._parent;
        el.style.transform = `translate(${p._x - n._w / 2}px, ${p._y - n._h / 2}px)`;
        fresh.push(el);
      } else { el.classList.remove('mm-new'); el.style.transform = el._target; }
      this.pos.set(n.id, { _x: n._x, _y: n._y });
    }
    if (fresh.length) requestAnimationFrame(() => fresh.forEach((el) => { if (!el.isConnected) return; el.classList.remove('mm-new'); el.style.transform = el._target; }));

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
      path.classList.toggle('mm-dash', !!this.opts.dashed?.(n)); // 比如笔记的标题：虚线，和文件夹之间的连线区分开
    }
    for (const [id, path] of this.paths) if (!seen.has(id) || id === this.root.id) { path.remove(); this.paths.delete(id); }

    this.bounds = flat.reduce((b, n) => ({
      x1: Math.min(b.x1, n._x - n._w / 2), x2: Math.max(b.x2, n._x + n._w / 2),
      y1: Math.min(b.y1, n._y - n._h / 2), y2: Math.max(b.y2, n._y + n._h / 2),
    }), { x1: Infinity, x2: -Infinity, y1: Infinity, y2: -Infinity });
    if (!this.placed) { this.placed = true; this.home(); }
    this.apply();
    if (actionFocus) this.els.get(actionFocus.id)?.querySelector(actionFocus.selector)?.focus({ preventScroll: true });
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
    const k = Math.min(1, (w - PAD * 2) / (b.x2 - b.x1), (h - PAD * 2) / (b.y2 - b.y1));
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

  // ---------- 多选 ----------
  // 使用方给 opts.canPick() 才能多选（只读的博客里不用：空白处拖还是平移）
  canPick() { return !!this.opts.canPick?.(); }
  // 选中的一组（按导图上的顺序）；没有多选时是空的
  picked() { return this.picks.size > 1 ? (this.flat || []).filter((n) => this.picks.has(n.id)) : []; }
  setPicks(ids) {
    const next = new Set(ids);
    if (next.size < 2) next.clear();
    for (const id of this.picks) if (!next.has(id)) this.els.get(id)?.classList.remove('mm-pick');
    for (const id of next) this.els.get(id)?.classList.add('mm-pick');
    const was = this.picks.size;
    this.picks = next;
    this.el.classList.toggle('mm-multi', next.size > 1);
    if (was || next.size) this.opts.onPicks?.(this.picked());
  }
  unpick() { if (this.picks.size) this.setPicks([]); }
  // Shift / ⌘ 点：加进这一组或从组里拿掉
  togglePick(id) {
    const ids = new Set(this.picks.size ? this.picks : this.sel != null && this.sel !== id ? [this.sel] : []);
    if (ids.has(id)) {
      ids.delete(id);
      if (this.sel === id) this.select([...ids].at(-1) ?? id, false);
    } else { ids.add(id); this.select(id, false); }
    this.setPicks(ids);
  }

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
    const done = (ok, how) => {
      label.removeEventListener('keydown', key);
      label.removeEventListener('blur', blur);
      label.contentEditable = 'false';
      this.editing = false;
      this.el.focus();
      const text = label.textContent.replace(/\s+/g, ' ').trim();
      const changed = !!(ok && text && text !== old);
      if (changed) this.opts.onRename?.(this.node(id), text);
      else label.textContent = shown;
      this.opts.onEditEnd?.(this.node(id), { how, changed }); // how：enter / escape / blur
    };
    const key = (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); done(true, 'enter'); }
      if (e.key === 'Escape') { e.preventDefault(); done(false, 'escape'); }
    };
    const blur = () => done(true, 'blur');
    label.addEventListener('keydown', key);
    label.addEventListener('blur', blur);
  }

  // ---------- 交互 ----------
  bind() {
    const el = this.el;
    let drag = null, band = null;
    el.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.mm-toggle, .mm-note, .ai-dot, .mm-write')) {
        this.actionClick = { id: e.target.closest('.mm-node')?.dataset.id, at: performance.now() };
      }
      this.pressNode(e);
      if (e.target.closest('.mm-node, .mm-mini, .mm-pop') || this.editing) return;
      // 空白处：左键拖 = 框选（像 XMind）；按住空格拖、中键拖 = 平移画布（触控板两指滑动、滚轮也能平移）
      if (e.button === 1 || (e.button === 0 && (this.space || !this.canPick()))) {
        e.preventDefault();
        if (this.space) this.space.moved = true;
        drag = { x: e.clientX - this.view.x, y: e.clientY - this.view.y };
        el.classList.add('mm-drag');
        el.setPointerCapture(e.pointerId);
      } else if (e.button === 0) {
        const r = el.getBoundingClientRect();
        const add = e.shiftKey || e.metaKey || e.ctrlKey;
        band = { x: e.clientX, y: e.clientY, r, base: add ? new Set(this.picks.size ? this.picks : this.sel != null ? [this.sel] : []) : new Set(), id: e.pointerId, box: null };
        el.setPointerCapture(e.pointerId);
      }
    });
    el.addEventListener('pointermove', (e) => {
      if (this.moveNode(e)) return;
      if (drag) { this.view.x = e.clientX - drag.x; this.view.y = e.clientY - drag.y; this.apply(); }
      if (band && e.pointerId === band.id) this.moveBand(band, e);
    });
    const up = (e, ok) => {
      this.endNode(e, ok); drag = null; el.classList.remove('mm-drag');
      if (band && e.pointerId === band.id) { const b = band; band = null; this.endBand(b, ok); }
    };
    el.addEventListener('pointerup', (e) => up(e, true));
    el.addEventListener('pointercancel', (e) => up(e, false));
    // 空格：按住拖是平移；按下松开没拖过 = 展开 / 收起选中的节点（见 key）
    addEventListener('keyup', (e) => {
      if (e.key !== ' ' || !this.space) return;
      const s = this.space; this.space = null; el.classList.remove('mm-grab');
      if (!s.moved && document.activeElement === el) { const n = this.node(this.sel) || this.root; if (n?.children.length) this.opts.onToggle?.(n); }
    });
    addEventListener('blur', () => { this.space = null; el.classList.remove('mm-grab'); });
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.dragging) { e.preventDefault(); e.stopPropagation(); this.endNode(null, false); } }, true);
    addEventListener('blur', () => this.endNode(null, false));
    // 滚轮平移，Ctrl/触控板捏合缩放
    el.addEventListener('wheel', (e) => {
      if (e.target.closest('.mm-pop') && !e.ctrlKey) return;
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const r = el.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
        // 每次最多缩放约 7%：鼠标滚轮一格的 deltaY 很大（约 100），不限制的话一下变化太大；触控板捏合本来就是小步
        const d = Math.max(-30, Math.min(30, e.deltaY));
        const k = Math.min(2.5, Math.max(0.2, this.view.k * Math.exp(-d * 0.0025)));
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
      if (!n) return;
      if (performance.now() - (this.dropped || 0) < 400) return; // 刚拖完松手：不算点击
      if (e.detail > 1 && this.actionClick && performance.now() - this.actionClick.at < 600) return;
      const action = e.target.closest('.mm-toggle, .mm-note, .ai-dot, .mm-write');
      if (action) this.actionClick = { id: n.id, at: performance.now() };
      else this.actionClick = null;
      if (e.target.closest('.mm-toggle')) { this.opts.onToggle?.(n); return; }
      if (e.target.closest('.mm-note')) { this.select(n.id, false); this.opts.onNote?.(n); return; }
      if (e.target.closest('.mm-write')) { this.select(n.id, false); this.opts.onWrite?.(n); return; }
      if (this.editing) return; // 正在改名：点的是正在改的字
      if (e.detail > 1) return; // 双击的第二下：双击另有用处（改名），不再选一次
      if ((e.shiftKey || e.metaKey || e.ctrlKey) && n !== this.root && this.canPick()) { this.el.focus({ preventScroll: true }); this.togglePick(n.id); return; }
      this.unpick();
      this.select(n.id, false);
      this.el.focus({ preventScroll: true });
      this.opts.onSelect?.(n, 'click');
    });
    el.addEventListener('dblclick', (e) => {
      if (e.target.closest('button, .mm-toggle, .mm-note, .ai-dot, [contenteditable="plaintext-only"]')) return;
      const nodeEl = e.target.closest('.mm-node');
      // Re-layout can place a heading or parent under the second click. A control double-click is one action.
      if (this.actionClick && performance.now() - this.actionClick.at < 600) return;
      if (nodeEl) this.opts.onActivate?.(this.node(nodeEl.dataset.id), e);
    });
    el.addEventListener('keydown', (e) => this.key(e));
  }

  // ---------- 框选 ----------
  moveBand(b, e) {
    if (!b.box) {
      if (Math.hypot(e.clientX - b.x, e.clientY - b.y) < 5) return;
      b.box = document.createElement('div');
      b.box.className = 'mm-band';
      this.el.appendChild(b.box);
    }
    const x1 = Math.min(b.x, e.clientX), x2 = Math.max(b.x, e.clientX), y1 = Math.min(b.y, e.clientY), y2 = Math.max(b.y, e.clientY);
    Object.assign(b.box.style, { left: x1 - b.r.left + 'px', top: y1 - b.r.top + 'px', width: x2 - x1 + 'px', height: y2 - y1 + 'px' });
    // 碰到框的节点都算（不用整个框住）；中心主题不算
    const ids = new Set(b.base);
    for (const [id, nel] of this.els) {
      if (id === this.root.id) continue;
      const r = nel.getBoundingClientRect();
      if (r.right > x1 && r.left < x2 && r.bottom > y1 && r.top < y2) ids.add(id);
    }
    b.ids = ids;
    for (const [id, nel] of this.els) nel.classList.toggle('mm-banding', ids.has(id));
  }
  endBand(b, ok) {
    for (const nel of this.els.values()) nel.classList.remove('mm-banding');
    if (!b.box) { if (ok && !b.base.size) this.unpick(); return; } // 没拖动：只是点了一下空白处，取消多选
    b.box.remove();
    this.dropped = performance.now();
    if (!ok) return;
    const ids = (this.flat || []).filter((n) => b.ids?.has(n.id)).map((n) => n.id);
    if (!ids.length) { this.unpick(); return; }
    this.el.focus({ preventScroll: true });
    if (ids.length === 1) { this.unpick(); this.select(ids[0], false); this.opts.onSelect?.(this.node(ids[0]), 'band'); return; }
    if (!ids.includes(this.sel)) this.select(ids.at(-1), false);
    this.setPicks(ids);
  }

  // ---------- 拖动节点 ----------
  // 使用方给 opts.canDrag(n)（能不能拖）、opts.dropZones(src, target)（能放到 target 的哪些位置：
  // 'before' / 'after' 同级前后、'child' 成为下级；返回空就是不能放）、opts.onDrop(src, target, where)。
  // 按住移动超过几个像素才开始拖（不影响单击）；拖到收起的节点上停一会儿会展开；拖到边上导图跟着滚；Esc 取消
  pressNode(e) {
    this.press = null;
    if (e.button !== 0 || this.editing || !this.opts.onDrop || e.target.closest('.mm-toggle, .mm-note, .ai-dot, button, .mm-pop, [contenteditable="plaintext-only"]')) return;
    const n = this.node(e.target.closest('.mm-node')?.dataset.id);
    if (n && this.opts.canDrag?.(n)) this.press = { n, x: e.clientX, y: e.clientY, id: e.pointerId };
  }

  moveNode(e) {
    const p = this.press;
    if (!p || e.pointerId !== p.id) return false;
    if (!this.dragging) {
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < 6) return true;
      const src = this.els.get(p.n.id);
      if (!src) { this.press = null; return false; }
      const r = src.getBoundingClientRect();
      const ghost = src.cloneNode(true);
      ghost.classList.add('mm-ghost');
      ghost.classList.remove('mm-sel');
      ghost.style.cssText = `position:fixed;left:0;top:0;margin:0;pointer-events:none;z-index:1000;transform-origin:0 0;--c:${src.style.getPropertyValue('--c')}`;
      const many = this.picks.has(p.n.id) ? this.picks.size : 0;
      if (many > 1) { const c = document.createElement('span'); c.className = 'mm-ghost-n'; c.textContent = many; ghost.appendChild(c); }
      this.el.appendChild(ghost);
      this.dragging = { n: p.n, src, ghost, dx: p.x - r.left, dy: p.y - r.top, k: r.width / src.offsetWidth || 1 };
      src.classList.add('mm-dragsrc');
      this.el.classList.add('mm-dragging');
      try { this.el.setPointerCapture(e.pointerId); } catch {}
    }
    e.preventDefault();
    const d = this.dragging;
    d.cx = e.clientX; d.cy = e.clientY;
    d.ghost.style.transform = `translate(${d.cx - d.dx}px, ${d.cy - d.dy}px) scale(${d.k})`;
    this.hitDrop();
    // 拖到导图边上：跟着滚
    const b = this.el.getBoundingClientRect(), m = 40;
    const vx = d.cx < b.left + m ? 1 : d.cx > b.right - m ? -1 : 0, vy = d.cy < b.top + m ? 1 : d.cy > b.bottom - m ? -1 : 0;
    d.pan = vx || vy ? [vx, vy] : null;
    if (d.pan && !d.raf) {
      const step = () => {
        if (this.dragging !== d || !d.pan) { d.raf = 0; return; }
        this.view.x += d.pan[0] * 10; this.view.y += d.pan[1] * 10;
        this.apply();
        this.hitDrop();
        d.raf = requestAnimationFrame(step);
      };
      d.raf = requestAnimationFrame(step);
    }
    return true;
  }

  hitDrop() {
    const d = this.dragging;
    // 正好在节点上，或者离节点边缘不到 10px（节点展开后会变窄一点，光标别一下子掉出去）
    let hitEl = document.elementFromPoint(d.cx, d.cy)?.closest('.mm-node:not(.mm-ghost)');
    if (!hitEl) for (const e of this.els.values()) {
      const r = e.getBoundingClientRect();
      if (d.cx > r.left - 10 && d.cx < r.right + 10 && d.cy > r.top - 6 && d.cy < r.bottom + 6) { hitEl = e; break; }
    }
    const t = hitEl && this.el.contains(hitEl) ? this.node(hitEl.dataset.id) : null;
    const zones = t && t !== d.n && !(this.picks.has(d.n.id) && this.picks.has(t.id)) ? this.opts.dropZones?.(d.n, t) || [] : [];
    let where = null;
    if (zones.length) {
      const r = hitEl.getBoundingClientRect();
      const inner = t._side < 0 ? d.cx < r.left + r.width * 0.35 : d.cx > r.right - r.width * 0.35;
      const half = d.cy < r.top + r.height / 2 ? 'before' : 'after';
      where = zones.includes('child') && (inner || !zones.includes(half)) ? 'child' : zones.includes(half) ? half : zones[0];
    }
    const key = where ? t.id + '|' + where : '';
    if (key === d.key) return;
    d.key = key;
    if (d.hl) d.hl.classList.remove('mm-drop-child', 'mm-drop-before', 'mm-drop-after');
    d.hl = where ? hitEl : null;
    d.drop = where ? { t, where } : null;
    if (d.hl) d.hl.classList.add('mm-drop-' + where);
    // 停在收起的节点上：展开它，好放进更深一层
    clearTimeout(d.open);
    if (where === 'child' && t.collapsed && t.children.length) d.open = setTimeout(() => { if (this.dragging === d && d.drop?.t === t) { const was = this.nodeRect(t.id); this.opts.onToggle?.(t); const now = this.nodeRect(t.id); if (was && now) { this.view.x += was.left - now.left; this.view.y += was.top - now.top; this.apply(); } d.key = null; const again = () => { if (this.dragging === d) { d.key = null; this.hitDrop(); } }; requestAnimationFrame(again); setTimeout(again, 400); } }, 700);
  }

  endNode(e, ok) {
    const d = this.dragging;
    if (e && this.press && e.pointerId !== this.press.id) return;
    this.press = null;
    if (!d) return;
    this.dragging = null;
    clearTimeout(d.open);
    cancelAnimationFrame(d.raf);
    d.ghost.remove();
    d.src.classList.remove('mm-dragsrc');
    d.hl?.classList.remove('mm-drop-child', 'mm-drop-before', 'mm-drop-after');
    this.el.classList.remove('mm-dragging');
    this.dropped = performance.now();
    if (ok && d.drop) this.opts.onDrop(this.node(d.n.id) || d.n, this.node(d.drop.t.id) || d.drop.t, d.drop.where);
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
    // Node action buttons keep native Enter/Space/Tab behaviour; map shortcuts only run on the canvas/name area.
    if (this.editing || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.closest?.('.mm-pop')) return;
    if (e.key !== 'Escape' && e.target.closest?.('button, [role="button"]')) return;
    const n = this.node(this.sel) || this.root;
    if (this.opts.onKey?.(e, n)) { e.preventDefault(); return; }
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && (e.key === '=' || e.key === '+')) { e.preventDefault(); return this.zoom(1.1); }
    if (ctrl && e.key === '-') { e.preventDefault(); return this.zoom(1 / 1.1); }
    if (ctrl && e.key === '0') { e.preventDefault(); return this.fit(); }
    if (ctrl && e.key === '/') { e.preventDefault(); if (n.children.length) this.opts.onToggle?.(n); return; }
    if (e.key === 'Home') { e.preventDefault(); this.select(this.root.id); this.opts.onSelect?.(this.root); return; }
    if (e.key === 'Escape') { if (this.picks.size) { e.preventDefault(); this.unpick(); return; } if (this.opts.onEscape?.()) e.preventDefault(); return; }
    if (ctrl && e.key.toLowerCase() === 'a' && this.canPick()) { e.preventDefault(); const ids = this.flat.filter((m) => m !== this.root).map((m) => m.id); if (ids.length) { if (!ids.includes(this.sel)) this.select(ids[0], false); this.setPicks(ids); } return; }
    if (e.key === '?') { e.preventDefault(); this.opts.onHelp?.(); return; }
    if (e.key === 'F2' && this.opts.onRename) { e.preventDefault(); if (n !== this.root || this.opts.rootEditable) this.edit(n.id); return; }
    const go = (m) => { if (m) { e.preventDefault(); this.unpick(); this.select(m.id); this.opts.onSelect?.(m, 'key'); } };
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
    else if (e.key === ' ') { e.preventDefault(); if (!e.repeat && !this.space) { this.space = { moved: false }; this.el.classList.add('mm-grab'); } }
    else if (e.key === 'Enter') { e.preventDefault(); this.opts.onActivate?.(n, e); }
  }
}
