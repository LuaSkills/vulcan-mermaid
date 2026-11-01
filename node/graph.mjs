// Share one explicit flowchart subset across validation, diff, and the offline viewer.
// 校验、差异比较和离线查看器共享一个明确的流程图语法子集。

/** Split semicolon statements outside quoted labels and shapes; text is source, returns line-tagged statements.
 * 在引号标签和形状之外分割分号语句；text 为源码，返回带行号的语句。
 */
function statements(text) {
  // Output preserves source line numbers for diagnostics.
  // Output 保留用于诊断的源码行号。
  const output = [];
  // Buffer, depth, quote, and line track the minimal lexical state without executing directives.
  // Buffer、depth、quote 和 line 跟踪最小词法状态，不执行任何指令。
  let buffer = '', depth = 0, quote = false, line = 1, start = 1;
  for (let index = 0; index < text.length; index++) {
    // Comments consume the rest of their line before semicolon splitting; initialization directives remain errors.
    // 注释在分号分割之前消费该行剩余内容；初始化指令仍保留为错误。
    if (!quote && depth === 0 && text.startsWith('%%',index) && !text.startsWith('%%{',index)) {
      while (index < text.length && text[index] !== '\n') index++;
      if (index === text.length) break;
    }
    // Character is the current source code unit.
    // Character 是当前源码字符。
    const character = text[index];
    if (character === '"' && text[index-1] !== '\\') quote = !quote;
    if (!quote && '[({'.includes(character)) depth++;
    if (!quote && '])}'.includes(character)) depth--;
    if (character === '\n' || (character === ';' && depth === 0 && !quote)) {
      if (buffer.trim()) output.push({text:buffer.trim(),line:start});
      buffer = ''; depth = 0; quote = false;
      if (character === '\n') line++;
      start = line;
    } else buffer += character;
  }
  if (buffer.trim()) output.push({text:buffer.trim(),line:start});
  return output;
}

/** Normalize a quoted label for text rendering; value is raw label, returns safe plain text.
 * 将带引号的标签规范化为文本；value 为原始标签，返回安全纯文本。
 */
