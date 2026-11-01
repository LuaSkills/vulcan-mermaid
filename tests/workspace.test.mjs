// Exercise storage boundaries and graph semantics through the exact Node handler called by Lua.
// 通过 Lua 调用的同一个 Node 处理器验证存储边界及图语义。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {main} from '../node/workspace.mjs';
import {parseGraph,diffGraphs} from '../node/graph.mjs';
import {segments} from '../node/store.mjs';
import {layoutGraph} from '../node/layout.mjs';

/** Allocate an isolated project; context owns cleanup, returns its absolute path.
 * 分配隔离项目；context 负责清理，返回绝对路径。
 */
function fixture(context) {
  // Root is a newly allocated OS temporary directory; only this exact path is cleaned up.
  // Root 是新分配的系统临时目录；仅清理这个精确路径。
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'vulcan-mermaid-test-'));
  context.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  return root;
}

/** Invoke a successful operation; PWD/action/extra supply arguments, returns its result after asserting success.
 * 调用成功操作；PWD/action/extra 提供参数，断言成功后返回结果。
 */
async function call(PWD,action,extra={}) {
  // Response uses the production handler rather than reproducing dispatcher logic in tests.
  // Response 使用生产处理器，而非在测试中复写分发逻辑。
  const response=await main({PWD,action,...extra});
  assert.equal(response.ok,true,JSON.stringify(response));return response.result;
}

test('batch creates ancestors, preserves format/history and ignores identical writes',async context=>{
  // Root and writes include Unicode field text and a deep nested node.
  // Root 和 writes 包含中文字段文本及深层嵌套节点。
  const root=fixture(context), writes=[{path:'architecture/service/database',fields:{diagram:'graph LR\nA[旧标签] --> B',description:'数据库说明'}}];
  await call(root,'write',{writes});
  assert.equal((await call(root,'tree')).nodes.length,3);
  assert.deepEqual((await call(root,'read',{path:'architecture/service'})).meta.children,['database']);
  assert.deepEqual((await call(root,'read',{path:writes[0].path})).meta.parentPath,['service']);
  // Before records a genuine write counter for the idempotence assertion.
  // Before 记录真实写入计数，用于幂等性断言。
  const before=await call(root,'read',{path:writes[0].path});
  assert.deepEqual((await call(root,'write',{writes})).writes[0].changed_fields,[]);
  assert.deepEqual((await call(root,'read',{path:writes[0].path})).meta,before.meta);
  await call(root,'write',{writes:[{path:writes[0].path,fields:{diagram:'graph LR\nA[新标签] --> B'}}]});
  assert.equal((await call(root,'diff',{path:writes[0].path})).changed_nodes[0].after.label,'新标签');
});

test('label-only, edge-label, shape, style, direction and duplicate-edge changes remain visible',()=>{
  assert.equal(diffGraphs('graph LR\nA[Old] --> B','graph LR\nA[New] --> B').has_changes,true);
  assert.equal(diffGraphs('graph LR\nA -->|old| B','graph LR\nA -->|new| B').added_edges[0].label,'new');
  assert.equal(diffGraphs('graph LR\nA[One]','graph LR\nA{One}').changed_nodes.length,1);
  assert.equal(diffGraphs('graph LR\nA','graph TD\nA').direction_changed,true);
  assert.equal(diffGraphs('graph LR\nA\nclassDef store fill:#fff','graph LR\nA\nclassDef store fill:#000').styles_changed,true);
  assert.equal(diffGraphs('graph LR\nA-->B','graph LR\nA-->B\nA-->B').added_edges.length,1);
  assert.equal(diffGraphs('graph LR\nA','graph LR\nA\n%% comment').has_changes,true);
});

