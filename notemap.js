// 笔记 <-> 导图：md 的标题（# ~ ######）是主题，层级照标题级别；
// 标题下面的内容（段落、列表、图片、代码、表格……）是这个主题的笔记（像 XMind 的主题笔记）。
// 在导图上改字、加主题、删除、移动、改笔记，都直接改对应的 md 行；代码块里的 # 不算标题。

const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const FENCE = /^\s*(```|~~~)/;
const NEW = '新主题';

// 节点上显示纯文字：去掉强调、行内代码、链接语法
export const plain = (t) => t.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/(\*\*|\*|~~|`)(.+?)\1/g, '$2').replace(/(^|\W)(__?)(\S(?:.*?\S)?)\2(?=\W|$)/g, '$1$3').trim(); // 只去成对的强调符号，AI_Study_Note 里的下划线保留

// 逐行判断是不是标题（跳过代码块）。返回 [{ line, level, text }]
function headings(lines) {
  const out = [];
  let fence = false;
  lines.forEach((raw, i) => {
    const l = raw.replace(/\r$/, '');
    if (FENCE.test(l)) { fence = !fence; return; }
    if (fence) return;
    const h = HEADING.exec(l);
    if (h) out.push({ line: i, level: h[1].length, text: h[2] });
  });
  return out;
}

export function parse(body, title) {
  const lines = body.split('\n');
  const root = { id: 'root', kind: 'root', line: -1, end: lines.length, level: 0, text: title, children: [] };
  const hs = headings(lines);
  const stack = [root];
  hs.forEach((h, k) => {
    while (stack.length > 1 && stack[stack.length - 1].level >= h.level) stack.pop();
    const parent = stack[stack.length - 1];
    // 管辖范围：到下一个同级或更高级标题为止，结尾的空行不算
    let end = lines.length;
    for (let j = k + 1; j < hs.length; j++) if (hs[j].level <= h.level) { end = hs[j].line; break; }
    while (end > h.line + 1 && !lines[end - 1].trim()) end--;
    const n = { id: 'l' + h.line, kind: 'h', line: h.line, level: h.level, text: h.text, end, children: [], parent };
    parent.children.push(n);
    stack.push(n);
  });
  return { lines, root };
}

const minLevel = (root) => (root.children.length ? Math.min(...root.children.map((c) => c.level)) : 2);

// 把一段行里的标题级别整体加减（代码块里的不动）
function shiftHeadings(block, delta) {
  let fence = false;
  return block.map((l) => {
    if (FENCE.test(l)) { fence = !fence; return l; }
    if (fence) return l;
    const h = HEADING.exec(l.replace(/\r$/, ''));
    return h ? '#'.repeat(Math.max(1, Math.min(6, h[1].length + delta))) + ' ' + h[2] : l;
  });
}

// 放进一段标题内容：前后补空行。返回标题所在行
function put(lines, at, block) {
  const pre = at > 0 && lines[at - 1].trim() ? [''] : [];
  const post = at < lines.length && lines[at].trim() ? [''] : [];
  lines.splice(at, 0, ...pre, ...block, ...post);
  return at + pre.length;
}
// 拿走一个主题的整段（连同它前面的空行）。返回 { block, from, removed }
function take(lines, n) {
  let from = n.line;
  const block = lines.slice(n.line, n.end);
  if (from > 0 && !lines[from - 1].trim()) from--;
  const removed = n.end - from;
  lines.splice(from, removed);
  return { block, from, removed };
}
const after = (pos, t) => (pos >= t.from + t.removed ? pos - t.removed : pos);
const pack = (lines, line) => ({ body: lines.join('\n'), line });
// 全文最后一行有内容的位置之后
const docEnd = (lines) => { let i = lines.length; while (i > 0 && !lines[i - 1].trim()) i--; return i; };

// ---------- 以下操作都返回 { body, line }：新的正文，以及要选中的主题所在行 ----------

