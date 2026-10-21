from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=128)
    password: str = Field(min_length=1, max_length=256)


class SettingsUpdate(BaseModel):
    confidence_threshold: float | None = Field(default=None, ge=0.05, le=0.95)
    max_upload_mb: int | None = Field(default=None, ge=1, le=2048)
