import os
import numpy as np, wave

SR = 44100
BPM = 100
BEAT = 60.0 / BPM
BARS = 40
TOTAL = BARS * 4 * BEAT

# Am - F - C - G, one bar each, looping.
CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]


def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12.0)


def env(n, a, d, s, r, sus=0.7):
    """Simple ADSR over n samples, all times in seconds."""
    a, d, r = int(a * SR), int(d * SR), int(r * SR)
    s = max(0, n - a - d - r)
    return np.concatenate([
        np.linspace(0, 1, a, endpoint=False),
        np.linspace(1, sus, d, endpoint=False),
        np.full(s, sus),
        np.linspace(sus, 0, n - a - d - s),
    ])[:n]


buf = np.zeros(int(TOTAL * SR) + SR)


def add(sig, at):
    i = int(at * SR)
    buf[i:i + len(sig)] += sig


def pluck(f, at, dur, amp):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # Two detuned saw-ish partials, low-passed by the envelope shape.
    s = (np.sin(2 * np.pi * f * t) + 0.45 * np.sin(2 * np.pi * f * 2 * t)
         + 0.2 * np.sin(2 * np.pi * f * 3 * t))
    add(s * env(n, 0.004, 0.12, 0, 0.4, sus=0.35) * amp, at)


def kick(at, amp=0.9):
    n = int(0.30 * SR)
    t = np.arange(n) / SR
    f = 120 * np.exp(-t * 26) + 45          # pitch drop
    s = np.sin(2 * np.pi * np.cumsum(f) / SR)
    add(s * np.exp(-t * 11) * amp, at)


def hat(at, amp=0.16, dur=0.05):
    n = int(dur * SR)
    t = np.arange(n) / SR
    rng = np.random.default_rng(int(at * 1000) % 99991)
    s = rng.standard_normal(n)
    # crude high-pass: subtract a running mean
    s = s - np.convolve(s, np.ones(12) / 12, mode="same")
    add(s * np.exp(-t * 90) * amp, at)


def sub(f, at, dur, amp=0.32):
    n = int(dur * SR)
    t = np.arange(n) / SR
    s = np.sin(2 * np.pi * f * t)
    add(s * env(n, 0.01, 0.05, 0, 0.15, sus=0.85) * amp, at)


for bar in range(BARS):
    t0 = bar * 4 * BEAT
    ch = CHORDS[bar % 4]

    # Bass root on 1 and on the "and" of 3.
    root = hz(ch[0] - 24)
    sub(root, t0, BEAT * 1.6)
    sub(root, t0 + BEAT * 2.5, BEAT * 1.2)

    # Kick on 1 and 3, plus a pickup before the downbeat every other bar.
    kick(t0)
    kick(t0 + BEAT * 2, 0.75)
    if bar % 2 == 1:
        kick(t0 + BEAT * 3.5, 0.45)

    # Hats on eighths, accented on the offbeat.
    for e in range(8):
        hat(t0 + e * BEAT / 2, 0.20 if e % 2 else 0.11)

    # Arpeggio: 8 sixteenth-ish plucks walking the chord.
    order = [0, 1, 2, 1, 2, 0, 1, 2]
    for i, oi in enumerate(order):
        note = ch[oi] + (12 if i >= 5 else 0)
        pluck(hz(note), t0 + i * BEAT / 2, 0.42, 0.13)


# Gentle stereo width: delay the right channel by a few milliseconds.
d = int(0.012 * SR)
left = buf
right = np.concatenate([np.zeros(d), buf[:-d]])
st = np.stack([left, right], axis=1)
st = st / np.max(np.abs(st)) * 0.85

pcm = (st * 32767).astype(np.int16)
with wave.open(f"{V}/mus/bed2.wav", "w") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print("bed2.wav", round(len(st) / SR, 1), "s")
