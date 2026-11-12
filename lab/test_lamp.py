"""HERESY 2301: the lamp's guard and its line: two requests at once never share the lamp (threads of one lab, and two processes as two
Studio instances), the second says its place and waits, Viktor's own run goes first when owner_first, one taken off leaves the line,
a dead holder's lock is the kernel's to free.

    cd lab && python3 -m unittest -q test_lamp
"""
import multiprocessing
import os
import tempfile
import threading
import time
import unittest

import lamp


class LampTest(unittest.TestCase):

    def setUp(self):
        self.dir = tempfile.mkdtemp(prefix="lamp-")
        os.environ["RUACH_LAMP_DIR"] = self.dir

    def run_in_lamp(self, job, spans, hold, who="", first=lambda: False):
        with lamp.turn(job, who=who, eta=hold, label="analog", owner_first=first, poll=0.02):
            t0 = time.time()
            time.sleep(hold)
            spans.append((t0, time.time(), who))

    def test_two_parallel_requests_never_share_the_lamp(self):
        spans, jobs = [], [{}, {}]
        ts = [threading.Thread(target=self.run_in_lamp, args=(j, spans, 0.3)) for j in jobs]
        ts[0].start()
        time.sleep(0.05)
        ts[1].start()
        time.sleep(0.1)
        self.assertEqual(jobs[1]["lamp"]["position"], 2)                       # the second waits, and says so
        self.assertIn("number 2", jobs[1]["waiting"])
        self.assertEqual(lamp.snapshot()[0]["holding"], True)
        for t in ts:
            t.join()
        (a0, a1, _), (b0, b1, _) = sorted(spans)
        self.assertLessEqual(a1, b0)                                            # one after the other, never both
        self.assertEqual(lamp.snapshot(), [])                                   # and the line is empty after

    def test_two_instances_as_two_processes(self):
        ctx = multiprocessing.get_context("fork")
        out = ctx.Queue()

        def one():
            with lamp.turn({}, eta=0.3, poll=0.02):
                t0 = time.time()
                time.sleep(0.3)
                out.put((t0, time.time()))
        ps = [ctx.Process(target=one) for _ in range(2)]
        for p in ps:
            p.start()
        for p in ps:
            p.join(10)
        (a0, a1), (b0, b1) = sorted([out.get(timeout=5), out.get(timeout=5)])
        self.assertLessEqual(a1, b0)

    def test_owner_first_and_taken_off(self):
        spans, holder, guest, owner, off = [], {}, {}, {}, {"cancel": False}
        ts = [threading.Thread(target=self.run_in_lamp, args=(holder, spans, 0.3, "guest1"))]
        ts[0].start()
        time.sleep(0.05)
        ts.append(threading.Thread(target=self.run_in_lamp, args=(guest, spans, 0.05, "guest2", lambda: True)))
        ts[1].start()
        time.sleep(0.05)
        gone = []

        def leaving():
            try:
                self.run_in_lamp(off, spans, 0.05, "guest3", lambda: True)
            except RuntimeError as e:
                gone.append(str(e))
        ts.append(threading.Thread(target=leaving))
        ts[2].start()
        time.sleep(0.05)
        ts.append(threading.Thread(target=self.run_in_lamp, args=(owner, spans, 0.05, "", lambda: True)))
        ts[3].start()
        time.sleep(0.05)
        self.assertEqual(owner["lamp"]["position"], 2)                         # Viktor's run straight after the one in the lamp
        self.assertEqual(guest["lamp"]["position"], 3)
        off["cancel"] = True
        for t in ts:
            t.join()
        self.assertEqual(gone, ["taken off the queue"])
        self.assertEqual([w for _a, _b, w in sorted(spans)], ["guest1", "", "guest2"])

    def test_a_dead_holder_frees_the_lamp(self):
        ctx = multiprocessing.get_context("fork")

        def die():
            with lamp.turn({}, eta=60, poll=0.02):
                os._exit(1)                                                     # a crash in the middle of a print
        p = ctx.Process(target=die)
        p.start()
        p.join(10)
        t0 = time.time()
        with lamp.turn({}, eta=1, poll=0.02):
            pass
        self.assertLess(time.time() - t0, 2)
        self.assertEqual(lamp.snapshot(), [])


if __name__ == "__main__":
    unittest.main()
