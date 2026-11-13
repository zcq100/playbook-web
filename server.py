import json, os, secrets, shutil, subprocess, threading, uuid
from pathlib import Path
import workspaces
from assets import read_asset, save_asset, is_playbook, asset_summary, classify_asset
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

BASE = Path(__file__).resolve().parent
VERSION = (BASE / 'VERSION').read_text().strip()
TOKEN = secrets.token_urlsafe(32)
runs = {}
lock = threading.Lock()

def root(workspace_id=None):
    return Path(workspaces.get_workspace(workspace_id)['directory']).expanduser().resolve()

def inside(value, base=None):
    base = base if base is not None else root()
    p = (base / value).resolve()
    if not p.is_relative_to(base):
        raise ValueError('文件路径超出目标目录')
    return p

def scan(base=None, summaries=False):
    base = base if base is not None else root()
    entries = []
    for folder, dirs, files in os.walk(base, followlinks=False):
        dirs[:] = sorted(d for d in dirs if not d.startswith('.') and not (Path(folder)/d).is_symlink())
        for name in sorted(files):
            p = Path(folder) / name
            if p.is_symlink() or name.startswith('.') or ('files' not in p.relative_to(base).parts[:-1] and 'templates' not in p.relative_to(base).parts[:-1] and p.suffix not in ('.yml', '.yaml', '.ini', '.cfg', '.j2', '.json') and name not in ('hosts', 'inventory')):
                continue
            rel = p.relative_to(base)
            parts = rel.parts
            asset_type = classify_asset(rel, p)
            role = None
            if 'roles' in parts:
                index = parts.index('roles')
                if len(parts) > index + 2:
                    role = str(Path(*parts[:index+2]))
            kind = 'roles' if role else asset_type
            entry = dict(path=str(rel), name=name, category=kind, assetType=asset_type, role=role, size=p.stat().st_size)
            if summaries:
                entry['summary'] = asset_summary(p, asset_type)
            entries.append(entry)
            if len(entries) >= 10000:
                return entries
    return entries

def execute(run_id, args, cwd):
    item = runs[run_id]
    try:
        env = {**os.environ, 'ANSIBLE_NOCOLOR': '1', 'PYTHONUNBUFFERED': '1'}
        proc = subprocess.Popen(args, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, errors='replace', env=env, start_new_session=True, stdin=subprocess.DEVNULL)
        with lock:
            item['process'] = proc
        for line in proc.stdout:
            with lock:
                item['output'] = (item['output'] + line)[-500000:]
        code = proc.wait()
        with lock:
            item.update(status='success' if code == 0 else 'failed', code=code)
    except Exception as exc:
        with lock:
            item.update(status='failed', output=str(exc), code=-1)

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BASE/'static'), **kwargs)

    def parse_request(self):
        if not super().parse_request():
            return False
        host = self.headers.get('Host', '').split(':')[0]
        if host not in ('127.0.0.1', 'localhost'):
            self.send_error(403, 'Local access only')
            return False
        return True

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def reply(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        from urllib.parse import urlparse, parse_qs
        u = urlparse(self.path)
        try:
            if not u.path.startswith('/api/'):
                return super().do_GET()
            if u.path == '/api/health':
                return self.reply(dict(status='ok', version=VERSION))
            workspace = workspaces.get_workspace(parse_qs(u.query).get('workspace', [None])[0])
            base = root(workspace['id'])
            if u.path == '/api/state':
                return self.reply(dict(version=VERSION, directory=str(base), workspace=workspace, workspaces=workspaces.read_settings()['workspaces'], files=scan(base, summaries=True), ansible=shutil.which('ansible-playbook') is not None, token=TOKEN))
            if u.path == '/api/file':
                p = inside(parse_qs(u.query)['path'][0], base)
                if not any(f['path'] == parse_qs(u.query)['path'][0] for f in scan(base)): raise ValueError('文件不属于可管理资产')
                return self.reply(read_asset(p))
            if u.path == '/api/runs':
                with lock:
                    return self.reply([ {k:v for k,v in r.items() if k != 'process'} for r in reversed(list(runs.values())) if r.get('workspace', 'default') == workspace['id']])
            if u.path.startswith('/api/'): return self.reply(dict(error='接口不存在'),404)
            return super().do_GET()
        except Exception as exc:
            return self.reply(dict(error=str(exc)),400)

    def do_POST(self):
        try:
            if self.headers.get('X-App-Token') != TOKEN: return self.reply(dict(error='无效请求'),403)
            n = int(self.headers.get('Content-Length',0))
            if n > 6 * 1024 * 1024: raise ValueError('请求过大')
            data = json.loads(self.rfile.read(n))
            if self.path == '/api/workspaces':
                return self.reply(workspaces.save_workspace(data), 201)
            workspace = workspaces.get_workspace(data.get('workspace'))
            base = root(workspace['id'])
            if self.path == '/api/file':
                with lock:
                    p = inside(data['path'], base)
                    if not any(f['path'] == data['path'] for f in scan(base)): raise ValueError('文件不属于可管理资产')
                    return self.reply(save_asset(p, data['content'], data['version']))
            if self.path == '/api/settings':
                with lock:
                    if any(r['status'] == 'running' and r.get('workspace', 'default') == workspace['id'] for r in runs.values()):
                        raise ValueError('此空间有运行中的任务，结束后再修改设置')
                    item = workspaces.save_workspace({**workspace, **data}, workspace['id'])
                return self.reply(item)
            if self.path == '/api/run':
                data = {**workspace['defaults'], **data}
                p = inside(data['path'], base)
                if not any(f['path']==data['path'] and f['category']=='playbooks' for f in scan(base)): raise ValueError('文件不是有效的 Playbook，无法执行')
                if not shutil.which('ansible-playbook'): raise ValueError('未安装 ansible-playbook，请先安装 Ansible')
                args = ['ansible-playbook',str(p)]
                if data.get('inventory'):
                    inv = inside(data['inventory'], base)
                    if not inv.exists(): raise ValueError('Inventory 路径不存在')
                    args += ['-i',str(inv)]
                for key, flag in [('limit','--limit'),('tags','--tags')]:
                    if data.get(key): args += [flag,data[key]]
                if data.get('check'): args += ['--check','--diff']
                if data.get('extra'):
                    extra = json.loads(data['extra'])
                    if not isinstance(extra,dict): raise ValueError('额外变量需要 JSON 对象')
                    args += ['--extra-vars',json.dumps(extra)]
                with lock:
                    if any(r['status']=='running' and r.get('workspace', 'default') == workspace['id'] for r in runs.values()): raise ValueError('此工作空间已有任务运行中，请等待结束')
                    rid = uuid.uuid4().hex[:8]
                    runs[rid] = dict(id=rid,workspace=workspace['id'],directory=str(base),path=data['path'],status='running',output='',command=args)
                threading.Thread(target=execute,args=(rid,args,str(base)),daemon=True).start()
                return self.reply(dict(id=rid))
            self.reply(dict(error='接口不存在'),404)
        except FileExistsError as exc:
            return self.reply(dict(error=str(exc)),409)
        except Exception as exc:
            return self.reply(dict(error=str(exc)),400)

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port',type=int,default=8765)
    opts = parser.parse_args()
    print(f'Playbook UI → http://127.0.0.1:{opts.port}',flush=True)
    ThreadingHTTPServer((opts.host,opts.port),Handler).serve_forever()
