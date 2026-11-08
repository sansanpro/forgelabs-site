# The App Ad Studio render worker, for any container host (Fly.io, Render, Cloud Run, a VPS).
#   docker build -t forge-worker engine/
#   docker run --env-file .env.local forge-worker
# Needs SUPABASE_SERVICE_ROLE_KEY and ELEVENLABS_API_KEY (SUPABASE_URL defaults to the Studio's project).
FROM python:3.12-slim
WORKDIR /engine
COPY requirements.txt .
RUN pip install --no-cache-dir Pillow imageio-ffmpeg requests
COPY forge_engine ./forge_engine
COPY assets ./assets
COPY worker.py .
RUN useradd --create-home worker
USER worker
CMD ["python", "worker.py"]
