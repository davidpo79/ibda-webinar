"""Vertical marketing videos, second cut: reference-matched style.

Two things changed from the first edit, both measured off the reference clip
rather than guessed:

  * The "camera zoom" in the reference is not a zoom. It is a hard jump cut
    between a wide framing and a punched-in one, roughly every 9 seconds. The
    old build used a continuous sine-wave zoompan, which reads completely
    differently.
  * Captions are a single short line of 3-4 words that changes at speaking
    pace, in a heavy Hebrew face with a thick outline, centred at 61.7% of
    frame height. The old build used two-line captions at 56%.

Pipeline is two passes on purpose:
  cut{k}.mp4  expensive: trims, punch cuts, slide, CTA, audio splice. Cached.
  v{k}.mp4    cheap: burn captions, mix music, compress. Re-run this alone
              when caption text needs a fix.
"""
import json
import os
import subprocess
import sys

FF = "/usr/local/lib/python3.11/dist-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2"
U = os.environ.get("VIDEO_SOURCES", "")
V = os.environ.get("VIDEO_WORKDIR", "/tmp/vid2")
FONTS = f"{V}/fonts"   # drop assets/Heebo-ExtraBold.ttf in here before running

BODY_SRC = f"{U}/31a47803-WhatsApp_Video_20260805_at_09.15.09.mp4"
MUSIC = f"{V}/mus/track.wav"
CLICK = f"{V}/mus/click.wav"
CTA_DUR = 3.0

# Playback speed for the spoken part. The closing CTA card is deliberately
# left out of this: it is a static card the viewer has to read, and 3s of
# reading time should not shrink just because the delivery got faster. The
# music bed is also unaffected - it keeps its own tempo and is simply trimmed
# to the new, shorter total.
SPEED = 1.25

# --- the body re-cut --------------------------------------------------------
# Yifat recorded the closing line three times: 62.12-63.68 stops short,
# 64.98-65.84 stumbles on the word, 66.18-68.52 is clean. Both splice points
# sit inside measured silence (61.75-62.25 and 65.84-66.18) so the join is
# inaudible, and the visual jump reads as intentional because the whole edit
# is built on jump cuts.
BODY_A = (0.20, 61.95)
BODY_B = (66.00, 68.75)
BODY_A_LEN = BODY_A[1] - BODY_A[0]
BODY_LEN = BODY_A_LEN + (BODY_B[1] - BODY_B[0])

# Slide window, in body-local seconds: exactly the three points she lists.
SLIDE_IN, SLIDE_OUT = 38.45, 43.20

# Punch schedule, body-local. Every boundary falls inside a measured silence
# so no cut lands mid-word. W = wide, T = punched in.
BODY_CUTS = [
    (0.20, 11.98, "W"),
    (11.98, 22.87, "T"),
    (22.87, 31.48, "W"),
    (31.48, 38.68, "T"),
    (38.68, 44.57, "W"),
    (44.57, 53.20, "T"),
    (53.20, 61.95, "W"),
]
BODY_B_SHOT = "T"   # the splice doubles as a framing change

HOOKS = {
    "1": dict(
        file=f"{U}/284eadf2-WhatsApp_Video_20260805_at_09.13.09.mp4",
        key="h1", trim=10.55,
        cuts=[(0.00, 4.45, "W"), (4.45, 8.55, "T"), (8.55, 10.55, "W")],
    ),
    "2": dict(
        file=f"{U}/be5661eb-WhatsApp_Video_20260805_at_09.12.48.mp4",
        key="h2", trim=15.15,
        cuts=[(0.00, 5.05, "W"), (5.05, 9.30, "T"), (9.30, 11.45, "W"), (11.45, 15.15, "T")],
    ),
    "3": dict(
        file=f"{U}/d13f12e6-WhatsApp_Video_20260805_at_09.11.49.mp4",
        key="h3", trim=14.20,
        cuts=[(0.00, 1.95, "T"), (1.95, 6.40, "W"), (6.40, 11.98, "T"), (11.98, 14.20, "W")],
    ),
}

