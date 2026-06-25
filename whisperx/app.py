import os
import gc
import traceback
from typing import Optional
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel


app = FastAPI()

_asr_model = None
_diarize_pipeline = None

MODEL_NAME = os.environ.get("WHISPERX_MODEL", "small")
COMPUTE_TYPE = os.environ.get("WHISPERX_COMPUTE_TYPE", "int8")
HF_TOKEN = os.environ.get("HF_TOKEN", "")


def _ensure_vad_model():
    """Download the VAD segmentation model from HuggingFace and patch
    whisperx's SHA256 check to match the file we actually downloaded.

    The whisperx S3 bucket is inaccessible (PermanentRedirect with no
    Location header). The SHA256 embedded in the S3 URL path is the hash
    of a specific older version of pytorch_model.bin — not a HuggingFace
    git revision. We download the current main-branch version and patch
    the URL so whisperx's hash check accepts it.

    whisperx uses torch.hub._get_torch_home() (→ ~/.cache/torch), NOT
    torch.hub.get_dir() (→ ~/.cache/torch/hub) — must match exactly.
    """
    import hashlib
    import shutil
    import torch
    import whisperx.vad as _vad
    from huggingface_hub import hf_hub_download

    model_dir = torch.hub._get_torch_home()
    os.makedirs(model_dir, exist_ok=True)
    model_fp = os.path.join(model_dir, "whisperx-vad-segmentation.bin")

    if not os.path.isfile(model_fp):
        print("Downloading VAD model from HuggingFace pyannote/segmentation ...", flush=True)
        hf_path = hf_hub_download(
            repo_id="pyannote/segmentation",
            filename="pytorch_model.bin",
            token=HF_TOKEN or None,
        )
        shutil.copy2(hf_path, model_fp)
        print(f"VAD model saved to {model_fp}", flush=True)

    # Patch whisperx's hardcoded URL so its SHA256 check matches the file
    # we actually have (the S3 hash may differ from the HuggingFace version).
    actual_sha256 = hashlib.sha256(open(model_fp, "rb").read()).hexdigest()
    parts = _vad.VAD_SEGMENTATION_URL.split("/")
    parts[-2] = actual_sha256
    _vad.VAD_SEGMENTATION_URL = "/".join(parts)


def get_asr_model():
    global _asr_model
    if _asr_model is None:
        import whisperx
        _ensure_vad_model()
        _asr_model = whisperx.load_model(MODEL_NAME, device="cpu", compute_type=COMPUTE_TYPE)
    return _asr_model


def get_diarize_pipeline():
    global _diarize_pipeline
    if _diarize_pipeline is None:
        import whisperx
        _diarize_pipeline = whisperx.DiarizationPipeline(
            use_auth_token=HF_TOKEN,
            device="cpu",
        )
    return _diarize_pipeline


class DiarizeRequest(BaseModel):
    path: str
    language: Optional[str] = "en"
    min_speakers: Optional[int] = None
    max_speakers: Optional[int] = None


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/diarize")
def diarize(req: DiarizeRequest):
    import whisperx

    if not os.path.exists(req.path):
        raise HTTPException(status_code=404, detail=f"Audio file not found: {req.path}")

    try:
        # 1 — Transcribe
        model = get_asr_model()
        audio = whisperx.load_audio(req.path)
        result = model.transcribe(audio, language=req.language, batch_size=4)

        # 2 — Align (improves word-level timestamps needed for diarization)
        align_model, metadata = whisperx.load_align_model(
            language_code=result["language"], device="cpu"
        )
        result = whisperx.align(
            result["segments"], align_model, metadata, audio, device="cpu",
            return_char_alignments=False,
        )
        del align_model
        gc.collect()

        # 3 — Diarize
        pipeline = get_diarize_pipeline()
        diarize_kwargs = {}
        if req.min_speakers:
            diarize_kwargs["min_speakers"] = req.min_speakers
        if req.max_speakers:
            diarize_kwargs["max_speakers"] = req.max_speakers
        diarize_segments = pipeline(audio, **diarize_kwargs)

        # 4 — Assign speakers to transcript segments
        result = whisperx.assign_word_speakers(diarize_segments, result)

        # Flatten: one entry per segment with a speaker label
        segments = []
        for seg in result.get("segments", []):
            speaker = seg.get("speaker", "SPEAKER_00")
            segments.append({
                "start": round(seg["start"], 2),
                "end": round(seg["end"], 2),
                "speaker": speaker,
                "text": seg["text"].strip(),
            })

        return {"segments": segments, "language": result.get("language", req.language)}

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
