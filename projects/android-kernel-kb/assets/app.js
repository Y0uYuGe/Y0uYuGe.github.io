(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const Core = window.AKGraphCore, data = window.ANDROID_KERNEL_KB;
  const el = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
  const svgEl = (tag, attributes = {}, text) => { const node = document.createElementNS('http://www.w3.org/2000/svg', tag); Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, String(value))); if (text !== undefined) node.textContent = text; return node; };
  const link = (text, url) => { const a = el('a', text); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a; };
  if (!Core || !data) { const error = $('load-error'); error.hidden = false; error.className = 'error'; error.textContent = '知识数据尚未加载。请确认 data/knowledge.js 已由 npm run build 生成。'; return; }
  const errors = Core.validateData(data);
  if (errors.length) { $('load-error').hidden = false; $('load-error').textContent = '数据校验未通过：' + errors.slice(0, 3).join('；'); return; }
  const index = Core.indexData(data), typeCounts = {}, sourceUsage = new Map();
  data.nodes.forEach(n => { typeCounts[n.type] = (typeCounts[n.type] || 0) + 1; n.sources.forEach(id => sourceUsage.set(id, (sourceUsage.get(id) || 0) + 1)); });
  const state = { selected: 'surface-binder', view: 'graph', mode: 'focus', depth: 1, query: '', types: [], applicability: '', coverage: '', path: null, scale: 1, x: 0, y: 0 };
  let filtered = [], stage, toastTimer;
  const knownViews = new Set(['graph', 'catalog', 'coverage', 'sources']);
  function readURL() {
    const p = new URLSearchParams(location.search);
    state.query = (p.get('q') || '').slice(0, 200);
    state.types = (p.get('types') || '').split(',').filter(type => Core.TYPES[type]);
    state.applicability = Core.APPLICABILITY[p.get('scope')] ? p.get('scope') : '';
    state.coverage = Core.COVERAGE[p.get('coverage')] ? p.get('coverage') : '';
    state.view = knownViews.has(p.get('view')) ? p.get('view') : 'graph';
    state.mode = p.get('mode') === 'overview' ? 'overview' : 'focus';
    state.depth = p.get('depth') === '2' ? 2 : 1;
    const matches = Core.filterNodes(data.nodes, { query: state.query, types: state.types, applicability: state.applicability, coverage: state.coverage });
    state.selected = index.nodes.has(p.get('node')) ? p.get('node') : (matches.find(n => n.id === 'surface-binder')?.id || matches[0]?.id);
    state.path = p.has('to') ? Core.associationPath(data, state.selected, p.get('to')) : null;
    if (state.path) state.mode = 'path';
  }
  function writeURL(push = false) {
    const p = new URLSearchParams();
    if (state.selected) p.set('node', state.selected);
    if (state.query) p.set('q', state.query);
    if (state.types.length) p.set('types', state.types.join(','));
    if (state.applicability) p.set('scope', state.applicability);
    if (state.coverage) p.set('coverage', state.coverage);
    if (state.view !== 'graph') p.set('view', state.view);
    if (state.mode === 'overview') p.set('mode', 'overview');
    if (state.depth !== 1) p.set('depth', String(state.depth));
    if (state.path) p.set('to', state.path.nodes.at(-1).id);
    const url = location.pathname + (p.size ? '?' + p.toString() : '');
    if (location.pathname + location.search !== url) history[push ? 'pushState' : 'replaceState'](null, '', url);
  }
  function toast(text) { clearTimeout(toastTimer); $('toast').textContent = text; $('toast').hidden = false; toastTimer = setTimeout(() => { $('toast').hidden = true; }, 2600); }
  function dot(type) { const span = el('span', undefined, 'dot'); span.style.backgroundColor = Core.TYPES[type].color; return span; }
  function badge(text) { return el('span', text, 'badge'); }
  function sourceItem(source, compact = false) {
    const item = el('div', undefined, compact ? 'detail-source' : 'source-card');
    item.append(link(source.title, source.url));
    const kinds = { documentation: '官方文档', research: '原作者研究', paper: '论文', 'source-code': '源码', advisory: '安全公告' };
    item.append(el(compact ? 'small' : 'p', source.publisher + (source.kind ? ' · ' + (kinds[source.kind] || source.kind) : '')));
    if (!compact) item.append(el('small', `核对 ${source.accessed || data.meta.reviewedAt} · ${sourceUsage.get(source.id) || 0} 个知识点引用`));
    return item;
  }
  function section(title, entries) {
    if (!entries?.length) return null;
    const s = el('section', undefined, 'detail-section'); s.append(el('h3', title));
    const ul = el('ul'); entries.forEach(text => ul.append(el('li', text))); s.append(ul); return s;
  }
  function resetTransform() { state.scale = 1; state.x = 0; state.y = 0; applyTransform(); }
  function applyTransform() { if (stage) stage.setAttribute('transform', `translate(${state.x} ${state.y}) scale(${state.scale})`); }
  function zoom(factor) {
    const next = Math.min(3, Math.max(.3, state.scale * factor)), ratio = next / state.scale;
    state.x = 480 - (480 - state.x) * ratio; state.y = 340 - (340 - state.y) * ratio; state.scale = next; applyTransform();
  }
  function selectNode(id, push = true, forceGraph = false) {
    if (!index.nodes.has(id)) return;
    state.selected = id; state.path = null; state.mode = 'focus';
    if (forceGraph || state.view === 'sources' || state.view === 'coverage') state.view = 'graph';
    render(false); writeURL(push);
  }
  function renderStats() {
    const stats = $('stats'); stats.replaceChildren();
    [[data.nodes.length, '知识点'], [data.edges.length, '关系'], [data.sources.length, '来源']].forEach(([count, label]) => { const item = el('span'); item.append(el('strong', count), document.createTextNode(label)); stats.append(item); });
    $('review-date').textContent = `资料核对：${data.meta.reviewedAt}`;
  }
  function renderFilters() {
    $('search').value = state.query; $('applicability').value = state.applicability; $('coverage-filter').value = state.coverage;
    const types = $('type-filters'); types.replaceChildren();
    const all = el('button', '全部类型', 'type-filter'); all.setAttribute('aria-pressed', String(!state.types.length)); all.append(el('span', data.nodes.length, 'count')); all.addEventListener('click', () => { state.types = []; render(true); writeURL(); }); types.append(all);
    Object.entries(Core.TYPES).forEach(([type, definition]) => {
      const button = el('button', undefined, 'type-filter'); button.append(dot(type), el('span', definition.label), el('span', typeCounts[type] || 0, 'count')); button.setAttribute('aria-pressed', String(state.types.includes(type)));
      button.addEventListener('click', () => { state.types = state.types.includes(type) ? state.types.filter(t => t !== type) : [...state.types, type]; render(true); writeURL(); }); types.append(button);
    });
    $('result-count').textContent = `${filtered.length} / ${data.nodes.length}`;
  }
  function renderDirectory() {
    const list = $('node-list'); list.replaceChildren();
    if (!filtered.length) { list.append(el('p', '没有匹配知识点。可以清除筛选，或换一个术语。', 'empty')); return; }
    filtered.forEach(node => {
      const button = el('button', node.label, 'node-button'); button.append(el('small', node.cve || node.labelEn));
      if (node.id === state.selected) button.setAttribute('aria-current', 'true');
      button.addEventListener('click', () => selectNode(node.id)); list.append(button);
    });
  }
  function renderDetails() {
    const panel = $('details'); panel.replaceChildren(); const node = index.nodes.get(state.selected);
    if (!node) { panel.append(el('h2', '从知识点开始'), el('p', '搜索术语或点击目录中的节点，查看背景、适用条件和依据。', 'empty')); return; }
    const type = el('p', undefined, 'detail-type'); type.append(dot(node.type), document.createTextNode(Core.TYPES[node.type].label));
    panel.append(type, el('h2', node.label), el('p', node.labelEn, 'detail-en'), el('p', node.summary, 'detail-summary'));
    const badges = el('div', undefined, 'badges'); badges.append(badge(Core.APPLICABILITY[node.applicability]), badge(Core.COVERAGE[node.coverage])); if (node.cve) badges.append(badge(node.cve)); if (node.year) badges.append(badge(String(node.year))); panel.append(badges);
    const actions = el('div', undefined, 'detail-actions'); const showGraph = el('button', '在图谱中查看', 'text-button'); showGraph.addEventListener('click', () => { state.view = 'graph'; state.mode = 'focus'; state.path = null; render(); writeURL(true); $('main').focus({ preventScroll: true }); }); actions.append(showGraph); panel.append(actions);
    [['知识说明', node.details], ['适用条件', node.conditions], ['边界与限制', node.limitations], ['公开报告中的环境', node.affected], ['补丁与公告', node.patched]].forEach(([title, entries]) => { const block = section(title, entries); if (block) panel.append(block); });
    const relations = index.adjacency.get(node.id);
    if (relations.length) {
      const block = el('section', undefined, 'detail-section'); block.append(el('h3', `相邻关系 · ${relations.length}`));
      relations.forEach(connection => {
        const other = index.nodes.get(connection.id), item = el('div', undefined, 'relation-item');
        const button = el('button', `${connection.forward ? '→' : '←'} ${Core.RELATIONS[connection.edge.relation]} · ${other.label}`);
        button.addEventListener('click', () => selectNode(other.id)); item.append(button, el('p', connection.edge.note));
        const evidence = el('div', undefined, 'relation-evidence'); evidence.append(document.createTextNode('依据 '));
        connection.edge.sources.forEach((id, i) => { const source = index.sources.get(id); const a = link(String(i + 1), source.url); a.title = source.title; evidence.append(a); }); item.append(evidence); block.append(item);
      }); panel.append(block);
    }
    const sources = el('section', undefined, 'detail-section'); sources.append(el('h3', `资料来源 · ${node.sources.length}`)); node.sources.forEach(id => sources.append(sourceItem(index.sources.get(id), true))); panel.append(sources);
  }
  function renderCatalog() {
    const list = $('catalog-list'); list.replaceChildren();
    if (!filtered.length) { list.append(el('p', '当前筛选没有匹配结果。', 'empty')); return; }
    filtered.forEach(node => { const article = el('article', undefined, 'catalog-card'), button = el('button', node.label); button.addEventListener('click', () => selectNode(node.id)); const labels = el('div', undefined, 'badges'); labels.append(badge(Core.TYPES[node.type].label), badge(Core.APPLICABILITY[node.applicability]), badge(Core.COVERAGE[node.coverage])); article.append(button, el('p', node.summary), labels); list.append(article); });
  }
  function prepareSVG() {
    const svg = $('graph'); svg.replaceChildren();
    const defs = svgEl('defs'), marker = svgEl('marker', { id: 'arrow', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 5, markerHeight: 5, orient: 'auto-start-reverse' }); marker.append(svgEl('path', { d: 'M0 0L10 5L0 10Z', fill: '#8f9e96' })); defs.append(marker); svg.append(defs);
    stage = svgEl('g'); svg.append(stage); resetTransform(); svg.classList.remove('dense'); return { svg, stage };
  }
  function activateSVG(group, action) { group.setAttribute('tabindex', '0'); group.setAttribute('role', 'button'); group.addEventListener('click', action); group.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); action(); } }); }
  function renderOverview() {
    const { stage } = prepareSVG(), types = Object.keys(Core.TYPES);
    stage.append(svgEl('text', { x: 480, y: 58, 'text-anchor': 'middle', class: 'overview-root' }, 'Android 内核研究 · 分类导航'));
    types.forEach((type, i) => {
      const column = i % 3, row = Math.floor(i / 3), x = 120 + column * 270, y = 150 + row * 165;
      stage.append(svgEl('path', { d: `M480 80 Q480 ${y - 30} ${x + 90} ${y}`, fill: 'none', stroke: '#d4ddd7', 'stroke-width': 1.2 }));
      const group = svgEl('g', { class: 'overview-node', 'aria-label': `${Core.TYPES[type].label} ${typeCounts[type] || 0} 个知识点` });
      group.append(svgEl('rect', { x, y, width: 195, height: 94, rx: 7 }), svgEl('circle', { cx: x + 22, cy: y + 28, r: 5, fill: Core.TYPES[type].color }), svgEl('text', { x: x + 38, y: y + 34 }, Core.TYPES[type].label), svgEl('text', { x: x + 20, y: y + 68, class: 'overview-count' }, `${typeCounts[type] || 0} knowledge nodes`));
      activateSVG(group, () => { state.types = [type]; state.view = 'catalog'; render(true); writeURL(true); }); stage.append(group);
    });
    $('graph-title').textContent = '分类概览'; $('graph-note').textContent = '点击分类浏览知识点。此图表示知识库分类结构，不表示利用过程或技术因果关系。';
  }
  function renderGraph() {
    $('focus-mode').setAttribute('aria-pressed', String(state.mode !== 'overview')); $('overview-mode').setAttribute('aria-pressed', String(state.mode === 'overview')); $('depth').value = String(state.depth); $('depth').disabled = state.mode !== 'focus';
    if (state.mode === 'overview') { renderOverview(); return; }
    const { svg, stage } = prepareSVG();
    const graph = state.path ? { nodes: state.path.nodes, edges: state.path.steps.map(s => s.edge), distances: new Map(), total: state.path.nodes.length, truncated: false } : Core.neighborhood(data, state.selected, state.depth, 60);
    if (!graph.nodes.length) { stage.append(svgEl('text', { x: 480, y: 330, 'text-anchor': 'middle', fill: '#6d777a', 'font-size': 17 }, '搜索或选择一个知识点')); $('graph-title').textContent = '知识关系图'; $('graph-note').textContent = '可以通过目录、中文说明、英文术语和 CVE 编号找到知识点。'; return; }
    const focus = index.nodes.get(state.selected);
    let positions;
    if (state.path) { positions = new Map(graph.nodes.map((node, i) => [node.id, { x: 95 + i * 770 / Math.max(graph.nodes.length - 1, 1), y: 310 + (i % 2 ? 70 : -10) }])); }
    else positions = Core.radialLayout(graph.nodes, state.selected, graph.distances);
    if (graph.nodes.length > 38) svg.classList.add('dense');
    graph.edges.forEach(edge => {
      const a = positions.get(edge.source), b = positions.get(edge.target); if (!a || !b) return;
      const dx = b.x - a.x, dy = b.y - a.y, distance = Math.hypot(dx, dy) || 1, fromOffset = edge.source === state.selected ? 19 : 11, toOffset = edge.target === state.selected ? 21 : 13;
      const line = svgEl('line', { x1: a.x + dx / distance * fromOffset, y1: a.y + dy / distance * fromOffset, x2: b.x - dx / distance * toOffset, y2: b.y - dy / distance * toOffset, class: 'graph-edge', 'marker-end': 'url(#arrow)' }); line.append(svgEl('title', {}, `${index.nodes.get(edge.source).label} → ${Core.RELATIONS[edge.relation]} → ${index.nodes.get(edge.target).label}\n${edge.note}`)); stage.append(line);
    });
    graph.nodes.forEach(node => {
      const p = positions.get(node.id), selected = node.id === state.selected, group = svgEl('g', { class: 'graph-node' + (selected ? ' selected' : ''), 'data-node-id': node.id, 'data-distance': graph.distances.get(node.id) || 0, 'aria-label': `${node.label}，${Core.TYPES[node.type].label}` });
      group.append(svgEl('title', {}, `${node.label}\n${node.labelEn}\n${node.summary}`), svgEl('circle', { cx: p.x, cy: p.y, r: selected ? 16 : 9, fill: Core.TYPES[node.type].color }));
      const short = [...node.label].length > 13 ? [...node.label].slice(0, 12).join('') + '…' : node.label;
      group.append(svgEl('text', { x: p.x, y: p.y + (selected ? 38 : 28), 'text-anchor': 'middle' }, short));
      if (selected) group.append(svgEl('text', { x: p.x, y: p.y + 55, 'text-anchor': 'middle', class: 'node-en' }, node.cve || node.labelEn));
      activateSVG(group, () => selectNode(node.id, true, true)); stage.append(group);
    });
    $('graph-title').textContent = state.path ? '知识关联路径' : focus.label;
    $('graph-note').textContent = state.path ? '箭头保留原关系方向；路径查询允许反向寻找关联，不代表一条可执行的利用链。' : `${state.depth} 跳邻域 · 显示 ${graph.nodes.length} 个知识点、${graph.edges.length} 条关系${graph.truncated ? `（邻域共 ${graph.total} 个，图中限制为 60 个；可点击邻居继续展开）` : ''}。目录筛选保留关联上下文。${graph.nodes.length > 38 ? '二跳标签在悬停或聚焦时显示。' : ''}`;
  }
  function renderPathResult() {
    const result = $('path-result'); result.replaceChildren(); if (!state.path) return;
    $('path-target').value = state.path.nodes.at(-1).id;
    const ol = el('ol'); state.path.steps.forEach(step => { const item = el('li', `${index.nodes.get(step.edge.source).label} → ${Core.RELATIONS[step.edge.relation]} → ${index.nodes.get(step.edge.target).label}`); const note = el('p', step.edge.note); item.append(note); ol.append(item); }); result.append(ol);
  }
  function renderCoverage() {
    const wrap = $('coverage-matrix'); wrap.replaceChildren();
    const scroll = el('div', undefined, 'matrix-wrap'), table = el('table'), thead = el('thead'), tr = el('tr'); ['领域', '总数', '已核对资料', '继续核对', 'Android 语境', '共享机制', '依赖配置', '相邻边界'].forEach(title => tr.append(el('th', title))); thead.append(tr); table.append(thead);
    const tbody = el('tbody');
    Object.entries(Core.TYPES).forEach(([type, definition]) => { const nodes = data.nodes.filter(n => n.type === type), row = el('tr'), name = el('td'), button = el('button', definition.label); button.addEventListener('click', () => { state.types = [type]; state.view = 'catalog'; render(true); writeURL(true); }); name.append(button); row.append(name); [nodes.length, nodes.filter(n => n.coverage === 'reviewed').length, nodes.filter(n => n.coverage === 'outline').length, ...Object.keys(Core.APPLICABILITY).map(scope => nodes.filter(n => n.applicability === scope).length)].forEach(count => row.append(el('td', count))); tbody.append(row); }); table.append(tbody); scroll.append(table); wrap.append(scroll, el('p', '这些数量描述当前资料库，不是“全球所有利用手法”的完成率。点击领域可以继续浏览具体条目。', 'coverage-footer'));
    const gaps = $('coverage-gaps'); gaps.replaceChildren(); gaps.append(el('h2', '需要继续核对的条目'));
    const outline = data.nodes.filter(n => n.coverage === 'outline');
    if (outline.length) { const list = el('ul'); outline.forEach(node => { const item = el('li'), button = el('button', node.label, 'text-button'); button.addEventListener('click', () => selectNode(node.id, true, true)); item.append(button, document.createTextNode(' · ' + node.limitations.join('；'))); list.append(item); }); gaps.append(list); }
    else gaps.append(el('p', '当前条目都有核对资料。仍需持续收录新的研究、OEM 驱动差异、补丁回移和更多版本条件。', 'coverage-footer'));
  }
  function renderSources() {
    const query = Core.normalize($('source-search').value), list = $('source-list'); list.replaceChildren();
    const sources = data.sources.filter(source => Core.normalize(source.title + ' ' + source.publisher).includes(query));
    if (!sources.length) list.append(el('p', '没有匹配资料。', 'empty'));
    sources.forEach(source => list.append(sourceItem(source)));
  }
  function render(autoSelect = false) {
    filtered = Core.filterNodes(data.nodes, { query: state.query, types: state.types, applicability: state.applicability, coverage: state.coverage });
    if (autoSelect) { state.selected = filtered.some(n => n.id === state.selected) ? state.selected : filtered[0]?.id; state.path = null; state.mode = 'focus'; }
    document.querySelectorAll('[data-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === state.view)));
    for (const view of knownViews) $('view-' + view).hidden = state.view !== view;
    $('workspace').classList.toggle('no-detail', state.view === 'coverage' || state.view === 'sources');
    renderFilters(); renderDirectory(); renderDetails(); renderGraph(); renderCatalog(); renderPathResult();
    if (state.view === 'coverage') renderCoverage(); if (state.view === 'sources') renderSources();
  }
  function download(nodes, edges, suffix) {
    const referenced = new Set([...nodes.flatMap(n => n.sources), ...edges.flatMap(e => e.sources)]);
    const exported = { meta: { ...data.meta, exportScope: suffix, directoryFilters: { query: state.query, types: state.types, applicability: state.applicability, coverage: state.coverage } }, nodes, edges, sources: data.sources.filter(s => referenced.has(s.id)) };
    const blob = new Blob([JSON.stringify(exported, null, 2) + '\n'], { type: 'application/json' }), url = URL.createObjectURL(blob), a = el('a'); a.href = url; a.download = `android-kernel-kb-${suffix}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast(`已导出 ${nodes.length} 个知识点及其内部关系`);
  }
  Object.entries(Core.APPLICABILITY).forEach(([value, label]) => { const option = el('option', label); option.value = value; $('applicability').append(option); });
  Object.entries(Core.COVERAGE).forEach(([value, label]) => { const option = el('option', label); option.value = value; $('coverage-filter').append(option); });
  data.nodes.slice().sort((a, b) => a.label.localeCompare(b.label, 'zh-CN')).forEach(node => { const option = el('option', node.label + (node.cve ? ' · ' + node.cve : '')); option.value = node.id; $('path-target').append(option); });
  Object.entries(Core.TYPES).forEach(([type, definition]) => { const item = el('span'); item.append(dot(type), document.createTextNode(definition.label)); $('legend').append(item); });
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => { state.view = button.dataset.view; render(); writeURL(true); }));
  $('search').addEventListener('input', () => { state.query = $('search').value; render(true); writeURL(); });
  $('applicability').addEventListener('change', () => { state.applicability = $('applicability').value; render(true); writeURL(); });
  $('coverage-filter').addEventListener('change', () => { state.coverage = $('coverage-filter').value; render(true); writeURL(); });
  $('clear-filters').addEventListener('click', () => { state.query = ''; state.types = []; state.applicability = ''; state.coverage = ''; render(true); writeURL(); });
  $('depth').addEventListener('change', () => { state.depth = Number($('depth').value); state.path = null; state.mode = 'focus'; renderGraph(); writeURL(); });
  $('focus-mode').addEventListener('click', () => { state.mode = 'focus'; state.path = null; renderGraph(); renderPathResult(); writeURL(); });
  $('overview-mode').addEventListener('click', () => { state.mode = 'overview'; state.path = null; renderGraph(); renderPathResult(); writeURL(); });
  $('zoom-in').addEventListener('click', () => zoom(1.2)); $('zoom-out').addEventListener('click', () => zoom(1 / 1.2)); $('fit').addEventListener('click', resetTransform);
  $('source-search').addEventListener('input', renderSources);
  $('find-path').addEventListener('click', () => { const path = Core.associationPath(data, state.selected, $('path-target').value); if (!path) { toast('在当前资料关系中没有找到 8 跳以内的关联路径'); return; } state.path = path; state.mode = 'path'; state.view = 'graph'; render(); writeURL(true); });
  $('clear-path').addEventListener('click', () => { state.path = null; state.mode = 'focus'; renderGraph(); renderPathResult(); writeURL(); });
  $('export-all').addEventListener('click', () => download(data.nodes, data.edges, 'all'));
  $('export-filtered').addEventListener('click', () => { const ids = new Set(filtered.map(n => n.id)); download(filtered, data.edges.filter(e => ids.has(e.source) && ids.has(e.target)), 'filtered'); });
  $('share').addEventListener('click', async () => { writeURL(); try { await navigator.clipboard.writeText(location.href); toast('当前知识点和筛选链接已复制'); } catch { toast('复制不可用；可以直接复制浏览器地址栏'); } });
  let drag = null;
  function graphPoint(event) { return new DOMPoint(event.clientX, event.clientY).matrixTransform($('graph').getScreenCTM().inverse()); }
  $('graph').addEventListener('pointerdown', event => { if (event.button !== 0 || event.target.closest('.graph-node,.overview-node')) return; const point = graphPoint(event); drag = { x: point.x, y: point.y, startX: state.x, startY: state.y }; $('graph').setPointerCapture(event.pointerId); });
  $('graph').addEventListener('pointermove', event => { if (!drag) return; const point = graphPoint(event); state.x = drag.startX + point.x - drag.x; state.y = drag.startY + point.y - drag.y; applyTransform(); });
  $('graph').addEventListener('pointerup', () => { drag = null; }); $('graph').addEventListener('pointercancel', () => { drag = null; });
  $('graph').addEventListener('wheel', event => { event.preventDefault(); zoom(event.deltaY < 0 ? 1.1 : 1 / 1.1); }, { passive: false });
  document.addEventListener('keydown', event => { if (event.key === '/' && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) { event.preventDefault(); $('search').focus(); } if (event.key === 'Escape' && document.activeElement === $('search')) { $('search').value = ''; state.query = ''; render(true); writeURL(); } });
  window.addEventListener('popstate', () => { readURL(); render(); });
  if (window.matchMedia('(max-width: 900px)').matches) $('filters').open = false;
  readURL(); renderStats(); render();
})();
