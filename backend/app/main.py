from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import config
from app.api.routes.routes import router, video_executor
from app.database import store
from app.security import AuthenticationMiddleware


@asynccontextmanager
async def lifespan(_: FastAPI):
    config.ensure_directories()
    store.initialize()
    yield
    video_executor.shutdown(wait=False, cancel_futures=True)


app = FastAPI(
    title="AI Road Vision API",
    description="Road object detection, video tracking, and traffic analytics.",
    version="1.0.0",
    lifespan=lifespan,
    docs_url=None if config.AUTH_ENABLED else "/docs",
    redoc_url=None if config.AUTH_ENABLED else "/redoc",
    openapi_url=None if config.AUTH_ENABLED else "/openapi.json",
)
app.add_middleware(AuthenticationMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
    expose_headers=["Content-Disposition"],
)
app.include_router(router)
