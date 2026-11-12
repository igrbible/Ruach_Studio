#include "scale.cuh"

#define MAX_GRIDDIM_X 0x7FFFFFFF

static __global__ void scale_f32(const float * x, float * dst, const float scale, const float bias, const int64_t nelements) {
    int64_t tid = (int64_t)blockIdx.x * (int64_t)blockDim.x + (int64_t)threadIdx.x;
    int64_t stride = (int64_t)blockDim.x * (int64_t)gridDim.x;

    for (int64_t i = tid; i < nelements; i += stride) {
        dst[i] = scale * x[i] + bias;
    }
}

static __global__ void scale_f32_bcast(
        const float * x,
        float * dst,
        const float scale,
        const float bias,
        const int64_t ne0,
        const int64_t ne1,
        const int64_t ne2,
        const int64_t ne3,
        const int64_t ne00,
        const int64_t ne01,
        const int64_t ne02,
        const int64_t ne03,
        const size_t s0,
        const size_t s1,
        const size_t s2,
        const size_t s3,
        const size_t s00,
        const size_t s01,
        const size_t s02,
        const size_t s03) {
    const int64_t tid = (int64_t)blockIdx.x * (int64_t)blockDim.x + (int64_t)threadIdx.x;
    const int64_t stride = (int64_t)blockDim.x * (int64_t)gridDim.x;
    const int64_t n = ne0*ne1*ne2*ne3;

    for (int64_t i = tid; i < n; i += stride) {
        const int64_t i0 = i % ne0;
        const int64_t i1 = (i / ne0) % ne1;
        const int64_t i2 = (i / (ne0*ne1)) % ne2;
        const int64_t i3 = i / (ne0*ne1*ne2);
        const size_t i_dst = i3*s3 + i2*s2 + i1*s1 + i0*s0;
        const size_t i_src =
            (i3 % ne03)*s03 + (i2 % ne02)*s02 + (i1 % ne01)*s01 + (i0 % ne00)*s00;
        dst[i_dst] = scale * x[i_src] + bias;
    }
}

static void scale_f32_cuda(const float * x, float * dst, const float scale, const float bias, const int64_t nelements, cudaStream_t stream) {
    const int64_t num_blocks = (nelements + CUDA_SCALE_BLOCK_SIZE - 1) / CUDA_SCALE_BLOCK_SIZE;
    scale_f32<<<MIN(MAX_GRIDDIM_X, num_blocks), CUDA_SCALE_BLOCK_SIZE, 0, stream>>>(x, dst, scale, bias, nelements);
}

static void scale_f32_bcast_cuda(const ggml_tensor * src0, ggml_tensor * dst, const float scale, const float bias, cudaStream_t stream) {
    GGML_TENSOR_UNARY_OP_LOCALS

    GGML_ASSERT(nb0 % sizeof(float) == 0);
    GGML_ASSERT(nb1 % sizeof(float) == 0);
    GGML_ASSERT(nb2 % sizeof(float) == 0);
    GGML_ASSERT(nb3 % sizeof(float) == 0);
    GGML_ASSERT(nb00 % sizeof(float) == 0);
    GGML_ASSERT(nb01 % sizeof(float) == 0);
    GGML_ASSERT(nb02 % sizeof(float) == 0);
    GGML_ASSERT(nb03 % sizeof(float) == 0);

    const size_t s0 = nb0 / sizeof(float);
    const size_t s1 = nb1 / sizeof(float);
    const size_t s2 = nb2 / sizeof(float);
    const size_t s3 = nb3 / sizeof(float);
    const size_t s00 = nb00 / sizeof(float);
    const size_t s01 = nb01 / sizeof(float);
    const size_t s02 = nb02 / sizeof(float);
    const size_t s03 = nb03 / sizeof(float);

    const int64_t nelements = ggml_nelements(dst);
    const int64_t num_blocks = (nelements + CUDA_SCALE_BLOCK_SIZE - 1) / CUDA_SCALE_BLOCK_SIZE;
    scale_f32_bcast<<<MIN(MAX_GRIDDIM_X, num_blocks), CUDA_SCALE_BLOCK_SIZE, 0, stream>>>(
        (const float *) src0->data,
        (float *) dst->data,
        scale,
        bias,
        ne0,
        ne1,
        ne2,
        ne3,
        ne00,
        ne01,
        ne02,
        ne03,
        s0,
        s1,
        s2,
        s3,
        s00,
        s01,
        s02,
        s03);
}

void ggml_cuda_op_scale(ggml_backend_cuda_context & ctx, ggml_tensor * dst) {
    const ggml_tensor * src0 = dst->src[0];
    const float * src0_d = (const float *)src0->data;
    float * dst_d = (float *)dst->data;
    cudaStream_t stream = ctx.stream();

    GGML_ASSERT(src0->type == GGML_TYPE_F32);
    GGML_ASSERT( dst->type == GGML_TYPE_F32);
    GGML_ASSERT(ggml_can_repeat(src0, dst));

    float scale;
    float bias;
    memcpy(&scale, (float *) dst->op_params + 0, sizeof(float));
    memcpy(&bias,  (float *) dst->op_params + 1, sizeof(float));

    if (!ggml_are_same_shape(src0, dst)) {
        scale_f32_bcast_cuda(src0, dst, scale, bias, stream);
        return;
    }

    scale_f32_cuda(src0_d, dst_d, scale, bias, ggml_nelements(src0), stream);
}
