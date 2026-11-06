"""Generate Wish Cairn assets with FLUX on a rented GPU and upload them to the S3 relay."""
import os, io, json, time, traceback
import numpy as np, torch, boto3
from PIL import Image, ImageFilter
from botocore.config import Config

S3 = boto3.client("s3", endpoint_url=os.environ["S3_ENDPOINT"], region_name=os.environ.get("S3_REGION", "auto"),
                  aws_access_key_id=os.environ["S3_KEY"], aws_secret_access_key=os.environ["S3_SECRET"],
                  config=Config(signature_version="s3v4", s3={"addressing_style": os.environ.get("S3_STYLE", "path")}))
BUCKET, PREFIX = os.environ["S3_BUCKET"], os.environ["S3_PREFIX"]
T0 = time.time()
FILES = []

def status(stage, pct, msg=""):
    body = json.dumps({"stage": stage, "pct": pct, "msg": msg, "files": FILES, "elapsed": round(time.time() - T0)})
    S3.put_object(Bucket=BUCKET, Key=f"{PREFIX}/status.json", Body=body, ContentType="application/json")
    print(f"[{round(time.time()-T0)}s] {stage} {pct}% {msg}", flush=True)

def upload(img, name, quality=92):
    buf = io.BytesIO(); img.convert("RGB").save(buf, "JPEG", quality=quality, optimize=True); buf.seek(0)
    S3.put_object(Bucket=BUCKET, Key=f"{PREFIX}/{name}", Body=buf.getvalue(), ContentType="image/jpeg")
    FILES.append(name)