export function rename(doc, n, text) {
  const lines = [...doc.lines];
  lines[n.line] = '#'.repeat(n.level) + ' ' + text;
  return pack(lines, n.line);
}

// Tab：加子主题（放在这个主题整段的最后）
export function addChild(doc, n) {
  const lines = [...doc.lines];
  if (n.kind === 'root') return pack(lines, put(lines, docEnd(lines), ['#'.repeat(minLevel(n)) + ' ' + NEW]));
  if (n.level >= 6) return { error: '已经是最深一级标题（######），不能再加子主题' };
  return pack(lines, put(lines, n.end, ['#'.repeat(n.level + 1) + ' ' + NEW]));
}

// Enter：在后面加同级
export function addSibling(doc, n) {
  if (n.kind === 'root') return addChild(doc, n);
  const lines = [...doc.lines];
  return pack(lines, put(lines, n.end, ['#'.repeat(n.level) + ' ' + NEW]));
}

// Shift+Enter：在前面加同级
export function addSiblingBefore(doc, n) {
  if (n.kind === 'root') return addChild(doc, n);
  const lines = [...doc.lines];
  return pack(lines, put(lines, n.line, ['#'.repeat(n.level) + ' ' + NEW]));
}

// Delete：删掉主题和它下面的全部内容
export function remove(doc, n) {
  if (n.kind === 'root') return null;
  const lines = [...doc.lines];
  take(lines, n);
  return pack(lines, Math.max(0, n.line - 1));
}

// Alt+↑ / Alt+↓：和相邻的同级交换位置
export function move(doc, n, dir) {
  if (n.kind === 'root') return null;
  const s = n.parent.children, other = s[s.indexOf(n) + dir];
  if (!other) return null;
  const lines = [...doc.lines];
  const t = take(lines, n);
  return pack(lines, put(lines, dir < 0 ? other.line - (other.line > 0 && !lines[other.line - 1]?.trim() ? 1 : 0) : after(other.end, t), t.block));
}

// Ctrl+C：记下这个主题的整段
export function copy(doc, n) {
  if (n.kind === 'root') return null;
  return { level: n.level, block: doc.lines.slice(n.line, n.end) };
}

// Ctrl+V：粘贴为子主题，标题级别跟着调整
export function paste(doc, target, clip) {
  if (!clip) return null;
  const lines = [...doc.lines];
  const level = target.kind === 'root' ? minLevel(target) : target.level + 1;
  if (level > 6) return { error: '已经是最深一级标题，不能再粘贴子主题' };
  const at = target.kind === 'root' ? docEnd(lines) : target.end;
  return pack(lines, put(lines, at, shiftHeadings(clip.block, level - clip.level)));
}

// 主题笔记：标题下、第一个子主题之前的内容。返回 { md, from }（from 是它在正文里的起始行）
export function sectionOf(doc, n) {
  const from = n.kind === 'root' ? 0 : n.line + 1;
  const to = n.children.length ? n.children[0].line : n.kind === 'root' ? doc.lines.length : n.end;
  return { md: doc.lines.slice(from, to).join('\n').trim(), from };
}

// 改主题笔记：只替换这一段，子主题不动。笔记里写的 # 标题会变成新的主题
export function setSection(doc, n, md) {
  const lines = [...doc.lines];
  const from = n.kind === 'root' ? 0 : n.line + 1;
  const to = n.children.length ? n.children[0].line : n.kind === 'root' ? lines.length : n.end;
  const block = md.replace(/\r\n/g, '\n').split('\n');
  while (block.length && !block[0].trim()) block.shift();
  while (block.length && !block[block.length - 1].trim()) block.pop();
  if (block.length && lines[to]?.trim()) block.push(''); // 和后面的子主题之间空一行
  lines.splice(from, to - from, ...block);
  return pack(lines, n.line);
}

// 编辑后按行号找回主题
export function findByLine(root, line) {
  let best = root;
  const walk = (n) => { if (n.line <= line && n.line >= best.line) best = n; n.children.forEach(walk); };
  walk(root);
  return best;
}
