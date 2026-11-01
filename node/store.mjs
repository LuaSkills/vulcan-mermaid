// Adapt the upstream .omm storage contract with explicit project and path boundaries.
// 基于上游 .omm 存储契约增加明确的项目及路径边界。
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import YAML from 'yaml';

// FIELD_FILES is the unchanged oh-my-mermaid field-to-file contract.
// FIELD_FILES 是未改变的 oh-my-mermaid 字段到文件的契约。
export const FIELD_FILES = Object.freeze({description:'description.md', diagram:'diagram.mmd', constraint:'constraint.md', concern:'concern.md', context:'context.md', todo:'todo.md', note:'note.md'});
// LIMITS bound workspace traversal and content allocation for tool calls and HTML export.
// LIMITS 限制工具调用和 HTML 导出的工作区遍历及内容分配。
export const LIMITS = Object.freeze({nodes:1000, bytes:16*1024*1024, field:1024*1024, depth:16});

/** Throw a stable domain error; code identifies the category, message explains the failure; never returns.
 * 抛出稳定的领域错误；code 标识类别，message 解释失败原因；不返回。
 */
export function fail(code, message) {
  throw Object.assign(new Error(message), {code});
}

/** Validate a portable relative node path; value is caller input, returns its segments.
 * 校验可移植的相对节点路径；value 为调用方输入，返回路径分段。
 */
