from __future__ import annotations

from pathlib import Path
from flask import Flask, Response, jsonify, send_file

from .config import Config
from .errors import register_error_handlers
from .extensions import cors, limiter
from .routes import register_blueprints


def create_app(config: type[Config] | object = Config) -> Flask:
    app = Flask(__name__)
    app.config.from_object(config)

    cors.init_app(
        app,
        resources={r"/v1/*": {"origins": app.config["CORS_ORIGINS"]}},
        supports_credentials=False,
    )
    limiter.init_app(app)
    register_error_handlers(app)
    register_blueprints(app)

    @app.get("/v1/health")
    def health():
        return jsonify({"data": {"status": "ok"}})

    @app.get("/openapi.yaml")
    def openapi_spec():
        return send_file(Path(app.root_path).parent / "openapi.yaml", mimetype="application/yaml")

    @app.get("/docs")
    def swagger_ui():
        return Response("""<!doctype html><html><head><title>Lost & Found API</title>
<link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"></head>
<body><div id="swagger-ui"></div><script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
<script>SwaggerUIBundle({url:'/openapi.yaml',dom_id:'#swagger-ui',persistAuthorization:true})</script></body></html>""", mimetype="text/html")

    return app
