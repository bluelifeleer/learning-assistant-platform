"""一次性脚本:用控制台新 Logo(渐变蓝底 + 书本 + 播放三角)重新生成扩展的 4 个 PNG 图标。

用法:python scripts/regen-extension-icons.py
依赖:系统 Python 的 Pillow(不进入项目依赖)。
"""

from pathlib import Path

from PIL import Image, ImageDraw

ASSETS = Path(__file__).resolve().parent.parent / "apps" / "extension" / "assets"
SIZES = (16, 32, 48, 128)
TOP = (59, 130, 246)  # #3B82F6
BOTTOM = (30, 64, 175)  # #1E40AF
ACCENT = (37, 99, 235)  # #2563EB

# Logo 图形坐标(与 apps/console/public/favicon.svg 同一 32x32 坐标系)
BOOK = [
    (8, 8.2), (10, 7.7), (12, 7.6), (14, 8.2), (16, 9.2),
    (18, 8.2), (20, 7.6), (22, 7.7), (24, 8.2),
    (24, 19.8), (22, 19.4), (20, 19.3), (18, 19.7), (16, 20.8),
    (14, 19.7), (12, 19.3), (10, 19.4), (8, 19.8),
]
SPINE = ((16, 9.4), (16, 20.6))
PLAY = [(17.9, 11.9), (21.7, 14.2), (17.9, 16.5)]


def rounded_gradient(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size))
    for y in range(size):
        t = y / (size - 1)
        color = tuple(round(TOP[i] + (BOTTOM[i] - TOP[i]) * t) for i in range(3))
        ImageDraw.Draw(img).line([(0, y), (size, y)], fill=color)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=size * 8 / 32, fill=255)
    img.putalpha(mask)
    return img


def render(size: int) -> Image.Image:
    scale = size * 4 / 32
    icon = Image.new("RGBA", (size * 4, size * 4), (0, 0, 0, 0))
    draw = ImageDraw.Draw(icon)
    draw.polygon([(x * scale, y * scale) for x, y in BOOK], fill=(255, 255, 255, 255))
    draw.line([(x * scale, y * scale) for x, y in SPINE], fill=ACCENT, width=max(1, round(1.1 * scale)))
    draw.polygon([(x * scale, y * scale) for x, y in PLAY], fill=ACCENT)
    base = rounded_gradient(size * 4)
    base.alpha_composite(icon)
    return base.resize((size, size), Image.LANCZOS)


def main() -> None:
    for size in SIZES:
        out = ASSETS / f"icon-{size}.png"
        render(size).save(out)
        print(f"written {out}")


if __name__ == "__main__":
    main()
