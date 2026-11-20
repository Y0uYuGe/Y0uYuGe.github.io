// 从右边终端（AI 会话）里复制的文字，粘进笔记前整理成正常的 md：
// - AI 界面自己加的符号去掉：顶格的 ⏺ / ● / • / › / ❯（一条消息的开头）、⎿ / └（工具输出）；缩进的 • 是列表，换成 -
// - 整块共同的缩进去掉（不然会变成代码块）
// - 终端按宽度硬折的行接回去（中文直接接，和英文、数字之间补空格）
// - 框线表格（claude：┌─┬─┐ │ a │ b │；codex：━━ 分隔、空格分列）变回 md 表格
// - 看着像代码的一段加上 ``` 围起来，不然几行会并成一段
// 复制时还读了终端里哪些字是粗体，记成 **粗体**（见 agents.js 的 richSelection）
// cols = 复制时终端的列数（不知道就按这段文字里最长的一行估）

const WIDE = /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]|[\u{1F300}-\u{1FAFF}]/u;
export const width = (s) => { let w = 0; for (const ch of s.replace(/\*\*/g, '')) w += WIDE.test(ch) ? 2 : 1; return w; };
const CJK = /[⺀-鿿豈-﫿＀-￯]/;
const CJK_PUNCT = /[　-〿！-／：-＠]/;
// 折行处原来的空格被吃掉了：两边都是中文（或有中文标点）直接接，有一边是英文、数字就补个空格
const joinText = (a, b) => a + ((CJK.test(a.at(-1)) && CJK.test(b[0])) || CJK_PUNCT.test(a.at(-1)) || CJK_PUNCT.test(b[0]) ? '' : ' ') + b;

