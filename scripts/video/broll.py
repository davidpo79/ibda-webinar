"""Generated cutaway b-roll, in the site's palette.

Nothing here is stock footage: every frame is drawn, so the clips are clean
from a licensing point of view and stay on-brand. Pillow is built with Raqm
here, so it applies bidi and shaping itself: Hebrew strings go in unmodified,
with no manual reversal.
"""
import math, os, subprocess
from PIL import Image, ImageDraw, ImageFont

FF = "/usr/local/lib/python3.11/dist-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2"
V = os.environ.get("VIDEO_WORKDIR", "/tmp/vid")
W, H, FPS = 1080, 1920, 30

INK = (13, 11, 7)
WARM = (42, 36, 24)
GOLD = (196, 164, 97)
GOLD_DIM = (120, 100, 58)
CREAM = (247, 253, 255)
GREY = (108, 100, 86)

FONT_B = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def background():
    """Smooth warm diagonal gradient matching the slides."""
    import numpy as np
    yy, xx = np.mgrid[0:H, 0:W]
    k = np.clip(0.55 * (1 - yy / H) + 0.45 * (1 - xx / W), 0, 1) ** 1.4
    arr = np.zeros((H, W, 3), dtype=np.uint8)
    for i in range(3):
        arr[..., i] = (INK[i] + (WARM[i] - INK[i]) * k).astype(np.uint8)
    return Image.fromarray(arr)


def rounded(d, box, r, fill=None, outline=None, width=2):
    d.rounded_rectangle(box, radius=r, fill=fill, outline=outline, width=width)


def encode(frames_dir, out, n):
    subprocess.run(
        f'{FF} -framerate {FPS} -i {frames_dir}/%05d.png -frames:v {n} '
        f'-c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p -y {out}',
        shell=True, check=True, capture_output=True,
    )
    print("wrote", out, n, "frames")


# --------------------------------------------------------------------------
# 1. Tool overload: app cards cascade in, faster and faster, until the grid is
#    crowded. Illustrates "יש בחוץ עשרות כלים, כל שבוע יוצא עוד אחד".
# --------------------------------------------------------------------------
def build_overload(dur=3.45, outdir=f"{V}/br1"):
    os.makedirs(outdir, exist_ok=True)
    n = int(dur * FPS)
    base = background()

    cols, rows = 4, 7
    cw, ch = 210, 150
    gx = (W - cols * cw) // (cols + 1)
    gy = 300
    cells = []
    for r in range(rows):
        for c in range(cols):
            cells.append((gx + c * (cw + gx), gy + r * (ch + 40)))
    # Deterministic shuffle so the fill order looks scattered, not raster.
    cells = [cells[(i * 13) % len(cells)] for i in range(len(cells))]

    dots = [GOLD, (140, 170, 190), (190, 130, 110), (130, 180, 140), CREAM]

    for f in range(n):
        t = f / n
        # ease-in: few cards early, a flood at the end
        shown = int(len(cells) * (t ** 1.9))
        im = base.copy()
        d = ImageDraw.Draw(im)
        for i in range(shown):
            x, y = cells[i]
            # each card pops with a short scale-up
            age = (t ** 1.9) * len(cells) - i
            k = min(1.0, age / 2.5)
            s = 0.72 + 0.28 * k
            w2, h2 = cw * s, ch * s
            cx, cy = x + cw / 2, y + ch / 2
            box = [cx - w2 / 2, cy - h2 / 2, cx + w2 / 2, cy + h2 / 2]
            rounded(d, box, 22, fill=(26, 23, 16), outline=GOLD_DIM, width=2)
            d.ellipse([box[0] + 26, box[1] + 28, box[0] + 62, box[1] + 64],
                      fill=dots[i % len(dots)])
            d.rounded_rectangle([box[0] + 26, box[1] + 84, box[0] + w2 - 40, box[1] + 96],
                                radius=6, fill=GREY)
            d.rounded_rectangle([box[0] + 26, box[1] + 108, box[0] + w2 - 90, box[1] + 118],
                                radius=5, fill=(70, 64, 54))
        im.save(f"{outdir}/{f + 1:05d}.png")
    encode(outdir, f"{V}/broll1.mp4", n)


# --------------------------------------------------------------------------
# 2. Hours burning: a gold ring sweeps while an hour counter spins up.
#    Illustrates "אותן משימות ששורפות לכם את השעות הכי יקרות".
# --------------------------------------------------------------------------
def build_hours(dur=2.80, outdir=f"{V}/br2"):
    os.makedirs(outdir, exist_ok=True)
    n = int(dur * FPS)
    base = background()
    big = ImageFont.truetype(FONT_B, 190)
    small = ImageFont.truetype(FONT_B, 44)

    cx, cy, R = W // 2, 690, 270
    for f in range(n):
        t = f / (n - 1)
        e = 1 - (1 - t) ** 2          # ease-out
        im = base.copy()
        d = ImageDraw.Draw(im)

        d.ellipse([cx - R, cy - R, cx + R, cy + R], outline=(52, 46, 34), width=16)
        d.arc([cx - R, cy - R, cx + R, cy + R], -90, -90 + 360 * e, fill=GOLD, width=16)

        # tick marks
        for i in range(12):
            a = math.radians(i * 30 - 90)
            r1, r2 = R - 44, R - 26
            d.line([cx + r1 * math.cos(a), cy + r1 * math.sin(a),
                    cx + r2 * math.cos(a), cy + r2 * math.sin(a)],
                   fill=(86, 76, 58), width=5)

        hours = int(1 + 37 * e)
        txt = str(hours)
        bb = d.textbbox((0, 0), txt, font=big)
        d.text((cx - (bb[2] - bb[0]) / 2, cy - (bb[3] - bb[1]) / 2 - 40), txt,
               font=big, fill=CREAM)
        lab = "שעות בחודש"
        bb = d.textbbox((0, 0), lab, font=small)
        d.text((cx - (bb[2] - bb[0]) / 2, cy + 105), lab, font=small, fill=GOLD)

        im.save(f"{outdir}/{f + 1:05d}.png")
    encode(outdir, f"{V}/broll2.mp4", n)


if __name__ == "__main__":
    build_overload()
    build_hours()
