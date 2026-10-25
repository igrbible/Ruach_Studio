#!/bin/bash

set -eo pipefail

for backend in CUDA0 CPU; do
    ./test-nar.py --device $backend 2>&1 | tee ${backend}-nar.log
done
