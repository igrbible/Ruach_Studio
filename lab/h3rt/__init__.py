"""HERESY 1870 (Viktor 29.10.2026: «Наша Студия абсолютно автономная и эргономная»): the Videographer's own MiniMax H3 runtime. The model's
code (the DiT, the VAEs, the packing, the Qwen3-VL prompt, the sampler), the quantization backends its files ship in and the layer offloading
come from AI-Toolkit (MIT, Ostris, LLC: LICENSE.ai-toolkit, SOURCES.txt), taken in by heresy/MISC/claude-arc/h3rt/vendor.py; the loading
mixin is cut down to the files the studio fetches, and runtime.py holds it all in place of AI-Toolkit's model class. It runs in the Artist's
environment (.venv-art: torch 2.11, transformers 5, accelerate, triton), reading only models/minimax-h3."""
