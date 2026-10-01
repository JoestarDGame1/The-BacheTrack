#!/bin/bash
cd "$(dirname "$0")"
source .venv/bin/activate
uvicorn ia_service:app --host 127.0.0.1 --port 8000