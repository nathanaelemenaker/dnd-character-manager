FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    git \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .

# torch CPU wheel is large — install separately so layer is cached
RUN pip install --no-cache-dir torch torchaudio --index-url https://download.pytorch.org/whl/cpu
# Force av to install from its pre-built manylinux wheel (not from source).
# av==11.x source code uses the old FFmpeg 6.x API and won't compile against
# the FFmpeg 7.x headers present on Debian Trixie.
RUN pip install --no-cache-dir --only-binary :all: "av==11.0.0"
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .

EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
