"""Verify managed Node and the official debugger end to end, including every action.
验证受管 Node 和官方调试器端到端流程，涵盖每个操作。
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import platform
import re
import shutil
import subprocess
import sys
from tempfile import TemporaryDirectory
import yaml

# ROOT is the repository owning all development artifacts.
# ROOT 是拥有全部开发产物的仓库。
ROOT = Path(__file__).resolve().parent.parent


def run(command: list[str], cwd: Path = ROOT) -> str:
    """Run an explicit argv without a shell; command/cwd specify it, return UTF-8 stdout or raise.
    不经过 shell 执行显式参数列表；command/cwd 指定命令，返回 UTF-8 输出或抛出错误。
    """
    # Completed preserves stderr on failures while keeping normal debugger output compact.
    # Completed 在失败时保留标准错误，同时使正常调试器输出紧凑。
    completed = subprocess.run(command, cwd=cwd, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=300)
    if completed.returncode:
        raise RuntimeError(f"Command failed ({completed.returncode}): {command}\n{completed.stdout}\n{completed.stderr}")
    return completed.stdout


def debug(command: str, arguments: Path | None = None) -> object:
    """Use the luaskills-debug wrapper; command/arguments identify request, return parsed JSON.
    使用 luaskills-debug 封装；command/arguments 标识请求，返回解析后的 JSON。
    """
    # Argv follows the exact platform wrapper contract without joining shell strings.
    # Argv 遵循精确的平台封装契约，不拼接 shell 字符串。
    argv = ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(ROOT / "scripts/debug_skill.ps1"), "-Command", command, "-Output", "json"] if os.name == "nt" else ["bash", str(ROOT / "scripts/debug_skill.sh"), command, "--output", "json"]
    if arguments is not None:
        argv += ["-Tool", "workspace", "-ArgsFile", str(arguments)] if os.name == "nt" else ["--tool", "workspace", "--args-file", str(arguments)]
    # Lines contain setup status prose followed by the official JSON opening line.
    # Lines 包含初始化状态文字及随后的官方 JSON 起始行。
    lines = run(argv).splitlines()
    for index, line in enumerate(lines):
        if line in ("{", "["):
            return json.loads("\n".join(lines[index:]))
    raise RuntimeError(f"Official debugger produced no JSON: {lines}")


def managed_node() -> Path:
    """Verify the declared downloaded runtime; no parameters, returns its executable path.
    验证声明的已下载运行时；无参数，返回可执行文件路径。
    """
    # Declaration is the single Node/pnpm version authority used by build and tests.
    # Declaration 是构建和测试使用的唯一 Node/pnpm 版本依据。
    declaration = yaml.safe_load((ROOT / "dependencies.yaml").read_text(encoding="utf-8"))["node_runtime"]
    # System and machine map only explicitly supported official platform identifiers.
    # System 和 machine 仅映射官方明确支持的平台标识。
    system = {"Windows": "windows", "Linux": "linux", "Darwin": "macos"}[platform.system()]
    machine = {"amd64": "x64", "x86_64": "x64", "arm64": "arm64", "aarch64": "arm64"}[platform.machine().lower()]
    # RuntimeRoot contains versions downloaded by the inherited setup scripts.
    # RuntimeRoot 包含继承的初始化脚本下载的版本。
    runtime_root = ROOT / ".luaskills-debug/runtime/dependencies/runtimes/node"
    # NodeRoot and pnpmRoot identify versioned manifests rather than PATH executables.
    # NodeRoot 和 pnpmRoot 定位版本化清单，而非 PATH 可执行程序。
    node_root = runtime_root / f"node-{declaration['version']}-{system}-{machine}"
    pnpm_root = runtime_root / f"pnpm-{declaration['package_manager_version']}"
    # Manifests are authoritative descriptors produced by the verified fetcher.
    # Manifests 是已校验下载器生成的权威描述。
    node_manifest = json.loads((node_root / "runtime-manifest.json").read_text(encoding="utf-8-sig"))
    pnpm_manifest = json.loads((pnpm_root / "runtime-manifest.json").read_text(encoding="utf-8-sig"))
    assert node_manifest["version"] == declaration["version"]
    assert pnpm_manifest["version"] == declaration["package_manager_version"]
    # Node and pnpm resolve within their exact distribution roots before execution.
    # Node 和 pnpm 在执行前解析到各自精确分发根目录内。
    node = (node_root / node_manifest["executable"]).resolve()
    pnpm = (pnpm_root / pnpm_manifest["executable"]).resolve()
    assert node.is_relative_to(node_root.resolve()) and pnpm.is_relative_to(pnpm_root.resolve())
    assert run([str(node), "--version"]).strip() == f"v{declaration['version']}"
    run([str(node), str(pnpm), "install", "--frozen-lockfile", "--ignore-scripts"], ROOT / "node")
    print(run([str(node), "scripts/build_viewer.mjs"]).strip())
    print(run([str(node), "--test", *[str(file) for file in sorted((ROOT / "tests").glob("*.test.mjs"))]]).strip())
    return node


def verify_help(synced_skill_path: Path) -> None:
    """Verify packaged help registration, links and JSON examples; synced_skill_path is the official runtime copy, returns None.
    验证包内帮助注册、链接及 JSON 示例；synced_skill_path 为官方运行时副本，无返回值。
    """
    # Manifest is loaded from the actual synchronized package, not a guessed host API.
    # Manifest 从实际同步包中加载，不使用猜测的宿主 API。
    manifest = yaml.safe_load((synced_skill_path / "skill.yaml").read_text(encoding="utf-8"))
    # Topics and index follow the public help.main/help.topics manifest contract.
    # Topics 和 index 遵循公开 help.main/help.topics 清单契约。
    topics = manifest["help"]["topics"]
    index = synced_skill_path / manifest["help"]["main"]["file"]
    assert [topic["name"] for topic in topics] == ["workspace", "paths", "browse", "edit", "analyze", "export", "workflow", "errors"]
    assert manifest["entries"][0]["help"] == "workspace"
    # IndexText must make every topic discoverable from the main help document.
    # IndexText 必须使每个主题都能从主帮助文档中发现。
    index_text = index.read_text(encoding="utf-8")
    for topic in topics:
        assert f"({Path(topic['file']).name})" in index_text
    for relative in [manifest["help"]["main"]["file"], *[topic["file"] for topic in topics]]:
        # Document and text identify one shipped UTF-8 help document.
        # Document 和 text 标识一份实际分发的 UTF-8 帮助文档。
        document = synced_skill_path / relative
        text = document.read_text(encoding="utf-8")
        assert text == (ROOT / relative).read_text(encoding="utf-8")
        for target in re.findall(r"\]\(([^)]+)\)", text):
            assert (document.parent / target).is_file(), (relative, target)
        for example in re.findall(r"```json\s*\n(.*?)\n```", text, re.DOTALL):
            json.loads(example)
    # ShippedAssets are the overflow template and offline-viewer files the export action reads at runtime.
    # ShippedAssets 是导出操作在运行时读取的溢出模板与离线查看器文件。
    shipped_assets = ["overflow_templates/workspace.md", "resources/viewer.html", "resources/viewer.mjs", "resources/dagre.min.js"]
    for relative in shipped_assets:
        assert (synced_skill_path / relative).is_file(), relative
    print("Synchronized help verified: main index, eight registered topics, links and JSON examples; overflow template and viewer assets present.")


def smoke() -> None:
    """Call all actions through sync/inspect/list-tools/call; no arguments, raise on mismatches.
    通过 sync/inspect/list-tools/call 调用全部操作；无参数，不匹配时抛出错误。
    """
    debug("sync")
    # Inspection exposes the exact synchronized package location in the official debugger protocol.
    # Inspection 通过官方调试器协议暴露准确的同步包位置。
    inspection = debug("inspect")
    verify_help(Path(inspection["synced_skill_path"]))
    # Tools asserts one canonical tool without a duplicated skill prefix.
    # Tools 断言只有一个规范工具名，不重复技能前缀。
    tools = debug("list-tools")
    assert len(tools) == 1 and tools[0]["canonical_name"] == "vulcan-mermaid-workspace"
    assert len(tools[0]["input_schema"]["properties"]["action"]["enum"]) == 9
    assert tools[0]["input_schema"]["required"] == ["action"]
    assert tools[0]["input_schema"]["properties"]["PWD"]["type"] == "string"
    with TemporaryDirectory(prefix="workspace 中文 ", dir=ROOT / ".luaskills-debug") as temporary:
        # Project is deliberately separate from the repository and worker cwd.
        # Project 特意与仓库及工作进程 cwd 分离。
        project = Path(temporary)
        # Arguments avoids shell quoting of the UTF-8 content.
        # Arguments 避免对 UTF-8 内容进行 shell 转义。
        arguments = project / "call.json"

        def invoke(action: str, expected_ok: bool = True, managed: bool = True, **extra: object) -> dict:
            """Invoke action/extra and assert expected_ok; managed adds project PWD, returns decoded Lua content.
            调用 action/extra 并断言 expected_ok；managed 添加项目 PWD，返回解码的 Lua 内容。
            """
            # Request explicitly includes or omits PWD to exercise the two real protocol modes.
            # Request 显式包含或省略 PWD，以验证两种真实协议模式。
            request = {"action": action, **extra}
            if managed:
                request["PWD"] = str(project)
            arguments.write_text(json.dumps(request, ensure_ascii=False), encoding="utf-8")
            # Envelope follows the observed official CallCommandResult structure.
            # Envelope 遵循已观察到的官方 CallCommandResult 结构。
            envelope = debug("call", arguments)
            assert envelope["resolved_tool_name"] == "vulcan-mermaid-workspace"
            # Content is the Lua-returned JSON string, not the host envelope.
            # Content 是 Lua 返回的 JSON 字符串，而非宿主外层结构。
            content = json.loads(envelope["result"]["content"])
            assert content["ok"] is expected_ok, content
            print(f"Official debugger: {'PWD' if managed else 'absolute/text'} {action} {'ok' if expected_ok else 'expected rejection'}", flush=True)
            return content

        assert invoke("tree")["result"]["exists"] is False
        invoke("init")
        invoke("write", writes=[
            {"path": "architecture", "fields": {"description": "# 本地架构\n批量编辑、嵌套导航、离线导出。", "diagram": "graph LR\napi[API] -->|queries| store[旧存储]\nclassDef store fill:#a6e3a1,stroke:#a6e3a1,color:#1e1e2e\nclass store store"}},
            {"path": "architecture/store", "fields": {"description": "持久化边界", "diagram": "graph TD\nwrite[写入] -->|提交| disk[(磁盘)]", "constraint": "- 数据保存在项目 .omm 中\n- 独占锁串行化协作写入"}},
            {"path": "operations", "fields": {"diagram": "graph LR\nref[\"@architecture/store\"] --> report[查看报告]"}},
        ])
        assert len(invoke("tree")["result"]["nodes"]) == 3
        assert invoke("read", path="architecture/store")["result"]["fields"]["description"] == "持久化边界"
        invoke("write", writes=[{"path": "architecture", "fields": {"diagram": "graph LR\napi[API] -->|queries| store[新存储]\nclassDef store fill:#a6e3a1,stroke:#a6e3a1,color:#1e1e2e\nclass store store"}}])
        assert invoke("diff", path="architecture")["result"]["changed_nodes"][0]["after"]["label"] == "新存储"
        assert invoke("diff", before="graph LR\nA-->B", after="graph TD\nA-->B")["result"]["direction_changed"]
        assert invoke("validate")["result"]["valid"]
        assert invoke("refs", path="architecture")["result"]["references"][0]["exists"]
        # Exported verifies the actual file before preserving a reviewable HTML artifact.
        # Exported 在保留可审查 HTML 产物之前验证实际文件。
        exported = Path(invoke("export")["result"]["file"])
        assert exported.is_file() and exported.stat().st_size > 100000
        (ROOT / "dist").mkdir(exist_ok=True)
        shutil.copy2(exported, ROOT / "dist/preview.html")
        # Workspace and absoluteNode reuse physical locations, with PWD deliberately absent from JSON.
        # Workspace 和 absoluteNode 复用物理位置，JSON 中故意不包含 PWD。
        workspace = str(project / ".omm")
        absolute_node = str(project / ".omm/absolute")
        invoke("init", managed=False, path=workspace)
        invoke("write", managed=False, writes=[{"path": absolute_node, "fields": {"diagram": "graph LR\nA[Old]"}}])
        assert invoke("read", managed=False, path=absolute_node)["result"]["absolute_path"] == absolute_node
        assert invoke("tree", managed=False, path=workspace)["workspace"] == workspace
        invoke("write", managed=False, writes=[{"path": absolute_node, "fields": {"diagram": "graph LR\nA[New]"}}])
        assert invoke("diff", managed=False, path=absolute_node)["result"]["changed_nodes"][0]["after"]["label"] == "New"
        assert invoke("diff", managed=False, before="graph LR\nA", after="graph TD\nA")["result"]["direction_changed"]
        assert invoke("validate", managed=False, path=workspace)["result"]["valid"]
        assert invoke("refs", managed=False, path=str(project / ".omm/architecture"))["result"]["references"][0]["exists"]
        assert Path(invoke("export", managed=False, path=workspace)["result"]["file"]).is_file()
        assert Path(invoke("export", managed=False, path=workspace, output=str(project / ".omm-export/absolute.html"))["result"]["file"]).is_file()
        for action in ["tree", "read", "delete", "validate", "refs", "export", "diff", "init"]:
            assert invoke(action, expected_ok=False, managed=False, path="architecture")["error"]["code"] == "ABSOLUTE_PATH_REQUIRED"
        assert invoke("write", expected_ok=False, managed=False, writes=[{"path": "relative", "fields": {"note": "bad"}}])["error"]["code"] == "ABSOLUTE_PATH_REQUIRED"
        assert invoke("export", expected_ok=False, managed=False, path=workspace, output="relative.html")["error"]["code"] == "ABSOLUTE_PATH_REQUIRED"
        invoke("delete", managed=False, path=absolute_node)
        assert not Path(absolute_node).exists()
        assert invoke("write", expected_ok=False, writes=[{"path": "../outside", "fields": {"note": "bad"}}])["error"]["code"] == "INVALID_PATH"
        assert invoke("delete", expected_ok=False, path="architecture")["error"]["code"] == "HAS_CHILDREN"
        invoke("delete", path="architecture", recursive=True)
        assert not (project / ".omm/architecture").exists()
        assert not invoke("validate")["result"]["valid"]
    print("Official debugger full flow passed: one tool, nine actions in both path modes, eight help topics, managed Node, Unicode/space paths.")


if __name__ == "__main__":
    if "--smoke-only" not in sys.argv:
        managed_node()
    smoke()
