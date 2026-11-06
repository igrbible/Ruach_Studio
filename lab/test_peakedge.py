"""HERESY 2022: peakedge.wave() finds the old Peak clip's level by the engine's own rule and counts what stood over it."""
import tempfile
import unittest
from pathlib import Path

import numpy as np
import soundfile as sf

import peakedge


def old_rule(y, clip=10):
    a = np.sort(np.abs(y).ravel())
    return float(a[int((len(a) - 1) * (1.0 - clip / 1e6))])


class PeakEdge(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()

    def tearDown(self):
        self.dir.cleanup()

    def write(self, y, rate=48000, sub="PCM_24"):
        p = Path(self.dir.name) / "a.wav"
        sf.write(str(p), y, rate, subtype=sub)
        return p, sf.read(str(p), dtype="float32", always_2d=True)[0]

    def test_level_by_the_old_rule(self):
        rng = np.random.default_rng(7)
        t = np.arange(48000 * 70) / 48000
        y = np.stack([0.5 * np.sin(2 * np.pi * 220 * t), 0.45 * np.sin(2 * np.pi * 330 * t)], axis=1) + rng.normal(0, 0.05, (len(t), 2))
        for at in (100000, 100010, 900000, 2500000, 3000000):   # five spikes, two of them 10 frames apart: four places
            y[at, 0] = 0.95
        y = np.clip(y, -0.98, 0.98)
        p, back = self.write(y)
        w = peakedge.wave(p, n=1000)
        self.assertAlmostEqual(w["cut"], old_rule(back), places=5)
        self.assertEqual(w["over"], int((np.abs(back) > old_rule(back)).sum()))
        self.assertEqual(len(w["peaks"]), 1000)
        self.assertAlmostEqual(w["seconds"], 70.0, places=2)
        self.assertGreaterEqual(w["places"], 1)
        self.assertTrue(all(0 <= k < 1000 for k in w["hot"]))
        self.assertEqual(w["flat"], 0)

    def test_spikes_make_places(self):
        y = np.full((48000 * 20, 2), 0.0, dtype=np.float32)
        y[:, 0] = 0.2 * np.sin(np.arange(len(y)) / 7.0)
        y[:, 1] = y[:, 0]
        ramp = np.concatenate([np.linspace(0.5, 0.95, 16), np.linspace(0.95, 0.5, 16)[1:]])
        spikes = [48000 * s for s in (2, 5, 9, 14)]
        for at in spikes:                             # four alike, far apart: the top 0.001 % in four places
            y[at:at + len(ramp), 0] = ramp
            y[at:at + len(ramp), 1] = ramp * 0.98
        p, back = self.write(y)
        w = peakedge.wave(p, n=400)
        ref = old_rule(back)
        self.assertAlmostEqual(w["cut"], ref, places=5)
        self.assertEqual(w["over"], int((np.abs(back) > ref).sum()))
        self.assertGreater(w["over"], 0)
        self.assertEqual(w["places"], 4)
        step = len(y) // 400
        self.assertEqual(w["hot"], sorted({(at + 15) // step for at in spikes}))

    def test_a_take_cut_before_2007(self):
        y = np.full((48000 * 10, 2), 0.0, dtype=np.float32)
        y[:, 0] = np.clip(1.3 * np.sin(np.arange(len(y)) / 50.0), -1, 1)
        y[:, 1] = y[:, 0]
        p, back = self.write(y)
        w = peakedge.wave(p, n=200)
        self.assertGreater(w["flat"], 1000)
        self.assertEqual(w["over"], 0)
        self.assertTrue(w["flats"])


if __name__ == "__main__":
    unittest.main()
