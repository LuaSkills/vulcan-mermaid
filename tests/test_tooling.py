"""
Test release-version validation used by the tag release scripts.
测试标签发布脚本使用的发布版本校验。
"""

from __future__ import annotations

from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from scripts.release_version import normalize_requested_version, resolve_release_tag


class ReleaseVersionTests(unittest.TestCase):
    """
    Verify that release tags follow the skill.yaml version.
    验证发布标签与 skill.yaml 版本一致。
    """

    def test_release_version_must_match_manifest(self) -> None:
        """
        Confirm that release tags accept only the exact semantic manifest version.
        确认发布标签只接受与清单精确一致的语义化版本。

        Returns:
            None after valid forms pass and mismatched or malformed forms fail.
            有效形式通过且不匹配或畸形形式失败后返回空值。
        """
        with TemporaryDirectory() as temporary_directory:
            # Root owns the isolated release manifest used by the resolver.
            # Root 是解析器使用的隔离发布清单所属根目录。
            root = Path(temporary_directory) / "demo-skill"
            root.mkdir()
            (root / "skill.yaml").write_text(
                "name: Demo\nversion: 1.2.3\n",
                encoding="utf-8",
            )
            self.assertEqual("v1.2.3", resolve_release_tag(root, "1.2.3"))
            self.assertEqual("v1.2.3", resolve_release_tag(root, "v1.2.3"))
            with self.assertRaisesRegex(RuntimeError, "does not match"):
                resolve_release_tag(root, "1.2.4")
            with self.assertRaisesRegex(RuntimeError, "exact semantic version"):
                normalize_requested_version("latest")


if __name__ == "__main__":
    unittest.main()
