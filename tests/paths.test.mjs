// Verify the two public path modes at the production handler boundary.
// 在生产处理器边界验证两种公开路径模式。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {main} from '../node/workspace.mjs';
import {absolutePath,fullyQualified} from '../node/store.mjs';

/** Allocate an isolated Unicode project; context owns cleanup, returns its canonical absolute directory.
 * 分配隔离中文项目；context 负责清理，返回其规范绝对目录。
 */
function project(context) {
  // Root is owned by this fixture, and cleanup never targets a caller-supplied location.
  // Root 由本夹具拥有，清理绝不指向调用方提供的位置。
  const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'mermaid 中文 ')));
  context.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  return root;
}

/** Call the production handler; args is a complete request, returns successful response including workspace.
 * 调用生产处理器；args 为完整请求，返回包含 workspace 的成功响应。
 */
async function success(args) {
  // Response is the public contract, including normalized paths and stable error details on failure.
  // Response 是公开契约，包含规范路径及失败时的稳定错误详情。
  const response=await main(args);
  assert.equal(response.ok,true,JSON.stringify(response));
  return response;
}

test('all filesystem actions work without PWD and return reusable absolute locations',async context=>{
  // Root, workspace and node locate one disposable project independently of process cwd.
  // Root、workspace 和 node 定位独立于进程 cwd 的一个临时项目。
  const root=project(context), workspace=path.join(root,'.omm'), node=path.join(workspace,'architecture');
  assert.equal((await success({action:'tree',path:workspace})).result.exists,false);
  assert.equal(fs.existsSync(workspace),false);
  assert.equal((await success({action:'init',path:workspace})).workspace,workspace);
  // Written captures the physical location from the actual write response for later read/diff calls.
  // Written 从真实写入响应取得物理位置，用于后续读取和差异调用。
  const written=await success({action:'write',writes:[{path:node,fields:{diagram:'graph LR\nA[Old]'}}]});
  assert.equal(written.result.writes[0].absolute_path,node);
  assert.equal((await success({action:'read',path:written.result.writes[0].absolute_path})).result.path,'architecture');
  assert.equal((await success({action:'tree',path:workspace})).result.nodes[0].absolute_path,node);
  await success({action:'write',writes:[{path:node,fields:{diagram:'graph LR\nA[New]'}}]});
  assert.equal((await success({action:'diff',path:node})).result.changed_nodes[0].after.label,'New');
  assert.equal((await success({action:'validate',path:workspace})).result.valid,true);
  assert.deepEqual((await success({action:'refs',path:node})).result.references,[]);
  // Exported verifies both the default and caller-selected absolute output locations.
  // Exported 验证默认及调用方指定的绝对输出位置。
  const exported=await success({action:'export',path:workspace});
  assert.equal(exported.result.file,path.join(root,'.omm-export','architecture.html'));
  assert.equal((await success({action:'export',path:node,output:path.join(root,'.omm-export','review.html')})).result.offline,true);
  assert.ok(!fs.readFileSync(exported.result.file,'utf8').includes(JSON.stringify(root).slice(1,-1)));
  await success({action:'delete',path:node});
  assert.deepEqual((await success({action:'tree',path:workspace})).result.nodes,[]);
});

test('missing or empty PWD never enables relative filesystem inputs or implicit cwd',async context=>{
  // Root gives absolute export scopes while leaving rejected relative requests without context.
  // Root 提供绝对导出范围，同时使被拒绝的相对请求没有上下文。
  const root=project(context);
  for (const PWD of [undefined,'']) {
    for (const action of ['init','tree','validate','refs','export']) {
      assert.equal((await main({PWD,action})).error.code,'ABSOLUTE_PATH_REQUIRED');
      assert.equal((await main({PWD,action,path:'architecture'})).error.code,'ABSOLUTE_PATH_REQUIRED');
    }
    for (const action of ['read','delete','diff']) assert.equal((await main({PWD,action,path:'architecture'})).error.code,'ABSOLUTE_PATH_REQUIRED');
    assert.equal((await main({PWD,action:'write',writes:[{path:'architecture',fields:{note:'bad'}}]})).error.code,'ABSOLUTE_PATH_REQUIRED');
    assert.equal((await main({PWD,action:'export',path:path.join(root,'.omm'),output:'report.html'})).error.code,'ABSOLUTE_PATH_REQUIRED');
  }
  assert.equal(fs.existsSync(path.join(root,'.omm')),false);
  assert.equal(fs.existsSync(path.join(root,'.omm-export')),false);
});

