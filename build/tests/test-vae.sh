#!/bin/bash

set -eo pipefail

for backend in CUDA0 CPU; do
    ./test-vae.py --device $backend 2>&1 | tee ${backend}-vae.log
done
