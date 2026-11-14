// Exercise the upstream-aligned layout pipeline: fan-out grids, aspect fallback, recursive
// sub-groups, overview roots and smooth edges, using the exact embedded Dagre bundle.
// 验证与上游对齐的布局管线：扇出网格、宽高比回退、递归子图、总览根与平滑边，
// 使用完全相同的内嵌 Dagre 包。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseGraph} from '../node/graph.mjs';
import {buildScene,layoutGraph,smoothPath,formatLabel,r1} from '../node/layout.mjs';

/** Load the pinned Dagre bundle into an isolated sandbox; returns the library global.
 *  将固定 Dagre 包加载进隔离沙箱；返回库全局对象。
 */
function dagreLibrary() {
  const sandbox = {};
  vm.runInNewContext(fs.readFileSync(new URL('../resources/dagre.min.js', import.meta.url), 'utf8'), sandbox, {timeout: 1000});
  return sandbox.dagre;
}

/** Build a scene from plain records; records are snapshot rows, returns the scene geometry.
 *  从普通记录构建场景；records 为快照行，返回场景几何。
 */
function scene(records) {
  return buildScene(records.map(record => ({path: record.path, fields: record.fields, meta: null})), {parseGraph, library: dagreLibrary()});
}

test('fan-out leaves collapse into a three-column grid instead of one long row', () => {
  // One parent with six leaf children mirrors the upstream command-surface shape.
  // 一个父节点带六个叶子子节点，复现上游 command-surface 形态。
  const leaves = ['a', 'b', 'c', 'd', 'e', 'f'].map(id => `root --> ${id}[${id}]`).join('\n');
  const result = scene([{path: 'root', fields: {diagram: `graph LR\n${leaves}`}}]);
  assert.equal(result.groups.length, 1);
  const group = result.groups[0];
  assert.equal(group.nodes.length, 7);
  const leafNodes = group.nodes.filter(node => node.id !== 'root');
  // The virtual grid places six leaves in exactly three columns and two rows.
  // 虚拟网格把六个叶子恰好排成三列两行。
  assert.equal(new Set(leafNodes.map(node => node.x)).size, 3);
  assert.equal(new Set(leafNodes.map(node => node.y)).size, 2);
  // A flat single-row fan would span six node widths; the grid stays far narrower.
  // 平铺单行扇出会横跨六个节点宽；网格保持远更窄。
  const singleRowSpan = leafNodes.reduce((sum, node) => sum + node.width, 0);
  assert.ok(group.width < singleRowSpan, `grid ${group.width} must be narrower than flat row ${singleRowSpan}`);
});

test('wide diagrams fall back to TB like the upstream aspect rule', () => {
  // A long chain is extremely wide in LR; the aspect rule must re-layout it vertically.
  // 长链在 LR 下极宽；宽高比规则必须将其重排为纵向。
  const chain = Array.from({length: 9}, (_, index) => `n${index} --> n${index + 1}`).join('\n');
  const result = scene([{path: 'chain', fields: {diagram: `graph LR\n${chain}`}}]);
  const group = result.groups[0];
  assert.equal(group.rankdir, 'TB');
  assert.ok(group.height > group.width);
});

test('children with diagrams embed recursively as scaled sub-groups', () => {
  // Parent references its child by id; the child owns a diagram and must embed, not stay flat.
  // 父节点按 id 引用子节点；子节点拥有图，必须内嵌而非保持平面。
  const result = scene([
    {path: 'app', fields: {diagram: 'graph LR\napi[API] --> store'}},
    {path: 'app/store', fields: {diagram: 'graph LR\nwrite[写入] --> disk[(磁盘)]'}},
  ]);
  const group = result.groups[0];
  const embedded = group.nodes.find(node => node.id === 'store');
  assert.ok(embedded.sub, 'store must embed its child diagram');
  assert.equal(embedded.sub.path, 'app/store');
  assert.ok(embedded.sub.fitScale <= 1);
  assert.equal(embedded.sub.group.nodes.length, 2);
  // The embedded box respects the upstream 320x220 maximum including padding.
  // 内嵌框遵循上游 320x220 上限（含内边距）。
  assert.ok(embedded.width <= 320 + 24 && embedded.height <= 220 + 24);
});

test('explicit @perspective references embed the target document', () => {
  const result = scene([
    {path: 'overview', fields: {diagram: 'graph LR\nentry[入口] --> detail["@shared"]'}},
    {path: 'shared', fields: {diagram: 'graph LR\nx[X] --> y[Y]'}},
  ]);
  const group = result.groups.find(item => item.path === 'overview');
  const embedded = group.nodes.find(node => node.id === 'detail');
  assert.ok(embedded.sub);
  assert.equal(embedded.sub.path, 'shared');
});

test('a document embeds only once across the whole canvas', () => {
  // Two perspectives reference the same target; the upstream global set prevents double expansion.
  // 两个视角引用同一目标；上游全局集合防止重复展开。
  const result = scene([
    {path: 'one', fields: {diagram: 'graph LR\na["@shared"]'}},
    {path: 'two', fields: {diagram: 'graph LR\nb["@shared"]'}},
    {path: 'shared', fields: {diagram: 'graph LR\nx[X]'}},
  ]);
  const embeddings = result.groups.flatMap(group => group.nodes.filter(node => node.sub !== null));
  assert.equal(embeddings.length, 1);
});

