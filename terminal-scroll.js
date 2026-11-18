// 本地滚动和全屏程序的鼠标滚动要分开：正常屏幕的滚轮始终查看终端历史，
// 全屏程序开启鼠标跟踪时仍交给它；没有鼠标跟踪时不要把滚轮伪装成上下键，
// 否则滚一下就会切换正在输入的历史命令，而不是查看之前的输出。
export function handleTerminalWheel(term, event, state) {
  if (term.buffer.active.type === 'alternate') {
    if (term.modes.mouseTrackingMode !== 'none') return true;
    event.preventDefault();
    return false;
  }
  if (event.ctrlKey || event.metaKey) return true; // 正常屏幕保留触控板捏合 / 带修饰键的终端行为。

  event.preventDefault();
  let lines = event.deltaY;
  if (event.deltaMode === 0) {
    const screen = term.element?.querySelector('.xterm-screen');
    const rowHeight = screen?.getBoundingClientRect().height / term.rows || term.options.fontSize * term.options.lineHeight;
    lines /= rowHeight;
  } else if (event.deltaMode === 2) lines *= term.rows;
  lines *= term.options.scrollSensitivity || 1;
  const fast = term.options.fastScrollModifier;
  if ((fast === 'alt' && event.altKey) || (fast === 'shift' && event.shiftKey)) lines *= term.options.fastScrollSensitivity || 5;
  if (state.lines && Math.sign(state.lines) !== Math.sign(lines)) state.lines = 0;
  state.lines += lines;
  const whole = Math.trunc(state.lines);
  if (whole) { state.lines -= whole; term.scrollLines(whole); }
  return false;
}

export function viewportOffset(term) {
  if (!term || term.buffer.active.type !== 'normal') return 0;
  return Math.max(0, term.buffer.normal.baseY - term.buffer.normal.viewportY);
}

export function viewportPosition(term) {
  if (!term || term.buffer.active.type !== 'normal') return null;
  const buffer = term.buffer.normal, offset = viewportOffset(term);
  const anchor = Array.from({ length: Math.min(3, term.rows) }, (_, i) => buffer.getLine(buffer.viewportY + i)?.translateToString(true) || '');
  return { offset, line: buffer.viewportY, anchor: offset && anchor.some(Boolean) ? anchor : null };
}

export function restoreViewport(term, position) {
  if (term.buffer.active.type !== 'normal' || !position?.offset) return;
  const buffer = term.buffer.normal;
  let target = Math.max(0, buffer.baseY - position.offset), nearest = Infinity;
  // 标签没打开时仍可能有新输出；找回阅读的那几行，而不是按新末尾计算后跳到另一段。
  if (position.anchor) for (let i = 0; i <= buffer.baseY; i++) {
    if (position.anchor.every((text, j) => (buffer.getLine(i + j)?.translateToString(true) || '') === text) && Math.abs(i - position.line) < nearest) {
      target = i; nearest = Math.abs(i - position.line);
    }
  }
  term.scrollToLine(target);
}
