# 离线导出与查看器

返回 [分类目录](help.md) · [路径规则](paths.md)。

## 导出

```json
{"action":"export","path":"D:/work/project/.omm"}
```

默认输出 `D:/work/project/.omm-export/architecture.html`。无 PWD 时如需自定义 output，必须提供完整路径：

```json
{"action":"export","path":"D:/work/project/.omm/architecture","output":"D:/work/project/.omm-export/architecture-review.html"}
```

有 PWD 时 output 可仅为 `architecture-review.html`。输出只允许选定项目 `.omm-export` 下一层的 `.html` 文件，不支持任意目录或嵌套输出目录。省略 output 总是允许，因为默认位置由选定工作区唯一确定。

返回 file（实际绝对输出路径）、nodes、bytes、offline:true 和 validation。导出保留诊断，不保证图本身通过校验；需要有效架构图时先 validate。相同文件名会替换旧快照。

## 查看器

直接用浏览器打开返回的 HTML。查看器对齐上游 oh-my-mermaid 的总览画布：所有顶层视角按平衡网格一屏排布，拥有图的子节点与 `@引用` 目标递归内嵌为缩放子图（最多 6 层，同一文档只内嵌一次）；超过 3 个的扇出叶子收进 3 列紧凑网格，过宽的图自动改为纵向布局。边为平滑贝塞尔曲线，保留箭头类型与边标签。

交互：拖动平移，Ctrl/⌘+滚轮或双指捏合缩放，普通滚轮平移；点击分组或节点打开右侧详情抽屉并动画聚焦，Esc 或点击空白关闭；缩小时渐进淡化内部细节、放大时逐步展开（与上游一致的视口阈值）。支持搜索、层级导航、明暗主题、字段/源码/历史差异标签页及引用跳转。它是只读快照，修改 `.omm` 后要重新 export。

单个 HTML 内嵌文档、解析器、Dagre 布局管线和查看器代码，使用系统字体，不依赖 CDN、联网请求、后台进程或服务器。字段以安全 Markdown 子集展示，HTML 与外部链接按字面文本显示。首次准备运行时及开发依赖可能需要网络，已导出的 HTML 不需要。

path 指定子树时只嵌入选定文档内容；子树根（即使它是嵌套节点或自身没有图）也会作为总览分组渲染，无图根回退渲染其拥有图的后代。引用关系按全工作区计算，因此关系表可能包含范围外文档的逻辑名称，范围外目标不可跳转；未内嵌的 `@引用` 节点点击时跳转到被引用文档。HTML 不嵌入本机绝对项目路径。导出包含文档及关系信息，分享范围应与这些内容一致。
