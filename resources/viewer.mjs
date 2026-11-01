// Consume inert snapshot JSON; all user-authored text is assigned through textContent.
// 消费惰性快照 JSON；所有用户编写文本均通过 textContent 赋值。
const snapshot=JSON.parse(document.getElementById('snapshot').textContent);
// Records are keyed by complete paths to preserve equally named nodes under different perspectives.
// Records 以完整路径为键，保留不同视角下的同名节点。
const records=new Map(snapshot.nodes.map(record=>[record.path,record]));
// Selection and tab retain local navigation state without any network or filesystem API.
// Selection 和 tab 保存本地导航状态，不使用网络或文件系统 API。
let selection=snapshot.nodes.length===0?null:snapshot.nodes[0].path, tab='details';
// View describes the current SVG viewport and drag anchor.
// View 描述当前 SVG 视口及拖动锚点。
let view={x:0,y:0,width:800,height:500}, dimensions={width:800,height:500}, drag=null;
// Svg is the single reusable drawing surface.
// Svg 是唯一复用的绘图表面。
const svg=document.getElementById('graph');

/** Create a safe HTML element; tag/text/className describe it, returns an unattached element.
 * 创建安全 HTML 元素；tag/text/className 描述元素，返回未挂载元素。
 */
function element(tag,text='',className='') {
  // Created receives plain text rather than interpreted markup.
  // Created 接收纯文本而非解释后的标记。
  const created=document.createElement(tag);
  created.textContent=text; created.className=className; return created;
}

/** Create an SVG element with explicit attributes; tag/attrs/text describe it, returns a safe SVG node.
 * 使用显式属性创建 SVG 元素；tag/attrs/text 描述元素，返回安全 SVG 节点。
 */
function vector(tag,attrs={},text='') {
  // Created is namespaced so browser HTML parsing is never involved.
  // Created 使用命名空间创建，从不涉及浏览器 HTML 解析。
  const created=document.createElementNS('http://www.w3.org/2000/svg',tag);
  for (const [name,value] of Object.entries(attrs)) created.setAttribute(name,String(value));
  created.textContent=text; return created;
}

/** Render a safe Markdown subset; parent is container, source is field text, returns void.
 * 渲染安全 Markdown 子集；parent 为容器，source 为字段文本，无返回值。
 */
