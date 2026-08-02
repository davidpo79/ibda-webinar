import subprocess, os

FF = "/usr/local/lib/python3.11/dist-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2"
V = os.environ.get("VIDEO_WORKDIR", "/tmp/vid")

# Text is drawn through libass rather than PIL: this ffmpeg build has libfribidi,
# so Hebrew gets correct bidi ordering for free. PIL has no bidi here.
ASS_HEAD = """[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Eyebrow,DejaVu Sans,36,&H0061A4C4,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,6,0,0,0,0
Style: Bullet,DejaVu Sans,54,&H00F7FDFF,&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,0,0,6,0,0,0,0
Style: Dot,DejaVu Sans,54,&H0061A4C4,&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,0,0,6,0,0,0,0
Style: Big,DejaVu Sans,92,&H00F7FDFF,&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,0,0,5,0,0,0,0
Style: Mid,DejaVu Sans,58,&H0061A4C4,&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,0,0,5,0,0,0,0
Style: Small,DejaVu Sans,40,&H00BBD0D9,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,5,0,0,0,0

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""


# Force an RTL base direction: this libass runs FriBidi in SIMPLE mode with an
# LTR base, which puts a leading number like "13" on the wrong side of a Hebrew
# line and pushes sentence-final punctuation to the right.
RLE, PDF = "\u202b", "\u202c"


def write_ass(path, lines):
    body = "".join(
        f"Dialogue: 0,0:00:00.00,0:00:20.00,{style},,0,0,0,,{{\\pos({x},{y})}}{RLE}{text}{PDF}\n"
        for style, x, y, text in lines
    )
    open(path, "w", encoding="utf-8").write(ASS_HEAD + body)


def render(ass, out, extra_vf=""):
    # Warm off-centre gradient + a hairline gold rule down the right edge, the
    # same treatment the site uses on its dark sections.
    run = (
        f'{FF} -f lavfi -i "gradients=s=1080x1920:c0=0x2A2418:c1=0x0D0B07:'
        f'x0=760:y0=180:x1=180:y1=1740:nb_colors=2:d=1" -frames:v 1 '
        f'-vf "drawbox=x=1071:y=0:w=4:h=1920:color=0xC4A461@0.85:t=fill,'
        f'drawbox=x=0:y=0:w=4:h=1920:color=0xC4A461@0.35:t=fill,'
        f'{extra_vf}'
        f'subtitles={ass}:fontsdir=/usr/share/fonts,format=rgb24" -y {out}'
    )
    r = subprocess.run(run, shell=True, capture_output=True, text=True)
    if r.returncode != 0:
        print(r.stderr[-1500:])
        raise SystemExit(1)
    print("wrote", out)


# --- slide 1: what the workshop covers -------------------------------------
RIGHT = 960          # right margin for RTL text
DOT_X = 995          # gold bullet sits outside the text column
BULLETS = [
    "מה כל כלי באמת יודע לעשות",
    "איפה הוא חזק, ואיפה פחות",
    "איך מטמיעים אותו ביום-יום",
]
lines = [("Eyebrow", RIGHT, 700, "מה נעשה בסדנה")]
for i, b in enumerate(BULLETS):
    y = 830 + i * 130
    lines.append(("Dot", DOT_X, y, "•"))
    lines.append(("Bullet", RIGHT, y, b))
write_ass(f"{V}/s1.ass", lines)
render(f"{V}/s1.ass", f"{V}/slide_list.png")

# --- slide 2: the date ------------------------------------------------------
write_ass(
    f"{V}/s2.ass",
    [
        ("Eyebrow", 540, 760, "הסדנה"),
        ("Big", 540, 900, "13 באוגוסט"),
        ("Big", 540, 1010, "10:00"),
        ("Mid", 540, 1140, "שעתיים"),
        ("Small", 540, 1215, "בלי תיאוריות באוויר"),
    ],
)
render(f"{V}/s2.ass", f"{V}/slide_date.png")

# --- slide 3: "עובד באמת" vs "גימיק" ----------------------------------------
# Two-column comparison, for the "מיתוס בכותרת" script: pairs with the line
# "איפה הוא חוסך לכם שעה, ואיפה הוא פשוט גימיק".
COMPARE_HEAD = ASS_HEAD.replace(
    "Style: Bullet,DejaVu Sans,54,&H00F7FDFF,&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,0,0,6,0,0,0,0",
    "Style: Bullet,DejaVu Sans,38,&H00F7FDFF,&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,0,0,6,0,0,0,0",
).replace(
    # Both column headers share one size/weight so they read as a pair; only
    # the color tells them apart (gold = the real answer, muted = the myth).
    # Must land in [V4+ Styles], i.e. before [Events] - appending after the
    # full header (as a first attempt did) drops these lines into [Events]
    # instead, where libass silently falls back to a tiny default size.
    "[Events]",
    "Style: HeadGold,DejaVu Sans,48,&H0061A4C4,&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,0,0,5,0,0,0,0\n"
    "Style: HeadMuted,DejaVu Sans,48,&H00A0A0A0,&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,0,0,5,0,0,0,0\n"
    "\n[Events]",
)


def write_compare_ass(path, lines):
    body = "".join(
        f"Dialogue: 0,0:00:00.00,0:00:20.00,{style},,0,0,0,,{{\\pos({x},{y})}}{RLE}{text}{PDF}\n"
        for style, x, y, text in lines
    )
    open(path, "w", encoding="utf-8").write(COMPARE_HEAD + body)


# Bullet style is right-aligned (Alignment 6): the anchor x is the text's
# RIGHT edge, and it grows leftward from there. Anchors sit near each box's
# right-hand edge, with the item text kept short enough to stay inside the
# box's left bound.
GOOD_BOX = (520, 1020)   # right column: "עובד באמת" (RTL reading order starts right)
BAD_BOX = (60, 520)      # left column: "גימיק"
GOOD_COL = GOOD_BOX[1] - 40
BAD_COL = BAD_BOX[1] - 20
GOOD_ITEMS = ["טיוטה ראשונה", "סיכום מסמכים", "עריכת נוסח"]
BAD_ITEMS = ["ייעוץ מוגמר", "החלטה סופית", "הבטחת קסם"]

lines3 = [
    ("Eyebrow", 540, 560, "איפה AI באמת עוזר"),
    ("HeadGold", (GOOD_BOX[0] + GOOD_BOX[1]) // 2, 700, "עובד באמת"),
    ("HeadMuted", (BAD_BOX[0] + BAD_BOX[1]) // 2, 700, "גימיק"),
]
for i, (g, b) in enumerate(zip(GOOD_ITEMS, BAD_ITEMS)):
    y = 820 + i * 150
    lines3.append(("Bullet", GOOD_COL, y, g))
    lines3.append(("Bullet", BAD_COL, y, b))
write_compare_ass(f"{V}/s3.ass", lines3)
# subtle color wash behind each column: warm gold tint on the right (good),
# flat grey tint on the left (gimmick) - drawn before the text layer.
compare_vf = (
    "drawbox=x=520:y=640:w=500:h=620:color=0xC4A461@0.07:t=fill,"
    "drawbox=x=60:y=640:w=460:h=620:color=0x666666@0.10:t=fill,"
    "drawbox=x=540:y=640:w=2:h=620:color=0xC4A461@0.5:t=fill,"
)
render(f"{V}/s3.ass", f"{V}/slide_compare.png", extra_vf=compare_vf)