# --- captions ---------------------------------------------------------------
# (first word index, last word index, corrected text). Timing comes from the
# word-level transcription; the text is corrected by hand because Whisper's
# Hebrew spelling is unreliable even where its timings are good.
BODY_CAPS = [
    (0, 2, "ואם עוד לא"),
    (3, 5, "נכנסתם לזה לעומק"),
    (6, 8, "זה ממש לא"),
    (9, 10, "כי נשארתם מאחור"),
    (11, 13, "זה פשוט כי"),
    (14, 17, "אין לכם זמן לבזבז"),
    (18, 19, "על ניסוי וטעייה"),
    (20, 23, "כשיש לכם כל כך"),
    (24, 26, "הרבה תיקים לנהל"),
    (27, 30, "ודדליינים לעמוד בהם"),
    (31, 34, "רוב עורכי הדין שאני"),
    (35, 36, "מדברת איתם"),
    (37, 39, "לא באמת נרתעים"),
    (40, 41, "מבינה מלאכותית"),
    (42, 45, "הם פשוט לא יודעים"),
    (46, 48, "מאיפה נכון להתחיל"),
    (49, 52, "יש בחוץ מגוון כלים"),
    (53, 54, "עשרות עדכונים"),
    (55, 59, "אין לכם את הרגע לעצור"),
    (60, 62, "כדי ללמוד ולבחון"),
    (63, 64, "מה מדויק"),
    (65, 67, "לעבודה המשפטית שלנו"),
    (68, 71, "ומה זה סתם גימיק"),
    (72, 74, "בדיוק בשביל זה"),
    (75, 77, "יצרתי את הסדנה"),
    (78, 81, "אני עורכת הדין"),
    (82, 84, "יפעת בן דוד עמית"),
    (85, 88, "ובסדנה העתיד כבר כאן"),
    (89, 91, "אנחנו עוברים תכל׳ס"),
    (92, 94, "על הכלים עצמם"),
    # 95-106 fall inside the slide window and are deliberately dropped
    (107, 108, "והכי חשוב"),
    (109, 111, "איך אנחנו מפעילים"),
    (112, 114, "את הכלים האלה"),
    (115, 116, "ביום-יום"),
    (117, 119, "על המשימות שאנחנו"),
    (120, 122, "עושים היום ידנית"),
    (123, 124, "על המשימות"),
    (125, 127, "שחוזרות על עצמן"),
    (128, 130, "ושורפות לנו את"),
    (131, 133, "השעות הכי יקרות"),
    (134, 135, "13 באוגוסט"),
    (136, 137, "10 בבוקר"),
    (138, 140, "השקעה של שעתיים"),
    (141, 143, "שתחזיר את עצמה"),
    (144, 146, "כבר בשבוע הראשון"),
    (151, 152, "הקישור להרשמה"),
    (153, 156, "מחכה לכם ממש כאן"),
]

HOOK_CAPS = {
    "h1": [
        (0, 2, "אנחנו כבר מבינים"),
        (3, 4, "שבינה מלאכותית"),
        (5, 8, "נכנסת חזק לעולם המשפט"),
        (9, 12, "הבעיה היא שיש כאן"),
        (13, 16, "הצפה מטורפת של מידע"),
        (17, 20, "בואו נעצור ונעשה סדר"),
    ],
    "h2": [
        (0, 2, "הרבה בטוחים שבשביל"),
        (3, 6, "לעבוד עם בינה מלאכותית"),
        (7, 9, "צריך רקע טכנולוגי"),
        (10, 13, "האמת היא בדיוק הפוכה"),
        (14, 16, "הכלים האלה עובדים"),
        (17, 18, "הכי טוב"),
        (19, 23, "כשנותנים להם הנחיה מדויקת"),
        (24, 27, "ולנסח מילים בצורה מדויקת"),
        (28, 31, "זה בדיוק המקצוע שלנו"),
    ],
    "h3": [
        (0, 1, "שאלה קטנה"),
        (2, 6, "כמה שעות הלכו לכם החודש"),
        (7, 9, "רק על ניסוחים"),
        (10, 13, "סיכומים ובדיקות של מסמכים?"),
        (14, 15, "עכשיו תחשבו"),
        (16, 19, "מה קורה ליומן שלכם"),
        (20, 23, "כשחלק גדול מהעבודה הזאת"),
        (24, 27, "לוקח רק כמה דקות?"),
    ],
}

