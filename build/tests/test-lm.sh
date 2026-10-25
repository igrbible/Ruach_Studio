#!/bin/bash

set -eo pipefail

for backend in CUDA0 CPU; do
    ./test-lm.py --device $backend 2>&1 | tee ${backend}-lm.log
done
