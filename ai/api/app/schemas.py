from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator


class ProfileUpdate(BaseModel):
    full_name: str = Field(min_length=2, max_length=50)
    phone: str | None = Field(default=None, max_length=30)
    notifications_enabled: bool = True
    location_enabled: bool = False

class SearchInput(BaseModel):
    q: str = Field(min_length=2, max_length=100)
    location_id: str | None = None
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    page: int = Field(default=0, ge=0, le=100)

    @field_validator("q")
    @classmethod
    def trimmed(cls, q):
        q = q.strip()
        if len(q) < 2:
            raise ValueError("Search must be 2 to 100 characters.")
        return q

class ClaimCreate(BaseModel):
    item_id: str
    message: str = Field(min_length=15, max_length=1000)

class MessageCreate(BaseModel):
    message: str = Field(min_length=1, max_length=500)

class UploadFile(BaseModel):
    filename: str = Field(min_length=1, max_length=180)
    content_type: Literal["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]
    size_bytes: int = Field(gt=0, le=10 * 1024 * 1024)

class UploadRequest(BaseModel):
    files: list[UploadFile] = Field(min_length=1, max_length=6)

class SuggestRequest(BaseModel):
    image_paths: list[str] = Field(min_length=2, max_length=6)

class ItemImage(BaseModel):
    path: str
    position: int = Field(ge=0, le=7)
    is_cover: bool = False

class ItemCreate(BaseModel):
    title: str = Field(min_length=3, max_length=60)
    category: str = Field(min_length=2, max_length=50)
    colours: list[str] = Field(default_factory=list, max_length=5)
    tags: list[str] = Field(default_factory=list, max_length=8)
    location_id: str
    exact_spot: str | None = Field(default=None, max_length=80)
    found_at: datetime
    private_description: str = Field(min_length=20, max_length=1000)
    images: list[ItemImage] = Field(min_length=2, max_length=6)

    @field_validator("images")
    @classmethod
    def one_cover(cls, images):
        if sum(image.is_cover for image in images) != 1:
            raise ValueError("Choose exactly one cover photo.")
        if len({image.position for image in images}) != len(images):
            raise ValueError("Photo positions must be unique.")
        return images

    @field_validator("found_at")
    @classmethod
    def not_in_future(cls, value):
        now = datetime.now(timezone.utc)
        compare = value if value.tzinfo else value.replace(tzinfo=timezone.utc)
        if compare > now:
            raise ValueError("Date can't be in the future.")
        return value

    @field_validator("tags")
    @classmethod
    def valid_tags(cls, tags):
        if any(len(tag.strip()) < 2 or len(tag.strip()) > 24 for tag in tags):
            raise ValueError("Tags must be 2 to 24 characters.")
        return tags

class ItemUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=60)
    category: str | None = Field(default=None, min_length=2, max_length=50)
    colours: list[str] | None = Field(default=None, max_length=5)
    tags: list[str] | None = Field(default=None, max_length=8)
    location_id: str | None = None
    exact_spot: str | None = Field(default=None, max_length=80)
    found_at: datetime | None = None

class ArchiveInput(BaseModel):
    reason: Literal["donated", "disposed", "police", "other"]
    note: str | None = Field(default=None, max_length=500)

class RejectInput(BaseModel):
    reason: Literal["details_mismatch", "already_returned", "suspected_false_claim", "other"]
    note: str | None = Field(default=None, max_length=200)

class ApproveInput(BaseModel):
    pickup_expires_at: datetime | None = None

class PickupVerify(BaseModel):
    code: str | None = Field(default=None, pattern=r"^\d{6}$")
    qr_token: str | None = None

    @field_validator("qr_token")
    @classmethod
    def exactly_one(cls, token, info):
        if bool(token) == bool(info.data.get("code")):
            raise ValueError("Enter a pickup code or scan a QR code.")
        return token
