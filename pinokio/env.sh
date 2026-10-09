# Ruach Studio under Pinokio (HERESY 1259): the toolchain that install.sh, update.sh, studio.sh and extras.sh share; sourced,
# never run. Nothing here installs anything except ruach_tools (cmake and ninja into .venv, when the machine has none fit).
#
# The CUDA toolkit 12.8: /usr/local/cuda-12.8 when it is there (the way the studio is made and tested), else the one
# Pinokio's AI bundle brings (its CUDA_HOME), else an nvcc 12.8 on the PATH. build.sh and start.sh take it as
# RUACH_CUDA_HOME. With the machine's toolkit the machine's gcc builds too, when CUDA 12.8 takes it (11 to 14).

RUACH_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

ruach_nvcc_release() { "$1" --version 2>/dev/null | sed -n 's/.*release \([0-9][0-9.]*\),.*/\1/p'; }

ruach_cuda() {
    local c on_path
    on_path="$(command -v nvcc 2>/dev/null)"
    for c in /usr/local/cuda-12.8 "${CUDA_HOME:-}" "${on_path:+$(dirname "$(dirname "$on_path")")}"; do
        [ -n "$c" ] && [ -x "$c/bin/nvcc" ] || continue
        [ "$(ruach_nvcc_release "$c/bin/nvcc")" = 12.8 ] && { echo "$c"; return 0; }
    done
    return 1
}

# a toolkit named beforehand (RUACH_CUDA_HOME=… bash pinokio/install.sh) is taken when it has its nvcc
if [ -z "${RUACH_CUDA_HOME:-}" ] || [ ! -x "$RUACH_CUDA_HOME/bin/nvcc" ]; then RUACH_CUDA_HOME="$(ruach_cuda || true)"; fi
export RUACH_CUDA_HOME
if [ -n "$RUACH_CUDA_HOME" ] && [ "$RUACH_CUDA_HOME" != /usr/local/cuda-12.8 ]; then
    # a conda prefix (Pinokio's): its cudart, cublas and nccl are not in lib64, where start.sh looks, and the engine's RUNPATH names
    # only its own build folder (measured 09.10.2026): the folders that hold them go first on the library path
    for ruach_lib in "$RUACH_CUDA_HOME/lib" "$RUACH_CUDA_HOME/targets/x86_64-linux/lib"; do   # each is put in front: CUDA's own targets/ ends first
        if [ -e "$ruach_lib/libcudart.so.12" ] || [ -e "$ruach_lib/libnccl.so.2" ]; then
            case ":${LD_LIBRARY_PATH:-}:" in *":$ruach_lib:"*) ;; *) LD_LIBRARY_PATH="$ruach_lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}" ;; esac
        fi
    done
    export LD_LIBRARY_PATH
    unset ruach_lib
fi
if [ "$RUACH_CUDA_HOME" = /usr/local/cuda-12.8 ]; then
    unset NVCC_PREPEND_FLAGS NVCC_APPEND_FLAGS          # conda's nvcc flags name conda's compiler, not this toolkit's
    ruach_gcc=$(/usr/bin/g++ -dumpversion 2>/dev/null | cut -d. -f1)
    if [ -x /usr/bin/gcc ] && [ -n "$ruach_gcc" ] && [ "$ruach_gcc" -ge 11 ] && [ "$ruach_gcc" -le 14 ]; then
        export CC=/usr/bin/gcc CXX=/usr/bin/g++
    fi
    unset ruach_gcc
fi
[ -n "$RUACH_CUDA_HOME" ] && export PATH="$RUACH_CUDA_HOME/bin:$PATH"

# the biggest card here, in MiB (0 without nvidia-smi)
ruach_vram() { nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits 2>/dev/null | sort -n | tail -1 | tr -d ' ' | grep -E '^[0-9]+$' || echo 0; }

# the backbone a card takes (INSTALL.md): 24 GB BF16 (fetch-models.sh's own), 16 GB Q8_0, 12 GB Q6_K, less Q5_K_M
ruach_quant() {
    local v; v=$(ruach_vram)
    if   [ "$v" -ge 23000 ]; then echo ""
    elif [ "$v" -ge 15000 ]; then echo Q8_0
    elif [ "$v" -ge 11000 ]; then echo Q6_K
    else echo Q5_K_M; fi
}

ruach_cmake_ok() {
    local v; v=$(cmake --version 2>/dev/null | sed -n 's/^cmake version \([0-9]*\)\.\([0-9]*\).*/\1 \2/p')
    [ -n "$v" ] || return 1
    set -- $v
    [ "$1" -gt 3 ] || { [ "$1" = 3 ] && [ "$2" -ge 24 ]; }
}

# cmake 3.24+ and ninja: the machine's, else PyPI's in .venv, linked into .venv/tools-bin (only those two go on the PATH).
# A ninja that is on the PATH is not proof: measured 09.10.2026 on Viktor's laptop, ~/.local/bin/ninja is a pip wrapper whose
# module is gone (a Traceback for --version), and build.sh would have handed it to cmake.
ruach_tools() {
    local tb="$RUACH_ROOT/.venv/tools-bin"
    if ruach_cmake_ok && ninja --version >/dev/null 2>&1; then return 0; fi
    if [ ! -x "$tb/cmake" ] || [ ! -x "$tb/ninja" ]; then
        "$RUACH_ROOT/.venv/bin/pip" install -q "cmake>=3.24,<4" ninja || return 1
        mkdir -p "$tb" && ln -sf ../bin/cmake "$tb/cmake" && ln -sf ../bin/ninja "$tb/ninja" || return 1
    fi
    export PATH="$tb:$PATH"
}
