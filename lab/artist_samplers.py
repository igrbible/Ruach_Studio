"""HERESY 1169 · 1333 (Viktor 10.10.2026: «По моему набору семплеров хочу попросить, чтобы ты их внедрил… Семплеры: er_sde, res_*s,
res_*s_ode, heun(pp2), exp_heun_2_x0(_sde). Планировщики: bong_tangent, sgm_uniform, exponential, beta, kl_optimal, beta57»): the Artist's
own sampling for diffusers' flow-matching painters (Krea 2, Qwen-Image), written for this studio from the methods' papers and from the
formulas of ComfyUI (GPL-3.0, as the studio's AGPL may take) and RES4LYF (read for its mathematics only: its licence bars commercial
services, so none of its code is here):
  · er_sde: the ER-SDE-Solver-3 (Cui et al. 2023, arXiv 2309.06169), one evaluation a step, the two before it kept;
  · res_2s, res_3s: the refined exponential solver's single-step methods (Zhang et al. 2023), two stages at c = ½ and three at ½ and 1
    (γ = 4); the _ode ones deterministic, the others with noise put back at each step, as a rectified flow takes it (down to σ_down,
    then noised up to the next σ; η ½);
  · heunpp2: Heun++ (Carzit's sd-webui-samplers-scheduler, MIT): three evaluations a step where it can, two then one at the end;
  · exp_heun_2_x0 and _sde: the exponential Heun of data prediction in log-SNR time (SEEDS-2 with r = 1 and φ₂; η 1 for _sde).
On a flow model x = (1−σ)·x0 + σ·ε: the model's velocity v gives x0 = x − σ·v; λ = log((1−σ)/σ), α = 1−σ.
A method of several evaluations a step lays its stage points into the timesteps, as diffusers' Heun does: the pipeline calls the model at
each one, and scheduler.sigmas[k + 1] is always the noise of what step k returns (the mask's blender and the previews read it so).
The schedules: beta57 (beta 0.5, 0.7), kl_optimal (Align Your Steps' KL-optimal spacing), sgm_uniform (uniform in time, its end dropped),
bong_tangent (two arctangent slopes, 1 → ½ → 0), besides diffusers' own Karras, exponential and beta."""
import math

import numpy as np
import torch
from diffusers import FlowMatchEulerDiscreteScheduler
from diffusers.schedulers.scheduling_flow_match_euler_discrete import FlowMatchEulerDiscreteSchedulerOutput

STAGES = {"res_2s": 2, "res_2s_ode": 2, "res_3s": 3, "res_3s_ode": 3, "heunpp2": 3, "exp_heun_2_x0": 2, "exp_heun_2_x0_sde": 2}
SAMPLERS = ("er_sde",) + tuple(STAGES)                 # ours; euler and euler-sde stay diffusers' own
SCHEDULES = ("beta57", "kl_optimal", "sgm_uniform", "bong_tangent")
ETA_RES = 0.5                                          # res_2s, res_3s: half the noise put back each step
SIG_TOP = 0.9999                                       # λ at σ = 1 is −∞: the first step starts a hair below (ComfyUI's offset)


def lam(s):
    s = min(max(float(s), 1e-9), SIG_TOP)
    return math.log((1.0 - s) / s)


def sig_of(lmb):
    return 1.0 / (1.0 + math.exp(lmb))


def phi(j, z):
    """φ_j(z) for z ≤ 0: φ₀ = eᶻ, φ₁ = (eᶻ − 1)/z, φ₂ = (eᶻ − 1 − z)/z², φ₃ = (eᶻ − 1 − z − z²/2)/z³; their series near 0."""
    if j == 0:
        return math.exp(z)
    if abs(z) < 1e-3:
        return sum(z ** k / math.factorial(k + j) for k in range(8))
    rest = sum(z ** k / math.factorial(k) for k in range(j))
    return (math.exp(z) - rest) / z ** j


def down(s, s1, eta):
    """The rectified flow's ancestral step (ComfyUI's RF ancestral): (σ_down, the scale up to s1, the noise's weight); η 0: s1 itself."""
    if eta <= 0 or s1 <= 0:
        return s1, 1.0, 0.0
    sd = s1 * (1.0 + (s1 / s - 1.0) * eta)
    a1, ad = 1.0 - s1, 1.0 - sd
    w = max(0.0, s1 ** 2 - sd ** 2 * a1 ** 2 / ad ** 2) ** 0.5
    return sd, a1 / ad, w


# ------------------------------------------------------------------------------------------------------------------ the schedules
def beta57(n, smax, smin):
    import scipy.stats
    t = 1.0 - np.linspace(0.0, 1.0, n)
    return smin + scipy.stats.beta.ppf(t, 0.5, 0.7) * (smax - smin)


