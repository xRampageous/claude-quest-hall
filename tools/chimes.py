"""Two soft bell chimes, made from sine tones with a quick attack and a
decaying tail: `ask` (two notes rising: needs you) and `done` (a three-note
arpeggio: turn finished). 22.05 kHz mono 16-bit WAV."""
import math
import struct
import sys
import wave

RATE = 22050


def bell(freq, start, length, total, out, gain=0.28):
    for i in range(int(length * RATE)):
        t = i / RATE
        env = min(1.0, t / 0.008) * math.exp(-t * 5.5)
        # A bell: the note plus a quieter octave and fifth above.
        v = math.sin(2 * math.pi * freq * t) + 0.35 * math.sin(2 * math.pi * freq * 2 * t) + 0.12 * math.sin(2 * math.pi * freq * 3 * t)
        j = int(start * RATE) + i
        if j < len(out):
            out[j] += gain * env * v / 1.47


def write(path, notes, total):
    out = [0.0] * int(total * RATE)
    for freq, start in notes:
        bell(freq, start, total - start, total, out)
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(b''.join(struct.pack('<h', int(max(-1, min(1, s)) * 32000)) for s in out))


d = sys.argv[1]
write(f'{d}/ask.wav', [(659.25, 0.0), (880.0, 0.14)], 0.9)
write(f'{d}/done.wav', [(523.25, 0.0), (659.25, 0.12), (783.99, 0.24)], 1.1)
