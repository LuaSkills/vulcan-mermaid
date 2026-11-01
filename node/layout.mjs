// Isolate graph identifiers from Dagre's internal object-key namespace.
// 将图标识符与 Dagre 内部对象键命名空间隔离。

/** Layout a parsed graph with the pinned Dagre instance; graph/library are inputs, returns plain geometry.
 * 使用固定 Dagre 实例布局已解析的图；graph/library 为输入，返回普通几何数据。
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
    // Lines 确定多行标签的预留布局区域。
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