test('overview roots exclude referenced perspectives and break cycles by outgoing count', () => {
  // b references a, so only b is a root; a still renders embedded inside b.
  // b 引用 a，因此只有 b 是根；a 仍内嵌在 b 中渲染。
  const referenced = scene([
    {path: 'a', fields: {diagram: 'graph LR\nx[X]'}},
    {path: 'b', fields: {diagram: 'graph LR\ny["@a"]'}},
  ]);
  assert.deepEqual(referenced.roots, ['b']);
  // A pure cycle falls back to the most-outgoing root instead of an empty canvas.
  // 纯循环回退到传出最多的根，而非空画布。
  const cyclic = scene([
    {path: 'a', fields: {diagram: 'graph LR\nx["@b"]'}},
    {path: 'b', fields: {diagram: 'graph LR\ny["@a"]'}},
  ]);
  assert.ok(cyclic.roots.length >= 1);
  assert.ok(cyclic.groups.length >= 1);
});

test('overview arranges independent perspectives in a balanced grid', () => {
  const records = Array.from({length: 4}, (_, index) => ({path: `p${index}`, fields: {diagram: `graph LR\nn${index}[N]`}}));
  const result = scene(records);
  assert.equal(result.groups.length, 4);
  // Four groups form a 2x2 grid: two distinct columns and two distinct rows.
  // 四个分组构成 2x2 网格：两个不同列与两个不同行。
  assert.equal(new Set(result.groups.map(group => group.x)).size, 2);
  assert.equal(new Set(result.groups.map(group => group.y)).size, 2);
  assert.ok(result.width > 0 && result.height > 0);
});

test('invalid or missing diagrams never render partial groups', () => {
  const result = scene([
    {path: 'broken', fields: {diagram: 'sequenceDiagram\nA->>B: ping'}},
    {path: 'empty', fields: {description: 'no diagram'}},
    {path: 'ok', fields: {diagram: 'graph LR\na[A] --> b[B]'}},
  ]);
  assert.deepEqual(result.groups.map(group => group.path), ['ok']);
});

test('parallel edges and reserved identifiers survive the scene pipeline', () => {
  const result = scene([{path: 'p', fields: {diagram: 'graph LR\n__proto__[原型] --> constructor[构造]\n__proto__ -->|并行| constructor'}}]);
  const group = result.groups[0];
  assert.equal(group.nodes.length, 2);
  assert.equal(group.edges.length, 2);
  assert.ok(group.edges.every(edge => edge.points.length >= 2));
  assert.ok(group.nodes.every(node => Number.isFinite(node.x) && Number.isFinite(node.y)));
});

test('smooth paths use the upstream S-curve and quadratic spline', () => {
  assert.equal(smoothPath([{x: 0, y: 0}, {x: 10, y: 10}]), 'M0,0 C5,0 5,10 10,10');
  const spline = smoothPath([{x: 0, y: 0}, {x: 5, y: 8}, {x: 10, y: 0}]);
  assert.ok(spline.startsWith('M0,0 Q5,8'));
  assert.ok(spline.endsWith('L10,0'));
  assert.equal(smoothPath([{x: 0, y: 0}]), '');
});

test('label formatting and rounding match upstream helpers', () => {
  assert.equal(formatLabel('command-surface'), 'Command Surface');
  assert.equal(formatLabel('api'), 'Api');
  assert.equal(r1(12.345), 12.3);
});

test('bundled upstream demo builds a complete multi-perspective scene', () => {
  // Read the imported example exactly as the export snapshot would contain it.
  // 按导出快照所含内容原样读取导入示例。
  const root = new URL('../examples/upstream/.omm/', import.meta.url);
  const records = [];
  function visit(directory, prefix) {
    for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      const fields = {};
      const diagramFile = new URL(`${entry.name}/diagram.mmd`, directory);
      if (fs.existsSync(diagramFile)) fields.diagram = fs.readFileSync(diagramFile, 'utf8');
      records.push({path, fields, meta: null});
      visit(new URL(`${entry.name}/`, directory), path);
    }
  }
  visit(root, '');
  assert.equal(records.length, 62);
  const result = buildScene(records, {parseGraph, library: dagreLibrary()});
  assert.ok(result.groups.length >= 2);
  assert.ok(result.width > 500 && result.height > 300);
  // Every rendered node has finite geometry and every edge keeps a smoothable route.
  // 每个渲染节点具有有限几何，每条边保留可平滑的路径。
  function check(group) {
    for (const node of group.nodes) {
      assert.ok(Number.isFinite(node.x) && Number.isFinite(node.y), node.id);
      if (node.sub) check(node.sub.group);
    }
    for (const edge of group.edges) assert.ok(edge.points.length >= 2);
  }
  result.groups.forEach(check);
});