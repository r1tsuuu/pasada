#!/usr/bin/env python3
"""Synthesizes the demo video's sound bed: an original music track (so nothing needs licensing), ducked
under the narration, plus UI sounds placed from out/build/timeline.json. Writes out/build/bed.wav."""
import json
import wave

import numpy as np

SR = 48000
MUSIC_LEVEL = 0.34  # the whole music bed; lower is quieter
BPM = 104
BEAT = 60 / BPM
rng = np.random.default_rng(7)


def tone(freq, seconds, kind="sine"):
    t = np.arange(int(seconds * SR)) / SR
    if kind == "sine":
        return np.sin(2 * np.pi * freq * t)
    # A soft, warm saw built from a few harmonics.
    return sum(np.sin(2 * np.pi * freq * k * t) / k**1.6 for k in range(1, 6))


def env(n, attack, release):
    e = np.ones(n)
    a, r = min(n, int(attack * SR)), min(n, int(release * SR))
    e[:a] = np.linspace(0, 1, a)
    if r:
        e[-r:] *= np.linspace(1, 0, r)
    return e


def add(buf, sig, at, gain=1.0):
    i = int(at * SR)
    if i >= len(buf) or i < 0:
        return
    n = min(len(sig), len(buf) - i)
    buf[i : i + n] += sig[:n] * gain


def note(semitones_from_a4):
    return 440 * 2 ** (semitones_from_a4 / 12)


def music(seconds):
    n = int(seconds * SR) + SR
    pad_l, pad_r, pluck, low = (np.zeros(n) for _ in range(4))
    # C - G - Am - F, a warm and hopeful loop.
    chords = [[-21, -17, -14, -9], [-14, -10, -7, -2], [-12, -9, -5, 0], [-16, -12, -9, -4]]
    roots = [-33, -26, -24, -28]
    bar = BEAT * 4
    arp = [0, 2, 1, 3, 2, 1, 3, 2]
    for b in range(int(seconds / bar) + 2):
        at = b * bar
        chord, root = chords[b % 4], roots[b % 4]
        for i, s in enumerate(chord):
            sig = tone(note(s), bar + 0.6, "saw")
            sig *= env(len(sig), 0.35, 0.8)
            add(pad_l, sig, at, 0.5 if i % 2 else 0.8)
            add(pad_r, sig, at, 0.8 if i % 2 else 0.5)
        for beat in (0, 1.5, 2, 3.5):
            sig = tone(note(root), BEAT * 0.9) * np.exp(-np.arange(int(BEAT * 0.9 * SR)) / (0.22 * SR))
            add(low, sig, at + beat * BEAT, 1.0)
        if b >= 2:  # the arpeggio joins after the title
            for i, a in enumerate(arp):
                sig = tone(note(chord[a] + 12), 0.5) * np.exp(-np.arange(int(0.5 * SR)) / (0.11 * SR))
                add(pluck, sig, at + i * BEAT / 2, 0.8)
    kick, hat = np.zeros(n), np.zeros(n)
    t = np.arange(int(0.22 * SR)) / SR
    kick_sig = np.sin(2 * np.pi * (46 * t + 30 * (1 - np.exp(-t * 28)) / 28)) * np.exp(-t * 17)
    hat_sig = rng.standard_normal(int(0.05 * SR)) * np.exp(-np.arange(int(0.05 * SR)) / (0.012 * SR))
    hat_sig = np.diff(hat_sig, prepend=0)
    for b in range(int(seconds / BEAT) + 2):
        if b >= 8:
            add(kick, kick_sig, b * BEAT, 1.0 if b % 2 == 0 else 0.55)
        if b >= 16:
            add(hat, hat_sig, (b + 0.5) * BEAT, 0.5)
    left = 0.055 * pad_l + 0.30 * low + 0.15 * pluck + 0.36 * kick + 0.16 * hat
    right = 0.055 * pad_r + 0.30 * low + 0.11 * pluck + 0.36 * kick + 0.16 * hat
    return np.stack([left, right], axis=1)


def whoosh():
    n = int(0.55 * SR)
    noise = rng.standard_normal(n)
    out = np.zeros(n)
    a = np.linspace(0.02, 0.28, n) * np.concatenate([np.linspace(0.3, 1, n // 2), np.linspace(1, 0.2, n - n // 2)])
    state = 0.0
    for i in range(n):  # a one-pole filter that sweeps open and closed
        state += a[i] * (noise[i] - state)
        out[i] = state
    return out * np.sin(np.linspace(0, np.pi, n)) ** 2


def click():
    n = int(0.05 * SR)
    return (rng.standard_normal(n) * 0.4 + tone(1900, 0.05)) * np.exp(-np.arange(n) / (0.006 * SR))


def bell(freqs, step=0.09, decay=0.32):
    out = np.zeros(int((step * len(freqs) + 1.0) * SR))
    for i, f in enumerate(freqs):
        sig = (tone(f, 1.0) + 0.3 * tone(f * 2.01, 1.0)) * np.exp(-np.arange(SR) / (decay * SR))
        add(out, sig, i * step)
    return out


SOUNDS = {
    "click": (click(), 0.20),
    "whoosh": (whoosh(), 0.42),
    "zoom": (whoosh()[: int(0.4 * SR)], 0.12),
    "paid": (bell([note(3), note(7), note(10), note(15)]), 0.16),
    "funded": (bell([note(-2), note(3), note(7), note(10), note(15)], 0.07), 0.17),
    "held": (bell([note(3), note(-2)], 0.14, 0.2), 0.14),
    "refused": (tone(150, 0.3, "saw") * env(int(0.3 * SR), 0.005, 0.18) + bell([note(-9)], 0.1, 0.1)[: int(0.3 * SR)], 0.13),
    "stinger": (bell([note(-9), note(-2), note(3), note(7), note(15)], 0.06, 0.55), 0.17),
}


def main():
    plan = json.load(open("out/build/timeline.json"))
    total = plan["total"]
    n = int(total * SR)
    bed = music(total)[:n]
    if len(bed) < n:
        bed = np.pad(bed, ((0, n - len(bed)), (0, 0)))

    # Duck the music under each narration clip, with smooth edges.
    gain = np.full(n, 1.0)
    for a, b in plan["narration"]:
        gain[int(max(0, a - 0.15) * SR) : int((b + 0.1) * SR)] = 0.4
    k = int(0.25 * SR)
    gain = np.convolve(gain, np.ones(k) / k, mode="same")
    fade = np.ones(n)
    fade[: int(0.7 * SR)] = np.linspace(0, 1, int(0.7 * SR))
    fade[-int(2.4 * SR) :] = np.linspace(1, 0, int(2.4 * SR))
    bed *= (gain * fade * MUSIC_LEVEL)[:, None]

    fx = np.zeros(n)
    for e in plan["sounds"]:
        sig, level = SOUNDS[e["kind"]]
        add(fx, sig, e["t"], level)
    mix = bed + fx[:, None]
    mix /= max(1.0, np.abs(mix).max() / 0.92)

    with wave.open("out/build/bed.wav", "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((mix * 32767).astype("<i2").tobytes())
    print(f"bed: {total:.1f} s, {len(plan['sounds'])} sounds")


main()
