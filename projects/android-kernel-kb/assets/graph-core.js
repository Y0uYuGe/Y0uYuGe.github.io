(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AKGraphCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const TYPES = {
    surface: { label: '攻击面', color: '#4188a0' },
    bug: { label: '漏洞成因', color: '#c95743' },
    technique: { label: '利用方法', color: '#a87836' },
    primitive: { label: '利用原语', color: '#8c6ab0' },
    mitigation: { label: '防护与诊断', color: '#498779' },
    context: { label: '环境与前提', color: '#788391' },
    outcome: { label: '影响与结果', color: '#a45b83' },
    case: { label: '公开案例', color: '#5776b3' }
  };
  const APPLICABILITY = { android: 'Android 机制 / 实证', shared: '共享 Linux 机制', conditional: '依赖配置或设备', adjacent: '相邻安全边界' };
  const COVERAGE = { reviewed: '资料已核对', outline: '需要继续核对' };
  const RELATIONS = { exposes: '暴露', enables: '形成能力', uses: '使用', affects: '影响', mitigates: '缓解', constrains: '约束', requires: '依赖', illustrates: '示例说明', related: '关联' };
  const collator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' });
  function normalize(text) { return String(text || '').normalize('NFKC').toLocaleLowerCase().replace(/[\s_-]+/g, ' ').trim(); }
  function searchable(node) { return normalize([node.id, node.label, node.labelEn, node.summary, node.cve, ...(node.tags || []), ...(node.details || [])].join(' ')); }
  function filterNodes(nodes, filters = {}) {
    const terms = normalize(filters.query).split(' ').filter(Boolean);
    const query = normalize(filters.query);
    const types = new Set(filters.types || []);
    const rank = node => !query ? 0 : [node.cve, node.label, node.labelEn, node.id].some(value => value && normalize(value) === query) ? 0 : [node.label, node.labelEn].some(value => normalize(value).includes(query)) ? 1 : 2;
    return nodes.filter(node => (!types.size || types.has(node.type)) && (!filters.applicability || node.applicability === filters.applicability) && (!filters.coverage || node.coverage === filters.coverage) && terms.every(term => searchable(node).includes(term)))
      .sort((a, b) => rank(a) - rank(b) || collator.compare(a.label, b.label));
  }
  function indexData(data) {
    const nodes = new Map(data.nodes.map(n => [n.id, n]));
    const sources = new Map(data.sources.map(s => [s.id, s]));
    const adjacency = new Map(data.nodes.map(n => [n.id, []]));
    data.edges.forEach((edge, index) => {
      adjacency.get(edge.source)?.push({ id: edge.target, edge, index, forward: true });
      adjacency.get(edge.target)?.push({ id: edge.source, edge, index, forward: false });
    });
    return { nodes, sources, adjacency };
  }
  function neighborhood(data, selected, depth = 1, limit = 60) {
    const index = indexData(data);
    if (!index.nodes.has(selected)) return { nodes: [], edges: [], total: 0, truncated: false, distances: new Map() };
    const distances = new Map([[selected, 0]]), queue = [selected];
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const id = queue[cursor], distance = distances.get(id);
      if (distance >= depth) continue;
      for (const next of index.adjacency.get(id)) {
        if (!distances.has(next.id)) { distances.set(next.id, distance + 1); queue.push(next.id); }
      }
    }
    const ids = [...distances.keys()].sort((a, b) => distances.get(a) - distances.get(b) || collator.compare(index.nodes.get(a).label, index.nodes.get(b).label)).slice(0, Math.max(limit, 1));
    const allowed = new Set(ids);
    return { nodes: ids.map(id => index.nodes.get(id)), edges: data.edges.filter(e => allowed.has(e.source) && allowed.has(e.target)), total: distances.size, truncated: distances.size > ids.length, distances };
  }
  function associationPath(data, start, end, maxDepth = 8) {
    const index = indexData(data);
    if (!index.nodes.has(start) || !index.nodes.has(end)) return null;
    const queue = [start], parent = new Map([[start, null]]), distance = new Map([[start, 0]]);
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const id = queue[cursor];
      if (id === end) {
        const ids = [], steps = []; let current = end;
        while (current !== null) { ids.push(current); const p = parent.get(current); if (!p) break; steps.push(p); current = p.from; }
        return { nodes: ids.reverse().map(nodeId => index.nodes.get(nodeId)), steps: steps.reverse() };
      }
      if (distance.get(id) >= maxDepth) continue;
      for (const next of index.adjacency.get(id)) {
        if (!parent.has(next.id)) { parent.set(next.id, { from: id, to: next.id, edge: next.edge, forward: next.forward }); distance.set(next.id, distance.get(id) + 1); queue.push(next.id); }
      }
    }
    return null;
  }
  function radialLayout(nodes, selected, distances = new Map()) {
    const positions = new Map();
    if (!nodes.length) return positions;
    positions.set(selected, { x: 480, y: 340 });
    [1, 2].forEach(ring => {
      const items = nodes.filter(n => n.id !== selected && (distances.get(n.id) > 1 ? 2 : 1) === ring).sort((a, b) => a.type.localeCompare(b.type) || collator.compare(a.label, b.label));
      items.forEach((node, i) => {
        const angle = -Math.PI / 2 + i * Math.PI * 2 / Math.max(items.length, 1);
        const radius = ring === 1 ? 215 : 305;
        positions.set(node.id, { x: 480 + Math.cos(angle) * radius * 1.25, y: 340 + Math.sin(angle) * radius });
      });
    });
    return positions;
  }
  function validateData(data) {
    const errors = [], nodeIds = new Set(), sourceIds = new Set(), edgeKeys = new Set();
    if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.edges) || !Array.isArray(data.sources)) return ['nodes, edges and sources must be arrays'];
    data.sources.forEach(source => {
      if (!source.id || sourceIds.has(source.id)) errors.push(`Duplicate or missing source ID: ${source.id}`);
      sourceIds.add(source.id);
      try { const url = new URL(source.url); if (url.protocol !== 'https:' || url.username || url.password) errors.push(`Source must use HTTPS without credentials: ${source.id}`); } catch { errors.push(`Invalid source URL: ${source.id}`); }
      if (!source.title || !source.publisher || !['documentation', 'research', 'paper', 'source-code', 'advisory'].includes(source.kind) || !/^\d{4}-\d{2}-\d{2}$/.test(source.accessed || '') || !Number.isFinite(Date.parse(source.accessed))) errors.push(`Incomplete source: ${source.id}`);
    });
    data.nodes.forEach(node => {
      if (!/^[a-z][a-z0-9-]+$/.test(node.id || '') || nodeIds.has(node.id)) errors.push(`Duplicate or invalid node ID: ${node.id}`);
      nodeIds.add(node.id);
      if (!TYPES[node.type]) errors.push(`Unknown node type: ${node.id}`);
      if (!APPLICABILITY[node.applicability] || !COVERAGE[node.coverage]) errors.push(`Invalid applicability/coverage: ${node.id}`);
      if (!node.label || !node.labelEn || !node.summary) errors.push(`Missing node description: ${node.id}`);
      for (const field of ['details', 'conditions', 'limitations', 'tags', 'sources']) if (!Array.isArray(node[field]) || node[field].some(value => typeof value !== 'string' || !value.trim())) errors.push(`Invalid array ${field}: ${node.id}`);
      if (!node.sources?.length) errors.push(`Unsourced node: ${node.id}`);
      if (Array.isArray(node.sources)) node.sources.forEach(id => { if (!sourceIds.has(id)) errors.push(`Unknown source ${id}: ${node.id}`); });
      if (!node.details?.length) errors.push(`Empty node details: ${node.id}`);
    });
    data.edges.forEach(edge => {
      const key = [edge.source, edge.relation, edge.target].join('|');
      if (edgeKeys.has(key)) errors.push(`Duplicate relation: ${key}`);
      edgeKeys.add(key);
      if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) errors.push(`Dangling relation: ${key}`);
      if (edge.source === edge.target) errors.push(`Self relation: ${key}`);
      if (!RELATIONS[edge.relation] || !edge.note || !Array.isArray(edge.sources) || !edge.sources.length) errors.push(`Incomplete relation: ${key}`);
      if (Array.isArray(edge.sources)) edge.sources.forEach(id => { if (!sourceIds.has(id)) errors.push(`Unknown edge source ${id}: ${key}`); });
    });
    return errors;
  }
  return { TYPES, APPLICABILITY, COVERAGE, RELATIONS, normalize, filterNodes, indexData, neighborhood, associationPath, radialLayout, validateData };
});
