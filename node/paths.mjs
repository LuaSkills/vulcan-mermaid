// Resolve the declared PWD convention or explicit absolute .omm locations, never the process cwd.
// 解析声明的 PWD 约定或显式绝对 .omm 位置，绝不使用进程 cwd。
import path from 'node:path';
import {absolutePath,fullyQualified,projectRoot,segments,fail} from './store.mjs';

/** Resolve a workspace/node input; input is caller text, pwdRoot is optional verified PWD, returns root and optional node.
 * 解析工作区/节点输入；input 为调用方文本，pwdRoot 为可选已验证 PWD，返回根目录及可选节点。
 */
function location(input,pwdRoot) {
  if (typeof input!=='string' || input.length===0) fail('INVALID_PATH','path must be a non-empty string');
  if (fullyQualified(input)) {
    // Absolute preserves the native root, including a complete Windows UNC share.
    // Absolute 保留当前平台根路径，包括完整 Windows UNC 共享。
    const absolute=absolutePath(input), anchor=path.parse(absolute).root;
    // Parts expose the explicit .omm marker rather than searching parent directories on disk.
    // Parts 暴露显式 .omm 标记，而非在磁盘上搜索父目录。
    const parts=absolute.slice(anchor.length).split(path.sep).filter(Boolean);
    // Markers require a unique explicit workspace boundary, including for missing write targets.
    // Markers 要求唯一显式工作区边界，也适用于尚不存在的写入目标。
    const markers=parts.flatMap((part,index)=>part==='.omm'?[index]:[]);
    if (markers.length!==1) fail('INVALID_WORKSPACE_PATH','Absolute path must contain exactly one .omm directory component, e.g. D:/project/.omm/architecture');
    // Root and node follow the on-disk .omm contract; a missing node may be created by write.
    // Root 和 node 遵循磁盘 .omm 契约；不存在的节点可由 write 创建。
    const root=projectRoot(path.join(anchor,...parts.slice(0,markers[0])));
    const node=parts.slice(markers[0]+1).join('/');
    if (node) segments(node);
    return {root,node:node||undefined};
  }
  if (pwdRoot===undefined) fail('ABSOLUTE_PATH_REQUIRED','PWD was not supplied: path and writes[].path must be absolute .omm locations');
  // Relative accepts native Windows separators and the explicit .omm prefix as well as existing node keys.
  // Relative 接受原生 Windows 分隔符、显式 .omm 前缀及现有节点键。
  let relative=process.platform==='win32'?input.replace(/\\/gu,'/'):input;
  if (relative==='.omm' || relative==='.omm/') return {root:pwdRoot,node:undefined};
  if (relative.startsWith('.omm/')) relative=relative.slice(5);
  segments(relative);
  return {root:pwdRoot,node:relative};
}

/** Normalize all filesystem inputs in one action; args is validated JSON, returns one project root and canonical arguments.
 * 规范化操作中的所有文件系统输入；args 为已校验 JSON，返回唯一项目根目录及规范参数。
 */
export function resolvePaths(args) {
  // PwdRoot is optional host/caller context; explicitly malformed values never fall back to cwd.
  // PwdRoot 为可选宿主/调用方上下文；显式畸形值绝不回退到 cwd。
  const pwdRoot=args.PWD===undefined || args.PWD===''?undefined:projectRoot(args.PWD);
  // Normalized copies caller arguments so normalization never mutates the host's request object.
  // Normalized 复制调用参数，避免规范化修改宿主请求对象。
  const normalized={...args};
  // Root is selected by explicit absolute locations or, for relative locations, by PWD.
  // Root 由显式绝对位置选定，或在相对位置模式下由 PWD 选定。
  let root;
  if (args.action==='write') {
    // Seen and ancestors reject duplicate aliases after absolute/relative forms have converged.
    // Seen 和 ancestors 在绝对/相对形式统一之后拒绝重复别名。
    const seen=new Set(), ancestors=new Map();
    normalized.writes=args.writes.map(write=>{
      // Resolved binds this write to a single .omm workspace before any storage mutation.
      // Resolved 在任何存储修改之前将此次写入绑定到唯一 .omm 工作区。
      const resolved=location(write.path,pwdRoot);
      if (resolved.node===undefined) fail('NODE_PATH_REQUIRED','write must target a node below .omm, not the workspace root');
      if (root!==undefined && path.relative(root,resolved.root)!=='') fail('CROSS_WORKSPACE','All writes in a batch must belong to one .omm workspace');
      root=resolved.root;
      if (seen.has(resolved.node.toLowerCase())) fail('INVALID_ARGUMENT',`Duplicate write path: ${resolved.node}`);
      seen.add(resolved.node.toLowerCase());
      // Parts enforce one portable spelling for every common ancestor.
      // Parts 为每个公共祖先强制统一的可移植拼写。
      const parts=segments(resolved.node);
      for (let depth=1;depth<=parts.length;depth++) {
        // Prefix and folded separate the preserved spelling from its case-insensitive identity.
        // Prefix 和 folded 区分保留的拼写与大小写不敏感标识。
        const prefix=parts.slice(0,depth).join('/'), folded=prefix.toLowerCase();
        if (ancestors.has(folded) && ancestors.get(folded)!==prefix) fail('CASE_COLLISION',`Conflicting path case: ${prefix}`);
        ancestors.set(folded,prefix);
      }
      return {...write,path:resolved.node};
    });
  } else {
    // Resolved uses explicit path when present; omitted scope requires the declared PWD context.
    // Resolved 在 path 存在时使用显式路径；省略范围则要求声明的 PWD 上下文。
    const resolved=args.path===undefined?{root:pwdRoot,node:undefined}:location(args.path,pwdRoot);
    if (resolved.root===undefined) fail('ABSOLUTE_PATH_REQUIRED','Supply an absolute .omm path when PWD is absent');
    root=resolved.root;
    normalized.path=resolved.node;
    if (['read','delete','diff'].includes(args.action) && resolved.node===undefined) fail('NODE_PATH_REQUIRED',`${args.action} requires a node below .omm`);
    if (args.action==='init' && resolved.node!==undefined) fail('WORKSPACE_PATH_REQUIRED','init accepts only the .omm workspace root');
  }
  if (args.output!==undefined) {
    if (fullyQualified(args.output)) {
      // Output is confined to this selected project's export directory, even when PWD refers elsewhere.
      // Output 即使在 PWD 指向其他位置时也限制在所选项目的导出目录内。
      const output=absolutePath(args.output), directory=path.join(root,'.omm-export');
      if (path.relative(directory,path.dirname(output))!=='') fail('INVALID_OUTPUT_PATH','Absolute output must be a direct .html file in the selected project .omm-export directory');
      normalized.output=path.basename(output);
    } else {
      if (pwdRoot===undefined) fail('ABSOLUTE_PATH_REQUIRED','Without PWD, an explicitly supplied output must be an absolute .html path');
      normalized.output=args.output;
    }
    if (segments(normalized.output).length!==1 || !normalized.output.endsWith('.html')) fail('INVALID_OUTPUT_PATH','output must identify one .html file');
  }
  return {root,args:normalized};
}
