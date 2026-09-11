#!/usr/bin/env python3
"""康威生命游戏 安卓图标生成脚本（可复现）

输入：ImageGen 产出的两张 1024x1024 原图
  - icon-source/icon-full.png        整图（深色背景 + 滑翔机）
  - icon-source/icon-foreground.png  前景（自适应图标用，黑底会自动转透明）

处理：
  1. 对称裁剪去掉生成水印（水印固定在右下角）
  2. 前景图黑底转真透明（ImageGen 常返回 RGB 黑底，直接用作前景会出现黑方块）
  3. 生成传统 mipmap PNG（API 24-25 用）
  4. 生成自适应图标前景 PNG（内容缩进安全区，API 26+ 用）

用法：
  python make-icons.py            # 在 android/ 目录下执行
依赖：Pillow（pip install Pillow）
"""

from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent.parent          # android/
SRC = HERE / "icon-source"
RES = HERE / "app" / "src" / "main" / "res"

# 传统图标各密度尺寸（mdpi 基准 48dp）
LEGACY = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}
# 自适应图标前景各密度尺寸（108dp 画布）
FOREGROUND = {
    "mipmap-mdpi": 108,
    "mipmap-hdpi": 162,
    "mipmap-xhdpi": 216,
    "mipmap-xxhdpi": 324,
    "mipmap-xxxhdpi": 432,
}

# 去水印裁剪框（按本项目实测的「主体中心 + 水印位置」标定）
# 整图主体中心 (505, 475)、水印自 y=963 起；前景主体中心 (510, 508)。
# 两个裁剪框的下边界都小于 963，确保右下角水印被完全切掉。
FULL_CROP = (76, 45, 936, 905)      # 860x860，主体约占 60%
FORE_CROP = (70, 68, 950, 948)      # 880x880，主体约占 67%（再缩到 90% 后与传统图标观感一致）


def crop_mark(img: Image.Image, box: tuple) -> Image.Image:
    """对称裁剪，去掉右下角生成水印"""
    return img.crop(box)


def make_transparent(img: Image.Image) -> Image.Image:
    """把黑底原图转成真透明背景。

    ImageGen 生成的前景图常是 RGB 黑底（没有 alpha 通道），直接用作自适应
    图标前景会出现黑色方块。这里用绿通道作 alpha 遮罩：背景黑（G≈0）全透明，
    薄荷绿细胞（G≈242）不透明，同时保留发光边缘的柔和过渡。
    """
    if img.mode == "RGBA" and img.getchannel("A").getextrema()[0] < 255:
        return img                                   # 源图已有透明通道，直接用
    rgb = img.convert("RGB")
    out = rgb.copy()
    out.putalpha(rgb.getchannel("G"))
    return out


def resize_to(img: Image.Image, size: int) -> Image.Image:
    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    full = Image.open(SRC / "icon-full.png").convert("RGB")
    fore = make_transparent(Image.open(SRC / "icon-foreground.png"))

    full_c = crop_mark(full, FULL_CROP)
    fore_c = crop_mark(fore, FORE_CROP)

    # 归档去水印版（512x512，应用商店素材尺寸）
    resize_to(full_c, 512).save(SRC / "store-icon-512.png", optimize=True)

    # 传统图标
    for folder, size in LEGACY.items():
        d = RES / folder
        d.mkdir(parents=True, exist_ok=True)
        resize_to(full_c, size).save(d / "ic_launcher.png", optimize=True)
        print(f"  ic_launcher.png  {folder}  {size}x{size}")

    # 自适应图标前景：内容缩进到安全区（约 60% 画布宽）
    for folder, size in FOREGROUND.items():
        d = RES / folder
        d.mkdir(parents=True, exist_ok=True)
        canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        inner = round(size * 0.90)
        small = resize_to(fore_c, inner)
        off = (size - inner) // 2
        canvas.alpha_composite(small, (off, off))
        canvas.save(d / "ic_launcher_foreground.png", optimize=True)
        print(f"  ic_launcher_foreground.png  {folder}  {size}x{size}")

    print("图标生成完成")


if __name__ == "__main__":
    main()
