// Expose one action-based protocol to LuaSkills using injected PWD or explicit absolute workspace paths.
// 向 LuaSkills 暴露一个基于 action 的协议，使用注入的 PWD 或显式工作区绝对路径。
import fs from 'node:fs';
import path from 'node:path';
import {FIELD_FILES,LIMITS,fail,guarded,initialize,scan,readNode,writeBatch,withLock,deleteNode,atomicWrite,config} from './store.mjs';
import {resolvePaths} from './paths.mjs';
import {parseGraph,diffGraphs,extractRefs} from './graph.mjs';

// ACTION_KEYS rejects misspelled and irrelevant parameters instead of silently ignoring them.
// ACTION_KEYS 拒绝拼错或不适用的参数，而非静默忽略。
const ACTION_KEYS = Object.freeze({init:['path'],tree:['path'],read:['path'],write:['writes'],delete:['path','recursive'],validate:['path'],diff:['path','before','after'],refs:['path'],export:['path','output']});

/** Validate one plain mapping; value is input and label identifies errors, returns void.
 * 校验一个普通映射；value 为输入，label 标识错误，无返回值。
 */
function object(value,label) {
  if (value===null || typeof value!=='object' || Array.isArray(value)) fail('INVALID_ARGUMENT',`${label} must be an object`);
}

/** Validate the action's exact input contract; args is host JSON, returns void before any filesystem mutation.
 * 校验操作的精确输入契约；args 为宿主 JSON，在任何文件系统修改前执行，无返回值。
 */
function validateArgs(args) {
  object(args,'arguments');
  if (typeof args.action!=='string' || !Object.hasOwn(ACTION_KEYS,args.action)) fail('INVALID_ARGUMENT','Unknown action');
  for (const key of Object.keys(args)) if (!['PWD','action',...ACTION_KEYS[args.action]].includes(key)) fail('INVALID_ARGUMENT',`Unexpected ${key} for ${args.action}`);
  if (args.PWD!==undefined && typeof args.PWD!=='string') fail('INVALID_PWD','PWD must be an absolute directory string or omitted');
  if (args.path!==undefined && (typeof args.path!=='string' || !args.path)) fail('INVALID_PATH','path must be a non-empty string');
  if (['read','delete'].includes(args.action) && args.path===undefined) fail('INVALID_ARGUMENT','path is required');
  if (args.recursive!==undefined && typeof args.recursive!=='boolean') fail('INVALID_ARGUMENT','recursive must be boolean');
  if (args.action==='diff') {
    if (args.path!==undefined) {
      if (args.before!==undefined || args.after!==undefined) fail('INVALID_ARGUMENT','Use path OR before/after');
    } else if (typeof args.before!=='string' || typeof args.after!=='string') fail('INVALID_ARGUMENT','diff requires path or both before and after strings');
    for (const key of ['before','after']) if (args[key]!==undefined && Buffer.byteLength(args[key])>LIMITS.field) fail('LIMIT_EXCEEDED','Diagram exceeds 1 MiB');
  }
  if (args.action==='write') {
    if (!Array.isArray(args.writes) || args.writes.length<1 || args.writes.length>100) fail('INVALID_ARGUMENT','writes must contain 1..100 entries');
    // Bytes bounds the whole batch before path resolution or storage allocation.
    // Bytes 在路径解析或存储分配之前限制整个批次。
    let bytes=0;
    for (const write of args.writes) {
      object(write,'write'); object(write.fields,'fields');
      if (typeof write.path!=='string' || !write.path) fail('INVALID_PATH','writes[].path must be a non-empty string');
      if (Object.keys(write).some(key=>!['path','fields'].includes(key))) fail('INVALID_ARGUMENT','write accepts only path and fields');
      if (Object.keys(write.fields).length===0) fail('INVALID_ARGUMENT','fields cannot be empty');
      for (const [field,text] of Object.entries(write.fields)) {
        if (!Object.hasOwn(FIELD_FILES,field) || typeof text!=='string') fail('INVALID_ARGUMENT',`Invalid field: ${field}`);
        if (Buffer.byteLength(text)>LIMITS.field) fail('LIMIT_EXCEEDED',`${field} exceeds 1 MiB`);
        bytes+=Buffer.byteLength(text);
      }
    }
    if (bytes>LIMITS.bytes) fail('LIMIT_EXCEEDED','Batch exceeds 16 MiB');
  }
  if (args.output!==undefined && (typeof args.output!=='string' || !args.output)) fail('INVALID_OUTPUT_PATH','output must be a non-empty path string');
}