function markdown(parent,source) {
  // Code is either the current fenced block or null; HTML and links remain visible literal text.
  // Code 为当前围栏代码块或 null；HTML 与链接保持可见字面文本。
  let code=null;
  for (const line of source.split('\n')) {
    if (line.startsWith('```')) {
      if (code===null) {code=element('pre');parent.append(code);} else code=null;
    } else if (code!==null) code.textContent+=`${line}\n`;
    else if (/^#{1,6}\s/u.test(line)) parent.append(element('h3',line.replace(/^#{1,6}\s/u,'')));
    else if (/^\s*[-*]\s/u.test(line)) parent.append(element('p',`• ${line.replace(/^\s*[-*]\s/u,'')}`));
    else if (line.trim()) parent.append(element('p',line));
  }
}

/** Rebuild the filtered tree; no arguments, returns void and preserves selection.
 * 重建过滤后的树；无参数，无返回值并保留选择。
 */
function renderTree() {
  // Query and tree are the current search value and navigation container.
  // Query 和 tree 为当前搜索值及导航容器。
  const query=document.getElementById('search').value.toLocaleLowerCase(), tree=document.getElementById('tree');
  tree.replaceChildren();
  for (const record of snapshot.nodes) {
    if (!`${record.path}\n${record.fields.description===undefined?'':record.fields.description}`.toLocaleLowerCase().includes(query)) continue;
    // Button uses depth indentation but keeps the full path in its accessible title.
    // Button 使用层级缩进，但在无障碍标题中保留完整路径。
    const button=element('button',record.path.split('/').at(-1),`tree-item${record.path===selection?' active':''}`);
    button.style.paddingLeft=`${10+(record.path.split('/').length-1)*16}px`;
    button.title=record.path; button.setAttribute('aria-current',String(record.path===selection));
    button.addEventListener('click',()=>select(record.path)); tree.append(button);
  }
  if (!tree.children.length) tree.append(element('p','没有匹配的节点','muted'));
}

/** Select one known full node path; nodePath identifies it, returns void after rendering.
 * 选择一个已知完整节点路径；nodePath 标识节点，渲染后无返回值。
 */
function select(nodePath) {
  if (!records.has(nodePath)) return;
  selection=nodePath; renderTree(); renderGraph(); renderDetails();
}

/** Apply the current viewport; no arguments, returns void.
 * 应用当前视口；无参数，无返回值。
 */
function applyView() { svg.setAttribute('viewBox',`${view.x} ${view.y} ${view.width} ${view.height}`); }

/** Fit the whole layout while respecting the visible surface ratio; no arguments, returns void.
 * 在尊重可见画布比例的同时适应整个布局；无参数，无返回值。
 */
function fit() {
  // Ratio reflects the actual responsive drawing area.
  // Ratio 反映响应式绘图区的实际比例。
  const ratio=svg.clientWidth/Math.max(1,svg.clientHeight);
  view.width=Math.max(dimensions.width+70,(dimensions.height+70)*ratio);
  view.height=view.width/ratio;
  view.x=(dimensions.width-view.width)/2; view.y=(dimensions.height-view.height)/2; applyView();
}

/** Zoom around the viewport center; factor is scale multiplier, returns void.
 * 围绕视口中心缩放；factor 为缩放倍数，无返回值。
 */
function zoom(factor) {
  // Width is clamped so repeated wheel events never yield a degenerate viewBox.
  // Width 受到限制，使重复滚轮事件不会产生退化 viewBox。
  const width=Math.min(20000,Math.max(100,view.width*factor)), ratio=width/view.width;
  view.x+=(view.width-width)/2; view.y+=(view.height-view.height*ratio)/2;
  view.width=width;view.height*=ratio;applyView();
}

/** Resolve node navigation using exact ownership; record/node identify context, returns full path or null.
 * 使用精确归属解析节点导航；record/node 标识上下文，返回完整路径或 null。
 */
function destination(record,node) {
  // Reference labels are explicit cross-perspective links in the upstream .omm convention.
  // Reference 标签是上游 .omm 约定中显式的跨视角链接。
  const reference=/^@([\w-]+(?:\/[\w-]+)*)/u.exec(node.label);
  if (reference!==null) return records.has(reference[1])?reference[1]:null;
  // Child belongs only to the currently selected node; no global short-name fallback is allowed.
  // Child 仅属于当前所选节点；不允许全局短名称兜底。
  const child=`${record.path}/${node.id}`;
  return records.has(child)?child:null;
}

/** Convert a class definition to a small safe color palette; graph/node supply style, returns allowed SVG colors.
 * 将类定义转换为受限安全配色；graph/node 提供样式，返回允许的 SVG 颜色。
 */
function colors(graph,node) {
  // Palette defaults to theme tokens rather than interpreting arbitrary Mermaid CSS.
  // Palette 默认使用主题变量，而不解释任意 Mermaid CSS。
  const palette={fill:'var(--surface)',stroke:'var(--line)',color:'var(--ink)'};
  for (const definition of graph.styles.filter(style=>style.name===node.className || style.name==='default')) {
    for (const declaration of definition.style.split(',')) {
      // Match permits only literal hexadecimal colors for the three supported properties.
      // Match 对三个受支持属性仅允许字面十六进制颜色。
      const match=/^\s*(fill|stroke|color)\s*:\s*(#[\da-f]{3}|#[\da-f]{6}|#[\da-f]{8})\s*$/iu.exec(declaration);
      if (match) palette[match[1]]=match[2];
    }
  }
  return palette;
}

/** Render the selected flowchart with Dagre; no arguments, returns void and refuses partial invalid diagrams.
 * 使用 Dagre 渲染所选流程图；无参数，无返回值，拒绝呈现无效图的部分内容。
 */
function renderGraph() {
  svg.replaceChildren();
  // Empty and notice present missing/invalid diagrams explicitly.
  // Empty 和 notice 显式展示缺失或无效图。
  const empty=document.getElementById('empty'), notice=document.getElementById('notice');
  empty.textContent=''; notice.style.display='none';
  if (selection===null) {empty.textContent='工作区为空\n使用 write 添加视角，再重新导出。';return;}
  // Record and graph are the selected source and its shared-parser result.
  // Record 和 graph 为所选源码及共享解析器结果。
  const record=records.get(selection), graph=parseGraph(record.fields.diagram===undefined?'':record.fields.diagram);
  document.getElementById('title').textContent=record.path;
  document.getElementById('subtitle').textContent=`${graph.nodes.length} 个节点 · ${graph.edges.length} 条连接 · ${graph.direction}`;
  if (graph.issues.some(issue=>issue.level==='error')) {empty.textContent='此图无法完整渲染。\n请在右侧查看诊断与原始源码。';notice.textContent='流程图语法或规模超出支持范围，未显示可能误导的局部结果。';notice.style.display='block';return;}
  // Layout uses the tested adapter so user identifiers never become Dagre object keys.
  // Layout 使用已测试的适配层，使用户标识符不会成为 Dagre 对象键。
  const layout=layoutGraph(graph,dagre);
  // PlacedNodes restores original identifiers only after the third-party layout calculation.
  // PlacedNodes 仅在第三方布局计算结束后恢复原始标识符。
  const placedNodes=new Map(layout.nodes.map(node=>[node.id,node]));
  dimensions={width:layout.width,height:layout.height};
  // Definitions contain only a fixed local arrow marker.
  // Definitions 仅包含固定的本地箭头标记。
  const definitions=vector('defs'), marker=vector('marker',{id:'arrow',viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:7,markerHeight:7,orient:'auto-start-reverse'});
  marker.append(vector('path',{d:'M 0 0 L 10 5 L 0 10 z',fill:'var(--muted)'})); definitions.append(marker); svg.append(definitions);
  graph.edges.forEach((edge,index)=>{
    // Placed is Dagre's route for this exact multigraph edge.
    // Placed 是 Dagre 为该精确多重图边生成的路径。
    const placed=layout.edges[index];
    if (edge.arrow==='~~~') return;
    // Route connects layout points without allowing arbitrary path text from user input.
    // Route 连接布局点，不允许用户输入任意路径文本。
    const route=placed.points.map((point,position)=>`${position===0?'M':'L'} ${point.x} ${point.y}`).join(' ');
    svg.append(vector('path',{d:route,fill:'none',stroke:'var(--muted)','stroke-width':edge.arrow==='==>'?3:1.5,'stroke-dasharray':edge.arrow==='-.->'?'5 4':'none',...(edge.arrow==='---'||edge.arrow==='--o'||edge.arrow==='--x'?{}:{'marker-end':'url(#arrow)'})}));
    if (edge.arrow==='--o' || edge.arrow==='--x') {
      // End locates the circle/cross terminal supplied by the explicit arrow syntax.
      // End 定位显式箭头语法指定的圆圈或交叉端点。
      const end=placed.points.at(-1);
      svg.append(edge.arrow==='--o'?vector('circle',{cx:end.x,cy:end.y,r:4,fill:'var(--bg)',stroke:'var(--muted)'}):vector('path',{d:`M ${end.x-4} ${end.y-4} l 8 8 M ${end.x-4} ${end.y+4} l 8 -8`,stroke:'var(--muted)'}));
    }
    if (edge.label) {
      // Lines display multiline edge labels within the area reserved by the layout adapter.
      // Lines 在布局适配层预留区域内显示多行边标签。
      const lines=edge.label.split('\n');
      lines.forEach((line,lineIndex)=>svg.append(vector('text',{x:placed.x,y:placed.y+(lineIndex-(lines.length-1)/2)*18,'text-anchor':'middle',class:'edge-label'},line)));
    }
  });
  // Changed marks updated/new nodes when a real previous diagram is available.
  // Changed 在存在真实旧图时标记更新或新增节点。
  const changed=new Set();
  if (record.meta!==null && record.meta.prev_diagram!==undefined) {
    // Difference uses the same semantics as the public diff action.
    // Difference 使用与公开 diff 操作相同的语义。
    const difference=diffGraphs(record.meta.prev_diagram,record.fields.diagram);
    for (const node of difference.added_nodes) changed.add(node.id);
    for (const node of difference.changed_nodes) changed.add(node.after.id);
  }
  for (const node of graph.nodes) {
    // Placed, palette, and target supply geometry, safe colors, and exact navigation.
    // Placed、palette 和 target 提供几何信息、安全颜色及精确导航。
    const placed=placedNodes.get(node.id), palette=colors(graph,node), target=destination(record,node);
    // Group carries keyboard access for nodes that lead to a known child or reference.
    // Group 为指向已知子节点或引用的节点提供键盘操作。
    const group=vector('g',{transform:`translate(${placed.x},${placed.y})`,class:'graph-node',...(target===null?{}:{tabindex:0,role:'button','aria-label':`打开 ${target}`})});
    // Width/height describe the local shape bounds around the node center.
    // Width/height 描述节点中心周围的局部形状边界。
    const width=placed.width,height=placed.height;
    // Attributes never include arbitrary CSS or event attributes from the diagram source.
    // Attributes 从不包含来自图源码的任意 CSS 或事件属性。
    const attributes={class:'shape',fill:palette.fill,stroke:changed.has(node.id)?'var(--green)':palette.stroke,'stroke-width':changed.has(node.id)?2.5:1.5};
    if (node.shape==='diamond') group.append(vector('polygon',{...attributes,points:`0,${-height/2} ${width/2},0 0,${height/2} ${-width/2},0`}));
    else if (node.shape==='circle') group.append(vector('ellipse',{...attributes,cx:0,cy:0,rx:width/2,ry:height/2}));
    else if (node.shape==='cylinder') group.append(vector('path',{...attributes,d:`M ${-width/2} ${-height/2+9} a ${width/2} 9 0 0 1 ${width} 0 v ${height-18} a ${width/2} 9 0 0 1 ${-width} 0 z M ${-width/2} ${-height/2+9} a ${width/2} 9 0 0 0 ${width} 0`}));
    else {
      group.append(vector('rect',{...attributes,x:-width/2,y:-height/2,width,height,rx:node.shape==='stadium'?height/2:node.shape==='round'?12:5}));
      if (node.shape==='subroutine') group.append(vector('path',{d:`M ${-width/2+8} ${-height/2} v ${height} M ${width/2-8} ${-height/2} v ${height}`,stroke:palette.stroke}));
    }
    // Lines are separate SVG text nodes, so embedded markup stays harmless visible text.
    // Lines 为独立 SVG 文本节点，因此嵌入标记始终是无害可见文本。
    const lines=node.label.split('\n');
    lines.forEach((line,index)=>group.append(vector('text',{x:0,y:(index-(lines.length-1)/2)*19+4,'text-anchor':'middle',class:'node-label',fill:palette.color},line)));
    group.append(vector('title',{},target===null?node.id:`打开 ${target}`));
    if (target!==null) {
      group.addEventListener('click',()=>select(target));
      group.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();select(target);}});
    }
    svg.append(group);
  }
  fit();
}

