from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes import adapters, auth, capture, courses, exports, health, notes, plugins, settings, setup, transcripts, video_events


def create_app() -> FastAPI:
    app = FastAPI(title="Learning Assistant API", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(health.router, prefix="/api/v1")
    app.include_router(plugins.router, prefix="/api/v1")
    app.include_router(auth.router, prefix="/api/v1")
    app.include_router(capture.router, prefix="/api/v1")
    app.include_router(courses.router, prefix="/api/v1")
    app.include_router(transcripts.router, prefix="/api/v1")
    app.include_router(video_events.router, prefix="/api/v1")
    app.include_router(notes.router, prefix="/api/v1")
    app.include_router(adapters.router, prefix="/api/v1")
    app.include_router(exports.router, prefix="/api/v1")
    app.include_router(settings.router, prefix="/api/v1")
    app.include_router(setup.router, prefix="/api/v1")
    return app


app = create_app()
