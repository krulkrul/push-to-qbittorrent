#!/usr/bin/env python3
"""Generate extension icons using Pillow."""
from PIL import Image, ImageDraw
import math, os

def make_icon(size):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    cx, cy = size / 2, size / 2
    r = size / 2 - 1

    # Background circle
    draw.ellipse([1, 1, size - 2, size - 2], fill=(30, 30, 30, 255))

    # Ring
    ring_w = max(2, int(size * 0.09))
    draw.ellipse([1, 1, size - 2, size - 2], outline=(79, 195, 247, 255), width=ring_w)

    # Downward arrow
    aw  = int(size * 0.18)   # half stem width
    ah  = int(size * 0.42)   # total arrow height
    hh  = int(ah * 0.38)     # arrowhead height
    hw  = int(size * 0.30)   # arrowhead half-width
    top = int(cy - ah / 2)
    mid = int(cy + ah / 2 - hh)
    bot = int(cy + ah / 2)

    # stem
    draw.rectangle(
        [int(cx - aw), top, int(cx + aw), mid],
        fill=(255, 255, 255, 255)
    )
    # arrowhead
    draw.polygon(
        [(int(cx - hw), mid), (int(cx + hw), mid), (int(cx), bot)],
        fill=(255, 255, 255, 255)
    )
    return img

os.makedirs("icons", exist_ok=True)
for sz in (16, 32, 48, 96):
    img = make_icon(sz)
    img.save(f"icons/icon{sz}.png", "PNG")
    print(f"wrote icons/icon{sz}.png")