test('parser consumes quoted labels, chains, direction and inline classes without invented nodes',()=>{
  // Graph covers semicolons and arrows embedded inside a label rather than as syntax.
  // Graph 覆盖标签中作为文本而非语法的分号及箭头。
  const graph=parseGraph('flowchart RL; A["x --> y; [z]"]:::entry -->|"a b"| B{Go} --> C((End)); class A entry');
  assert.deepEqual(graph.issues,[]);
  assert.deepEqual(graph.nodes.map(node=>node.id),['A','B','C']);
  assert.equal(graph.nodes[0].label,'x --> y; [z]');
  assert.equal(graph.edges.length,2);
  assert.equal(parseGraph('graph LR\nA -- calls --> B').edges[0].label,'calls');
  assert.deepEqual(parseGraph('graph LR\n%% comment; hidden --> node\nA --> B %% inline; hidden').nodes.map(node=>node.id),['A','B']);
});

test('unsupported or malformed diagrams are explicitly incomplete, never a false no-change',()=>{
  for (const source of ['sequenceDiagram\nA->>B: ping','graph LR\nsubgraph test\nA-->B\nend','graph LR\nA[broken','graph LR\nA -->','graph LR\nclick A "https://example.com"']) assert.ok(parseGraph(source).issues.some(issue=>issue.level==='error'),source);
  assert.equal(diffGraphs('sequenceDiagram\nA->>B: ping','sequenceDiagram\nA->>B: pong').complete,false);
  assert.equal(diffGraphs('sequenceDiagram\nA->>B: ping','sequenceDiagram\nA->>B: pong').has_changes,true);
});

test('every portable path escape and Windows alias is rejected before writing',async context=>{
  // Root remains free of .omm when contract validation fails.
  // Root 在契约校验失败时不产生 .omm。
  const root=fixture(context);
  for (const unsafe of ['../outside','a/../../x','/absolute','C:/x','C:\\x','\\\\host\\share','a//b','a/./b','a/..','a:stream','NUL','CON.txt','x.','x ','COM1','a/*']) {
    assert.throws(()=>segments(unsafe),undefined,unsafe);
    assert.equal((await main({PWD:root,action:'write',writes:[{path:unsafe,fields:{note:'bad'}}]})).ok,false);
  }
  assert.equal(fs.existsSync(path.join(root,'.omm')),false);
  assert.equal((await main({PWD:'.',action:'tree'})).error.code,'INVALID_PWD');
});

test('whole-batch validation rejects unknown fields, duplicates and invalid second targets',async context=>{
  // Root owns an existing node whose field must remain unchanged after rejection.
  // Root 包含已有节点，其字段在拒绝之后必须不变。
  const root=fixture(context);
  await call(root,'write',{writes:[{path:'safe',fields:{note:'before'}}]});
  for (const writes of [
    [{path:'safe',fields:{note:'after'}},{path:'../bad',fields:{note:'oops'}}],
    [{path:'safe',fields:{note:'after'}},{path:'safe',fields:{note:'duplicate'}}],
    [{path:'safe',fields:{unknown:'no'}}],
  ]) assert.equal((await main({PWD:root,action:'write',writes})).ok,false);
  assert.equal((await call(root,'read',{path:'safe'})).fields.note,'before');
});

test('case aliases are rejected consistently before batch mutation on Windows and Unix',async context=>{
  // Root begins empty to exercise aliases between not-yet-created ancestors.
  // Root 初始为空，用于验证尚未创建祖先之间的别名。
  const root=fixture(context);
  assert.equal((await main({PWD:root,action:'write',writes:[{path:'One/a',fields:{note:'a'}},{path:'one/b',fields:{note:'b'}}]})).error.code,'CASE_COLLISION');
  assert.equal(fs.existsSync(path.join(root,'.omm')),false);
  await call(root,'write',{writes:[{path:'One',fields:{note:'original'}}]});
  assert.equal((await main({PWD:root,action:'write',writes:[{path:'one',fields:{note:'changed'}}]})).error.code,'CASE_COLLISION');
  assert.equal((await call(root,'read',{path:'One'})).fields.note,'original');
});

