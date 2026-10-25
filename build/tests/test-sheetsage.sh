#!/bin/bash

set -eo pipefail

for backend in CUDA0 CPU; do
    ./test-sheetsage.py --device $backend 2>&1 | tee ${backend}-sheetsage.log
done
