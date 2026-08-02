# Vertical marketing video builder. See docs/video-production.md for the full
# spec: timeline, caption rules, the RTL pitfalls and the audio levels.
#
# Paths come from the environment so the scripts can run anywhere:
#   VIDEO_WORKDIR  scratch + asset directory   (default /tmp/vid)
#   VIDEO_SOURCES  directory holding the raw hook/body clips
import subprocess, os, sys
from PIL import ImageFont

FF = "/usr/local/lib/python3.11/dist-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2"
U = os.environ.get("VIDEO_SOURCES", "")
V = os.environ.get("VIDEO_WORKDIR", "/tmp/vid")

BODY_SRC = f"{U}/4d75c507-c75ab18e044645aebfeeef0d704a4f9f.mp4"
BODY_DUR = 69.39
XF = 0.45          # dissolve between hook and body
CTA_DUR = 3.0
CTA_XF = 0.5

# Licensed background track supplied by the client (BlueTreeAudio, royalty-free).
MUSIC = f"{V}/mus/track.wav"

# Each hook is cut to just past its last word. The originals carry 0.6-1.4s of
# dead frames at the end, which is what made the joint feel abrupt.
HOOKS = {
    "1": dict(
        file=f"{U}/3c2d69c5-dbc9f9acb68346ee8d53244b347a1cec.mp4",
        trim=17.20,
        subs=[
            (0.59, 4.75, "אתם כבר מבינים שבינה מלאכותית\\Nנכנסת חזק לעולם המשפט", 0),
            (4.75, 8.41, "הבעיה היא שיש כאן\\Nהצפה מטורפת של מידע", 1),
            (8.41, 11.25, "באיזה כלי להשתמש? מה חדש יותר?", 0),
            (11.77, 15.73, "מה נותן את המענה הכי טוב\\Nעבורנו כעורכי דין?", 0),
            (15.95, 17.10, "בואו נעשה סדר", 1),
        ],
    ),
    "2": dict(
        file=f"{U}/b99c4c7a-6915dabaf73143b1b07fa3c07dbc7659.mp4",
        # Cut just after "המקצוע שלנו": the "יאללה בואו" beat and the head tilt
        # that came with it are dropped.
        trim=14.75,
        subs=[
            (0.34, 4.92, "הרבה בטוחים שבשביל לעבוד עם בינה\\Nמלאכותית צריך רקע טכנולוגי", 0),
            (5.12, 6.18, "האמת היא בדיוק הפוכה", 1),
            (6.68, 10.56, "הכלים האלה עובדים הכי טוב\\Nכשנותנים להם הנחיה מדויקת", 0),
            (11.04, 14.48, "ולנסח מילים בצורה מדויקת,\\Nזה בדיוק המקצוע שלנו", 1),
        ],
    ),
    "3": dict(
        file=f"{U}/e7f1d2c6-097a691266904de5ae02287dee445c05.mov",
        trim=13.70,
        subs=[
            (0.50, 6.22, "שאלה קטנה: כמה שעות הלכו לכם החודש\\Nרק על ניסוחים, סיכומים ובדיקה של מסמכים?", 0),
            (6.76, 9.80, "עכשיו תחשבו מה קורה ליומן שלכם", 0),
            (9.80, 13.45, "כשחלק גדול מהעבודה הזאת\\Nיכול להיעשות בלעדיכם", 1),
        ],
    ),
}

# Slide windows, in body-local seconds. Captions are suppressed inside them
# because the slide carries the same words.
SLIDE1 = (35.30, 39.70, f"{V}/slide_list.png")
SLIDE2 = (52.20, 56.10, f"{V}/slide_date.png")

# Generated cutaways (see broll.py). Captions keep running over them, since the
# voiceover continues underneath.
BROLL1 = (15.90, 19.33, f"{V}/broll1.mp4")   # "יש בחוץ עשרות כלים"
BROLL2 = (49.30, 52.10, f"{V}/broll2.mp4")   # "ששורפות לכם את השעות הכי יקרות"