test('junctions at .omm, node, field and output boundaries cannot escape',async context=>{
  // Root/outside are independently owned temporary fixtures.
  // Root/outside 为独立拥有的临时夹具。
  const root=fixture(context), outside=fixture(context);
  fs.symlinkSync(outside,path.join(root,'.omm'),process.platform==='win32'?'junction':'dir');
  assert.equal((await main({PWD:root,action:'tree'})).error.code,'UNSAFE_LINK');
  fs.unlinkSync(path.join(root,'.omm'));
  await call(root,'init');
  fs.symlinkSync(outside,path.join(root,'.omm','escape'),process.platform==='win32'?'junction':'dir');
  assert.equal((await main({PWD:root,action:'write',writes:[{path:'escape',fields:{note:'bad'}}]})).error.code,'UNSAFE_LINK');
  assert.equal((await main({PWD:root,action:'tree'})).error.code,'UNSAFE_LINK');
  fs.unlinkSync(path.join(root,'.omm','escape'));
  await call(root,'write',{writes:[{path:'safe',fields:{note:'good'}}]});
  fs.writeFileSync(path.join(outside,'linked.md'),'outside');
  fs.linkSync(path.join(outside,'linked.md'),path.join(root,'.omm','safe','description.md'));
  assert.equal((await main({PWD:root,action:'read',path:'safe'})).error.code,'UNSAFE_LINK');
  fs.unlinkSync(path.join(root,'.omm','safe','description.md'));
  fs.symlinkSync(outside,path.join(root,'.omm-export'),process.platform==='win32'?'junction':'dir');
  assert.equal((await main({PWD:root,action:'export'})).error.code,'UNSAFE_LINK');
  assert.deepEqual(fs.readdirSync(outside),['linked.md']);
});

test('metadata-free upstream diagrams still acquire correct history',async context=>{
  // Root simulates an existing upstream directory containing only a Mermaid source.
  // Root 模拟仅包含 Mermaid 源码的现存上游目录。
  const root=fixture(context);fs.mkdirSync(path.join(root,'.omm','legacy'),{recursive:true});
  fs.writeFileSync(path.join(root,'.omm','legacy','diagram.mmd'),'graph LR\nA[Old]');
  await call(root,'write',{writes:[{path:'legacy',fields:{diagram:'graph LR\nA[New]'}}]});
  assert.equal((await call(root,'diff',{path:'legacy'})).has_changes,true);
});

test('nested refs use full paths and subtree queries include incoming references',async context=>{
  // Root holds duplicate child names under two independent perspectives.
  // Root 在两个独立视角下保存同名子节点。
  const root=fixture(context);
  await call(root,'write',{writes:[{path:'one/shared',fields:{diagram:'graph LR\nA["@two/shared"]'}},{path:'two/shared',fields:{diagram:'graph LR\nB[End]'}}]});
  assert.deepEqual((await call(root,'refs',{path:'two'})).references,[{source:'one/shared',target:'two/shared',exists:true}]);
  assert.equal((await call(root,'validate',{path:'one/shared'})).valid,true);
});

test('deletion requires recursive opt-in and leaves a recoverable subtree',async context=>{
  // Root owns the nested document used to assert exact deletion boundaries.
  // Root 拥有用于断言精确删除边界的嵌套文档。
  const root=fixture(context);await call(root,'write',{writes:[{path:'one/child',fields:{note:'keep me'}}]});
  assert.equal((await main({PWD:root,action:'delete',path:'one'})).error.code,'HAS_CHILDREN');
  // Deleted returns the recovery location rather than removing data irreversibly.
  // Deleted 返回恢复位置，而非不可逆删除数据。
  const deleted=await call(root,'delete',{path:'one',recursive:true});
  assert.equal(fs.readFileSync(path.join(root,deleted.trash_path,'child','note.md'),'utf8'),'keep me');
  assert.deepEqual((await call(root,'tree')).nodes,[]);
});

