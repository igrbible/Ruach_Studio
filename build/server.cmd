@echo off

set PATH=%~dp0build\Release;%PATH%

rem Multi-GPU: set GGML_BACKEND to pick a device (CUDA0, CUDA1, Vulkan0...)
rem set GGML_BACKEND=CUDA0
rem set GGML_BACKEND=Vulkan0

rem Q8_0 is near lossless. The quant is a straight swap: quantize.sh also
rem builds Q6_K and Q5_K_M, and the native BF16 stays available.
yue-server.exe ^
    --host 0.0.0.0 ^
    --port 8087 ^
    --model models\YuE2-3B-Q8_0.gguf ^
    --vae models\YuE2-Vae-F32.gguf ^
    --transcriber models\SheetSage2-Q8_0.gguf

pause
