FROM python:3.11-slim

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

# torch CPU wheel is large — install separately so layer is cached
RUN pip install --no-cache-dir torch torchaudio --index-url https://download.pytorch.org/whl/cpu
# Pre-install av wheel explicitly to avoid source build
RUN pip install --no-cache-dir "av==11.0.0"
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .

EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