/** Render current document fields, source, or history; no arguments, returns void.
 * 渲染当前文档字段、源码或历史；无参数，无返回值。
 */
function renderDetails() {
  // Panel owns only freshly constructed safe DOM nodes.
  // Panel 仅包含新构建的安全 DOM 节点。
  const panel=document.getElementById('details');panel.replaceChildren();
  if (selection===null) {panel.append(element('p','暂无文档。','muted'));return;}
  // Record is guaranteed to exist by selection validation.
  // Record 已通过选择校验，保证存在。
  const record=records.get(selection);
  if (tab==='source') {
    panel.append(element('h2','diagram.mmd'),element('pre',record.fields.diagram===undefined?'（未提供）':record.fields.diagram));return;
  }
  if (tab==='changes') {
    if (record.meta===null || record.meta.prev_diagram===undefined || record.fields.diagram===undefined) {panel.append(element('p','尚无上一个图版本。修改 diagram 后重新导出即可比较。','muted'));return;}
    // Difference includes both semantic changes and the complete-source comparison flag.
    // Difference 包含语义变化及完整源码比较标记。
    const difference=diffGraphs(record.meta.prev_diagram,record.fields.diagram);
    panel.append(element('h2',difference.has_changes?'图已变化':'图未变化'),element('pre',JSON.stringify(difference,null,2)),element('h2','修改前'),element('pre',record.meta.prev_diagram),element('h2','修改后'),element('pre',record.fields.diagram));return;
  }
  // Report comes from the exported validation snapshot, including cross-node reference issues.
  // Report 来自导出的校验快照，包含跨节点引用问题。
  const report=snapshot.validation.nodes.find(item=>item.path===selection);
  for (const issue of report.issues) panel.append(element('div',`${issue.line===undefined?'':`L${issue.line} · `}${issue.message}`,`issue ${issue.level}`));
  // Names map the fixed .omm field set to readable headings.
  // Names 将固定 .omm 字段集合映射为可读标题。
  const names={description:'说明',constraint:'约束',concern:'关注点',context:'上下文',todo:'待办',note:'备注'};
  for (const [field,title] of Object.entries(names)) if (record.fields[field]!==undefined) {panel.append(element('h2',title));markdown(panel,record.fields[field]);}
  // Related covers both incoming and outgoing links using full paths.
  // Related 使用完整路径涵盖传入和传出链接。
  const related=snapshot.refs.filter(ref=>ref.source===selection||ref.target===selection);
  if (related.length) panel.append(element('h2','引用关系'));
  for (const ref of related) {
    // DestinationPath is explicitly the opposite endpoint of this relation.
    // DestinationPath 明确为该关系的另一端。
    const destinationPath=ref.source===selection?ref.target:ref.source;
    const button=element('button',`${ref.source===selection?'→':'←'} ${destinationPath}${ref.exists?'':' · 缺失'}`,'ref');
    button.disabled=!records.has(destinationPath);button.addEventListener('click',()=>select(destinationPath));panel.append(button);
  }
  if (record.meta!==null) panel.append(element('h2','元数据'),element('pre',JSON.stringify(record.meta,(key,value)=>key==='prev_diagram'?undefined:value,2)));
}