/** Build path-qualified references from all nodes; records are workspace records, returns edge records.
 * 从所有节点构建完整路径引用；records 为工作区记录，返回引用边记录。
 */
function references(records) {
  // Known uses full paths to avoid collisions between equally named nested nodes.
  // Known 使用完整路径，避免同名嵌套节点冲突。
  const known=new Set(records.map(record=>record.path));
  return records.flatMap(record=>extractRefs(record.fields.diagram===undefined?'':record.fields.diagram).map(target=>({source:record.path,target,exists:known.has(target)})));
}

/** Validate selected diagrams and global reference resolution; records/all select scope, returns issue reports.
 * 校验指定图和全局引用解析；records/all 选择范围，返回问题报告。
 */
function validateRecords(records,all) {
  // Refs are resolved against the whole workspace even when only a subtree is validated.
  // Refs 即使仅校验子树也根据整个工作区解析。
  const refs=references(all);
  // Reports distinguish missing diagrams (warnings) from invalid diagrams (errors).
  // Reports 区分缺失图（警告）和无效图（错误）。
  const reports=records.map(record=>{
    // Issues retain source line numbers from the shared parser.
    // Issues 保留共享解析器提供的源码行号。
    const issues=record.fields.diagram===undefined?[{level:'warning',rule:'missing-diagram',message:'Node has no diagram'}]:parseGraph(record.fields.diagram).issues;
    for (const ref of refs.filter(ref=>ref.source===record.path)) {
      if (!ref.exists) issues.push({level:'error',rule:'missing-reference',message:`Missing @${ref.target}`});
      if (ref.target===record.path) issues.push({level:'warning',rule:'self-reference',message:`Self reference @${ref.target}`});
    }
    return {path:record.path,valid:issues.every(issue=>issue.level!=='error'),issues};
  });
  return {valid:reports.every(report=>report.valid),nodes:reports};
}

/** Export a self-contained snapshot; root identifies project, records/all scope data, output names the HTML, returns file info.
 * 导出自包含快照；root 标识项目，records/all 指定数据范围，output 为 HTML 名称，返回文件信息。
 */
function exportViewer(root, records, all, output) {
  // Snapshot embeds only .omm records, not arbitrary project files or local absolute paths.
  // Snapshot 仅嵌入 .omm 记录，不包含任意项目文件或本地绝对路径。
  const snapshot={format:'vulcan-mermaid-viewer/1',generated:new Date().toISOString(),nodes:records,refs:references(all),validation:validateRecords(records,all)};
  // Json escapes HTML delimiters so a label cannot close the inert JSON script element.
  // Json 转义 HTML 分隔符，使标签不能关闭惰性 JSON 脚本元素。
  const json=JSON.stringify(snapshot).replace(/</gu,'\\u003c').replace(/>/gu,'\\u003e').replace(/&/gu,'\\u0026').replace(/\u2028/gu,'\\u2028').replace(/\u2029/gu,'\\u2029');
  // Resource URLs derive from this module, independent of Windows separators or worker cwd.
  // Resource URL 基于本模块，与 Windows 分隔符或工作进程 cwd 无关。
  const template=fs.readFileSync(new URL('../resources/viewer.html',import.meta.url),'utf8');
  const vendor=fs.readFileSync(new URL('../resources/dagre.min.js',import.meta.url),'utf8');
  const parser=fs.readFileSync(new URL('./graph.mjs',import.meta.url),'utf8').replace(/^export /gmu,'');
  // Layout shares the tested Dagre adapter with the embedded viewer.
  // Layout 与嵌入查看器共享已测试的 Dagre 适配层。
  const layout=fs.readFileSync(new URL('./layout.mjs',import.meta.url),'utf8').replace(/^export /gmu,'');
  const viewer=fs.readFileSync(new URL('../resources/viewer.mjs',import.meta.url),'utf8');
  // Html contains no network request, module import, or server endpoint.
  // Html 不包含网络请求、模块导入或服务器端点。
  const html=template.replace('/* VULCAN_VENDOR */',()=>vendor).replace('/* VULCAN_APP */',()=>`${parser}\n${layout}\n${viewer}`).replace('VULCAN_SNAPSHOT_JSON',()=>json);
  fs.mkdirSync(guarded(root,['.omm-export']),{recursive:true});
  atomicWrite(root,['.omm-export',output],html);
  return {file:guarded(root,['.omm-export',output],'file'),nodes:records.length,bytes:Buffer.byteLength(html),offline:true,validation:snapshot.validation};
}

