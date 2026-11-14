// Layout pipeline adapted from the oh-my-mermaid architecture viewer: fan-out grids, aspect-aware
// direction, recursively embedded sub-groups and an overview canvas. Geometry only — no DOM, no HTML.
// 移植自 oh-my-mermaid 架构查看器的布局管线：扇出网格、宽高比自适应方向、递归内嵌子图与总览画布。
// 只计算几何，不涉及 DOM 与 HTML。

// Limits mirror the upstream viewer constants so exported pages match its visual density.
// 限额与上游查看器常量一致，使导出页面与其视觉密度一致。
const MAX_DEPTH = 6;
const GRID_COLUMNS = 3;
const SUB_MAX_WIDTH = 320, SUB_MAX_HEIGHT = 220, SUB_PAD = 12;
const GROUP_PAD = { left: 16, right: 20, top: 20, bottom: 16 };
const OVERVIEW_GAP_X = 70, OVERVIEW_GAP_Y = 90, OVERVIEW_PAD = 60;

/** Round to one decimal like the upstream renderer; value is a number, returns a compact number.
 *  按上游渲染器保留一位小数；value 为数字，返回紧凑数字。
 */
export function r1(value) { return Math.round(value * 10) / 10; }

/** Format a kebab-case identifier as display words; name is an identifier, returns a title label.
 *  将短横线标识符格式化为展示词；name 为标识符，返回标题标签。
 */