test('offline export embeds escaped data and local resources only',async context=>{
  // Root includes script-closing text to verify the inert-data embedding boundary.
  // Root 包含脚本结束文本，用于验证惰性数据嵌入边界。
  const root=fixture(context);await call(root,'write',{writes:[{path:'one',fields:{diagram:'graph LR\nA["</script><script>alert(1)</script>"]',note:'<img src=x onerror=alert(1)>'}}]});
  // Exported and html identify the actual produced document.
  // Exported 和 html 标识实际生成的文档。
  const exported=await call(root,'export'), html=fs.readFileSync(exported.file,'utf8');
  assert.ok(html.includes('dagre'));
  assert.ok(html.includes('\\u003c/script\\u003e'));
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(!/<script[^>]*\bsrc=|<link[^>]*\bhref=|\bfetch\(|new EventSource\(/u.test(html));
  assert.equal((await main({PWD:root,action:'export',output:'../outside.html'})).ok,false);
});

test('unknown format, malformed metadata and locks fail explicitly',async context=>{
  // Root exercises persisted failures independently of host-schema validation.
  // Root 独立于宿主结构校验验证持久化失败。
  const root=fixture(context);await call(root,'init');
  fs.writeFileSync(path.join(root,'.omm','config.yaml'),'version: 99.0.0\n');
  assert.equal((await main({PWD:root,action:'tree'})).error.code,'UNSUPPORTED_FORMAT');
  fs.writeFileSync(path.join(root,'.omm','config.yaml'),'version: 0.1.0\n');
  fs.writeFileSync(path.join(root,'.omm','.vulcan-mermaid.lock'),'busy');
  assert.equal((await main({PWD:root,action:'tree'})).error.code,'WORKSPACE_BUSY');
  fs.unlinkSync(path.join(root,'.omm','.vulcan-mermaid.lock'));
  await call(root,'write',{writes:[{path:'one',fields:{note:'safe'}}]});
  fs.writeFileSync(path.join(root,'.omm','one','meta.yaml'),'update_count: broken\n');
  assert.equal((await main({PWD:root,action:'read',path:'one'})).error.code,'INVALID_OMM');
});

test('bundled upstream demo parses and exports without modifying its source',async context=>{
  // Root receives a copy so imported evidence remains unchanged in the repository.
  // Root 接收副本，使仓库内导入的证据保持不变。
  const root=fixture(context);fs.cpSync(new URL('../examples/upstream/.omm',import.meta.url),path.join(root,'.omm'),{recursive:true});
  assert.equal((await call(root,'tree')).nodes.length,62);
  assert.equal((await call(root,'validate')).valid,true);
  assert.equal((await call(root,'export')).nodes,62);
});

test('actual embedded Dagre handles reserved IDs, cycles, parallel edges and all shapes',()=>{
  // Sandbox executes only the pinned dependency, without a browser, DOM, filesystem or network API.
  // Sandbox 仅执行固定依赖，不提供浏览器、DOM、文件系统或网络 API。
  const sandbox={};
  vm.runInNewContext(fs.readFileSync(new URL('../resources/dagre.min.js',import.meta.url),'utf8'),sandbox,{timeout:1000});
  // Graph deliberately uses names that break unadapted Dagre 0.8.5 object-key handling.
  // Graph 故意使用会破坏未适配 Dagre 0.8.5 对象键处理的名称。
  const graph=parseGraph('graph LR\n__proto__[原型] --> constructor((构造)) --> toString{转换} --> __proto__\n__proto__ -->|并行| constructor\nround(Round) --> stadium([Stadium]) --> sub[[Subroutine]] --> disk[(Disk)]');
  assert.deepEqual(graph.issues,[]);
  // Layout is the same adapter and dependency combination embedded into HTML exports.
  // Layout 使用与 HTML 导出完全相同的适配层和依赖组合。
  const layout=layoutGraph(graph,sandbox.dagre);
  assert.equal(layout.nodes.length,7);
  assert.equal(layout.edges.length,7);
  assert.ok(layout.nodes.every(node=>Number.isFinite(node.x)&&Number.isFinite(node.y)));
  assert.ok(layout.edges.every(edge=>edge.points.length>1));
});
