# The Narrator on an Intel Arc: Drama 3 through Vulkan

Fish Audio Drama 3 reads on an Intel card (Arc) through audio.cpp's Vulkan build. audio.cpp has CUDA, HIP, Vulkan, Metal and processor builds and no SYCL, so Vulkan is the Intel card's road. This page is the whole road: the packages, the check, the build, the tier the Narrator reads in, and what to do when something is missing. The Narrator's guide (F1, «On an Intel Arc or Another Vulkan Card») has the short version.

## What the Narrator does on an Intel card

- **Its own tier, `arc-q4`:** Q4_K (`drama-3-experts-Q4_K-backbone-Q8_0.gguf`) with 28 of its 40 expert banks in the machine's memory. About 11 GB on the card and 16 GB of the machine's memory free.
- **Measured on an Arc Pro B50 (16 GB), 12.11.2026:** the model's load 52.8 s; a piece of 7.7 s of Russian speech read in 25.4 s (a second of speech in 3.3 s); the card's peak 11.2 GB of 15.9; no line from the kernel's xe driver.
- **When the card's memory runs short**, the engine moves four banks more into the machine's memory (32) and reads on, as it does on a CUDA card.
- **Auto on an Intel card takes this tier alone.** A CUDA or processor quant named for the Intel card is refused at once, and the answer names the tier the card would take.
- **Never the processor in the card's name.** The Vulkan loader is shown Mesa's Intel driver alone (`VK_ICD_FILENAMES` and `VK_DRIVER_FILES` set to `intel_icd.json`), so llvmpipe or another card can never become «device 0». After the first piece the engine reads the device the server took from its log. When no Intel device is named there, the server is stopped and the run fails, saying so.
- **The engine's server runs at nice 10** on the Intel card, because the 28 banks in RAM are computed by the processor and other work on the machine keeps its pace.
- **Only Intel cards for now.** The lab sends Drama 3 to the Vulkan build only on an Intel card it finds as the Studio does (vendor 8086, driver `xe` or `i915`, sensors of its own). audio.cpp's Vulkan build runs on other Vulkan cards too, but the Narrator does not route them yet.

## 1 · The system's packages

The Vulkan headers, the shader compiler glslc, the SPIR-V headers, Mesa's Vulkan drivers and vulkaninfo, installed once by you (the Studio never installs a system package):

```
# Debian, Ubuntu
sudo apt install libvulkan-dev glslc spirv-headers mesa-vulkan-drivers vulkan-tools
# Fedora
sudo dnf install vulkan-loader-devel glslc spirv-headers-devel mesa-vulkan-drivers vulkan-tools
# Arch
sudo pacman -S --needed vulkan-icd-loader vulkan-headers shaderc spirv-headers vulkan-intel vulkan-tools
```

The build also needs cmake (3.21 or newer) and a C++ compiler (g++ 11 or newer), as every audio.cpp build does. Measured on Ubuntu 24.04 with Mesa 25.2 and Linux 7.0.

## 2 · The check

```
vulkaninfo --summary
```

The card is listed under Devices with Mesa's Intel driver:

```
deviceName = Intel(R) Arc(tm) Pro B50 Graphics (BMG G21)
driverName = Intel open-source Mesa driver
```

A list with `llvmpipe` alone means the Intel driver is not there (Mesa's Vulkan drivers, or a kernel too old for the card). Then:

```
bash tools/narrator-setup.sh --vulkan-check
```

It says whether an Intel card is here, whether the headers, glslc, the SPIR-V header and Mesa's Intel driver are here, which card the driver sees, and whether the Vulkan build is made. What is missing is named with the install line for your system. It ends with 0 when nothing is missing.

## 3 · The build

```
bash tools/narrator-setup.sh                    # on a machine with an Intel card: the Vulkan build too, beside the other one
bash tools/narrator-setup.sh --build --vulkan   # the Vulkan build alone
```

It builds `build/audio.cpp` (the Studio's own copy at its pin, never fetched from upstream) with `scripts/build_linux.sh --backend vulkan`, the Narrator's engine only, into `build/audio.cpp/build/linux-vulkan-release/bin/audiocpp_server`. The log is in `tmp/narrator-build.log`. Before it starts, it checks the packages and stops on the first one missing, naming it.

The lab looks for the server there first, then in `heresy/MISC/audio.cpp/build/linux-vulkan-release/` and `engines/audio.cpp/vulkan/`; `READER_AUDIOCPP_VULKAN` names a server of your own.

## 4 · The model

The Intel card reads Q4_K, which the setup fetches by default (24.8 GB). Q8_0 is the room's default on a CUDA card wherever it fits; fetch it with `bash tools/narrator-setup.sh --quant Q8_0` (40.9 GB). On an Intel card it is not used.

## When something is wrong

| what you see | what it means | what to do |
|---|---|---|
| `'spv' has not been declared` in the build log | the SPIR-V header is missing | install `spirv-headers` (Fedora `spirv-headers-devel`) |
| `glslc is not here` | the shader compiler is missing | install `glslc` (Arch `shaderc`) |
| `vulkaninfo` shows `llvmpipe` alone | the Intel Vulkan driver is not there | install Mesa's Vulkan drivers (Arch `vulkan-intel`) |
| the run says no Intel device was named | the server took no Intel card | check `vulkaninfo --summary`, then that no other program holds the card |
| the run says there is no tier for the Intel card | the Q4_K model is not here | `bash tools/narrator-setup.sh --quant Q4_K` |
| the run wants more of the machine's memory | the 28 banks need 16 GB free | close what holds the memory, or read on a CUDA card |
