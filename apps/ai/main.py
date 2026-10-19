from fastapi import FastAPI

app = FastAPI(title="Nivaran AI Service", version="0.0.0")


@app.get("/healthz")
def healthz() -> dict[str, str]:
    """Liveness probe. Returns 200 immediately."""
    return {"status": "ok"}
