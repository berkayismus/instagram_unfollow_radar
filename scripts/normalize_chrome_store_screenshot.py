#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Chrome Web Store büyük ekran görüntüsü: sabit 1280×800 tuval.

Ham popup yakalaması farklı çözünürlükteyse, oran korunur; boş alanlar
icon-assets ile uyumlu turuncu→mor dikey gradient ile doldurulur.

Kullanım:
  python3 scripts/normalize_chrome_store_screenshot.py assets/screenshots/screenshot_04_watch.png
  python3 scripts/normalize_chrome_store_screenshot.py giris.png cikis.png
"""

from __future__ import annotations

import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print('Pillow gerekli: pip install Pillow', file=sys.stderr)
    sys.exit(1)

STORE_W = 1280
STORE_H = 800

# icon-assets.mdc — Instagram gradient uçları
_GRAD_TOP = (0xF5, 0x85, 0x29)
_GRAD_BOTTOM = (0x83, 0x3A, 0xB4)


def _gradient_background(width: int, height: int) -> Image.Image:
    strip = Image.new('RGB', (1, height))
    px = strip.load()
    for y in range(height):
        t = y / (height - 1) if height > 1 else 0.0
        r = int(_GRAD_TOP[0] * (1 - t) + _GRAD_BOTTOM[0] * t)
        g = int(_GRAD_TOP[1] * (1 - t) + _GRAD_BOTTOM[1] * t)
        b = int(_GRAD_TOP[2] * (1 - t) + _GRAD_BOTTOM[2] * t)
        px[0, y] = (r, g, b)
    return strip.resize((width, height), Image.Resampling.NEAREST)


def normalize(input_path: Path, output_path: Path) -> None:
    fg = Image.open(input_path).convert('RGBA')
    if fg.size == (STORE_W, STORE_H):
        fg.convert('RGB').save(output_path, 'PNG', optimize=True)
        print(f'{input_path}: zaten {STORE_W}×{STORE_H} → {output_path}')
        return

    scale = min(STORE_W / fg.width, STORE_H / fg.height)
    nw = max(1, int(round(fg.width * scale)))
    nh = max(1, int(round(fg.height * scale)))
    fg_resized = fg.resize((nw, nh), Image.Resampling.LANCZOS)

    canvas = _gradient_background(STORE_W, STORE_H).convert('RGBA')
    x = (STORE_W - nw) // 2
    y = (STORE_H - nh) // 2
    canvas.paste(fg_resized, (x, y), fg_resized)
    canvas.convert('RGB').save(output_path, 'PNG', optimize=True)
    print(f'{input_path} → {output_path} ({STORE_W}×{STORE_H}), içerik {nw}×{nh} ortalanmış')


def main() -> None:
    if len(sys.argv) < 2:
        print(
            f'Kullanım: {sys.argv[0]} <giris.png> [cikis.png]',
            file=sys.stderr
        )
        sys.exit(1)
    inp = Path(sys.argv[1])
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else inp
    if not inp.is_file():
        print(f'Dosya yok: {inp}', file=sys.stderr)
        sys.exit(1)
    normalize(inp, out)


if __name__ == '__main__':
    main()
