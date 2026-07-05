from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes import health


def create_app() -> FastAPI:
    app = FastAPI(title="Learning Assistant API", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://127.0.0.1:17891", "http://localhost:17891"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(health.router, prefix="/api/v1")
    return app


app = create_app()