export function segments(value) {
  if (typeof value !== 'string' || !value || value.length > 512) fail('INVALID_PATH', 'path must contain 1..512 characters');
  // Parts are checked before any normalization so traversal cannot be hidden by resolution.
  // Parts 在任何规范化之前检查，避免路径解析隐藏穿越行为。
  const parts = value.split('/');
  if (parts.length > LIMITS.depth) fail('INVALID_PATH', 'Maximum path depth is 16');
  for (const part of parts) {
    if (!part || part.length > 80 || part.startsWith('.') || /[<>:"\\|?*\x00-\x1f]/u.test(part) || /[.\s]$/u.test(part) || /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/iu.test(part)) fail('INVALID_PATH', `Unsafe path segment: ${part}`);
  }
  return parts;
}

/** Check every existing descendant for links/type mismatches; root is trusted, parts relative, returns absolute path.
 * 检查每个现存后代的链接和类型；root 为可信根目录，parts 为相对分段，返回绝对路径。
 */
export function guarded(root, parts, finalType = 'directory') {
  // Current tracks each lexical descendant without following a junction or symlink.
  // Current 逐级跟踪词法后代，不跟随目录联接或符号链接。
  let current = root;
  for (const [index, part] of parts.entries()) {
    // ExistingNames detects case aliases before Windows can resolve them to a different logical node.
    // ExistingNames 在 Windows 将大小写别名解析为不同逻辑节点之前检测它们。
    const existingNames = fs.existsSync(current) ? fs.readdirSync(current) : [];
    if (existingNames.some(name => name.toLowerCase() === part.toLowerCase() && name !== part)) fail('CASE_COLLISION', `Path case conflicts with an existing entry: ${part}`);
    current = path.join(current, part);
    // Stat is absent only for ENOENT; permission and I/O failures stay visible.
    // Stat 仅在 ENOENT 时缺失；权限和 I/O 错误保持可见。
    const stat = fs.lstatSync(current, {throwIfNoEntry:false});
    if (!stat) continue;
    if (stat.isSymbolicLink()) fail('UNSAFE_LINK', `Links are forbidden: ${current}`);
    // Expected distinguishes the final file from all directory ancestors.
    // Expected 区分最终文件与所有目录祖先。
    const expected = index === parts.length - 1 ? finalType : 'directory';
    if (expected === 'directory' ? !stat.isDirectory() : !stat.isFile()) fail('INVALID_TYPE', `Expected ${expected}: ${current}`);
    if (stat.isFile() && stat.nlink > 1) fail('UNSAFE_LINK', `Hard-linked files are forbidden: ${current}`);
  }
  return current;
}

/** Resolve explicit PWD to a real directory; pwd is absolute input, returns project root.
 * 将显式 PWD 解析为真实目录；pwd 为绝对路径输入，返回项目根目录。
 */
export function projectRoot(pwd) {
  if (typeof pwd !== 'string' || !fullyQualified(pwd)) fail('INVALID_PWD', 'PWD must be a fully qualified existing project directory');
  // Root is resolved once; the managed process cwd is never used as project context.
  // Root 仅解析一次；受管进程 cwd 从不作为项目上下文。
  const root = fs.realpathSync(absolutePath(pwd));
  if (!fs.statSync(root).isDirectory()) fail('INVALID_PWD', 'PWD must be a directory');
  // A project cannot be inside reserved .omm storage: returned absolute node paths need one unique boundary.
  // 项目不能位于保留的 .omm 存储内：返回的节点绝对路径必须具有唯一边界。
  if (root.split(path.sep).some(part => part.toLowerCase() === '.omm')) fail('INVALID_PWD', 'Project directory must not be .omm or be nested inside .omm');
  guarded(root, ['.omm']);
  return root;
}

/** Test native fully qualified syntax; value is a path string, returns false for drive-relative/root-relative Windows paths.
 * 检查当前平台的完整路径语法；value 为路径字符串，Windows 驱动器相对或根相对路径返回 false。
 */
export function fullyQualified(value) {
  if (typeof value !== 'string') return false;
  if (process.platform !== 'win32') return value.startsWith('/');
  return /^[A-Za-z]:[/\\]/u.test(value) || /^[/\\]{2}[^/\\]+[/\\][^/\\]+(?:[/\\]|$)/u.test(value);
}

/** Normalize one explicit absolute path without resolving traversal; value is caller text, returns native spelling.
 * 规范化一个显式绝对路径而不解析穿越；value 为调用方文本，返回当前平台路径形式。
 */
export function absolutePath(value) {
  if (!fullyQualified(value)) fail('ABSOLUTE_PATH_REQUIRED', 'A fully qualified absolute path is required when PWD is absent');
  if (value.length > 4096 || /[\x00-\x1f]/u.test(value)) fail('INVALID_PATH', 'Absolute path is too long or contains control characters');
  // Native removes only documented drive/UNC verbatim prefixes; device and pipe namespaces are rejected.
  // Native 仅移除已文档化的驱动器/UNC 长路径前缀；设备及管道命名空间明确拒绝。
  let native = value;
  if (process.platform === 'win32') {
    if (/^\\\\\?\\[A-Za-z]:\\/u.test(native)) native = native.slice(4);
    else if (/^\\\\\?\\UNC\\[^/\\]+\\[^/\\]+(?:\\|$)/iu.test(native)) native = `\\\\${native.slice(8)}`;
    else if (/^\/\/\?\/[A-Za-z]:\//u.test(native)) native = native.slice(4);
    else if (/^\/\/\?\/UNC\/[^/\\]+\/[^/\\]+(?:\/|$)/iu.test(native)) native = `//${native.slice(8)}`;
    else if (/^[/\\]{2}[?.][/\\]/u.test(native)) fail('INVALID_PATH', 'Unsupported Windows device namespace');
  } else if (native.includes('\\')) fail('INVALID_PATH', 'Backslashes are not supported in POSIX paths');
  // Parts are inspected before normalization; trimming a verbatim prefix must not change the referenced directory.
  // Parts 在规范化前接受检查；去掉长路径前缀不得改变实际引用的目录。
  const parts = native.split(process.platform === 'win32' ? /[/\\]/u : '/');
  if (parts.some(part => part === '.' || part === '..')) fail('INVALID_PATH', 'Dot and parent traversal components are forbidden');
  if (process.platform === 'win32' && parts.some((part,index) => {
    if (part === '' || (index === 0 && /^[A-Za-z]:$/u.test(part))) return false;
    return /[<>:"|?*]|[.\s]$/u.test(part) || /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/iu.test(part);
  })) fail('INVALID_PATH', 'Ambiguous Windows component, device name or alternate data stream');
  return path.normalize(native);
}

/** Read bounded UTF-8 content; file is already guarded, returns text or null for a missing file.
 * 读取有界 UTF-8 内容；file 已通过路径保护，返回文本或用 null 表示文件不存在。
 */
export function readText(file) {
  // Stat supplies the pre-read allocation limit without masking permission failures.
  // Stat 提供读取前的分配限制，不掩盖权限失败。
  const stat = fs.lstatSync(file, {throwIfNoEntry:false});
  if (!stat) return null;
  if (stat.size > LIMITS.field) fail('LIMIT_EXCEEDED', `File exceeds 1 MiB: ${file}`);
  return fs.readFileSync(file, 'utf8');
}

/** Read an optional YAML object; file is guarded and label identifies errors, returns object or null.
 * 读取可选 YAML 对象；file 已受保护，label 标识错误，返回对象或 null。
 */
function readYaml(file, label) {
  // Raw preserves the distinction between a missing file and malformed existing YAML.
  // Raw 保留缺失文件与现存 YAML 格式错误之间的区别。
  const raw = readText(file);
  if (raw === null) return null;
  // Value is parsed with alias expansion bounded by the YAML library.
  // Value 由 YAML 库在别名展开限制下解析。
  const value = YAML.parse(raw, {maxAliasCount:50});
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_OMM', `${label} must be a YAML mapping`);
  return value;
}

/** Write one guarded file through a sibling temporary file; root/parts locate it, text is UTF-8, returns void.
 * 通过同目录临时文件写入受保护文件；root/parts 定位文件，text 为 UTF-8 内容，无返回值。
 */
export function atomicWrite(root, parts, text) {
  // Destination is rechecked immediately before the replace operation.
  // Destination 在替换操作前重新检查。
  const destination = guarded(root, parts, 'file');
  // Temporary uses an unpredictable sibling name and exclusive creation.
  // Temporary 使用不可预测的同目录名称并独占创建。
  const temporary = path.join(path.dirname(destination), `.vulcan-${randomUUID()}.tmp`);
  try {
    fs.writeFileSync(temporary, text, {encoding:'utf8', flag:'wx'});
    fs.renameSync(temporary, destination);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

/** Check the existing config; root is the explicit project, returns null when uninitialized.
 * 检查现有配置；root 为显式项目，未初始化时返回 null。
 */
export function config(root) {
  // Value follows the upstream version 0.1.0 on-disk contract independently of package version.
  // Value 遵循上游磁盘格式 0.1.0 契约，与包版本无关。
  const value = readYaml(guarded(root, ['.omm','config.yaml'], 'file'), 'config.yaml');
  if (value !== null && value.version !== '0.1.0') fail('UNSUPPORTED_FORMAT', 'Only .omm config version 0.1.0 is supported');
  return value;
}

/** Create the upstream-compatible workspace if absent; root identifies project, returns config.
 * 不存在时创建兼容上游的工作区；root 标识项目，返回配置。
 */
export function initialize(root) {
  fs.mkdirSync(guarded(root, ['.omm']), {recursive:true});
  if (config(root) === null) atomicWrite(root, ['.omm','config.yaml'], YAML.stringify({version:'0.1.0'}));
  return config(root);
}

/** Read one node including optional metadata; root/path identify it, returns a JSON-compatible record.
 * 读取一个节点及其可选元数据；root/path 标识节点，返回可 JSON 序列化的记录。
 */
export function readNode(root, nodePath) {
  // Parts identify the node under .omm rather than under the current process directory.
  // Parts 在 .omm 下定位节点，而非当前进程目录。
  const parts = ['.omm', ...segments(nodePath)];
  if (!fs.existsSync(guarded(root, parts))) fail('NOT_FOUND', `Node not found: ${nodePath}`);
  // Fields retain empty strings; missing fields are omitted exactly as in upstream ClassData.
  // Fields 保留空字符串；缺失字段与上游 ClassData 一样省略。
  const fields = {};
  for (const [field, file] of Object.entries(FIELD_FILES)) {
    // Text is the optional content of one declared field.
    // Text 是一个已声明字段的可选内容。
    const text = readText(guarded(root, [...parts, file], 'file'));
    if (text !== null) fields[field] = text;
  }
  // Meta accepts upstream optional keys but verifies all fields we subsequently modify.
  // Meta 接受上游可选键，但验证后续会修改的所有字段。
  const meta = readYaml(guarded(root, [...parts,'meta.yaml'], 'file'), `${nodePath}/meta.yaml`);
  if (meta !== null) {
    if (!Number.isSafeInteger(meta.update_count) || meta.update_count < 0 || typeof meta.created !== 'string' || typeof meta.updated !== 'string' || !Object.hasOwn(FIELD_FILES, meta.last_field)) fail('INVALID_OMM', `Invalid required metadata: ${nodePath}`);
    if (meta.prev_diagram !== undefined && typeof meta.prev_diagram !== 'string') fail('INVALID_OMM', `Invalid prev_diagram: ${nodePath}`);
    if (meta.children !== undefined && (!Array.isArray(meta.children) || meta.children.some(child => typeof child !== 'string'))) fail('INVALID_OMM', `Invalid children: ${nodePath}`);
  }
  return {path:nodePath, fields, meta};
}

/** Walk selected nodes without following links; root/path select scope, returns a bounded flat list.
 * 不跟随链接遍历指定节点；root/path 选择范围，返回有界扁平列表。
 */
export function scan(root, selected = undefined) {
  config(root);
  if (selected !== undefined) segments(selected);
  // Result and bytes bound recursion and memory before the viewer receives any content.
  // Result 和 bytes 在查看器接收内容之前限制递归和内存。
  const result = [];
  let bytes = 0;
  /** Visit a checked node path and its direct children; relative is .omm-relative, returns void.
   * 访问已检查节点路径及其直接子节点；relative 为 .omm 相对路径，无返回值。
   */
  function visit(relative) {
    // Directory is checked even for roots to reject junctions before directory enumeration.
    // Directory 即使是根节点也先检查，避免目录枚举之前跟随目录联接。
    const directory = guarded(root, ['.omm', ...(relative ? segments(relative) : [])]);
    if (!fs.existsSync(directory)) {
      if (relative) fail('NOT_FOUND', `Node not found: ${relative}`);
      return;
    }
    if (relative) {
      if (result.length >= LIMITS.nodes) fail('LIMIT_EXCEEDED', 'Workspace exceeds 1000 nodes');
      // Record holds validated fields and metadata for one node.
      // Record 保存一个节点的已验证字段及元数据。
      const record = readNode(root, relative);
      bytes += Buffer.byteLength(JSON.stringify(record));
      if (bytes > LIMITS.bytes) fail('LIMIT_EXCEEDED', 'Workspace exceeds 16 MiB');
      result.push(record);
    }
    for (const entry of fs.readdirSync(directory, {withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name,'en'))) {
      if (entry.name.startsWith('.')) continue;
      if (entry.isSymbolicLink()) fail('UNSAFE_LINK', `Links are forbidden: ${path.join(directory,entry.name)}`);
      if (entry.isDirectory()) visit(relative ? `${relative}/${entry.name}` : entry.name);
    }
  }
  visit(selected === undefined ? '' : selected);
  return result;
}

/** Create upstream node metadata; nodePath/field identify initial state, returns a mutable mapping.
 * 创建上游节点元数据；nodePath/field 标识初始状态，返回可变映射。
 */
function newMeta(nodePath, field) {
  // Parts determine the upstream parentPath convention (excluding the perspective).
  // Parts 确定上游 parentPath 约定（不包含视角）。
  const parts = segments(nodePath);
  // Now is shared by both initial timestamps.
  // Now 供两个初始时间戳共用。
  const now = new Date().toISOString();
  return {created:now,updated:now,update_count:0,last_field:field,kind:parts.length === 1 ? 'perspective' : 'nested-class',title:parts.at(-1),children:[],...(parts.length > 1 ? {parentPath:parts.slice(1,-1)} : {})};
}

/** Preflight and persist a batch; root is project and writes contain path/fields, returns changed field summaries.
 * 预检并持久化批次；root 为项目，writes 包含 path/fields，返回变更字段摘要。
 */
export function writeBatch(root, writes) {
  // Planned stores each final node state before any mutation, including implicit parents.
  // Planned 在任何修改之前保存每个最终节点状态，包括隐式父节点。
  const planned = new Map();
  /** Stage one node and its current metadata; nodePath/field locate it, returns the staged record.
   * 暂存节点及其现有元数据；nodePath/field 定位节点，返回暂存记录。
   */
  function stage(nodePath, field) {
    if (planned.has(nodePath)) return planned.get(nodePath);
    // Directory is checked before the existence test and before every read.
    // Directory 在存在性检查和每次读取之前受到检查。
    const directory = guarded(root, ['.omm',...segments(nodePath)]);
    // Record represents either verified existing data or an explicitly new node.
    // Record 表示已验证的现有数据或明确的新节点。
    const record = fs.existsSync(directory) ? readNode(root,nodePath) : {path:nodePath,fields:{},meta:null};
    record.meta = record.meta === null ? newMeta(nodePath,field) : record.meta;
    record.changed = [];
    record.metaChanged = false;
    planned.set(nodePath,record);
    return record;
  }
  for (const write of writes) {
    // Parts let us create and synchronize every ancestor, including missing intermediate nodes.
    // Parts 使所有祖先（包括缺失中间节点）都能创建并同步。
    const parts = segments(write.path);
    // Record is the staged destination; all fields were validated by the dispatcher.
    // Record 是暂存目标；所有字段已由分发器验证。
    const record = stage(write.path,Object.keys(write.fields)[0]);
    for (const [field,text] of Object.entries(write.fields)) {
      guarded(root,['.omm',...parts,FIELD_FILES[field]],'file');
      if (record.fields[field] === text) continue;
      if (field === 'diagram' && record.fields.diagram !== undefined) record.meta.prev_diagram = record.fields.diagram;
      record.fields[field] = text;
      record.changed.push(field);
      record.meta.update_count++;
      record.meta.last_field = field;
      record.meta.updated = new Date().toISOString();
      record.metaChanged = true;
    }
    for (let depth = 1; depth < parts.length; depth++) {
      // Parent receives the explicit child relationship created by this batch.
      // Parent 接收本批次创建的显式父子关系。
      const parent = stage(parts.slice(0,depth).join('/'),Object.keys(write.fields)[0]);
      // Children merges existing declared children with the child created by this batch.
      // Children 将现有已声明子节点与本批次创建的子节点合并。
      const children = parent.meta.children === undefined ? [] : parent.meta.children;
      if (!children.includes(parts[depth])) {
        parent.meta.children = [...children,parts[depth]].sort();
        parent.metaChanged = true;
      }
    }
  }
  // Serialized checks metadata size before initialization or any field writes.
  // Serialized 在初始化或任何字段写入之前检查元数据大小。
  const serialized = new Map();
  for (const record of planned.values()) {
    guarded(root,['.omm',...segments(record.path),'meta.yaml'],'file');
    // Text is the final upstream-compatible YAML metadata.
    // Text 是最终兼容上游的 YAML 元数据。
    const text = YAML.stringify(record.meta);
    if (Buffer.byteLength(text) > LIMITS.field) fail('LIMIT_EXCEEDED', `Metadata exceeds 1 MiB: ${record.path}`);
    serialized.set(record.path,text);
  }
  initialize(root);
  for (const record of [...planned.values()].sort((a,b)=>a.path.split('/').length-b.path.split('/').length)) {
    // Parts are shared by this node's mkdir, field writes, and metadata replacement.
    // Parts 供本节点的建目录、字段写入和元数据替换共用。
    const parts = ['.omm',...segments(record.path)];
    fs.mkdirSync(guarded(root,parts),{recursive:true});
    for (const field of record.changed) atomicWrite(root,[...parts,FIELD_FILES[field]],record.fields[field]);
    if (record.metaChanged) atomicWrite(root,[...parts,'meta.yaml'],serialized.get(record.path));
  }
  return writes.map(write=>({path:write.path,changed_fields:planned.get(write.path).changed}));
}

/** Serialize cooperating calls without stale-lock guessing; root identifies project, operation returns its result.
 * 串行化协作调用而不猜测过期锁；root 标识项目，operation 返回操作结果。
 */
export function withLock(root, operation) {
  // File is project-local; a crashed owner's lock requires explicit removal after inspection.
  // File 位于项目内；进程崩溃遗留的锁需要检查后显式移除。
  const file = guarded(root,['.omm','.vulcan-mermaid.lock'],'file');
  // Handle is acquired exclusively so concurrent mutations fail visibly rather than lose updates.
  // Handle 独占获取，使并发修改显式失败而非丢失更新。
  let handle;
  try { handle = fs.openSync(file,'wx'); } catch (error) {
    if (error.code === 'EEXIST') fail('WORKSPACE_BUSY','Workspace lock exists: .omm/.vulcan-mermaid.lock');
    throw error;
  }
  try {
    fs.writeFileSync(handle,JSON.stringify({pid:process.pid,created:new Date().toISOString()}));
    return operation();
  } finally { fs.closeSync(handle); fs.unlinkSync(file); }
}

/** Move a node to recoverable trash; root/path select it, recursive authorizes children, returns trash path.
 * 将节点移入可恢复回收目录；root/path 选择节点，recursive 授权包含子节点，返回回收路径。
 */
export function deleteNode(root, nodePath, recursive) {
  // Records prove the entire subtree is readable and link-free before the rename.
  // Records 在重命名前证明整个子树可读且无链接。
  const records = scan(root,nodePath);
  if (records.length > 1 && recursive !== true) fail('HAS_CHILDREN','Use recursive:true to delete a node with children');
  // Parts and source are validated independently from the trash destination.
  // Parts 和 source 独立于回收目标进行验证。
  const parts = segments(nodePath);
  const source = guarded(root,['.omm',...parts]);
  // Parent is pre-read so invalid metadata cannot cause a failure after the move.
  // Parent 提前读取，避免移动后才因元数据无效而失败。
  const parent = parts.length > 1 ? readNode(root,parts.slice(0,-1).join('/')) : null;
  // Trash uses a hidden upstream-ignored directory and collision-resistant node name.
  // Trash 使用上游忽略的隐藏目录及抗冲突节点名。
  const trash = ['.omm','.trash',`${randomUUID()}-${parts.at(-1)}`];
  fs.mkdirSync(guarded(root,['.omm','.trash']),{recursive:true});
  fs.renameSync(source,guarded(root,trash));
  try {
    if (parent !== null && parent.meta !== null && parent.meta.children !== undefined) {
      parent.meta.children = parent.meta.children.filter(child=>child !== parts.at(-1));
      atomicWrite(root,['.omm',...parts.slice(0,-1),'meta.yaml'],YAML.stringify(parent.meta));
    }
  } catch (error) { fs.renameSync(path.join(root,...trash),source); throw error; }
  return {path:nodePath,trash_path:trash.join('/'),nodes:records.length};
}

