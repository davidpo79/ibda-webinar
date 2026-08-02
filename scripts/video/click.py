import os
import numpy as np, wave

SR = 44100

# A camera shutter is two mechanical events: the mirror/first curtain, then the
# second curtain about 80ms later. Each is a very short filtered noise burst
# with a bit of metallic ring on top.
def burst(dur, decay, tone, amp, seed):
    n = int(dur * SR)
    t = np.arange(n) / SR
    rng = np.random.default_rng(seed)
    noise = rng.standard_normal(n)
    # crude band-pass: remove the rumble, keep the snap
    noise = noise - np.convolve(noise, np.ones(30) / 30, mode="same")
    ring = np.sin(2 * np.pi * tone * t) * 0.35
    return (noise + ring) * np.exp(-t * decay) * amp


total = int(0.32 * SR)
buf = np.zeros(total)


def add(sig, at):
    i = int(at * SR)
    buf[i:i + len(sig)] += sig[:total - i]


add(burst(0.09, 130, 2600, 0.95, 11), 0.005)   # first curtain, sharp
add(burst(0.14, 70, 1500, 0.55, 22), 0.088)    # second curtain, softer

buf /= np.max(np.abs(buf))
st = np.stack([buf, buf], axis=1) * 0.9
with wave.open(f"{V}/mus/click.wav", "w") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((st * 32767).astype(np.int16).tobytes())
print("click.wav", round(total / SR, 3), "s")
