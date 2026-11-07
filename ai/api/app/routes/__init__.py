from flask import Flask

from .claims import bp as claims_bp
from .items import bp as items_bp
from .me import bp as me_bp
from .push import bp as push_bp
from .staff import bp as staff_bp


def register_blueprints(app: Flask) -> None:
    for blueprint in (me_bp, items_bp, claims_bp, push_bp, staff_bp):
        app.register_blueprint(blueprint, url_prefix="/v1")