test('injected PWD supports node keys and .omm prefixes without mutating caller arguments',async context=>{
  // Root and request represent exactly the JSON forwarded after host injection.
  // Root 和 request 表示宿主注入后原样转发的 JSON。
  const root=project(context), request={PWD:root,action:'write',writes:[{path:'.omm/architecture/api',fields:{note:'kept'}}]};
  // Original detects accidental normalization changes leaking into the host request object.
  // Original 检测规范化修改是否意外泄漏到宿主请求对象。
  const original=structuredClone(request);
  await success(request);
  assert.deepEqual(request,original);
  assert.equal((await success({PWD:root,action:'read',path:'architecture/api'})).result.fields.note,'kept');
  assert.equal((await success({PWD:root,action:'tree',path:'.omm/'})).result.nodes.length,2);
  if (process.platform==='win32') assert.equal((await success({PWD:root,action:'read',path:'.omm\\architecture\\api'})).result.fields.note,'kept');
});

test('explicit absolute targets select their own workspace and cross-project batches fail before mutation',async context=>{
  // First and second represent distinct caller-authorized projects; PWD is context rather than a sandbox.
  // First 和 second 表示调用方明确指定的不同项目；PWD 是上下文而非沙箱。
  const first=project(context), second=project(context);
  assert.equal((await main({PWD:first,action:'write',writes:[{path:'one',fields:{note:'bad'}},{path:path.join(second,'.omm','two'),fields:{note:'bad'}}]})).error.code,'CROSS_WORKSPACE');
  assert.equal(fs.existsSync(path.join(first,'.omm')),false);
  assert.equal(fs.existsSync(path.join(second,'.omm')),false);
  assert.equal((await success({PWD:first,action:'write',writes:[{path:path.join(second,'.omm','two'),fields:{note:'right'}}]})).workspace,path.join(second,'.omm'));
  assert.equal((await success({PWD:first,action:'export',path:path.join(second,'.omm'),output:'chosen.html'})).result.file,path.join(second,'.omm-export','chosen.html'));
  assert.equal(fs.existsSync(path.join(first,'.omm')),false);
});

test('absolute and relative aliases cannot write the same node twice',async context=>{
  // Root provides one workspace for normalized duplicate and case-conflict checks.
  // Root 为规范化重复项及大小写冲突检查提供一个工作区。
  const root=project(context);
  assert.equal((await main({PWD:root,action:'write',writes:[{path:'one',fields:{note:'a'}},{path:path.join(root,'.omm','one'),fields:{note:'b'}}]})).error.code,'INVALID_ARGUMENT');
  assert.equal((await main({action:'write',writes:[{path:path.join(root,'.omm','One','a'),fields:{note:'a'}},{path:path.join(root,'.omm','one','b'),fields:{note:'b'}}]})).error.code,'CASE_COLLISION');
  assert.equal(fs.existsSync(path.join(root,'.omm')),false);
});

test('workspace selectors, explicit output locations and traversal are checked before creating files',async context=>{
  // Root and workspace identify a nonexistent .omm under an existing project.
  // Root 和 workspace 标识已存在项目下尚不存在的 .omm。
  const root=project(context), workspace=path.join(root,'.omm');
  for (const action of ['read','delete','diff']) assert.equal((await main({action,path:workspace})).error.code,'NODE_PATH_REQUIRED');
  assert.equal((await main({action:'write',writes:[{path:workspace,fields:{note:'bad'}}]})).error.code,'NODE_PATH_REQUIRED');
  assert.equal((await main({action:'init',path:path.join(workspace,'one')})).error.code,'WORKSPACE_PATH_REQUIRED');
  for (const invalid of [root,path.join(workspace,'one','.omm','two')]) assert.equal((await main({action:'tree',path:invalid})).error.code,'INVALID_WORKSPACE_PATH');
  for (const invalid of [`${workspace}${path.sep}..${path.sep}outside`,`${workspace}${path.sep}.${path.sep}one`]) assert.equal((await main({action:'tree',path:invalid})).error.code,'INVALID_PATH');
  for (const output of [path.join(root,'outside.html'),path.join(root,'.omm-export','child','nested.html'),path.join(root,'.omm-export','wrong.txt')]) assert.equal((await main({action:'export',path:workspace,output})).error.code,'INVALID_OUTPUT_PATH');
  assert.equal(fs.existsSync(workspace),false);
  assert.equal(fs.existsSync(path.join(root,'.omm-export')),false);
});

test('invalid PWD is explicit while pure text diff never opens a workspace',async context=>{
  // Root and file distinguish nonexistent context, wrong context type and text-only work.
  // Root 和 file 区分不存在的上下文、错误上下文类型及纯文本工作。
  const root=project(context), file=path.join(root,'file.txt');
  fs.writeFileSync(file,'ordinary file');
  for (const PWD of ['.',false,null,file]) assert.equal((await main({PWD,action:'tree'})).error.code,'INVALID_PWD');
  assert.equal((await main({PWD:path.join(root,'missing'),action:'tree'})).error.code,'ENOENT');
  // Compared intentionally points PWD at missing storage; no path operation should execute.
  // Compared 故意令 PWD 指向不存在的存储；不应执行任何路径操作。
  const compared=await success({PWD:path.join(root,'missing'),action:'diff',before:'graph LR\nA[Old]',after:'graph LR\nA[New]'});
  assert.equal(compared.result.has_changes,true);
  assert.equal(Object.hasOwn(compared,'workspace'),false);
  assert.equal((await success({action:'diff',before:'',after:''})).result.has_changes,false);
  assert.equal((await main({action:'diff',path:path.join(root,'.omm','one'),before:'',after:''})).error.code,'INVALID_ARGUMENT');
  assert.equal((await main({pwd:root,action:'tree'})).error.code,'INVALID_ARGUMENT');
});