export function formatLabel(name) {
  return String(name).split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

/** Default text measurement matching the viewer font fallback; text/font identify content, returns width.
 *  与查看器字体回退一致的默认文本测量；text/font 标识内容，返回宽度。
 */
export function estimateTextWidth(text, font = '12px system-ui') {
  // Size reads the leading pixel size so CJK glyphs receive a wider advance than ASCII.
  // Size 读取前导像素字号，使 CJK 字符获得比 ASCII 更宽的步进。
  const size = Number.parseFloat(font) || 12;
  let width = 0;
  for (const character of String(text)) width += character.codePointAt(0) > 255 ? size : size * 0.58;
  return Math.ceil(width);
}

/** Smooth path through Dagre waypoints, identical to the upstream quadratic spline.
 *  穿过 Dagre 路径点的平滑路径，与上游二次样条一致。
 */
export function smoothPath(points) {
  if (!points || points.length < 2) return '';
  if (points.length === 2) {
    // Two-point edges use the upstream S-curve instead of a straight segment.
    // 两点边使用上游 S 形曲线而非直线段。
    const [a, b] = points, mx = r1((a.x + b.x) / 2);
    return `M${r1(a.x)},${r1(a.y)} C${mx},${r1(a.y)} ${mx},${r1(b.y)} ${r1(b.x)},${r1(b.y)}`;
  }
  let path = `M${r1(points[0].x)},${r1(points[0].y)}`;
  for (let index = 1; index < points.length - 1; index++) {
    const mid = { x: (points[index].x + points[index + 1].x) / 2, y: (points[index].y + points[index + 1].y) / 2 };
    path += ` Q${r1(points[index].x)},${r1(points[index].y)} ${r1(mid.x)},${r1(mid.y)}`;
  }
  const last = points[points.length - 1];
  return `${path} L${r1(last.x)},${r1(last.y)}`;
}

/** Isolate graph identifiers from Dagre's internal object-key namespace.
 *  将图标识符与 Dagre 内部对象键命名空间隔离。
 */

/** Layout a parsed graph with the pinned Dagre instance; graph/library are inputs, returns plain geometry.
 *  使用固定 Dagre 实例布局已解析的图；graph/library 为输入，返回普通几何数据。
 */
export function layoutGraph(graph, library) {
  // Identifiers replace user names such as __proto__ with safe private numeric IDs.
  // Identifiers 将 __proto__ 等用户名称替换为安全的内部数字 ID。
  const identifiers=new Map(graph.nodes.map((node,index)=>[node.id,`n${index}`]));
  // Layout preserves parallel edges by assigning an explicit unique edge name.
  // Layout 通过显式唯一边名称保留平行边。
  const layout=new library.graphlib.Graph({multigraph:true}).setGraph({rankdir:graph.direction,nodesep:35,ranksep:90,marginx:24,marginy:24}).setDefaultEdgeLabel(()=>({}));
  for (const node of graph.nodes) {
    // Lines estimate system-font label bounds without DOM or HTML interpretation.
    // Lines 在不依赖 DOM 或 HTML 解释的前提下估算系统字体标签边界。
    const lines=node.label.split('\n');
    // Width/height include shape-specific room for the displayed text.
    // Width/height 包含形状特定的文字展示空间。
    let width=Math.max(90,...lines.map(line=>[...line].reduce((sum,char)=>sum+(char.charCodeAt(0)>255?13:7),0)+28));
    let height=Math.max(46,lines.length*19+22);
    if (node.shape==='diamond') {width*=1.5;height*=1.5;}
    if (node.shape==='circle') width=height=Math.max(width,height);
    layout.setNode(identifiers.get(node.id),{width,height});
  }
  graph.edges.forEach((edge,index)=>{
    // Lines determine a multiline label's reserved layout area.
    // Lines 确定多行边标签预留的布局区域。
    const lines=edge.label.split('\n');
    layout.setEdge(identifiers.get(edge.from),identifiers.get(edge.to),{width:Math.max(...lines.map(line=>line.length*7)),height:edge.label?18*lines.length:0},String(index));
  });
  library.layout(layout);
  return {
    width:Math.max(100,layout.graph().width),height:Math.max(100,layout.graph().height),
    nodes:graph.nodes.map(node=>({id:node.id,...layout.node(identifiers.get(node.id))})),
    edges:graph.edges.map((edge,index)=>layout.edge(identifiers.get(edge.from),identifiers.get(edge.to),String(index))),
  };
}

/** Build the overview scene from workspace records; options supply parsing and measurement, returns geometry.
 *  从工作区记录构建总览场景；options 提供解析与测量，返回几何数据。
 */
export function buildScene(records, options) {
  const { parseGraph, library, measure = estimateTextWidth, maxDepth = MAX_DEPTH } = options;
  // Records and children index the snapshot by full path so equal short names never collide.
  // Records 和 children 以完整路径索引快照，使相同短名称不会冲突。
  const byPath = new Map(records.map(record => [record.path, record]));
  const children = new Map();
  for (const record of records) {
    const separator = record.path.lastIndexOf('/');
    if (separator < 0) continue;
    const parent = record.path.slice(0, separator);
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(record.path.slice(separator + 1));
  }
  // Expanded prevents one document from embedding into several branches, like the upstream global set.
  // Expanded 防止一个文档内嵌进多个分支，与上游全局集合一致。
  const expanded = new Set();
  // Parse caches each diagram once per scene build.
  // Parse 在每次场景构建中缓存每张图一次。
  const parsed = new Map();
  function graphOf(path) {
    if (!parsed.has(path)) {
      const record = byPath.get(path);
      const graph = parseGraph(record.fields.diagram === undefined ? '' : record.fields.diagram);
      parsed.set(path, graph);
    }
    return parsed.get(path);
  }
  /** Reference target of a node label or id, resolved against the whole snapshot; returns full path or null.
   *  节点标签或 id 的引用目标，按整个快照解析；返回完整路径或 null。
   */
  function referenceTarget(node) {
    const label = /^@([\w-]+(?:\/[\w-]+)*)/u.exec(node.label);
    if (label && byPath.has(label[1])) return label[1];
    const id = /^@([\w-]+(?:\/[\w-]+)*)/u.exec(node.id);
    if (id && byPath.has(id[1])) return id[1];
    return null;
  }
  /** Render one group recursively; path/level/seen locate it, returns geometry or null.
   *  递归渲染一个分组；path/level/seen 定位它，返回几何或 null。
   */
  function renderGroup(path, level, seen) {
    const graph = graphOf(path);
    if (graph.nodes.length === 0 || graph.issues.some(issue => issue.level === 'error')) return null;
    if (seen.has(path)) return null;
    const nextSeen = new Set(seen); nextSeen.add(path);
    const nodes = graph.nodes, edges = graph.edges;
    const subGroups = new Map(), dimensions = new Map();
    const currentChildren = children.get(path) || [];
    for (const node of nodes) {
      // Subgroup resolution follows upstream: explicit @ref, or a direct child owning a diagram.
      // 子图解析遵循上游：显式 @ref，或拥有图的直接子节点。
      const reference = referenceTarget(node);
      const childPath = currentChildren.includes(node.id) && byPath.has(`${path}/${node.id}`) ? `${path}/${node.id}` : null;
      const target = reference !== null ? reference : childPath;
      if (level < maxDepth && target !== null && !nextSeen.has(target) && !expanded.has(target)) {
        const sub = renderGroup(target, level + 1, nextSeen);
        if (sub) {
          expanded.add(target);
          const fitScale = Math.min((SUB_MAX_WIDTH - SUB_PAD * 2) / sub.width, (SUB_MAX_HEIGHT - SUB_PAD * 2) / sub.height, 1);
          subGroups.set(node.id, { path: target, fitScale, group: sub });
          dimensions.set(node.id, { width: sub.width * fitScale + SUB_PAD * 2, height: sub.height * fitScale + SUB_PAD * 2 });
        }
      }
      if (!dimensions.has(node.id)) {
        // Dimensions mirror upstream: first label line, 80..220 width, diamond taller.
        // 尺寸与上游一致：首行标签、80..220 宽、菱形更高。
        const label = node.label.replace(/^@/u, '');
        const mainLine = label.split('\n')[0];
        const hasPath = label.includes('\n');
        const maxWidth = nodes.length > 10 ? 160 : 220;
        const width = Math.min(maxWidth, Math.max(80, measure(mainLine, '12px system-ui') + 44));
        const baseHeight = node.shape === 'diamond' ? 42 : 38;
        dimensions.set(node.id, { width, height: hasPath ? baseHeight + 14 : baseHeight });
      }
    }
    // Fan-out leaves collapse into a virtual grid node exactly like the upstream compact layout.
    // 扇出叶子与上游紧凑布局完全一致地收进虚拟网格节点。
    const gridGroups = new Map(), gridExcluded = new Set(), gridPositions = new Map();
    for (const node of nodes) {
      const leafTargets = edges.filter(edge => edge.from === node.id).map(edge => edge.to)
        .filter(target => !edges.some(edge => edge.from === target) && !subGroups.has(target));
      const unique = [...new Set(leafTargets)];
      if (unique.length <= GRID_COLUMNS) continue;
      const rows = Math.ceil(unique.length / GRID_COLUMNS);
      const cellWidth = Math.max(...unique.map(id => dimensions.get(id).width)) + 16;
      const cellHeight = Math.max(...unique.map(id => dimensions.get(id).height)) + 10;
      const virtualId = `__grid_${node.id}`;
      gridGroups.set(virtualId, { parent: node.id, children: unique, cellWidth, cellHeight });
      dimensions.set(virtualId, { width: GRID_COLUMNS * cellWidth, height: rows * cellHeight });
      for (const id of unique) gridExcluded.add(id);
    }
    /** Build one Dagre layout for a rank direction; identifiers stay isolated from user names.
     *  为一个层级方向构建一次 Dagre 布局；标识符与用户名称保持隔离。
     */
    function buildLayout(rankdir) {
      const dense = nodes.length > 10;
      const identifiers = new Map();
      let counter = 0;
      const layout = new library.graphlib.Graph({ multigraph: true });
      layout.setGraph({ rankdir, nodesep: dense ? 20 : 32, ranksep: dense ? 28 : 44, marginx: GROUP_PAD.left, marginy: GROUP_PAD.top });
      layout.setDefaultEdgeLabel(() => ({}));
      const identify = id => {
        if (!identifiers.has(id)) identifiers.set(id, `n${counter++}`);
        return identifiers.get(id);
      };
      for (const node of nodes) {
        if (gridExcluded.has(node.id)) continue;
        layout.setNode(identify(node.id), dimensions.get(node.id));
      }
      for (const virtualId of gridGroups.keys()) layout.setNode(identify(virtualId), dimensions.get(virtualId));
      const addedVirtualEdges = new Set();
      let edgeIndex = 0;
      for (const edge of edges) {
        let from = edge.from, to = edge.to;
        if (gridExcluded.has(from)) { edgeIndex++; continue; }
        if (gridExcluded.has(to)) {
          const entry = [...gridGroups.entries()].find(([, group]) => group.children.includes(to));
          if (!entry) { edgeIndex++; continue; }
          to = entry[0];
          const key = `${from}->${to}`;
          if (addedVirtualEdges.has(key)) { edgeIndex++; continue; }
          addedVirtualEdges.add(key);
        }
        // Edge labels reserve layout area; parallel edges keep distinct names.
        // 边标签预留布局区域；平行边保持不同名称。
        layout.setEdge(identify(from), identify(to), { width: edge.label ? measure(edge.label, '9px system-ui') + 8 : 0, height: edge.label ? 12 : 0 }, `e${edgeIndex++}`);
      }
      try { library.layout(layout); } catch { return null; }
      return { layout, identifiers };
    }
    // Direction follows the source, with the upstream aspect-ratio fallback to TB.
    // 方向跟随源码，并按上游宽高比回退到 TB。
    let rankdir = graph.direction === 'TD' ? 'TB' : graph.direction;
    let built = buildLayout(rankdir);
    if (built === null) return null;
    const first = built.layout.graph();
    const aspectThreshold = nodes.length > 12 ? 1.4 : nodes.length > 7 ? 1.6 : 2.0;
    if (first.width > 0 && first.height > 0 && first.width / first.height > aspectThreshold && rankdir !== 'TB') {
      const vertical = buildLayout('TB');
      if (vertical !== null) { built = vertical; rankdir = 'TB'; }
    }
    const { layout, identifiers } = built;
    // Virtual grid nodes expand back into child positions after layout.
    // 虚拟网格节点在布局后展开回子节点位置。
    for (const [virtualId, group] of gridGroups) {
      const placed = layout.node(identifiers.get(virtualId));
      const rows = Math.ceil(group.children.length / GRID_COLUMNS);
      const startX = placed.x - ((GRID_COLUMNS - 1) * group.cellWidth) / 2;
      const startY = placed.y - ((rows - 1) * group.cellHeight) / 2;
      group.children.forEach((childId, index) => {
        gridPositions.set(childId, { x: startX + (index % GRID_COLUMNS) * group.cellWidth, y: startY + Math.floor(index / GRID_COLUMNS) * group.cellHeight });
      });
    }
    const info = layout.graph();
    const width = r1(info.width + GROUP_PAD.right), height = r1(info.height + GROUP_PAD.bottom);
    // Edge geometry resolves grid children and keeps every parallel edge.
    // 边几何解析网格子节点并保留每条平行边。
    const sceneEdges = [];
    let edgeCursor = 0;
    const identifierList = [...identifiers.entries()];
    for (const edge of edges) {
      const index = edgeCursor++;
      if (gridExcluded.has(edge.from)) continue;
      const source = layout.node(identifiers.get(edge.from)) || gridPositions.get(edge.from);
      const target = gridPositions.get(edge.to) || layout.node(identifiers.get(edge.to));
      if (!source || !target) continue;
      let points, mid;
      if (gridPositions.has(edge.to)) {
        const mx = (source.x + target.x) / 2, my = (source.y + target.y) / 2;
        points = [{ x: source.x, y: source.y }, { x: mx, y: my }, { x: target.x, y: target.y }];
        mid = { x: mx, y: my };
      } else {
        const placed = layout.edge(identifiers.get(edge.from), identifiers.get(edge.to), `e${index}`);
        if (!placed || !placed.points || placed.points.length === 0) continue;
        points = placed.points;
        mid = points[Math.floor(points.length / 2)];
      }
      sceneEdges.push({ from: edge.from, to: edge.to, arrow: edge.arrow, label: edge.label, points, mid });
    }
    // Node geometry restores original identifiers only after third-party layout.
    // 节点几何仅在第三方布局结束后恢复原始标识符。
    const sceneNodes = [];
    for (const node of nodes) {
      const position = gridPositions.get(node.id) || layout.node(identifiers.get(node.id));
      if (!position) continue;
      const dimension = dimensions.get(node.id);
      const sub = subGroups.get(node.id);
      const label = node.label.replace(/^@/u, '');
      const lines = label.split('\n');
      sceneNodes.push({
        id: node.id, shape: node.shape, className: node.className,
        x: r1(position.x), y: r1(position.y), width: dimension.width, height: dimension.height,
        mainLabel: lines[0], pathLabel: lines.length > 1 ? lines.slice(1).join('\n') : '',
        sub: sub === undefined ? null : { path: sub.path, fitScale: r1(sub.fitScale), group: sub.group },
        target: referenceTarget(node) !== null ? referenceTarget(node) : (byPath.has(`${path}/${node.id}`) ? `${path}/${node.id}` : null),
      });
    }
    return { path, width, height, rankdir, nodes: sceneNodes, edges: sceneEdges, styles: graph.styles };
  }
  // Roots are perspectives without incoming references; cycles fall back to the most outgoing.
  // 根是没有传入引用的视角；循环时回退到传出最多者。
  const paths = records.map(record => record.path);
  const topLevel = paths.filter(path => !path.includes('/'));
  const incoming = new Map(topLevel.map(path => [path, 0]));
  const outgoing = new Map(topLevel.map(path => [path, 0]));
  for (const path of topLevel) {
    const graph = graphOf(path);
    const targets = new Set();
    for (const node of graph.nodes) {
      const target = referenceTarget(node);
      if (target !== null && incoming.has(target) && target !== path) targets.add(target);
    }
    outgoing.set(path, targets.size);
    for (const target of targets) incoming.set(target, incoming.get(target) + 1);
  }
  let roots = topLevel.filter(path => incoming.get(path) === 0);
  if (roots.length === 0 && topLevel.length > 0) {
    const maxOut = Math.max(...topLevel.map(path => outgoing.get(path)));
    roots = topLevel.filter(path => outgoing.get(path) === maxOut);
  }
  // Groups render once; the overview arranges them in a balanced sqrt grid like upstream.
  // 分组只渲染一次；总览按上游的平衡平方根网格排布。
  const groups = [];
  for (const root of roots) {
    const group = renderGroup(root, 0, new Set());
    if (group) groups.push(group);
  }
  const columns = Math.max(1, Math.ceil(Math.sqrt(groups.length)));
  const rows = Math.ceil(groups.length / columns);
  const columnWidths = Array.from({ length: columns }, (_, column) => Math.max(0, ...groups.filter((group, index) => index % columns === column).map(group => group.width)));
  const rowHeights = Array.from({ length: rows }, (_, row) => Math.max(0, ...groups.filter((group, index) => Math.floor(index / columns) === row).map(group => group.height)));
  const columnX = [], rowY = [];
  for (let index = 0; index < columns; index++) columnX.push(index === 0 ? 0 : columnX[index - 1] + columnWidths[index - 1] + OVERVIEW_GAP_X);
  for (let index = 0; index < rows; index++) rowY.push(index === 0 ? 0 : rowY[index - 1] + rowHeights[index - 1] + OVERVIEW_GAP_Y);
  groups.forEach((group, index) => {
    group.x = r1(OVERVIEW_PAD + columnX[index % columns]);
    group.y = r1(OVERVIEW_PAD + rowY[Math.floor(index / columns)]);
  });
  const width = groups.length === 0 ? 0 : r1(columnX[columns - 1] + columnWidths[columns - 1] + OVERVIEW_PAD * 2);
  const height = groups.length === 0 ? 0 : r1(rowY[rows - 1] + rowHeights[rows - 1] + OVERVIEW_PAD * 2);
  return { width, height, groups, roots };
}