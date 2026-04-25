FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    libpq-dev \
    libgeos-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY pyproject.toml .

RUN pip install --no-cache-dir uv && \
    uv pip install --system -e ".[dev]"

COPY . .

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1
