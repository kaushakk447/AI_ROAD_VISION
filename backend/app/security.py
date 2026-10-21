import base64
import hashlib
import hmac
import json
import time

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app import config


TOKEN_TTL_SECONDS = 12 * 60 * 60
PUBLIC_API_PATHS = {"/api/health", "/api/auth/status", "/api/auth/login"}


def _encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def create_access_token() -> str:
    payload = _encode(
        json.dumps(
            {"sub": config.AUTH_USERNAME, "exp": int(time.time()) + TOKEN_TTL_SECONDS},
            separators=(",", ":"),
        ).encode("utf-8")
    )
    signature = _encode(hmac.new(config.AUTH_SECRET.encode("utf-8"), payload.encode("ascii"), hashlib.sha256).digest())
    return f"{payload}.{signature}"


def verify_access_token(token: str) -> bool:
    try:
        payload, signature = token.split(".", 1)
        expected = _encode(hmac.new(config.AUTH_SECRET.encode("utf-8"), payload.encode("ascii"), hashlib.sha256).digest())
        if not hmac.compare_digest(expected, signature):
            return False
        claims = json.loads(_decode(payload))
        return claims.get("sub") == config.AUTH_USERNAME and int(claims.get("exp", 0)) > int(time.time())
    except (ValueError, TypeError, UnicodeDecodeError, json.JSONDecodeError):
        return False


class AuthenticationMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        path = request.url.path
        if not config.AUTH_ENABLED or not path.startswith("/api/") or path in PUBLIC_API_PATHS or request.method == "OPTIONS":
            return await call_next(request)

        authorization = request.headers.get("authorization", "")
        scheme, _, token = authorization.partition(" ")
        if scheme.lower() != "bearer" or not token or not verify_access_token(token):
            return JSONResponse(
                {"detail": "Sign in to use this workspace."},
                status_code=401,
                headers={"WWW-Authenticate": "Bearer"},
            )
        return await call_next(request)
