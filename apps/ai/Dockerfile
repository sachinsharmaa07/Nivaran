# syntax=docker/dockerfile:1

FROM python:3.12-slim-bookworm AS deps
WORKDIR /app
COPY apps/ai/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

FROM deps AS test
COPY apps/ai/requirements-dev.txt .
RUN pip install --no-cache-dir -r requirements-dev.txt
COPY apps/ai/pyproject.toml ./
COPY apps/ai/main.py ./
COPY apps/ai/tests ./tests

FROM python:3.12-slim-bookworm AS runtime
WORKDIR /app

RUN addgroup --system nivaran && adduser --system --ingroup nivaran nivaran

COPY --from=deps /usr/local /usr/local
COPY apps/ai/main.py ./

USER nivaran
EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/healthz')" || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
