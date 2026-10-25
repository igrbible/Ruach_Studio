#!/bin/bash

set -eo pipefail

for backend in CUDA0 CPU; do
    ./test-tokenizer.py --device $backend 2>&1 | tee ${backend}-tokenizer.log
done
