// Consume inert snapshot JSON and render the upstream-style overview canvas with safe DOM only.
// 消费惰性快照 JSON，仅用安全 DOM 渲染上游风格的总览画布。
const snapshot = JSON.parse(document.getElementById('snapshot').textContent);
// Records are keyed by complete paths to preserve equally named nodes under different perspectives.
// Records 以完整路径为键，保留不同视角下的同名节点。
const records = new Map(snapshot.nodes.map(record => [record.path, record]));
// Canvas state mirrors the upstream viewer: translate/scale viewport, selection and detail tab.
// 画布状态与上游查看器一致：平移/缩放视口、选择与详情标签页。
const wrap = document.getElementById('canvas-wrap'), canvas = document.getElementById('canvas');
const sidebar = document.getElementById('sidebar'), details = document.getElementById('details');
const zoomLabel = document.getElementById('zoom-label');
let vpX = 0, vpY = 0, vpScale = 0.7, scene = null, selection = null, tab = 'details';
const MIN_SCALE = 0.02, MAX_SCALE = 30;

/** Create a safe HTML element; tag/text/className describe it, returns an unattached element.
 *  创建安全 HTML 元素；tag/text/className 描述它，返回未挂载元素。
 */
function element(tag, text = '', className = '') {
  const created = document.createElement(tag);
  created.textContent = text; created.className = className; return created;
}

/** Create an SVG element with explicit attributes; tag/attrs/text describe it, returns a safe SVG node.
 *  使用显式属性创建 SVG 元素；tag/attrs/text 描述它，返回安全 SVG 节点。
 */
function vector(tag, attrs = {}, text = '') {
  const created = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [name, value] of Object.entries(attrs)) created.setAttribute(name, String(value));
  created.textContent = text; return created;
}

/** Measure text with the viewer's system-font stack; text/font identify content, returns pixel width.
 *  用查看器系统字体栈测量文本；text/font 标识内容，返回像素宽度。
 */
const measureContext = document.createElement('canvas').getContext('2d');
function measure(text, font) {
  measureContext.font = font || '12px system-ui,"Microsoft YaHei",sans-serif';
  return Math.ceil(measureContext.measureText(String(text)).width);
}

/** Render a safe Markdown subset; parent is container, source is field text, returns void.
 *  渲染安全 Markdown 子集；parent 为容器，source 为字段文本，无返回值。
 */
