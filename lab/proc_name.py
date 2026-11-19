"""HERESY 2733 (Viktor 18.11.2026: «XPU для Arc. GPU для геймерских RTX… GPU для всех Nvidia… AMD Radeon своим кагалем… CUDA, SYCL, Vulkan,
etc.»): a processor as the Studio names it in what the user reads (the log, a job's line): GPU0 for an NVIDIA card, XPU0 for an Intel Arc (the
lab numbers those from 100), CPU for the processor; the lab's "0+1+2" or a list as GPU0+1+2; an Arc not numbered ("arc", "xpu") XPU. Only the
words: the indices underneath stay what they are."""
import re


def proc_name(g):
    if isinstance(g, (list, tuple)):
        g = "+".join(str(x) for x in g)
    s = str("" if g is None else g).strip()
    if "+" in s or "," in s:
        parts = [p.strip() for p in s.replace(",", "+").split("+") if p.strip()]
        return proc_name(parts[0]) + "".join("+" + re.sub(r"^[A-Z]+", "", proc_name(p)) for p in parts[1:])
    if s.lower() in ("cpu", "processor"):
        return "CPU"
    if s.lower() in ("arc", "xpu"):
        return "XPU"
    try:
        i = int(s)
    except ValueError:
        return s
    return f"XPU{i - 100}" if i >= 100 else f"GPU{i}"
