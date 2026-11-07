from pathlib import Path

from dotenv import load_dotenv

# Config reads the environment at import time, so load .env first (deployments set real env vars).
load_dotenv(Path(__file__).parent / ".env")

from app import create_app  # noqa: E402

app = create_app()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