function markdown(parent, source) {
  // Code is either the current fenced block or null; HTML and links remain visible literal text.
  // Code 为当前围栏代码块或 null；HTML 与链接保持可见字面文本。
  let code = null;
  for (const line of source.split('\n')) {
    if (line.startsWith('```')) {
      if (code === null) { code = element('pre'); parent.append(code); } else code = null;
    } else if (code !== null) code.textContent += `${line}\n`;
    else if (/^#{1,6}\s/u.test(line)) parent.append(element('h3', line.replace(/^#{1,6}\s/u, '')));
    else if (/^\s*[-*]\s/u.test(line)) parent.append(element('p', `• ${line.replace(/^\s*[-*]\s/u, '')}`));
    else if (line.trim()) parent.append(element('p', line));
  }
}

/** Convert a class definition to a small safe color palette; graph/node supply style, returns allowed colors.
 *  将类定义转换为受限安全配色；graph/node 提供样式，返回允许的颜色。
 */
function colors(styles, node) {
  // Palette defaults to theme tokens rather than interpreting arbitrary Mermaid CSS.
  // Palette 默认使用主题变量，而不解释任意 Mermaid CSS。
  const palette = { fill: 'var(--surface)', stroke: 'var(--line)', color: 'var(--ink)' };
  for (const definition of styles.filter(style => style.name === node.className || style.name === 'default')) {
    for (const declaration of definition.style.split(',')) {
      // Match permits only literal hexadecimal colors for the three supported properties.
      // Match 对三个受支持属性仅允许字面十六进制颜色。
      const match = /^\s*(fill|stroke|color)\s*:\s*(#[\da-f]{3}|#[\da-f]{6}|#[\da-f]{8})\s*$/iu.exec(declaration);
      if (match) palette[match[1]] = match[2];
    }
  }
  return palette;
}

/** Changed node ids of one record against its real previous diagram; record supplies history, returns a Set.
 *  记录相对真实旧图的变化节点 id；record 提供历史，返回集合。
 */
function changedNodes(record) {
  const changed = new Set();
  if (record.meta !== null && record.meta.prev_diagram !== undefined && record.fields.diagram !== undefined) {
    const difference = diffGraphs(record.meta.prev_diagram, record.fields.diagram);
    for (const node of difference.added_nodes) changed.add(node.id);
    for (const node of difference.changed_nodes) changed.add(node.after.id);
  }
  return changed;
}

/** Append one edge with the upstream smooth spline and arrow semantics; group/edge/uid supply context.
 *  按上游平滑样条与箭头语义追加一条边；group/edge/uid 提供上下文。
 */
function drawEdge(group, edge, uid, index) {
  if (edge.arrow === '~~~') return;
  const markerId = `${uid}m${index}`;
  const marker = vector('marker', { id: markerId, markerWidth: 6, markerHeight: 5, refX: 5, refY: 2.5, orient: 'auto', markerUnits: 'userSpaceOnUse' });
  marker.append(vector('path', { d: 'M0,0.5 L0,4.5 L6,2.5 z', class: 'arrow-head' }));
  const definitions = vector('defs'); definitions.append(marker); group.append(definitions);
  const attributes = {
    class: 'edge-path', d: smoothPath(edge.points), fill: 'none',
    'stroke-width': edge.arrow === '==>' ? 3 : 2,
    'data-from': edge.from, 'data-to': edge.to,
  };
  if (edge.arrow === '-.->') attributes['stroke-dasharray'] = '5 4';
  if (!(edge.arrow === '---' || edge.arrow === '--o' || edge.arrow === '--x')) attributes['marker-end'] = `url(#${markerId})`;
  group.append(vector('path', attributes));
  if (edge.arrow === '--o' || edge.arrow === '--x') {
    // End locates the circle/cross terminal supplied by the explicit arrow syntax.
    // End 定位显式箭头语法指定的圆圈或交叉端点。
    const end = edge.points[edge.points.length - 1];
    group.append(edge.arrow === '--o'
      ? vector('circle', { cx: end.x, cy: end.y, r: 4, class: 'edge-terminal' })
      : vector('path', { d: `M ${end.x - 4} ${end.y - 4} l 8 8 M ${end.x - 4} ${end.y + 4} l 8 -8`, class: 'edge-cross' }));
  }
  if (edge.label) {
    // Label chip matches the upstream background rectangle with centered text.
    // 标签片与上游背景矩形加居中文字一致。
    const labelWidth = measure(edge.label, '9px system-ui,"Microsoft YaHei",sans-serif') + 8;
    const chip = vector('g', { class: 'edge-label' });
    chip.append(vector('rect', { x: r1(edge.mid.x - labelWidth / 2), y: r1(edge.mid.y - 6), width: labelWidth, height: 12, rx: 2 }));
    chip.append(vector('text', { x: r1(edge.mid.x), y: r1(edge.mid.y + 3), 'text-anchor': 'middle', 'font-size': 9 }, edge.label));
    group.append(chip);
  }
}

/** Append one regular node shape and labels; group/node/palette supply geometry and safe colors.
 *  追加一个普通节点形状与标签；group/node/palette 提供几何与安全颜色。
 */
function drawNode(group, node, palette, changed) {
  const nx = r1(node.x - node.width / 2), ny = r1(node.y - node.height / 2);
  const attributes = {
    class: 'nshape', fill: palette.fill,
    stroke: changed ? 'var(--green)' : palette.stroke,
    'stroke-width': changed ? 2.5 : 2,
  };
  if (node.shape === 'diamond') {
    group.append(vector('polygon', { ...attributes, points: `${node.x},${ny} ${nx + node.width},${node.y} ${node.x},${ny + node.height} ${nx},${node.y}` }));
  } else if (node.shape === 'circle') {
    group.append(vector('ellipse', { ...attributes, cx: node.x, cy: node.y, rx: node.width / 2, ry: node.height / 2 }));
  } else if (node.shape === 'cylinder') {
    const w = node.width, h = node.height;
    group.append(vector('path', { ...attributes, d: `M ${nx} ${ny + 9} a ${w / 2} 9 0 0 1 ${w} 0 v ${h - 18} a ${w / 2} 9 0 0 1 ${-w} 0 z M ${nx} ${ny + 9} a ${w / 2} 9 0 0 0 ${w} 0` }));
  } else {
    const radius = node.shape === 'stadium' || node.shape === 'round' ? node.height / 2 : 4;
    group.append(vector('rect', { ...attributes, x: nx, y: ny, width: node.width, height: node.height, rx: radius }));
    if (node.shape === 'subroutine') group.append(vector('path', { d: `M ${nx + 8} ${ny} v ${node.height} M ${nx + node.width - 8} ${ny} v ${node.height}`, stroke: palette.stroke, fill: 'none' }));
  }
  // Main and path labels follow the upstream two-line presentation.
  // 主标签与路径标签遵循上游双行呈现。
  if (node.pathLabel) {
    group.append(vector('text', { class: 'node-lbl', x: node.x, y: r1(node.y - 7), 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 12, fill: palette.color }, node.mainLabel));
    group.append(vector('text', { class: 'node-path', x: node.x, y: r1(node.y + 7), 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 9, fill: palette.color }, node.pathLabel));
  } else {
    group.append(vector('text', { class: 'node-lbl', x: node.x, y: node.y, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 12, fill: palette.color }, node.mainLabel));
  }
}

/** Render one scene group recursively into safe SVG; group/depth/uid supply context, returns the SVG group.
 *  将一个场景分组递归渲染为安全 SVG；group/depth/uid 提供上下文，返回 SVG 分组。
 */
function renderGroup(group, depth, uid) {
  const record = records.get(group.path);
  const changed = changedNodes(record);
  const outer = vector('g', { class: 'grp-node', 'data-cls': group.path, 'data-depth': depth, transform: `translate(${group.x},${group.y})`, tabindex: 0, role: 'button', 'aria-label': `打开 ${group.path}` });
  outer.append(vector('rect', { class: 'grp-border', width: group.width, height: group.height, rx: depth === 0 ? 8 : 5, 'stroke-width': 2 }));
  // Top label chip and centered label reproduce the upstream group chrome.
  // 顶部标签片与居中标签复现上游分组外观。
  const title = formatLabel(group.path.split('/').pop());
  const titleWidth = measure(title, '600 10px system-ui,"Microsoft YaHei",sans-serif') + 14;
  outer.append(vector('rect', { class: 'grp-label-top grp-label-bg', x: 6, y: -10, width: titleWidth, height: 20, rx: 2 }));
  outer.append(vector('text', { class: 'grp-label-top', x: 12, y: 3, 'font-size': 10, 'font-weight': 600, 'letter-spacing': '0.05em' }, title));
  const inner = vector('g', { class: 'grp-inner' });
  group.edges.forEach((edge, index) => drawEdge(inner, edge, `${uid}g${depth}_`, index));
  for (const node of group.nodes) {
    if (node.sub !== null) {
      // Embedded sub-group: scaled content inside a clipped boundary, like upstream.
      // 内嵌子图：裁剪边界内的缩放内容，与上游一致。
      const sub = node.sub, pad = 12;
      const boxWidth = r1(sub.group.width * sub.fitScale + pad * 2), boxHeight = r1(sub.group.height * sub.fitScale + pad * 2);
      const nx = r1(node.x - node.width / 2), ny = r1(node.y - node.height / 2);
      const clipId = `${uid}clip_${depth}_${node.id.replace(/[^\w-]/gu, '')}`;
      const definitions = vector('defs');
      const clip = vector('clipPath', { id: clipId });
      clip.append(vector('rect', { x: -2, y: -16, width: boxWidth + 4, height: boxHeight + 18, rx: 6 }));
      definitions.append(clip); inner.append(definitions);
      const subOuter = renderGroup({ ...sub.group, x: nx, y: ny }, depth + 1, `${uid}s${depth}_`);
      subOuter.setAttribute('clip-path', `url(#${clipId})`);
      const border = subOuter.querySelector('.grp-border');
      border.setAttribute('width', boxWidth); border.setAttribute('height', boxHeight);
      const subInner = subOuter.querySelector('.grp-inner');
      subInner.setAttribute('transform', `translate(${pad},${pad}) scale(${sub.fitScale})`);
      const subLabel = subOuter.querySelectorAll('.grp-label-top');
      const subTitleWidth = measure(formatLabel(sub.path.split('/').pop()), '600 9px system-ui,"Microsoft YaHei",sans-serif') + 12;
      subLabel[0].setAttribute('x', 5); subLabel[0].setAttribute('y', -7);
      subLabel[0].setAttribute('width', subTitleWidth); subLabel[0].setAttribute('height', 14);
      subLabel[1].setAttribute('x', 10); subLabel[1].setAttribute('y', 2); subLabel[1].setAttribute('font-size', 9);
      const center = subOuter.querySelector('.grp-label-center');
      center.setAttribute('x', boxWidth / 2); center.setAttribute('y', boxHeight / 2); center.setAttribute('font-size', 9);
      inner.append(subOuter);
      continue;
    }
    const palette = colors(group.styles, node);
    const nodeGroup = vector('g', { class: 'reg-node', 'data-cls': `${group.path}/${node.id}`, tabindex: 0, role: 'button', 'aria-label': `打开 ${group.path}/${node.id}` });
    drawNode(nodeGroup, node, palette, changed.has(node.id));
    nodeGroup.append(vector('title', {}, node.target === null ? node.id : `打开 ${node.target}`));
    inner.append(nodeGroup);
  }
  outer.append(inner);
  outer.append(vector('text', { class: 'grp-label-center', x: r1(group.width / 2), y: r1(group.height / 2), 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 10, 'font-weight': 600, 'letter-spacing': '0.05em' }, title));
  return outer;
}

/** Rebuild the whole overview canvas from the current snapshot; no arguments, returns void.
 *  从当前快照重建整个总览画布；无参数，无返回值。
 */
function rebuild() {
  canvas.replaceChildren();
  scene = buildScene(snapshot.nodes, { parseGraph, library: dagre, measure });
  const empty = document.getElementById('empty');
  if (scene.groups.length === 0) {
    empty.textContent = snapshot.nodes.length === 0 ? '工作区为空\n使用 write 添加视角，再重新导出。' : '没有可渲染的流程图\n请检查各节点 diagram 的诊断与源码。';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  const svg = vector('svg', { width: scene.width, height: scene.height, xmlns: 'http://www.w3.org/2000/svg' });
  scene.groups.forEach((group, index) => svg.append(renderGroup(group, 0, `v${index}_`)));
  canvas.append(svg);
  applyTransform();
  if (selection !== null) markSelected(selection);
}

/** Rebuild the navigation tree with search filtering; no arguments, returns void.
 *  重建带搜索过滤的导航树；无参数，无返回值。
 */
function renderTree() {
  const query = document.getElementById('search').value.toLocaleLowerCase();
  const tree = document.getElementById('tree');
  tree.replaceChildren();
  for (const record of snapshot.nodes) {
    const description = record.fields.description === undefined ? '' : record.fields.description;
    if (!`${record.path}\n${description}`.toLocaleLowerCase().includes(query)) continue;
    const button = element('button', record.path.split('/').at(-1), `tree-item${record.path === selection ? ' active' : ''}`);
    button.style.paddingLeft = `${10 + (record.path.split('/').length - 1) * 16}px`;
    button.title = record.path;
    button.addEventListener('click', () => openRecord(record.path));
    tree.append(button);
  }
  if (!tree.children.length) tree.append(element('p', '没有匹配的节点', 'muted'));
}

/** Mark the selected element across canvas and tree; path identifies it, returns void.
 *  在画布与树中标记所选元素；path 标识它，无返回值。
 */
function markSelected(path) {
  document.querySelectorAll('.grp-node.selected,.reg-node.selected').forEach(node => node.classList.remove('selected'));
  document.querySelectorAll(`[data-cls="${CSS.escape(path)}"]`).forEach(node => node.classList.add('selected'));
  document.querySelectorAll('.tree-item').forEach(button => button.classList.toggle('active', button.title === path));
}

/** Apply the viewport transform with upstream scale compensation and progressive disclosure.
 *  应用视口变换，带上游缩放补偿与渐进呈现。
 */
function applyTransform() {
  canvas.style.transform = `translate(${vpX}px,${vpY}px) scale(${vpScale})`;
  const percent = Math.round(vpScale * 100);
  zoomLabel.textContent = percent >= 1000 ? `${(percent / 100).toFixed(0)}k%` : `${percent}%`;
  // Group, center and node labels keep readable rendered sizes at any zoom.
  // 分组、居中与节点标签在任意缩放下保持可读的渲染尺寸。
  const groupSize = Math.min(72, Math.max(10, 13 / vpScale));
  document.querySelectorAll('#canvas .grp-label-top').forEach(node => {
    if (node.tagName === 'text') node.setAttribute('font-size', String(Math.round(groupSize * 10) / 10));
    else node.setAttribute('height', String(Math.round(groupSize * 1.5)));
  });
  const centerSize = Math.min(120, Math.max(14, 20 / vpScale));
  document.querySelectorAll('#canvas .grp-label-center').forEach(node => node.setAttribute('font-size', String(Math.round(centerSize * 10) / 10)));
  const nodeSize = Math.min(60, Math.max(11, 11 / vpScale));
  document.querySelectorAll('#canvas .node-lbl').forEach(node => node.setAttribute('font-size', String(Math.round(nodeSize * 10) / 10)));
  wrap.classList.toggle('zoom-overview', vpScale < 0.42);
  // Progressive collapse/expansion follows the upstream viewport-relative thresholds.
  // 渐进折叠/展开遵循上游相对视口的阈值。
  const viewportWidth = wrap.clientWidth;
  document.querySelectorAll('#canvas [data-depth]').forEach(node => {
    const border = node.querySelector(':scope > .grp-border');
    if (!border) return;
    const rect = border.getBoundingClientRect();
    const depth = Number.parseInt(node.getAttribute('data-depth') || '0', 10);
    node.classList.toggle('grp-collapsed', rect.width < viewportWidth * 0.275);
    node.classList.toggle('grp-expanded', rect.width >= viewportWidth * (0.5 + depth * 0.15));
  });
}

/** Zoom around a screen point; factor/origin define the change, returns void.
 *  围绕屏幕点缩放；factor/origin 定义变化，无返回值。
 */
function zoomTo(newScale, originX, originY) {
  const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));
  const cx = originX ?? wrap.clientWidth / 2, cy = originY ?? wrap.clientHeight / 2;
  vpX = cx - (cx - vpX) * (scale / vpScale);
  vpY = cy - (cy - vpY) * (scale / vpScale);
  vpScale = scale;
  applyTransform();
}

/** Fit the whole canvas like the upstream reset; no arguments, returns void.
 *  按上游重置方式适应整个画布；无参数，无返回值。
 */
function centerView() {
  if (!scene || scene.width === 0) return;
  const scale = Math.min(0.9, (wrap.clientWidth - 80) / scene.width, (wrap.clientHeight - 80) / scene.height);
  vpScale = Math.max(MIN_SCALE, scale);
  vpX = wrap.clientWidth / 2 - (scene.width / 2) * vpScale;
  vpY = wrap.clientHeight / 2 - (scene.height / 2) * vpScale;
  applyTransform();
}

/** Animated viewport transition with ease-out cubic; target values define the destination.
 *  带缓出三次曲线的视口动画；目标值定义终点。
 */
let animationFrame = null;
function animateTo(toX, toY, toScale, duration = 380) {
  if (animationFrame !== null) cancelAnimationFrame(animationFrame);
  const fromX = vpX, fromY = vpY, fromScale = vpScale, start = performance.now();
  function frame(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    vpX = fromX + (toX - fromX) * eased;
    vpY = fromY + (toY - fromY) * eased;
    vpScale = fromScale + (toScale - fromScale) * eased;
    applyTransform();
    if (t < 1) animationFrame = requestAnimationFrame(frame);
  }
  animationFrame = requestAnimationFrame(frame);
}

/** Focus one canvas element and exempt it plus ancestors from overview dimming.
 *  聚焦一个画布元素，并使其与祖先豁免总览淡化。
 */
function focusElement(path) {
  document.querySelectorAll('#canvas [data-cls].focus-exempt').forEach(node => node.classList.remove('focus-exempt'));
  const target = document.querySelector(`#canvas [data-cls="${CSS.escape(path)}"]`);
  if (!target) return;
  target.classList.add('focus-exempt');
  let ancestor = target.parentElement;
  while (ancestor) {
    if (ancestor.hasAttribute && ancestor.hasAttribute('data-cls')) ancestor.classList.add('focus-exempt');
    ancestor = ancestor.parentElement;
  }
  const border = target.querySelector(':scope > .grp-border') || target.querySelector(':scope > .nshape') || target;
  const rect = border.getBoundingClientRect(), wrapRect = wrap.getBoundingClientRect();
  const centerX = (rect.left + rect.width / 2 - wrapRect.left - vpX) / vpScale;
  const centerY = (rect.top + rect.height / 2 - wrapRect.top - vpY) / vpScale;
  const width = rect.width / vpScale, height = rect.height / vpScale;
  const drawer = sidebar.classList.contains('open') ? sidebar.offsetWidth : 0;
  const availableWidth = wrap.clientWidth - drawer - 60, availableHeight = wrap.clientHeight - 60;
  const targetScale = Math.min(MAX_SCALE, Math.max(0.15, Math.min(availableWidth / width, availableHeight / height) * 0.85));
  animateTo((wrap.clientWidth - drawer) / 2 - centerX * targetScale, wrap.clientHeight / 2 - centerY * targetScale, targetScale);
}

/** Open one record: select, show details and focus its canvas element when present.
 *  打开一条记录：选择、显示详情，并在画布元素存在时聚焦。
 */
function openRecord(path) {
  if (!records.has(path)) return;
  selection = path;
  markSelected(path); renderTree(); renderDetails();
  sidebar.classList.add('open');
  const scoped = document.querySelector(`#canvas [data-cls="${CSS.escape(path)}"]`) ? path : null;
  if (scoped !== null) focusElement(scoped);
}

/** Close the detail drawer and clear selection highlights; no arguments, returns void.
 *  关闭详情抽屉并清除选择高亮；无参数，无返回值。
 */
function closeSidebar() {
  sidebar.classList.remove('open');
  selection = null;
  document.querySelectorAll('.grp-node.selected,.reg-node.selected').forEach(node => node.classList.remove('selected'));
  document.querySelectorAll('#canvas [data-cls].focus-exempt').forEach(node => node.classList.remove('focus-exempt'));
  document.querySelectorAll('.tree-item').forEach(button => button.classList.remove('active'));
  renderDetails();
}

/** Render the selected record fields, source or history into the drawer; no arguments, returns void.
 *  将所选记录的字段、源码或历史渲染进抽屉；无参数，无返回值。
 */
function renderDetails() {
  details.replaceChildren();
  const title = document.getElementById('sb-title');
  if (selection === null) { title.textContent = '架构工作区'; details.append(element('p', '点击画布中的分组或节点，或在左侧选择文档。', 'muted')); return; }
  const record = records.get(selection);
  title.textContent = formatLabel(selection.split('/').pop());
  if (tab === 'source') {
    details.append(element('h2', 'diagram.mmd'), element('pre', record.fields.diagram === undefined ? '（未提供）' : record.fields.diagram));
    return;
  }
  if (tab === 'changes') {
    if (record.meta === null || record.meta.prev_diagram === undefined || record.fields.diagram === undefined) {
      details.append(element('p', '尚无上一个图版本。修改 diagram 后重新导出即可比较。', 'muted')); return;
    }
    const difference = diffGraphs(record.meta.prev_diagram, record.fields.diagram);
    details.append(element('h2', difference.has_changes ? '图已变化' : '图未变化'), element('pre', JSON.stringify(difference, null, 2)), element('h2', '修改前'), element('pre', record.meta.prev_diagram), element('h2', '修改后'), element('pre', record.fields.diagram));
    return;
  }
  // Report comes from the exported validation snapshot, including cross-node reference issues.
  // Report 来自导出的校验快照，包含跨节点引用问题。
  const report = snapshot.validation.nodes.find(item => item.path === selection);
  if (report) for (const issue of report.issues) details.append(element('div', `${issue.line === undefined ? '' : `L${issue.line} · `}${issue.message}`, `issue ${issue.level}`));
  const names = { description: '说明', constraint: '约束', concern: '关注点', context: '上下文', todo: '待办', note: '备注' };
  for (const [field, heading] of Object.entries(names)) if (record.fields[field] !== undefined) { details.append(element('h2', heading)); markdown(details, record.fields[field]); }
  const related = snapshot.refs.filter(ref => ref.source === selection || ref.target === selection);
  if (related.length) details.append(element('h2', '引用关系'));
  for (const ref of related) {
    const destinationPath = ref.source === selection ? ref.target : ref.source;
    const button = element('button', `${ref.source === selection ? '→' : '←'} ${destinationPath}${ref.exists ? '' : ' · 缺失'}`, 'ref');
    button.disabled = !records.has(destinationPath);
    button.addEventListener('click', () => openRecord(destinationPath));
    details.append(button);
  }
  if (record.meta !== null) details.append(element('h2', '元数据'), element('pre', JSON.stringify(record.meta, (key, value) => key === 'prev_diagram' ? undefined : value, 2)));
}

// Canvas interaction: delegated clicks, edge hover highlighting and Figma-style pan/zoom.
// 画布交互：委托点击、边悬停高亮与 Figma 风格平移/缩放。
canvas.addEventListener('click', event => {
  const node = event.target.closest('.grp-node,.reg-node');
  if (!node) return;
  event.stopPropagation();
  openRecord(node.getAttribute('data-cls'));
});
canvas.addEventListener('keydown', event => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const node = event.target.closest('.grp-node,.reg-node');
  if (!node) return;
  event.preventDefault();
  openRecord(node.getAttribute('data-cls'));
});
wrap.addEventListener('click', event => { if (!event.target.closest('.grp-node,.reg-node')) closeSidebar(); });
wrap.addEventListener('mouseover', event => {
  const node = event.target.closest('.reg-node,.grp-node');
  if (!node) return;
  const id = node.getAttribute('data-cls');
  const parentGroup = node.parentElement.closest('[data-cls]') || node.closest('svg');
  if (!parentGroup) return;
  parentGroup.querySelectorAll('.edge-path').forEach(path => {
    const from = path.getAttribute('data-from'), to = path.getAttribute('data-to');
    const edgeParent = path.closest('[data-cls]') || path.closest('svg');
    if (edgeParent !== parentGroup) return;
    if (from === id || to === id || `@${from}` === id || `@${to}` === id || id.endsWith(`/${from}`) || id.endsWith(`/${to}`)) path.classList.add('edge-hl');
  });
});
wrap.addEventListener('mouseout', event => {
  if (!event.target.closest('.reg-node,.grp-node')) return;
  document.querySelectorAll('#canvas .edge-path.edge-hl').forEach(path => path.classList.remove('edge-hl'));
});
wrap.addEventListener('wheel', event => {
  event.preventDefault();
  document.querySelectorAll('#canvas [data-cls].focus-exempt').forEach(node => node.classList.remove('focus-exempt'));
  if (event.ctrlKey || event.metaKey) {
    const factor = event.deltaMode === 0 ? Math.pow(0.993, event.deltaY) : (event.deltaY < 0 ? 1.22 : 1 / 1.22);
    zoomTo(vpScale * factor, event.clientX - wrap.getBoundingClientRect().left, event.clientY - wrap.getBoundingClientRect().top);
  } else {
    vpX -= event.deltaX; vpY -= event.deltaY; applyTransform();
  }
}, { passive: false });
let panning = null;
wrap.addEventListener('pointerdown', event => {
  if (event.target.closest('.grp-node,.reg-node') && event.button === 0) return;
  panning = { x: event.clientX, y: event.clientY, vpX, vpY };
  wrap.setPointerCapture(event.pointerId); wrap.classList.add('panning');
});
wrap.addEventListener('pointermove', event => {
  if (panning === null) return;
  vpX = panning.vpX + (event.clientX - panning.x);
  vpY = panning.vpY + (event.clientY - panning.y);
  applyTransform();
});
for (const name of ['pointerup', 'pointercancel']) wrap.addEventListener(name, () => { panning = null; wrap.classList.remove('panning'); });
window.addEventListener('keydown', event => {
  if ((event.metaKey || event.ctrlKey) && !event.shiftKey) {
    if (event.key === '0') { event.preventDefault(); centerView(); }
    if (event.key === '1') { event.preventDefault(); zoomTo(1); }
    if (event.key === '2') { event.preventDefault(); zoomTo(2); }
    if (event.key === '+' || event.key === '=') { event.preventDefault(); zoomTo(vpScale * 1.25); }
    if (event.key === '-') { event.preventDefault(); zoomTo(vpScale / 1.25); }
  }
  if (event.key === 'Escape') closeSidebar();
});
document.getElementById('search').addEventListener('input', renderTree);
document.getElementById('theme').addEventListener('click', () => {
  document.documentElement.dataset.theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
});
document.getElementById('fit').addEventListener('click', centerView);
document.getElementById('zoom-in').addEventListener('click', () => zoomTo(vpScale * 1.25));
document.getElementById('zoom-out').addEventListener('click', () => zoomTo(vpScale / 1.25));
document.getElementById('sb-close').addEventListener('click', closeSidebar);
document.getElementById('mobile-nav-btn').addEventListener('click', () => {
  document.getElementById('nav-sidebar').classList.toggle('mobile-open');
});
for (const button of document.querySelectorAll('[data-tab]')) button.addEventListener('click', () => {
  tab = button.dataset.tab;
  for (const candidate of document.querySelectorAll('[data-tab]')) candidate.setAttribute('aria-selected', String(candidate === button));
  renderDetails();
});
new ResizeObserver(() => applyTransform()).observe(wrap);
document.getElementById('generated').textContent = `快照 ${snapshot.generated.slice(0, 10)}`;
document.getElementById('status').textContent = `${snapshot.nodes.length} nodes · .omm format 0.1.0 · 单文件离线查看器 · 不连接网络 · 数据更新后请重新导出`;
rebuild(); renderTree(); renderDetails();
requestAnimationFrame(centerView);