# ---------- image post-processing ----------
def seamless(img, feather=0.12):
    """Offset by half and feather the cross-shaped seam so the texture tiles."""
    a = np.asarray(img.convert("RGB")).astype(np.float32) / 255
    h, w, _ = a.shape
    b = np.roll(np.roll(a, h // 2, 0), w // 2, 1)          # seams now run through the middle
    fy = int(h * feather); fx = int(w * feather)
    wy = np.ones(h, np.float32); wx = np.ones(w, np.float32)
    ramp_y = np.linspace(0, 1, fy); ramp_x = np.linspace(0, 1, fx)
    wy[h//2 - fy//2 : h//2 - fy//2 + fy] = np.abs(ramp_y * 2 - 1); wx[w//2 - fx//2 : w//2 - fx//2 + fx] = np.abs(ramp_x * 2 - 1)
    m = np.minimum(wy[:, None], wx[None, :])[..., None]      # 1 away from seams, 0 on the seam
    out = b * m + a * (1 - m)                                # original (whose seams are at the border, now hidden) fills the seam
    return Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8))

def normal_from_height(img, strength=2.2, blur=1.2):
    g = np.asarray(img.convert("L").filter(ImageFilter.GaussianBlur(blur))).astype(np.float32) / 255
    gy, gx = np.gradient(g)
    n = np.dstack([-gx * strength, -gy * strength, np.ones_like(g)])
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    return Image.fromarray(((n * 0.5 + 0.5) * 255).astype(np.uint8))

def roughness_from_albedo(img):
    g = np.asarray(img.convert("L").filter(ImageFilter.GaussianBlur(2))).astype(np.float32) / 255
    r = 0.62 + (1 - g) * 0.3                                  # darker = rougher; range ≈ 0.62–0.92
    return Image.fromarray((np.clip(r, 0, 1) * 255).astype(np.uint8)).convert("RGB")

def sky_seam(img, feather=0.08):
    a = np.asarray(img.convert("RGB")).astype(np.float32) / 255
    h, w, _ = a.shape
    b = np.roll(a, w // 2, 1); fx = int(w * feather)
    wx = np.ones(w, np.float32); wx[w//2 - fx//2 : w//2 - fx//2 + fx] = np.abs(np.linspace(0, 1, fx) * 2 - 1)
    out = b * wx[None, :, None] + a * (1 - wx[None, :, None])
    return Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8))

# ---------- model ----------
try:
    status("setup", 2, "loading model")
    from huggingface_hub import login
    if os.environ.get("HF_TOKEN"): login(token=os.environ["HF_TOKEN"], add_to_git_credential=False)
    from diffusers import FluxPipeline, StableDiffusionXLPipeline
    vram = torch.cuda.get_device_properties(0).total_memory / 2**30
    # Preference order. FLUX models are gated on Hugging Face: accept their license with the
    # account behind HF_TOKEN and the next run upgrades itself. SDXL needs no acceptance.
    CANDIDATES = [
        ("black-forest-labs/FLUX.1-dev", FluxPipeline, dict(num_inference_steps=28, guidance_scale=3.5)),
        ("black-forest-labs/FLUX.1-schnell", FluxPipeline, dict(num_inference_steps=4, guidance_scale=0.0)),
        ("stabilityai/stable-diffusion-xl-base-1.0", StableDiffusionXLPipeline, dict(num_inference_steps=40, guidance_scale=6.5)),
    ]
    pipe = None
    for model, cls, params in CANDIDATES:
        try:
            kw = dict(torch_dtype=torch.bfloat16) if cls is FluxPipeline else dict(torch_dtype=torch.float16, variant="fp16", use_safetensors=True)
            pipe = cls.from_pretrained(model, **kw); break
        except Exception as e:
            print(f"{model} unavailable:", str(e)[:160].replace(chr(10), " "))
    if pipe is None: raise RuntimeError("no model could be loaded")
    is_flux = isinstance(pipe, FluxPipeline)
    if vram < 40 and is_flux: pipe.enable_model_cpu_offload()
    else: pipe.to("cuda")
    status("setup", 15, f"{model} on {vram:.0f}GB")
    gen = lambda seed: torch.Generator("cuda").manual_seed(seed)
    NEG_HINT = " No text, no watermark, no people, no logos."
    NEG = "text, watermark, logo, people, person, hands, blurry, low quality, frame, border, vignette"
    def run(prompt, width, height, seed):
        if is_flux:
            return pipe(prompt, width=width, height=height, generator=gen(seed), **params).images[0]
        return pipe(prompt, negative_prompt=NEG, width=width, height=height, generator=gen(seed), **params).images[0]

    # ---------- stone albedo (two candidates) ----------
    stone_prompt = ("Seamless tileable texture of a smooth grey river stone surface, subtle warm brown mineral veins, "
                    "fine granite speckle, slightly worn, photographed perfectly flat with soft even light, no shadows, "
                    "no highlights, no edges, 8k PBR albedo material scan, uniform scale." + NEG_HINT)
    for i, seed in enumerate([11, 23]):
        status("stone", 20 + i * 20, f"albedo {i+1}/2")
        img = run(stone_prompt, 1024, 1024, seed)
        img = seamless(img).resize((2048, 2048), Image.LANCZOS)
        upload(img, "stone_albedo.jpg" if i == 0 else "stone_albedo_alt.jpg")
        if i == 0:
            upload(normal_from_height(img), "stone_normal.jpg", 90)
            upload(roughness_from_albedo(img), "stone_roughness.jpg", 85)

    # ---------- sky (equirectangular) ----------
    status("sky", 65, "panorama")
    sky_prompt = ("Equirectangular 360 degree panorama of a clear night sky over a quiet mountain pass in Korea, deep blue "
                  "to violet gradient, a low full moon near the left horizon with soft glow, thousands of stars, faint "
                  "milky way band, thin high clouds, distant dark ridgelines all around the horizon, ground is dark "
                  "mossy grass, no sun, photographic, HDR look." + NEG_HINT)
    # SDXL is trained at ~1MP: render 1536x768 and upscale; FLUX handles 2048x1024 directly.
    sky = run(sky_prompt, 2048 if is_flux else 1536, 1024 if is_flux else 768, 7)
    if sky.width < 2048: sky = sky.resize((2048, 1024), Image.LANCZOS)
    upload(sky_seam(sky), "skybox.jpg", 90)

    status("done", 100, f"{model} · {len(FILES)} files")
except Exception:
    err = traceback.format_exc()
    print(err)
    status("error", 100, err[-800:])
