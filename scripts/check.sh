#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
python3 -m unittest discover -s tests
node --check static/app.js
node tests/asset_views.cjs
node tests/startup.cjs
node tests/flow_split.cjs
python3 -m compileall -q server.py assets.py workspaces.py
