#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
engine="${CONTAINER_ENGINE:-docker}"
image="${TEST_IMAGE:-playbook-web:smoke}"
name="playbook-web-smoke-${RANDOM}"
cleanup() { "$engine" rm -f "$name" >/dev/null 2>&1 || true; }
trap cleanup EXIT
"$engine" run -d --name "$name" "$image" >/dev/null
ready=false
for attempt in {1..30}; do
  if "$engine" exec "$name" python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8765/api/health',timeout=2)" >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
if [[ "$ready" != true ]]; then
  "$engine" logs "$name"
  exit 1
fi
"$engine" exec -i "$name" python - <<'PY'
import json
import os
import subprocess
import urllib.request
from pathlib import Path

base = 'http://127.0.0.1:8765'
assert os.getuid() != 0, 'Container must run as non-root'
assert json.load(urllib.request.urlopen(base+'/api/health'))['version'] == Path('VERSION').read_text().strip()
assert b'Playbook UI' in urllib.request.urlopen(base).read() or b'Playbook' in urllib.request.urlopen(base).read()
subprocess.run(['ansible-playbook','--version'],check=True)
state = json.load(urllib.request.urlopen(base+'/api/state'))
assert any(f['category'] == 'playbooks' for f in state['files'])
assert state['ansible']
# Exercise persistent settings and an actual file write inside the container.
payload = dict(workspace=state['workspace']['id'],name='Container smoke',directory=state['directory'])
request = urllib.request.Request(base+'/api/settings',data=json.dumps(payload).encode(),headers={'Content-Type':'application/json','X-App-Token':state['token']})
assert urllib.request.urlopen(request).status == 200
assert Path('/data/.settings.json').is_file()
path = 'group_vars/all.yml'
doc = json.load(urllib.request.urlopen(base+'/api/file?path='+path))
payload = dict(workspace=state['workspace']['id'],path=path,version=doc['version'],content=doc['content']+'\n# container smoke\n')
request = urllib.request.Request(base+'/api/file',data=json.dumps(payload).encode(),headers={'Content-Type':'application/json','X-App-Token':state['token']})
assert urllib.request.urlopen(request).status == 200
assert 'container smoke' in Path(state['directory'],path).read_text()
print('Container smoke test passed')
PY
