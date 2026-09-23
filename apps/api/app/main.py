from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.routes import adapters, ai, auth, capture, courses, email, exports, health, note_images, notes, plugins, quiz, review, screenshots, search, settings, setup, stats, transcripts, video_events
from app.services.digest_scheduler import start_digest_scheduler


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncGenerator[None, None]:
    if get_settings().digest_scheduler_enabled:
        start_digest_scheduler()
    yield


def create_app() -> FastAPI:
    app = FastAPI(title="Learning Assistant API", version="0.1.0", lifespan=lifespan)
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
    app.include_router(note_images.router, prefix="/api/v1")
    app.include_router(adapters.router, prefix="/api/v1")
    app.include_router(exports.router, prefix="/api/v1")
    app.include_router(settings.router, prefix="/api/v1")
    app.include_router(setup.router, prefix="/api/v1")
    app.include_router(search.router, prefix="/api/v1")
    app.include_router(stats.router, prefix="/api/v1")
    app.include_router(review.router, prefix="/api/v1")
    app.include_router(ai.router, prefix="/api/v1")
    app.include_router(screenshots.router, prefix="/api/v1")
    app.include_router(quiz.router, prefix="/api/v1")
    app.include_router(email.router, prefix="/api/v1")
    return app


app = create_app()
