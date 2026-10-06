#!/bin/bash

set -eu

# Multi-GPU: set GGML_BACKEND to pick a device (CUDA0, CUDA1, Vulkan0...)
#export GGML_BACKEND=CUDA0
#export GGML_BACKEND=Vulkan0

# Q8_0 is near lossless. The quant is a straight swap: quantize.sh also
# builds Q6_K and Q5_K_M, and the native BF16 stays available.
./build/yue-server \
    --host 0.0.0.0 \
    --port 8087 \
    --model models/YuE2-3B-Q8_0.gguf \
    --vae models/YuE2-Vae-F32.gguf \
    --transcriber models/SheetSage2-Q8_0.gguf
