<#
.SYNOPSIS
Test, exercise every action through luaskills-debug, then validate and package the skill.
测试技能，通过 luaskills-debug 执行每个操作，然后校验并打包技能。
#>
# ErrorActionPreference stops immediately on PowerShell errors.
# ErrorActionPreference 使 PowerShell 错误立即终止。
$ErrorActionPreference = 'Stop'
# ProjectRoot is the independent skill repository.
# ProjectRoot 是独立技能仓库。
$ProjectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
# DebugScript is the repository wrapper around luaskills-debug.
# DebugScript 是 luaskills-debug 的仓库封装脚本。
$DebugScript = Join-Path $PSScriptRoot 'debug_skill.ps1'
Set-Location $ProjectRoot
& python -X utf8 -m unittest discover -s tests -v
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup_debug.ps1
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& python -X utf8 scripts/verify_runtime.py
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& powershell -NoProfile -ExecutionPolicy Bypass -File $DebugScript -Command validate
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& powershell -NoProfile -ExecutionPolicy Bypass -File $DebugScript -Command package
exit $LASTEXITCODE
