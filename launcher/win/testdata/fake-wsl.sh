#!/bin/bash
# fake-wsl.sh · wsl.exe for the launcher's end-to-end run on Linux (e2e.sh). Its state is files in $FAKE_WSL_STATE.
# --list answers in UTF-16LE whatever WSL_UTF8 says (an older wsl.exe does that), --version honours WSL_UTF8=1.
S=${FAKE_WSL_STATE:?}
echo "$*" >> "$S/calls"
u16() { iconv -f UTF-8 -t UTF-16LE; }
case "$1" in
  --version) printf 'WSL version: %s\r\nKernel version: 6.6.87.2-1\r\nWindows version: 10.0.26100.4652\r\n' "${FAKE_WSL_VERSION:-2.6.1.0}" | { [ "${WSL_UTF8:-}" = 1 ] && cat || u16; } ;;
  --list)
    if [ -f "$S/installed" ]; then printf 'Ubuntu-24.04\r\nRuachStudio\r\n' | u16
    else printf 'Windows Subsystem for Linux has no installed distributions.\r\n' | u16; exit 255; fi ;;
  --install|--import) touch "$S/installed"; printf 'The operation completed successfully.\r\n' ;;
  --terminate) rm -f "$S/running" ;;
  --unregister) rm -f "$S/installed" "$S/running"; printf 'Unregistering.\r\nThe operation completed successfully.\r\n' ;;
  --distribution)
    shift 2; [ "$1" = --user ] && shift 2; [ "$1" = --exec ] && shift
    case "$1" in
      /bin/sleep) touch "$S/running"; echo $$ > "$S/alive.pid"; exec sleep infinity ;;
      /usr/lib/wsl/lib/nvidia-smi) [ -n "${FAKE_NO_GPU:-}" ] && exit 127; echo "GPU 0: NVIDIA GeForce RTX 3090 (UUID: GPU-fake)" ;;
      /bin/cat) echo "2.0.6" ;;
      /bin/sh) [ -f "$S/models" ] ;;
      /usr/local/bin/ruach-fetch-models) echo "fake: the models, 12.0 GB"; touch "$S/models" ;;
      *) echo "fake: $*" ;;
    esac ;;
  *) echo "fake: unknown $*"; exit 1 ;;
esac
