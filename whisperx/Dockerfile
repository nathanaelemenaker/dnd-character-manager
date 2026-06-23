# Bookworm (Debian 12) ships FFmpeg 5.1 which still has the channel_layout API
# that av==11.0.0 (a faster-whisper dependency) requires. Trixie (Debian 13)
# ships FFmpeg 7.x which removed that API, causing source builds to fail,
# and av==11.x has no pre-built wheels.
FROM python:3.11-slim-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    git \
    build-essential \
    pkg-config \
    python3-dev \
    libavformat-dev \
    libavcodec-dev \
    libavdevice-dev \
    libavutil-dev \
    libswscale-dev \
    libswresample-dev \
    libavfilter-dev \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .

# Pin to torch 2.0.x — pyannote.audio 3.1.x uses torchaudio APIs
# (set_audio_backend, get_audio_backend, torchaudio.backend.common)
# that were all removed in torchaudio 2.1.0.
RUN pip install --no-cache-dir \
    "torch==2.0.1+cpu" \
    "torchaudio==2.0.2+cpu" \
    --index-url https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .

EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
