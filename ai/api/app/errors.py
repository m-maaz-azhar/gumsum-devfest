from __future__ import annotations

from dataclasses import dataclass
from uuid import uuid4

from flask import Flask, jsonify
from pydantic import ValidationError
from werkzeug.exceptions import HTTPException


@dataclass
class ApiError(Exception):
    message: str
    code: str = "BAD_REQUEST"
    status: int = 400
    fields: dict[str, str] | None = None


def error_response(error: ApiError):
    payload = {
        "code": error.code,
        "message": error.message,
        "request_id": f"req_{uuid4().hex[:12]}",
    }
    if error.fields:
        payload["fields"] = error.fields
    return jsonify({"error": payload}), error.status


def register_error_handlers(app: Flask) -> None:
    app.register_error_handler(ApiError, error_response)

    @app.errorhandler(ValidationError)
    def handle_validation(error: ValidationError):
        fields = {
            ".".join(str(part) for part in item["loc"]): item["msg"]
            for item in error.errors()
        }
        return error_response(ApiError("Check the highlighted fields.", "VALIDATION", 422, fields))

    @app.errorhandler(HTTPException)
    def http_error(error: HTTPException):
        status = error.code or 500
        code, message = {
            400: ("BAD_REQUEST", "Check your request and try again."),
            401: ("UNAUTHENTICATED", "Sign in to continue."),
            403: ("FORBIDDEN", "You do not have access to this area."),
            404: ("NOT_FOUND", "That resource was not found."),
            405: ("METHOD_NOT_ALLOWED", "That method is not allowed."),
            413: ("PAYLOAD_TOO_LARGE", "That request is too large."),
            429: ("RATE_LIMITED", "Too many requests. Try again later."),
        }.get(status, ("HTTP_ERROR", "Something went wrong. Try again."))
        return error_response(ApiError(message, code, status))

    @app.errorhandler(Exception)
    def unexpected(error: Exception):
        app.logger.exception("Unhandled API error", exc_info=error)
        return error_response(ApiError("Something went wrong. Try again.", "INTERNAL", 500))