# Geometry lifted straight off the reference: text centre at 61.7% of frame
# height, cap height 2.74% of frame height, outline about 7px at 1080 wide.
ASS_HEAD = """[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: K,Heebo,78,&H00FFFFFF,&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,7,0,5,50,50,0,0

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""

CAP_Y = 1185

# libass here runs FriBidi in SIMPLE mode with an LTR base direction, so a
# trailing "?" lands on the right of a Hebrew line instead of the left.
# Wrapping the line in RLE..PDF forces an RTL base. Verified by pixel-matching
# the glyph at each end of the line against a standalone "?" render.
RLE, PDF = "‫", "‬"

NORM = ("scale=1080:1920:force_original_aspect_ratio=increase,"
        "crop=1080:1920,fps=30,setsar=1,format=yuv420p")
# 1.28x punch. unsharp only on this branch: the source is already upscaled
# 1.875x to reach 1080x1920, so the punch pushes it to 2.4x and it softens
# visibly next to the wide shot unless it is sharpened back.
TIGHT = ("scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,"
         "crop=844:1500:118:90,scale=1080:1920,unsharp=5:5:0.8,"
         "fps=30,setsar=1,format=yuv420p")


def shot_filter(kind):
    return NORM if kind == "W" else TIGHT


def ts(t):
    h = int(t // 3600); m = int(t % 3600 // 60); s = t % 60
    return f"{h}:{m:02d}:{s:05.2f}"


def run(cmd, label):
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if r.returncode != 0:
        print("FAIL:", label)
        print(r.stderr[-2500:])
        raise SystemExit(1)


WORDS = json.load(open(f"{V}/words.json", encoding="utf-8"))


def body_time(t):
    """Map a time in the original body onto the re-cut body timeline."""
    if t < BODY_B[0]:
        return t - BODY_A[0]
    return t - BODY_A[0] - (BODY_B[0] - BODY_A[1])


def build_ass(path, hook_key, hook_dur):
    ev = []
    for a, b, text in HOOK_CAPS[hook_key]:
        w = WORDS[hook_key]
        ev.append([w[a]["s"], w[b]["e"], text])
    for a, b, text in BODY_CAPS:
        w = WORDS["body"]
        ev.append([body_time(w[a]["s"]) + hook_dur, body_time(w[b]["e"]) + hook_dur, text])
    ev.sort(key=lambda e: e[0])
    # Caption times are authored against the original speech timeline, so they
    # have to be compressed by the same factor the speech is.
    for e in ev:
        e[0] /= SPEED
        e[1] /= SPEED

    # Hold each caption until the next one starts, capped at 0.4s of dwell,
    # so a line does not blink out during the micro-pauses inside a sentence
    # but also does not linger over a real silence. Ends are clamped to the
    # next start: two \pos captions at the same coordinates would otherwise
    # draw on top of each other.
    for i, e in enumerate(ev):
        nxt = ev[i + 1][0] if i + 1 < len(ev) else e[1] + 0.4
        e[1] = min(max(e[1], e[1]), min(e[1] + 0.4, nxt - 0.02))

    out = [ASS_HEAD]
    for st, en, text in ev:
        if en <= st:
            en = st + 0.25
        out.append(
            f"Dialogue: 0,{ts(st)},{ts(en)},K,,0,0,0,,"
            f"{{\\pos(540,{CAP_Y})}}{RLE}{text}{PDF}\n"
        )
    open(path, "w", encoding="utf-8").write("".join(out))
    return len(ev)


# --- one-time assets --------------------------------------------------------
if not os.path.exists(f"{V}/cta.mp4"):
    run(f'{FF} -loop 1 -i {V}/slide_cta.png -f lavfi -i anullsrc=r=44100:cl=stereo '
        f'-t {CTA_DUR} -vf "fps=30,setsar=1,format=yuv420p" -c:v libx264 -preset medium '
        f'-crf 20 -c:a aac -b:a 160k -ar 44100 -ac 2 -shortest -y {V}/cta.mp4', "cta")

only = sys.argv[1:] or list(HOOKS)

for key in only:
    h = HOOKS[key]
    hook_dur = h["trim"]
    speech = (hook_dur + BODY_LEN) / SPEED   # spoken part, after the speed-up
    total = speech + CTA_DUR

    # ---------------- pass 1: cut ----------------
    if not os.path.exists(f"{V}/cut{key}.mp4"):
        # A filter input pad can only be consumed once, and both sources are
        # sliced into many segments, so split them explicitly up front.
        nh = len(h["cuts"])
        nb = len(BODY_CUTS) + 1
        parts = [
            f"[0:v]split={nh}" + "".join(f"[hv{i}]" for i in range(nh)) + ";",
            f"[1:v]split={nb}" + "".join(f"[bv{i}]" for i in range(nb)) + ";",
            "[1:a]asplit=2[ba0][ba1];",
        ]
        n = 0
        for i, (a, b, kind) in enumerate(h["cuts"]):
            parts.append(f"[hv{i}]trim={a}:{b},setpts=PTS-STARTPTS,{shot_filter(kind)}[s{n}];")
            n += 1
        for i, (a, b, kind) in enumerate(BODY_CUTS):
            parts.append(f"[bv{i}]trim={a}:{b},setpts=PTS-STARTPTS,{shot_filter(kind)}[s{n}];")
            n += 1
        parts.append(f"[bv{len(BODY_CUTS)}]trim={BODY_B[0]}:{BODY_B[1]},setpts=PTS-STARTPTS,"
                     f"{shot_filter(BODY_B_SHOT)}[s{n}];")
        n += 1
        # Speech segments concat and then speed up together; the CTA card is
        # appended afterwards so it keeps its full 3 seconds of reading time.
        parts.append("".join(f"[s{i}]" for i in range(n)) + f"concat=n={n}:v=1:a=0,"
                     f"setpts=PTS/{SPEED},fps=30[vspd];")
        parts.append(f"[3:v]fps=30,setsar=1,format=yuv420p[ctav];")
        parts.append("[vspd][ctav]concat=n=2:v=1:a=0[vcat];")

        parts.append(f"[0:a]atrim=0:{hook_dur},asetpts=PTS-STARTPTS[a0];")
        parts.append(f"[ba0]atrim={BODY_A[0]}:{BODY_A[1]},asetpts=PTS-STARTPTS[a1];")
        parts.append(f"[ba1]atrim={BODY_B[0]}:{BODY_B[1]},asetpts=PTS-STARTPTS[a2];")
        parts.append(f"[a0][a1][a2]concat=n=3:v=0:a=1,atempo={SPEED},"
                     f"aresample=44100[aspd];")
        parts.append("[3:a]anull[a3];")
        parts.append("[aspd][a3]concat=n=2:v=0:a=1[acat];")

        sa = (hook_dur + body_time(SLIDE_IN)) / SPEED
        sb = (hook_dur + body_time(SLIDE_OUT)) / SPEED
        rest = max(0.0, total - sb)
        parts.append(
            f"[2:v]scale=1080:1920,fps=30,format=yuva420p,"
            f"fade=t=in:st=0:d=0.3:alpha=1,fade=t=out:st={sb - sa - 0.3:.2f}:d=0.3:alpha=1,"
            f"tpad=start_duration={sa:.2f}:start_mode=add:"
            f"stop_duration={rest:.2f}:stop_mode=add:color=0x00000000[sl];"
        )
        parts.append(f"[vcat][sl]overlay=0:0:enable='between(t,{sa:.2f},{sb:.2f})'[vout]")

        fc = "".join(parts)
        run(
            f'{FF} -i "{h["file"]}" -i "{BODY_SRC}" '
            f'-loop 1 -framerate 30 -t {sb - sa:.2f} -i {V}/slide_list.png '
            f'-i {V}/cta.mp4 -filter_complex "{fc}" -map "[vout]" -map "[acat]" '
            f'-c:v libx264 -preset veryfast -crf 20 -c:a aac -b:a 192k -ar 44100 -ac 2 '
            f'-y {V}/cut{key}.mp4',
            f"cut {key}",
        )
        print(f"video {key}: cut done ({total:.2f}s)", flush=True)

    # ---------------- pass 2: captions + music ----------------
    ass = f"{V}/sub{key}.ass"
    ncaps = build_ass(ass, h["key"], hook_dur)

    click_ms = int(hook_dur / SPEED * 1000)
    fade_at = max(0.0, total - 3.0)
    run(
        f'{FF} -i {V}/cut{key}.mp4 -i {MUSIC} -i {CLICK} -filter_complex '
        f'"[0:v]subtitles={ass}:fontsdir={V}/fonts[v];'
        f'[0:a]loudnorm=I=-16:TP=-1.5:LRA=11[sp];'
        f'[1:a]atrim=0:{total:.2f},asetpts=N/SR/TB,loudnorm=I=-35:TP=-9:LRA=7,'
        f'afade=t=in:st=0:d=2,afade=t=out:st={fade_at:.2f}:d=3[bg];'
        f'[2:a]adelay={click_ms}|{click_ms},volume=0.55[ck];'
        f'[sp][bg][ck]amix=inputs=3:duration=first:dropout_transition=0:normalize=0,'
        f'alimiter=limit=0.95[a]" '
        # -ar is not optional here: loudnorm resamples to 192kHz internally and
        # amix inherits the highest input rate, so without this the file ships
        # with a 96kHz track that some social players handle badly.
        f'-map "[v]" -map "[a]" -c:v libx264 -preset medium -crf 24 -maxrate 2000k '
        f'-bufsize 4000k -pix_fmt yuv420p -c:a aac -b:a 128k -ar 44100 -ac 2 '
        f'-movflags +faststart -y {V}/v{key}.mp4',
        f"final {key}",
    )
    print(f"video {key}: DONE ({ncaps} captions)", flush=True)