def kl_optimal(n, smax, smin):
    k = np.arange(n) / max(1, n - 1)
    return np.tan(k * math.atan(smin) + (1.0 - k) * math.atan(smax))


def bong_tangent(n, start=1.0, middle=0.5, end=0.0, p1=0.6, p2=0.6, k1=0.2, k2=0.2):
    """Two arctangent slopes, from start to middle and on to end: n + 1 sigmas, the last end."""
    def curve(m, slope, pivot, a, b):
        f = lambda x: ((2 / math.pi) * math.atan(-slope * (x - pivot)) + 1) / 2
        hi, lo = f(0), f(m - 1)
        return [(f(x) - lo) / (hi - lo) * (a - b) + b for x in range(m)]
    total = n + 2
    mid = int((total * p1 + total * p2) / 2)
    q1, q2 = int(total * p1), int(total * p2)
    k1, k2 = k1 / (total / 40), k2 / (total / 40)
    first = curve(mid, k1, q1, start, middle)[:-1]
    second = curve(total - mid, k2, q2 - mid, middle, end)
    return np.array(first + second, dtype=np.float64)


# ------------------------------------------------------------------------------------------------------------------ the scheduler
class HeresyFlowScheduler(FlowMatchEulerDiscreteScheduler):
    """diffusers' flow-match Euler with the studio's own samplers and schedules; set .heresy = {sampler, schedule, seed} before use."""
    heresy = {}

    def set_timesteps(self, num_inference_steps=None, device=None, sigmas=None, mu=None, timesteps=None):
        h = self.heresy or {}
        sch = h.get("schedule") or ""
        if sch == "sgm_uniform":                       # uniform in the unshifted time from its first, the end dropped
            t0 = float(sigmas[0]) if sigmas is not None and len(sigmas) else 1.0
            n = len(sigmas) if sigmas is not None else int(num_inference_steps)
            sigmas = list(np.linspace(t0, 1e-3, n + 1)[:-1])
            num_inference_steps = None
        super().set_timesteps(num_inference_steps=num_inference_steps, device=device, sigmas=sigmas, mu=mu, timesteps=timesteps)
        base = self.sigmas.detach().double().cpu().numpy()
        n = len(base) - 1
        if sch in ("beta57", "kl_optimal") and n > 1:
            base = np.append((beta57 if sch == "beta57" else kl_optimal)(n, base[0], base[n - 1]), 0.0)
        elif sch == "bong_tangent" and n > 1:
            base = np.append(bong_tangent(n)[:-1] * base[0], 0.0)
        self._base = [float(v) for v in base]
        self._plan, evals = [], []
        sampler = h.get("sampler") or "euler"
        for i in range(n):
            s, s1 = self._base[i], self._base[i + 1]
            stages = [s]
            if s1 > 0 and sampler in STAGES:
                eta = ETA_RES if sampler in ("res_2s", "res_3s") else 0.0
                sd = down(s, s1, eta)[0]
                if sampler.startswith("res_2s"):
                    stages.append(sig_of(lam(s) + 0.5 * (lam(sd) - lam(s))))
                elif sampler.startswith("res_3s"):
                    stages += [sig_of(lam(s) + 0.5 * (lam(sd) - lam(s))), sd]
                elif sampler == "heunpp2":
                    s2 = self._base[i + 2] if i + 2 <= n else 0.0
                    stages += [s1] + ([s2] if s2 > 0 else [])
                else:                                  # exp_heun_2_x0(_sde): its second evaluation at the next sigma
                    stages.append(s1)
            for k, e in enumerate(stages):
                self._plan.append((i, k, len(stages)))
                evals.append(e)
        self._evals = evals
        t = torch.tensor(evals, dtype=torch.float32)
        self.timesteps = (t * self.config.num_train_timesteps).to(device=device)
        self.sigmas = torch.cat([t, torch.zeros(1)]).to(device=device)
        self._k, self._st, self._gen, self._er = 0, {}, None, {}
        self._step_index, self._begin_index = None, 0

    def _noise(self, x):
        if self._gen is None:
            self._gen = torch.Generator(device=x.device).manual_seed(int((self.heresy or {}).get("seed") or 0) + 1328)
        return torch.randn(x.shape, generator=self._gen, device=x.device, dtype=torch.float32)

    def step(self, model_output, timestep, sample, s_churn=0.0, s_tmin=0.0, s_tmax=float("inf"), s_noise=1.0, generator=None,
             per_token_timesteps=None, return_dict=True):
        if ((self.heresy or {}).get("sampler") or "euler") in ("euler", "euler-sde"):   # diffusers' own step on one of our schedules
            return super().step(model_output, timestep, sample, s_churn=s_churn, s_tmin=s_tmin, s_tmax=s_tmax, s_noise=s_noise, generator=generator,
                                per_token_timesteps=per_token_timesteps, return_dict=return_dict)
        k = self._k
        i, j, m = self._plan[k]
        x = sample.float()
        e = self._evals[k]
        d = x - e * model_output.float()               # the model's x0 at the sigma it was given
        out = self._advance(i, j, m, x, d)
        self._k += 1
        self._step_index = self._k
        out = out.to(model_output.dtype)
        return FlowMatchEulerDiscreteSchedulerOutput(prev_sample=out) if return_dict else (out,)

    # each method's step: j the stage this call is (of m), the step's own x and x0s kept in self._st
    def _advance(self, i, j, m, x, d):
        sampler = (self.heresy or {}).get("sampler") or "euler"
        s, s1 = self._base[i], self._base[i + 1]
        if s1 <= 0:                                    # the last step: the model's own picture
            return d
        if j == 0:
            self._st = {"x": x, "D": [d]}
        else:
            self._st["D"].append(d)
        if sampler == "er_sde":
            return self._er_sde(i, x, d)
        if sampler.startswith("res_"):
            return self._res(i, j, m, sampler)
        if sampler == "heunpp2":
            return self._heunpp2(i, j, m, x, d)
        return self._exp_heun(i, j, sampler)

    def _er_sde(self, i, x, d):
        """ER-SDE-Solver-3 on a flow model: er_λ = σ/α; its noise scaler x·(e^{x^0.3} + 10); 200 points for its integrals."""
        def ns(v):
            return v * (math.exp(v ** 0.3) + 10.0)
        base = [min(v, SIG_TOP) for v in self._base]
        erl = [v / (1.0 - v) if v > 0 else 0.0 for v in base]
        s, s1 = base[i], base[i + 1]
        es, et = erl[i], erl[i + 1]
        a_s, a_t = 1.0 - s, 1.0 - s1
        r = ns(et) / ns(es)
        x = (a_t / a_s) * r * x + a_t * (1.0 - r) * d
        st = self._er
        if i >= 1 and "d" in st:
            dt = et - es
            pts = [et + p * (-dt / 200.0) for p in range(200)]
            sc = [ns(p) for p in pts]
            s_int = sum(1.0 / v for v in sc) * (-dt / 200.0)
            dd = (d - st["d"]) / (es - erl[i - 1])
            x = x + a_t * (dt + s_int * ns(et)) * dd
            if i >= 2 and "dd" in st:
                s_u = sum((p - es) / v for p, v in zip(pts, sc)) * (-dt / 200.0)
                du = (dd - st["dd"]) / ((es - erl[i - 2]) / 2.0)
                x = x + a_t * (dt ** 2 / 2.0 + s_u * ns(et)) * du
            st["dd"] = dd
        st["d"] = d
        w = max(0.0, et ** 2 - es ** 2 * r ** 2) ** 0.5
        return x + a_t * self._noise(x) * w

    def _res(self, i, j, m, sampler):
        """The refined exponential solver, single-step: two stages at c2 = ½ or three at c2 = ½, c3 = 1 (γ = 4), in λ; data prediction."""
        s, s1 = self._base[i], self._base[i + 1]
        eta = 0.0 if sampler.endswith("_ode") else ETA_RES
        sd, up, w = down(s, s1, eta)
        ls, lt = lam(s), lam(sd)
        h = lt - ls
        x0, D = self._st["x"], self._st["D"]
        if m == 2 and j == 0:                          # to the stage at c2 = ½
            c2 = 0.5
            s2 = sig_of(ls + c2 * h)
            return (s2 / s) * x0 + (1.0 - s2) * h * c2 * phi(1, -c2 * h) * D[0]
        if m == 3 and j == 0:
            c2 = 0.5
            s2 = sig_of(ls + c2 * h)
            return (s2 / s) * x0 + (1.0 - s2) * h * c2 * phi(1, -c2 * h) * D[0]
        if m == 3 and j == 1:                          # to the stage at c3 = 1 (σ_down)
            c2, c3, gam = 0.5, 1.0, 4.0
            a32 = gam * c2 * phi(2, -c2 * h) + (c3 ** 2 / c2) * phi(2, -c3 * h)
            a31 = c3 * phi(1, -c3 * h) - a32
            return (sd / s) * x0 + (1.0 - sd) * h * (a31 * D[0] + a32 * D[1])
        if m == 2:                                     # the step's end from both
            c2 = 0.5
            b2 = phi(2, -h) / c2
            b1 = phi(1, -h) - b2
            xt = (sd / s) * x0 + (1.0 - sd) * h * (b1 * D[0] + b2 * D[1])
        else:
            c2, c3, gam = 0.5, 1.0, 4.0
            b3 = phi(2, -h) / (gam * c2 + c3)
            b2 = gam * b3
            b1 = phi(1, -h) - b2 - b3
            xt = (sd / s) * x0 + (1.0 - sd) * h * (b1 * D[0] + b2 * D[1] + b3 * D[2])
        if w > 0:                                      # noised up from σ_down to the next sigma
            xt = up * xt + self._noise(xt) * w
        return xt

    def _heunpp2(self, i, j, m, x, d):
        """Heun++ in sigma (k-diffusion's d = (x − x0)/σ): Euler, then Heun at σ_{i+1}, then a third look at σ_{i+2}, weighted by σ/(3σ₀)."""
        base = self._base
        s, s1 = base[i], base[i + 1]
        x0, D = self._st["x"], self._st["D"]
        dts = lambda xx, ss, dd: (xx - dd) / ss
        d1 = dts(x0, s, D[0])
        if j == 0:                                     # Euler to σ_{i+1}: Heun's own first look
            return x0 + d1 * (s1 - s)
        x2 = self._st.setdefault("x2", x)
        if m == 2 or (m == 3 and j == 2):
            d2 = dts(self._st["x2"], s1, D[1])
            if m == 2:                                 # Heun, its weights by σ₀ as the method has them
                wgt = s1 / (2 * base[0])
                return x0 + (d1 * (1 - wgt) + d2 * wgt) * (s1 - s)
            s2 = base[i + 2]
            d3 = dts(self._st["x3"], s2, D[2])
            w2, w3 = s1 / (3 * base[0]), s2 / (3 * base[0])
            return x0 + ((1 - w2 - w3) * d1 + w2 * d2 + w3 * d3) * (s1 - s)
        s2 = base[i + 2]                               # m == 3, j == 1: on to σ_{i+2}
        d2 = dts(x2, s1, D[1])
        x3 = x2 + d2 * (s2 - s1)
        self._st["x3"] = x3
        return x3

    def _exp_heun(self, i, j, sampler):
        """SEEDS-2 with r = 1 and φ₂: the exponential Heun of data prediction (η 1 with noise for _sde)."""
        s, s1 = self._base[i], self._base[i + 1]
        eta = 1.0 if sampler.endswith("_sde") else 0.0
        ls, lt = lam(s), lam(s1)
        h = lt - ls
        he = h * (eta + 1)
        x0, D = self._st["x"], self._st["D"]
        a_t = 1.0 - s1
        if j == 0:
            x2 = (s1 / s) * math.exp(-h * eta) * x0 - a_t * math.expm1(-he) * D[0]
            if eta > 0:
                nz = (-math.expm1(-2 * h * eta)) ** 0.5 * self._noise(x0)
                self._st["nz"] = nz
                x2 = x2 + nz * s1
            return x2
        b2 = ((math.expm1(-he) + he) / (-he))          # h·φ₂(−h_η), as ComfyUI's ei_h_phi_2 has it (r = 1)
        b1 = math.expm1(-he) - b2
        xt = (s1 / s) * math.exp(-h * eta) * x0 - a_t * (b1 * D[0] + b2 * D[1])
        if eta > 0:
            xt = xt + self._st["nz"] * s1
        return xt


def install(pipe, sampling, seed=0):
    """The pipeline's scheduler as the sampling asks: ours for our samplers and schedules (diffusers' flags kept for Karras, exponential and
    beta), else nothing changed here (artist_job.set_schedule keeps diffusers' own for Euler and Euler SDE)."""
    sm = (sampling or {}).get("sampler") or "euler"
    sc = (sampling or {}).get("schedule") or "simple"
    if sm not in SAMPLERS and sc not in SCHEDULES:
        return False
    flags = {"use_karras_sigmas": sc == "karras", "use_exponential_sigmas": sc == "exponential", "use_beta_sigmas": sc == "beta",
             "stochastic_sampling": False}
    sch = HeresyFlowScheduler.from_config({**pipe.scheduler.config, **flags})
    sch.heresy = {"sampler": sm if sm in SAMPLERS else ("euler-sde" if sm == "euler-sde" else "euler"), "schedule": sc if sc in SCHEDULES else "", "seed": seed}
    if sm == "euler-sde":                              # Euler SDE on one of our schedules: diffusers' own stochastic step
        sch.register_to_config(stochastic_sampling=True)
    pipe.scheduler = sch
    return True