/** Handle one host invocation; args follows skill.yaml, returns success with optional workspace or {ok:false,error}.
 * 处理一次宿主调用；args 遵循 skill.yaml，返回包含可选 workspace 的成功结果或 {ok:false,error}。
 */
export async function main(args) {
  try {
    validateArgs(args);
    // Explicit text comparison is filesystem-free and needs no project context.
    // 显式文本比较不使用文件系统，也不需要项目上下文。
    if (args.action==='diff' && args.path===undefined) return {ok:true,action:args.action,result:diffGraphs(args.before,args.after)};
    // Resolved selects one explicit workspace and normalizes node locations without using cwd.
    // Resolved 选择一个显式工作区并规范节点位置，不使用 cwd。
    const resolved=resolvePaths(args), root=resolved.root;
    args=resolved.args;
    // Execute keeps action-specific results under one stable envelope.
    // Execute 将各操作结果保持在一个稳定外层结构中。
    const execute=()=>{
      config(root);
      if (args.action==='init') return {config:initialize(root)};
      if (args.action==='write') return {writes:writeBatch(root,args.writes).map(write=>({...write,absolute_path:path.join(root,'.omm',write.path)}))};
      if (args.action==='read') return {...readNode(root,args.path),absolute_path:path.join(root,'.omm',args.path)};
      if (args.action==='delete') return deleteNode(root,args.path,args.recursive);
      if (args.action==='diff') {
        // Record supplies the exact previous diagram recorded by storage; no guessed empty baseline.
        // Record 提供存储记录的精确旧图，不猜测空基线。
        const record=readNode(root,args.path);
        if (record.fields.diagram===undefined || record.meta===null || record.meta.prev_diagram===undefined) fail('NO_HISTORY','Node has no previous diagram; supply before/after for an explicit comparison');
        return diffGraphs(record.meta.prev_diagram,record.fields.diagram);
      }
      // All establishes reference targets; selected narrows the returned subtree without losing incoming refs.
      // All 建立引用目标；selected 缩小返回子树，同时不丢失传入引用。
      const all=scan(root);
      const selected=args.path===undefined?all:all.filter(record=>record.path===args.path || record.path.startsWith(`${args.path}/`));
      if (args.path!==undefined && selected.length===0) fail('NOT_FOUND',`Node not found: ${args.path}`);
      // A direct child must contain a separator; slicing at -1 would invent parents for top-level names.
      // 直接子节点必须包含分隔符；以 -1 截断会为顶层名称凭空构造父节点。
      if (args.action==='tree') return {exists:fs.existsSync(guarded(root,['.omm'])),nodes:selected.map(record=>({path:record.path,absolute_path:path.join(root,'.omm',record.path),fields:Object.keys(record.fields),children:all.filter(child=>child.path.includes('/') && child.path.slice(0,child.path.lastIndexOf('/'))===record.path).map(child=>child.path)}))};
      if (args.action==='validate') return validateRecords(selected,all);
      if (args.action==='refs') {
        // Paths includes descendants so incoming and outgoing edges honor subtree selection.
        // Paths 包含后代，使传入与传出边遵循子树选择。
        const paths=new Set(selected.map(record=>record.path));
        return {references:references(all).filter(ref=>paths.has(ref.source)||paths.has(ref.target))};
      }
      return exportViewer(root,selected,all,args.output===undefined?'architecture.html':args.output);
    };
    // Mutations create the lock directory only after the complete input contract has passed.
    // 修改操作仅在完整输入契约通过后创建锁目录。
    if (['init','write'].includes(args.action)) fs.mkdirSync(guarded(root,['.omm']),{recursive:true});
    // Result uses a cooperating lock whenever the workspace exists, including consistent snapshot reads.
    // Result 在工作区存在时使用协作锁，包括读取一致快照。
    const result=fs.existsSync(guarded(root,['.omm']))?withLock(root,execute):execute();
    return {ok:true,action:args.action,workspace:path.join(root,'.omm'),result};
  } catch (error) {
    return {ok:false,error:{code:typeof error.code==='string'?error.code:'INTERNAL_ERROR',message:error.message}};
  }
}

