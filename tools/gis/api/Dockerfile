FROM python:3.13-slim-trixie AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py environment.py competitions.py .
USER 1000:1000
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 BCBD_DATA=/data
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--no-proxy-headers"]

FROM runtime AS test
USER root
RUN pip install --no-cache-dir httpx==0.28.1
COPY test_api.py test_environment.py .
USER 1000:1000
CMD ["python", "test_api.py"]

FROM runtime AS production