const MSG = /^(?:⏺|●|•|›|❯)\s/;          // 顶格：一条消息 / 一次操作 / 你发的话的开头
const OUT = /^(\s*)(?:⎿|└)\s/;            // 工具输出
const BOX_BORDER = /^\s*[┌├└╭╰┏┣┗][─━┬┼┴┳╋┻]+[┐┤┘╮╯┓┫┛]\s*$/;
const BOX_ROW = /^\s*[│┃].*[│┃]\s*$/;
const RULE = /^\s*[━─]+(?:\s+[━─]+)+\s*$/;   // codex 表格的分隔线：几段 ━━ / ── 中间空格
const BLOCK = /^\s*(?:[-*+•]\s|\d+[.)]\s|#{1,6}\s|>|\||```|~~~|[│┃┌├└╭╰━─])/;
const ITEM = /^(\s*)((?:[-*+•]|\d+[.)])\s+)/;
const FENCE = /^\s*(```|~~~)/;
const ind = (l) => l.match(/^\s*/)[0].length;

// 按显示宽度（中文两格）切出 [from, to) 这几列
function cut(line, from, to) {
  let w = 0, s = '';
  for (const ch of line) { if (w >= from && w < to) s += ch; w += WIDE.test(ch) ? 2 : 1; }
  return s.trim();
}
const mdRow = (r, n) => '| ' + Array.from({ length: n }, (_, k) => (r[k] || '').replace(/\|/g, '\\|')).join(' | ') + ' |';
const mdTable = (rows) => { const n = Math.max(...rows.map((r) => r.length)); return [mdRow(rows[0], n), '| ' + Array(n).fill('---').join(' | ') + ' |', ...rows.slice(1).map((r) => mdRow(r, n))]; };
const merge = (cur, cells) => cells.forEach((c, k) => { if (c) cur[k] = cur[k] ? joinText(cur[k], c) : c; });

function tables(lines) {
  const out = [];
  const push = (rows) => { if (!rows.length) return; if (out.length && out.at(-1).trim()) out.push(''); out.push(...mdTable(rows), ''); };
  for (let i = 0; i < lines.length;) {
    // claude：框线表格，横线把它分成一行行；一行里折成几条就按格子拼起来
    if (BOX_BORDER.test(lines[i]) || (BOX_ROW.test(lines[i]) && BOX_ROW.test(lines[i + 1] || ''))) {
      const rows = [];
      let cur = null;
      for (; i < lines.length && (BOX_BORDER.test(lines[i]) || BOX_ROW.test(lines[i])); i++) {
        if (BOX_BORDER.test(lines[i])) { if (cur) rows.push(cur); cur = null; continue; }
        const cells = lines[i].replace(/\*\*/g, '').trim().replace(/^[│┃]|[│┃]$/g, '').split(/[│┃]/).map((c) => c.trim());
        if (!cur) cur = cells; else merge(cur, cells);
      }
      if (cur) rows.push(cur);
      push(rows);
      continue;
    }
    // codex：表头下面一条 ━━ 线，按 ━━ 的位置分列；行之间是 ── 线
    if (lines[i].trim() && /━/.test(lines[i + 1] || '') && RULE.test(lines[i + 1])) {
      const spans = [];
      let w = 0, start = -1;
      for (const ch of lines[i + 1] + ' ') {
        if (/[━─]/.test(ch)) { if (start < 0) start = w; } else if (start >= 0) { spans.push([start, w]); start = -1; }
        w += WIDE.test(ch) ? 2 : 1;
      }
      // 每列从上一列结束后算起，到下一列开始之前（格子里的字可能比横线宽一点）
      const cols = spans.map((_, k) => [k ? spans[k - 1][1] : 0, k + 1 < spans.length ? spans[k + 1][0] : 1e9]);
      const cells = (l) => cols.map(([a, b]) => cut(l.replace(/\*\*/g, ''), a, b));
      const rows = [cells(lines[i])];
      i += 2;
      let cur = null;
      for (; i < lines.length && lines[i].trim(); i++) {
        if (RULE.test(lines[i])) { if (cur) rows.push(cur); cur = null; continue; }
        if (!cur) cur = cells(lines[i]); else merge(cur, cells(lines[i]));
      }
      if (cur) rows.push(cur);
      push(rows);
      continue;
    }
    out.push(lines[i++]);
  }
  return out;
}

// 看着像代码的一段：好几行、大半行像代码（或有缩进层次）、没有中文句子
const CODEY = /^\s*(?:def |class |import |from \S+ import|return\b|const |let |var |function |fn |pub |if .*[:{]$|for .*[:{]$|while .*[:{]$|#include|package |func |\$ |npm |git |cd |[}\])];?$)|[;{]\s*$|^\s*\w[\w.]*\s*=\s*\S|\w\(.*\)\s*$/;
function fenceCode(lines) {
  const out = [];
  for (let i = 0; i < lines.length;) {
    if (FENCE.test(lines[i])) { // 本来就围好的代码块原样留着
      const end = lines.findIndex((l, k) => k > i && FENCE.test(l));
      const j = end < 0 ? lines.length : end + 1;
      out.push(...lines.slice(i, j));
      i = j;
      continue;
    }
    if (!lines[i].trim() || BLOCK.test(lines[i])) { out.push(lines[i++]); continue; }
    let j = i;
    while (j < lines.length && lines[j].trim() && !BLOCK.test(lines[j])) j++;
    const block = lines.slice(i, j);
    const code = block.filter((l) => CODEY.test(l)).length;
    const nested = block.some((l) => ind(l) > ind(block[0]));
    const prose = block.some((l) => /[一-鿿]{6,}/.test(l.replace(/#.*$|\/\/.*$|(["']).*?\1/g, '')));
    // 用字符画出来的示意图（AI 回答里的 ```text 块，终端里不显示 ```）：靠空格对齐，不围起来空格就没了
    const drawn = block.some((l) => /\S.*[─━│┃═┄┈→←↑↓▶◀]{3,}|[─━═]{2,}\s*[>→▶]|[┬┴┼├┤└┘┌┐]/.test(l)) || block.slice(1).some((l) => ind(l) >= ind(block[0]) + 4);
    if (block.length >= 2 && !prose && (code * 2 >= block.length || (nested && code))) out.push('```', ...block, '```');
    else if (block.length >= 2 && drawn) out.push('```text', ...block, '```');
    else out.push(...block);
    i = j;
  }
  return out;
}

// AI 界面本身的文字（输入框、状态栏、「干了多久」），不是回答的内容
const CHROME = [
  /^\s*[─━]{20,}\s*$/, // 输入框上下的整行横线
  /^\s*[›❯>]\s*$/, // 空的输入行
  /^\s*›\s*Ask Codex/,
  /Worked for \d|^\s*[✻✳✶✽✢·*]\s+\S+ for \d+s|esc to interrupt|\? for shortcuts|shift\+tab to cycle|bypass permissions|⏵⏵|⚠ \d+ warning/,
  /^\s*(?:gpt|o\d|claude|opus|sonnet|haiku|fable)[\w.-]*\s.*·\s/i, // 模型 · 路径
];
export function tidyTerminal(text, cols = 0) {
  let lines = text.replace(/\r\n?/g, '\n').replace(/ /g, ' ').split('\n').map((l) => l.replace(/\s+$/, ''));
  lines = lines.filter((l) => !CHROME.some((re) => re.test(l.replace(/\*\*/g, ''))));
  const widths = lines.map(width); // 按终端里原来的样子量（符号、缩进都算）
  // 界面符号换成同样宽的空格，后面的对齐不乱
  lines = lines.map((l) => l.replace(MSG, '  ').replace(OUT, (m, s) => s + '  '));
  // 折行的宽度按段估（空行隔开的一段）：终端拖宽拖窄过，早先的输出是按当时的宽度折的。
  // 一段里有行写到接近右边，就用这段最长那行；都没写到右边，说明这段没被折过。表格、分隔线不算（常常比正文宽）
  const prose = (i) => !BOX_BORDER.test(lines[i]) && !BOX_ROW.test(lines[i]) && !RULE.test(lines[i]) && !RULE.test(lines[i + 1] || '');
  const most = Math.max(0, ...widths.filter((w, i) => prose(i)));
  const near = cols ? cols - 16 : Math.max(40, most * 0.8);
  const wrapOf = [];
  for (let i = 0; i < lines.length;) {
    let j = i, m = 0;
    while (j < lines.length && lines[j].trim()) { if (prose(j)) m = Math.max(m, widths[j]); j++; }
    for (let k = i; k < j; k++) wrapOf[k] = m >= near ? m : 0;
    i = j + 1;
  }
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i], p = out.at(-1), wrapAt = wrapOf[i];
    if (wrapAt && p && p.text.trim() && l.trim() && !BLOCK.test(l) && !/^\s*(?:#{1,6}\s|\||```|~~~)/.test(p.text)
      && !BOX_BORDER.test(p.text) && !BOX_ROW.test(p.text) && !RULE.test(p.text) && !RULE.test(lines[i + 1] || '')) {
      // 被折的：上一行再放下一行的第一个词就超宽了（claude 按词折，codex 按字折，都满足），
      // 而且续行缩进到上一行正文开始的位置
      const it = ITEM.exec(p.text);
      const body = it ? it[0].length : ind(p.text);
      const first = l.trim().split(/\s/)[0];
      if (p.w + 1 + width(first) > wrapAt - 1 && ind(l) === body) {
        p.text = joinText(p.text, l.trim());
        p.w = widths[i];
        continue;
      }
    }
    out.push({ text: l, w: widths[i] });
  }
  lines = out.map((x) => x.text.replace(/\*\*(\s*)\*\*/g, '$1')); // 粗体被折成两段的接回去
  // 去掉整块共同的缩进
  const min = Math.min(...lines.filter((l) => l.trim()).map(ind));
  if (min > 0 && min < Infinity) lines = lines.map((l) => l.slice(Math.min(min, ind(l))));
  // 从列表中间开始选的：第一项缩进比后面的还深，每段里按最浅的列表项对齐到顶格，层级关系不变
  for (let i = 0; i < lines.length;) {
    let j = i;
    while (j < lines.length && lines[j].trim()) j++;
    const items = lines.slice(i, j).filter((l) => ITEM.test(l));
    const m = items.length ? Math.min(...items.map(ind)) : 0;
    if (m) for (let k = i; k < j; k++) lines[k] = lines[k].slice(Math.min(m, ind(lines[k])));
    // 开头几项比后面的顶层项还深（它们的上一级没选进来）：这几项退到顶层
    const first = lines.slice(i, j).findIndex((l) => ITEM.test(l));
    const top = first < 0 ? -1 : lines.slice(i, j).findIndex((l) => ITEM.test(l) && ind(l) === 0);
    if (first >= 0 && top > first) {
      const d = ind(lines[i + first]);
      for (let k = i + first; k < i + top; k++) lines[k] = lines[k].slice(Math.min(d, ind(lines[k])));
    }
    // 列表上面那几行是上一项被截掉的后半句：单独成一段
    if (first > 0) { lines.splice(i + first, 0, ''); j++; }
    i = j + 1;
  }
  lines = tables(lines);
  lines = fenceCode(lines);
  lines = lines.map((l) => l.replace(/^(\s*)[•●◦▪]\s/, '$1- ')); // 缩进的 • 是列表
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// 看着像从 AI 终端里复制的（别的终端里复制来的也算）
export const looksLikeTerminal = (t) => /^(?:⏺|●|•) |^\s*[┌╭][─┬]+[┐╮]|^\s*━+\s+━|^\s+⎿/m.test(t);
