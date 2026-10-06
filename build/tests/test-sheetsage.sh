#!/bin/bash

set -eo pipefail

for backend in CUDA0 CPU; do
    env GGML_BACKEND=$backend ./test-sheetsage.py 2>&1 | tee ${backend}-sheetsage.log
done