document.getElementById('search').addEventListener('input',renderTree);
document.getElementById('theme').addEventListener('click',()=>{document.documentElement.dataset.theme=document.documentElement.dataset.theme==='light'?'dark':'light';});
document.getElementById('fit').addEventListener('click',fit);
document.getElementById('zoom-in').addEventListener('click',()=>zoom(.8));
document.getElementById('zoom-out').addEventListener('click',()=>zoom(1.25));
for (const button of document.querySelectorAll('[data-tab]')) button.addEventListener('click',()=>{
  tab=button.dataset.tab;
  for (const candidate of document.querySelectorAll('[data-tab]')) candidate.setAttribute('aria-selected',String(candidate===button));
  renderDetails();
});
svg.addEventListener('wheel',event=>{event.preventDefault();zoom(event.deltaY>0?1.12:.89);},{passive:false});
svg.addEventListener('pointerdown',event=>{
  if(event.target.closest('.graph-node'))return;
  drag={x:event.clientX,y:event.clientY,view:{...view}};svg.setPointerCapture(event.pointerId);svg.classList.add('dragging');
});
svg.addEventListener('pointermove',event=>{
  if(drag===null)return;
  view.x=drag.view.x-(event.clientX-drag.x)*view.width/svg.clientWidth;
  view.y=drag.view.y-(event.clientY-drag.y)*view.height/svg.clientHeight;applyView();
});
for (const eventName of ['pointerup','pointercancel']) svg.addEventListener(eventName,()=>{drag=null;svg.classList.remove('dragging');});
new ResizeObserver(fit).observe(document.getElementById('graph-area'));
document.getElementById('generated').textContent=`快照 ${snapshot.generated.slice(0,10)}`;
document.getElementById('status').textContent=`${snapshot.nodes.length} nodes · .omm format 0.1.0 · 单文件离线查看器 · 不连接网络 · 数据更新后请重新导出`;
renderTree();renderGraph();renderDetails();
