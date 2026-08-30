#!/usr/bin/env python3
"""Build a deterministic Chrome Web Store ZIP from an explicit allowlist."""

from __future__ import annotations

import argparse
import json
import os
import tempfile
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
FIXED_TIMESTAMP = (2020, 1, 1, 0, 0, 0)
RELEASE_PATHS = (
    Path("manifest.json"),
    Path("src"),
    Path("assets/icons"),
    Path("locales"),
    Path("vendor"),
)


def release_files() -> list[Path]:
    files: list[Path] = []
    for relative in RELEASE_PATHS:
        source = ROOT / relative
        if not source.exists():
            raise FileNotFoundError(f"Required release path is missing: {relative}")
        if source.is_file():
            files.append(relative)
        else:
            files.extend(
                path.relative_to(ROOT)
                for path in source.rglob("*")
                if path.is_file()
                and "__pycache__" not in path.parts
                and not any(part.startswith(".") for part in path.relative_to(ROOT).parts)
            )
    return sorted(set(files), key=lambda item: item.as_posix())


def default_output() -> Path:
    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    version = manifest["version"]
    return ROOT / "dist" / f"instagram-unfollow-radar-{version}.zip"


def write_zip(output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{output.name}.", suffix=".tmp", dir=output.parent
    )
    os.close(descriptor)
    temporary = Path(temporary_name)

    try:
        with zipfile.ZipFile(
            temporary, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9
        ) as archive:
            for relative in release_files():
                info = zipfile.ZipInfo(relative.as_posix(), FIXED_TIMESTAMP)
                info.compress_type = zipfile.ZIP_DEFLATED
                info.create_system = 3
                info.external_attr = (0o100644 & 0xFFFF) << 16
                archive.writestr(
                    info,
                    (ROOT / relative).read_bytes(),
                    compress_type=zipfile.ZIP_DEFLATED,
                    compresslevel=9,
                )
        temporary.replace(output)
        output.chmod(0o644)
    finally:
        if temporary.exists():
            temporary.unlink()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output",
        type=Path,
        help="Output ZIP path (defaults to dist/<name>-<manifest version>.zip)",
    )
    args = parser.parse_args()
    output = args.output.resolve() if args.output else default_output()
    write_zip(output)
    print(output)


if __name__ == "__main__":
    main()