test('absolute locations retain junction and hardlink protection',async context=>{
  // Root and outside belong to separate fixtures so an escape would be observable.
  // Root 和 outside 属于独立夹具，使路径逃逸可以被观察。
  const root=project(context), outside=project(context);
  fs.symlinkSync(outside,path.join(root,'.omm'),process.platform==='win32'?'junction':'dir');
  assert.equal((await main({action:'write',writes:[{path:path.join(root,'.omm','escape'),fields:{note:'bad'}}]})).error.code,'UNSAFE_LINK');
  assert.deepEqual(fs.readdirSync(outside),[]);
  fs.unlinkSync(path.join(root,'.omm'));
  await success({action:'write',writes:[{path:path.join(root,'.omm','safe'),fields:{note:'safe'}}]});
  fs.writeFileSync(path.join(outside,'linked.md'),'outside');
  fs.linkSync(path.join(outside,'linked.md'),path.join(root,'.omm','safe','description.md'));
  assert.equal((await main({action:'read',path:path.join(root,'.omm','safe')})).error.code,'UNSAFE_LINK');
});

test('Windows drive, UNC and verbatim paths retain complete-path semantics',{skip:process.platform!=='win32'},async context=>{
  // Root and verbatim exercise the actual local filesystem using an explicit long-path prefix.
  // Root 和 verbatim 使用显式长路径前缀验证真实本地文件系统。
  const root=project(context), verbatim=`\\\\?\\${root}`;
  for (const incomplete of ['C:relative','\\relative','/relative','\\\\server']) assert.equal(fullyQualified(incomplete),false,incomplete);
  for (const incomplete of ['C:relative','\\relative','/relative']) assert.equal((await main({action:'tree',path:incomplete})).error.code,'ABSOLUTE_PATH_REQUIRED');
  assert.equal(absolutePath('\\\\server\\share\\project\\.omm'),'\\\\server\\share\\project\\.omm');
  assert.equal(absolutePath('\\\\?\\UNC\\server\\share\\project\\.omm'),'\\\\server\\share\\project\\.omm');
  assert.equal(absolutePath('//?/UNC/server/share/project/.omm'),'\\\\server\\share\\project\\.omm');
  assert.equal(absolutePath(verbatim),root);
  assert.equal((await success({action:'write',writes:[{path:`${verbatim}\\.omm\\one`,fields:{note:'verbatim'}}]})).result.writes[0].absolute_path,path.join(root,'.omm','one'));
  assert.equal((await success({PWD:verbatim,action:'read',path:'one'})).result.fields.note,'verbatim');
  for (const invalid of ['\\\\.\\pipe\\name','\\\\?\\GLOBALROOT\\Device\\x','\\\\?\\C:\\project.\\.omm','C:\\project \\.omm','C:\\project:stream\\.omm','\\\\?\\C:\\project\\..\\.omm']) assert.throws(()=>absolutePath(invalid),{code:'INVALID_PATH'},invalid);
});

test('tree direct children never confuse neighboring perspective names',async context=>{
  // Root owns similarly spelled perspectives and one genuine direct/indirect descendant chain.
  // Root 拥有拼写相近的视角，以及一条真实的直接/间接后代链。
  const root=project(context);
  await success({PWD:root,action:'write',writes:[{path:'ap/child/grandchild',fields:{note:'nested'}},{path:'api',fields:{note:'separate perspective'}}]});
  // Nodes exposes the actual parent relation returned by the public tree operation.
  // Nodes 暴露公开 tree 操作返回的实际父子关系。
  const nodes=(await success({action:'tree',path:path.join(root,'.omm')})).result.nodes;
  assert.deepEqual(nodes.find(node=>node.path==='ap').children,['ap/child']);
  assert.deepEqual(nodes.find(node=>node.path==='api').children,[]);
  assert.deepEqual(nodes.find(node=>node.path==='ap/child').children,['ap/child/grandchild']);
});

test('PWD cannot create nested workspaces whose returned absolute paths would be ambiguous',async context=>{
  // Root and nested are existing directories, isolating the semantic project-boundary check from ENOENT.
  // Root 和 nested 为已存在目录，将语义项目边界检查与 ENOENT 区分。
  const root=project(context), nested=path.join(root,'.omm','existing');
  fs.mkdirSync(nested,{recursive:true});
  for (const PWD of [path.join(root,'.omm'),nested]) {
    assert.equal((await main({PWD,action:'write',writes:[{path:'one',fields:{note:'bad'}}]})).error.code,'INVALID_PWD');
    assert.equal(fs.existsSync(path.join(PWD,'.omm')),false);
  }
});