function labelText(value) {
  return value.trim().replace(/^"([\s\S]*)"$/u,'$1').replace(/\\n|<br\s*\/?\s*>/giu,'\n').replace(/\\"/gu,'"');
}

/** Consume one flowchart node; source is remaining text, returns node/rest or throws a syntax error.
 * 消费一个流程图节点；source 为剩余文本，返回 node/rest 或抛出语法错误。
 */
function nodeToken(source) {
  // Match avoids swallowing arrow hyphens when spaces are absent.
  // Match 避免在没有空格时吞掉箭头连字符。
  const match = /^(@?[\w]+(?:-[\w]+)*)/u.exec(source.trimStart());
  if (!match) throw new Error(`Expected node ID near: ${source.slice(0,60)}`);
  // Rest and node track the consumed identifier and optional presentation.
  // Rest 和 node 跟踪已消费标识符及可选展示信息。
  let rest = source.trimStart().slice(match[0].length).trimStart();
  const node = {id:match[1]};
  // Shapes are longest-first delimiters supported by the upstream architecture viewer.
  // Shapes 按最长优先排列上游架构查看器支持的分隔符。
  const shapes = [['[[',']]','subroutine'],['((', '))','circle'],['([','])','stadium'],['[(',')]','cylinder'],['[',']','rect'],['(',')','round'],['{','}','diamond']];
  for (const [open,close,shape] of shapes) {
    if (!rest.startsWith(open)) continue;
    // Quote and end locate an unquoted closing delimiter so labels may contain bracket characters.
    // Quote 和 end 定位引号之外的结束分隔符，使标签可包含括号字符。
    let quote = false, end = -1;
    for (let index = open.length; index < rest.length; index++) {
      if (rest[index] === '"' && rest[index-1] !== '\\') quote = !quote;
      if (!quote && rest.startsWith(close,index)) { end=index; break; }
    }
    if (end < 0) throw new Error(`Unclosed ${open} label for ${node.id}`);
    node.label = labelText(rest.slice(open.length,end));
    node.shape = shape;
    rest = rest.slice(end+close.length).trimStart();
    break;
  }
  // ClassMatch recognizes the documented inline class shorthand.
  // ClassMatch 识别已文档化的内联类简写。
  const classMatch = /^:::([\w-]+)/u.exec(rest);
  if (classMatch) { node.className=classMatch[1]; rest=rest.slice(classMatch[0].length).trimStart(); }
  return {node,rest};
}

/** Parse a bounded architecture flowchart; source is Mermaid text, returns nodes/edges/styles/issues without executing it.
 * 解析有界架构流程图；source 为 Mermaid 文本，返回节点、边、样式和问题，不执行内容。
 */
export function parseGraph(source) {
  // Nodes and classes are Maps so user identifiers cannot modify object prototypes.
  // Nodes 和 classes 使用 Map，避免用户标识符修改对象原型。
  const nodes = new Map(), classes = new Map();
  // Graph is JSON-compatible and includes explicit syntax errors instead of silently dropping lines.
  // Graph 可 JSON 序列化，包含明确语法错误而非静默丢弃行。
  const graph = {direction:'LR',nodes:[],edges:[],styles:[],issues:[]};
  // Header distinguishes a missing declaration from a supported flowchart.
  // Header 区分缺失声明与受支持流程图。
  let header = false;
  /** Merge a parsed node while retaining its explicit label; node is a token, returns void.
   * 合并已解析节点并保留显式标签；node 为词法节点，无返回值。
   */
  function add(node) {
    if (!nodes.has(node.id)) nodes.set(node.id,{id:node.id,label:node.id,shape:'rect',className:''});
    Object.assign(nodes.get(node.id),node);
  }
  for (const statement of statements(source)) {
    if (statement.text.startsWith('%%') && !statement.text.startsWith('%%{')) continue;
    try {
      // Declaration permits exactly one graph/flowchart header with a supported rank direction.
      // Declaration 仅允许一个带受支持布局方向的 graph/flowchart 声明。
      const declaration = /^(?:graph|flowchart)\s+(LR|RL|TD|TB|BT)$/u.exec(statement.text);
      if (!header) {
        if (!declaration) throw new Error('Expected graph/flowchart LR, RL, TD, TB, or BT declaration');
        header = true; graph.direction=declaration[1]; continue;
      }
      if (declaration) throw new Error('Duplicate flowchart declaration');
      // Definition and assignment preserve styling as semantic diff input.
      // Definition 和 assignment 将样式保留为语义差异输入。
      const definition = /^classDef\s+([\w-]+)\s+(.+)$/u.exec(statement.text);
      if (definition) { graph.styles.push({name:definition[1],style:definition[2]}); continue; }
      const assignment = /^class\s+([\w,-]+)\s+([\w-]+)$/u.exec(statement.text);
      if (assignment) { for (const id of assignment[1].split(',')) classes.set(id,assignment[2]); continue; }
      if (/^(?:subgraph|end|style|linkStyle|click|%%\{)\b/u.test(statement.text)) throw new Error('Unsupported directive; use nested .omm nodes and classDef instead');
      // Parsed consumes a full node before edge parsing, so arrows inside quoted labels remain text.
      // Parsed 在解析边之前消费完整节点，因此引号标签内的箭头保持为文本。
      let parsed = nodeToken(statement.text);
      add(parsed.node);
      while (parsed.rest) {
        // Arrow supports both pipe labels and the upstream -- text --> form.
        // Arrow 支持竖线标签及上游 -- text --> 形式。
        const arrow = /^(-->|---|--o|--x|-\.->|==>|~~~)(?:\|("[^"]*"|[^|]*)\|)?\s*/u.exec(parsed.rest);
        const words = arrow === null ? /^--\s+(.+?)\s+-->\s*/u.exec(parsed.rest) : null;
        if (arrow === null && words === null) throw new Error(`Unsupported syntax near: ${parsed.rest.slice(0,60)}`);
        // Next identifies the edge destination and any subsequent chain.
        // Next 标识边的目标及后续链。
        const next = nodeToken(parsed.rest.slice(arrow !== null ? arrow[0].length : words[0].length));
        add(next.node);
        graph.edges.push({from:parsed.node.id,to:next.node.id,arrow:arrow !== null ? arrow[1] : '-->',label:labelText(arrow !== null ? (arrow[2] === undefined ? '' : arrow[2]) : words[1])});
        parsed = next;
      }
    } catch (error) { graph.issues.push({level:'error',rule:'flowchart-syntax',line:statement.line,message:error.message}); }
  }
  if (!header && graph.issues.length === 0) graph.issues.push({level:'error',rule:'flowchart-syntax',line:1,message:'Missing flowchart declaration'});
  for (const [id,className] of classes) {
    if (!nodes.has(id)) graph.issues.push({level:'warning',rule:'unknown-class-node',message:`Class assigned to missing node ${id}`});
    else nodes.get(id).className=className;
  }
  graph.nodes = [...nodes.values()];
  if (graph.nodes.length > 200 || graph.edges.length > 400) graph.issues.push({level:'error',rule:'diagram-size',message:'Viewer limit is 200 nodes and 400 edges per diagram; split into nested .omm nodes'});
  return graph;
}

/** Compare graph semantics and full source; before/after are diagram strings, returns an honest structured diff.
 * 比较图语义及完整源码；before/after 为图文本，返回如实的结构化差异。
 */
export function diffGraphs(before, after) {
  // Previous/current are parsed with the same grammar used by the viewer.
  // Previous/current 使用与查看器相同的语法解析。
  const previous=parseGraph(before), current=parseGraph(after);
  // OldNodes/newNodes retain labels, shapes and classes rather than only IDs.
  // OldNodes/newNodes 保留标签、形状和类，而非仅保留 ID。
  const oldNodes=new Map(previous.nodes.map(node=>[node.id,node])), newNodes=new Map(current.nodes.map(node=>[node.id,node]));
  /** Subtract edge multisets so duplicate-edge changes remain visible; left/right are arrays, returns excess edges.
   * 对边多重集合求差以保留重复边变化；left/right 为数组，返回多出的边。
   */
  function subtract(left,right) {
    // Remaining keeps one slot per occurrence, unlike the upstream Set implementation.
    // Remaining 为每次出现保留位置，与上游 Set 实现不同。
    const remaining=right.map(edge=>JSON.stringify(edge));
    return left.filter(edge=>{
      // Index is the matching occurrence consumed by this edge.
      // Index 是当前边消费的匹配项。
      const index=remaining.indexOf(JSON.stringify(edge));
      if (index < 0) return true;
      remaining.splice(index,1); return false;
    });
  }
  return {
    has_changes:before !== after,
    added_nodes:current.nodes.filter(node=>!oldNodes.has(node.id)),
    removed_nodes:previous.nodes.filter(node=>!newNodes.has(node.id)),
    changed_nodes:current.nodes.filter(node=>oldNodes.has(node.id) && JSON.stringify(node)!==JSON.stringify(oldNodes.get(node.id))).map(node=>({before:oldNodes.get(node.id),after:node})),
    added_edges:subtract(current.edges,previous.edges),removed_edges:subtract(previous.edges,current.edges),
    direction_changed:previous.direction!==current.direction,styles_changed:JSON.stringify(previous.styles)!==JSON.stringify(current.styles),
    complete:previous.issues.every(issue=>issue.level!=='error') && current.issues.every(issue=>issue.level!=='error'),
    issues:{before:previous.issues,after:current.issues},
  };
}

/** Extract upstream @perspective references, extended with explicit nested paths; source is text, returns unique targets.
 * 提取上游 @perspective 引用并扩展显式嵌套路径；source 为文本，返回去重目标。
 */
export function extractRefs(source) {
  return [...new Set([...source.matchAll(/@([\w-]+(?:\/[\w-]+)*)/gu)].map(match=>match[1]))].sort();
}