BODY_SUBS = [
    (0.46, 4.48, "ואם עוד לא נכנסתם לזה לעומק,\\Nזה ממש לא כי נשארתם מאחור", 1),
    (4.66, 9.46, "זה פשוט כי אין לכם זמן לבזבז על ניסוי\\Nוטעייה, כשיש לכם תיקים לנהל", 0),
    (10.00, 13.54, "רוב עורכי הדין שאני מדברת איתם\\Nלא באמת נרתעים מבינה מלאכותית", 0),
    (13.92, 15.46, "הם פשוט לא יודעים מאיפה להתחיל", 1),
    (15.90, 17.24, "יש בחוץ עשרות כלים", 0),
    (17.40, 19.36, "כל שבוע יוצא עוד כלי חדש", 0),
    (19.88, 25.36, "ואף אחד לא עוצר כדי להגיד לכם ביושר\\Nאיזה מהם באמת מחזיק מים בעבודה משפטית", 0),
    (25.36, 26.80, "ומה זה סתם גימיק", 1),
    (26.80, 28.94, "בדיוק בשביל זה יצרתי את הסדנה", 0),
    (29.34, 31.26, "אני עורכת הדין יפעת בן דוד עמית", 1),
    (31.34, 35.20, "ובסדנה ״העתיד כבר כאן״\\Nאנחנו עוברים תכל׳ס על הכלים עצמם", 0),
    # 35.30-39.70 = slide 1
    (39.82, 40.90, "והכי חשוב:", 1),
    (40.96, 42.82, "איך מפעילים אותם ביום-יום", 0),
    (42.82, 44.40, "על המשימות שאתם עושים היום ידנית", 0),
    (44.86, 48.92, "איך ממש מטמיעים את הכלים\\Nבעבודה היום-יומית שלכם", 0),
    (49.30, 52.10, "על אותן משימות ששורפות לכם\\Nאת השעות הכי יקרות", 1),
    # 52.20-56.10 = slide 2
    (56.28, 57.42, "בלי תיאוריות באוויר", 0),
    (57.76, 59.90, "בלי הרצאות כלליות על העתיד של המקצוע", 0),
    (60.28, 65.60, "אתם יוצאים מהסדנה עם כלים שאתם\\Nפותחים כבר למחרת בבוקר במשרד", 0),
    (65.60, 67.08, "ומתחילים לעבוד איתם", 1),
    (67.60, 68.90, "יאללה, בואו, ניפגש", 1),
]

