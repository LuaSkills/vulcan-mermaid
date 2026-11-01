--- Dispatch one workspace request through the official managed Node.js bridge.
--- 通过官方受管 Node.js 桥接分发一次工作区请求。
--- @param args table Host arguments matching the workspace input schema.
--- @param args table 符合工作区输入结构的宿主参数。
--- @return string json Encoded action result or explicit domain error.
--- @return string json 编码后的操作结果或明确的领域错误。
return function(args)
  -- Invocation forwards optional host-injected PWD and explicit paths unchanged across the managed boundary.
  -- Invocation 跨受管环境边界原样转发可选的宿主暗传 PWD 和显式路径。
  local invocation = vulcan.runtime.node.invoke({
    file = "node/workspace.mjs",
    handler = "main",
    timeout_ms = 60000,
    args = args,
  })
  if invocation.ok ~= true then
    error("Managed Node.js invocation failed: " .. tostring(invocation.error))
  end
  return vulcan.json.encode(invocation.value)
end
