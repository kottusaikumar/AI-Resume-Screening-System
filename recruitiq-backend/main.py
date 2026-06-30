"""
main.py
-------
Entry point for the RecruitIQ FastAPI backend.

Run with:
    python main.py
or:
    uvicorn main:app --reload --host 0.0.0.0 --port 8000

Host/port (and all security settings) are read from .env — see
app/core/config.py and .env.example.
"""

from app.api import app  # noqa: F401 — uvicorn target
from app.core import config

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=config.HOST, port=config.PORT, reload=True)