ASS_HEAD = """[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: W,DejaVu Sans,60,&H00FFFDF7,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,5,2,8,90,90,1080,0
Style: G,DejaVu Sans,60,&H0061A4C4,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,5,2,8,90,90,1080,0

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""

# libass here runs FriBidi in SIMPLE mode with an LTR base direction, so a
# trailing "?" or "." lands on the right-hand side of a Hebrew line instead of
# the left. Wrapping each visual line in RLE..PDF forces an RTL base direction
# and puts sentence-final punctuation where it belongs. Verified by comparing
# the rendered glyph at each end of the line against a standalone "?" render.
RLE, PDF = "‫", "‬"


def rtl(text):
    return "\\N".join(RLE + part + PDF for part in text.split("\\N"))


# Captions are capped at two lines. libass would otherwise wrap a long line to
# three or four by itself. Measurement is done with Pillow against the same
# font file; libass renders DejaVu at roughly 0.85x the em width Pillow
# reports, so the Pillow budget below (1010) lands just under the 900px of
# usable width left by the 90px side margins. Calibrated by rendering a known
# string through libass and comparing ink widths.
_MEASURE = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 60)
MAXW = 1010


def _wrap2(text):
    """Balanced two-line split. Returns (lines, widest line)."""
    if _MEASURE.getlength(text) <= MAXW:
        return [text], _MEASURE.getlength(text)
    words = text.split()
    best = None
    for i in range(1, len(words)):
        a, b = " ".join(words[:i]), " ".join(words[i:])
        m = max(_MEASURE.getlength(a), _MEASURE.getlength(b))
        if best is None or m < best[1]:
            best = ([a, b], m)
    return best if best else ([text], _MEASURE.getlength(text))


def fit_events(st, en, text, gold):
    """Two lines or fewer. Anything that still overflows becomes two
    consecutive captions, split at a word boundary near the middle and given a
    share of the time slot proportional to its length."""
    lines, widest = _wrap2(text)
    words = text.split()
    if widest <= MAXW or len(words) < 2:
        return [(st, en, "\\N".join(lines), gold)]
    k = len(words) // 2
    a, b = " ".join(words[:k]), " ".join(words[k:])
    mid = st + (en - st) * len(a) / (len(a) + len(b))
    return fit_events(st, mid, a, gold) + fit_events(mid, en, b, gold)

NORM = ("scale=1080:1920:force_original_aspect_ratio=increase,"
        "crop=1080:1920,fps=30,setsar=1,format=yuv420p")

# Slow breathing zoom plus a lazy drift, so a static tripod shot still has some
# life in it. Supersampled first so the crop stays sharp at 1.1x.
CAMERA = (
    "scale=1620:2880:flags=bicubic,"
    "zoompan=z='1.075+0.055*sin(2*PI*on/(30*11))+0.02*sin(2*PI*on/(30*4.3))':"
    "x='iw/2-(iw/zoom/2)+26*sin(2*PI*on/(30*17))':"
    "y='ih/2-(ih/zoom/2)+30*sin(2*PI*on/(30*23))':"
    "d=1:s=1080x1920:fps=30,format=yuv420p"
)


def ts(t):
    h = int(t // 3600); m = int(t % 3600 // 60); s = t % 60
    return f"{h}:{m:02d}:{s:05.2f}"


def build_ass(path, events):
    out = [ASS_HEAD]
    for st, en, txt, gold in events:
        flat = " ".join(txt.split("\\N"))
        for a, b, line, g in fit_events(st, en, flat, gold):
            out.append(f"Dialogue: 0,{ts(a)},{ts(b)},{'G' if g else 'W'},,0,0,0,,{rtl(line)}\n")
    open(path, "w", encoding="utf-8").write("".join(out))


def run(cmd, label):
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if r.returncode != 0:
        print("FAIL:", label)
        print(r.stderr[-2500:])
        raise SystemExit(1)


def overlay_chain(idx, start, dur, total, fade=0.35):
    """Transparent-padded overlay track so a slide or cutaway fades in and out
    on the main timeline without any framesync guesswork."""
    rest = max(0.0, total - start - dur)
    return (
        f"[{idx}:v]scale=1080:1920,fps=30,format=yuva420p,"
        f"fade=t=in:st=0:d={fade}:alpha=1,fade=t=out:st={dur - fade:.2f}:d={fade}:alpha=1,"
        f"tpad=start_duration={start:.2f}:start_mode=add:"
        f"stop_duration={rest:.2f}:stop_mode=add:color=0x00000000[ov{idx}]"
    )


# --- one-time assets --------------------------------------------------------
if not os.path.exists(f"{V}/body.mp4"):
    run(f'{FF} -i "{BODY_SRC}" -vf "{NORM}" -c:v libx264 -preset medium -crf 20 '
        f'-c:a aac -b:a 160k -ar 44100 -ac 2 -y {V}/body.mp4', "body")

if not os.path.exists(f"{V}/cta.mp4"):
    run(f'{FF} -loop 1 -i {V}/slide_cta.png -f lavfi -i anullsrc=r=44100:cl=stereo '
        f'-t {CTA_DUR} -vf "fps=30,setsar=1,format=yuv420p" -c:v libx264 -preset medium '
        f'-crf 20 -c:a aac -b:a 160k -shortest -y {V}/cta.mp4', "cta")

only = sys.argv[1:] or list(HOOKS)

for key in only:
    h = HOOKS[key]
    trim = h["trim"]
    off = trim - XF                     # where body-local time 0 lands
    main = off + BODY_DUR               # length before the CTA card
    total = main + CTA_DUR - CTA_XF

    hook_norm = f"{V}/hk{key}.mp4"
    if not os.path.exists(hook_norm):
        run(f'{FF} -i "{h["file"]}" -t {trim} -vf "{NORM}" -c:v libx264 -preset veryfast '
            f'-crf 20 -c:a aac -b:a 160k -ar 44100 -ac 2 -y {hook_norm}', f"hook {key}")

    events = list(h["subs"]) + [(s + off, e + off, t, g) for (s, e, t, g) in BODY_SUBS]
    ass = f"{V}/sb{key}.ass"
    build_ass(ass, events)

    # (input index, start, end, source, fade) for every cutaway, in body-local
    # seconds shifted onto the joined timeline.
    # Input order below is 0=hook 1=body 2=slide1 3=slide2 4=cta 5=broll1 6=broll2.
    cuts = [
        (2, SLIDE1[0] + off, SLIDE1[1] + off, SLIDE1[2], 0.35),
        (3, SLIDE2[0] + off, SLIDE2[1] + off, SLIDE2[2], 0.35),
        (5, BROLL1[0] + off, BROLL1[1] + off, BROLL1[2], 0.25),
        (6, BROLL2[0] + off, BROLL2[1] + off, BROLL2[2], 0.25),
    ]

    chains = ";".join(overlay_chain(i, a, b - a, main, f) for i, a, b, _, f in cuts)
    overlays = ""
    prev = "base"
    for n, (i, a, b, _, _) in enumerate(cuts, start=1):
        tag = f"o{n}"
        overlays += f"[{prev}][ov{i}]overlay=0:0:enable='between(t,{a:.2f},{b:.2f})'[{tag}];"
        prev = tag

    fc = (
        f"[0:v][1:v]xfade=transition=fadeblack:duration={XF}:offset={trim - XF:.2f}[j];"
        f"[j]{CAMERA}[base];"
        + chains + ";"
        + overlays
        + f"[{prev}]subtitles={ass}:fontsdir=/usr/share/fonts,settb=1/30[sv];"
        f"[4:v]fps=30,settb=1/30[ct];"
        f"[sv][ct]xfade=transition=fadeblack:duration={CTA_XF}:offset={main - CTA_XF:.2f}[v];"
        f"[0:a][1:a]acrossfade=d={XF}[a1];"
        f"[a1][4:a]acrossfade=d={CTA_XF}[a]"
    )

    if not os.path.exists(f"{V}/cut{key}.mp4"):
      run(
        f'{FF} -i {hook_norm} -i {V}/body.mp4 '
        f'-loop 1 -framerate 30 -t {cuts[0][2] - cuts[0][1]:.2f} -i {SLIDE1[2]} '
        f'-loop 1 -framerate 30 -t {cuts[1][2] - cuts[1][1]:.2f} -i {SLIDE2[2]} '
        f'-i {V}/cta.mp4 -i {BROLL1[2]} -i {BROLL2[2]} '
        f'-filter_complex "{fc}" -map "[v]" -map "[a]" '
        f'-c:v libx264 -preset veryfast -crf 20 -c:a aac -b:a 192k -ar 44100 -ac 2 '
        f'-y {V}/cut{key}.mp4',
        f"cut {key}",
      )
    print(f"video {key}: cut done ({total:.2f}s)", flush=True)

    fade_at = max(0.0, total - 3.0)
    # Shutter lands in the middle of the dip to black, so the click and the
    # darkest frame coincide.
    click_ms = int((trim - XF / 2) * 1000)
    run(
        f'{FF} -i {V}/cut{key}.mp4 -i {MUSIC} -i {V}/mus/click.wav -filter_complex '
        f'"[0:a]loudnorm=I=-16:TP=-1.5:LRA=11[sp];'
        f'[1:a]atrim=0:{total:.2f},asetpts=N/SR/TB,loudnorm=I=-35:TP=-9:LRA=7,'
        f'afade=t=in:st=0:d=2,afade=t=out:st={fade_at:.2f}:d=3[bg];'
        f'[2:a]adelay={click_ms}|{click_ms},volume=0.55[ck];'
        f'[sp][bg][ck]amix=inputs=3:duration=first:dropout_transition=0:normalize=0,'
        f'alimiter=limit=0.95[a]" '
        f'-map 0:v -map "[a]" -c:v libx264 -preset medium -crf 24 -maxrate 2000k '
        f'-bufsize 4000k -pix_fmt yuv420p -c:a aac -b:a 128k '
        f'-movflags +faststart -y {V}/v{key}.mp4',
        f"mix {key}",
    )
    print(f"video {key}: DONE", flush=True)
