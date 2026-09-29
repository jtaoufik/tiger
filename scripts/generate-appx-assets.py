#!/usr/bin/env python3
"""Generate the Microsoft Store (appx) tile assets electron-builder looks for in
build/appx/ (packager.getResource(undefined, 'appx'), see AppxTarget.js). Source is
build/icon.png (1024x1024, transparent corners). Run after scripts/generate-icon.sh,
or standalone: python3 scripts/generate-appx-assets.py

Icon tiles (StoreLogo/Square44x44/Square150x150/Wide310x150/LargeTile/SmallTile) keep a
transparent background - Windows composites them over the appx manifest's
backgroundColor (set to the brand accent in package.json's build.appx.backgroundColor).
SplashScreen is always opaque per Store guidance, so its background is baked in.

Scale-200 variants are only generated for the four logos Microsoft's own template
ships in multiple scales (StoreLogo, Square44x44Logo, Square150x150Logo,
Wide310x150Logo); electron-builder only switches into its (Windows-only) makepri.exe
path when it sees a ".scale-" or ".targetsize-" filename, so this doubles as the
complete list of assets that can safely carry a scale suffix.
"""
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parent.parent
src = Image.open(root / 'build' / 'icon.png').convert('RGBA')
out_dir = root / 'build' / 'appx'
out_dir.mkdir(parents=True, exist_ok=True)

BRAND = (255, 106, 26, 255)  # #ff6a1a, --accent in website/styles.css


def tile(size, pad_ratio=0.18, bg=None):
    w, h = (size, size) if isinstance(size, int) else size
    canvas = Image.new('RGBA', (w, h), bg or (0, 0, 0, 0))
    short_side = min(w, h)
    icon_side = int(short_side * (1 - pad_ratio * 2))
    icon = src.resize((icon_side, icon_side), Image.LANCZOS)
    canvas.paste(icon, ((w - icon_side) // 2, (h - icon_side) // 2), icon)
    return canvas


# name -> (base size, also emit .scale-200 at 2x)
LOGOS = {
    'StoreLogo.png': ((50, 50), True),
    'Square44x44Logo.png': ((44, 44), True),
    'Square150x150Logo.png': ((150, 150), True),
    'Wide310x150Logo.png': ((310, 150), True),
    'LargeTile.png': ((310, 310), False),
    'SmallTile.png': ((71, 71), False),
}

for name, (size, scale200) in LOGOS.items():
    tile(size).save(out_dir / name)
    if scale200:
        w, h = size
        scaled_name = name.replace('.png', '.scale-200.png')
        tile((w * 2, h * 2)).save(out_dir / scaled_name)

# SplashScreen: opaque brand background, no scale variant needed - 620x300 is already
# electron-builder's default (200%-scale) splash size.
tile((620, 300), pad_ratio=0.3, bg=BRAND).save(out_dir / 'SplashScreen.png')

print('Generated:', sorted(p.name for p in out_dir.iterdir()))
