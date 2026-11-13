"""Persistent workspace definitions; request handlers capture a workspace snapshot."""
import json
import os
from pathlib import Path
import tempfile
import threading
import uuid

BASE = Path(__file__).resolve().parent
CONFIG = Path(os.environ.get('PLAYBOOK_SETTINGS_FILE', str(BASE / '.settings.json'))).expanduser().resolve()
config_lock = threading.RLock()
DEFAULTS = dict(inventory='', limit='', tags='', extra='', check=True)


def read_settings():
    with config_lock:
        settings = json.loads(CONFIG.read_text()) if CONFIG.exists() else {}
        if 'workspaces' not in settings:
            settings = dict(workspaces=[dict(id='default', name='默认工作空间',
                directory=settings.get('directory', str(BASE/'examples')), defaults=dict(DEFAULTS))])
            if CONFIG.exists():
                write_settings(settings)
        return settings


def write_settings(settings):
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=CONFIG.parent,
                                         prefix='.workspace-', delete=False) as stream:
            temporary = stream.name
            json.dump(settings, stream, ensure_ascii=False, indent=2)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, CONFIG)
    finally:
        if temporary and os.path.exists(temporary):
            os.unlink(temporary)


def get_workspace(workspace_id=None):
    settings = read_settings()
    for item in settings['workspaces']:
        if item['id'] == (workspace_id or 'default'):
            return {**item, 'defaults': {**DEFAULTS, **item.get('defaults', {})}}
    raise ValueError('工作空间不存在，请刷新后重新选择')


def save_workspace(data, workspace_id=None):
    name = data.get('name', '').strip()
    if not name or len(name) > 80:
        raise ValueError('工作空间名称需要 1–80 个字符')
    if not isinstance(data.get('directory'), str) or not data['directory'].strip():
        raise ValueError('请填写目标目录')
    directory = Path(data['directory']).expanduser().resolve()
    if not directory.is_dir():
        raise ValueError('目标目录不存在或不是文件夹')
    defaults = {**DEFAULTS, **data.get('defaults', {})}
    for key in ('inventory', 'limit', 'tags', 'extra'):
        if not isinstance(defaults[key], str):
            raise ValueError('默认执行参数必须为文本')
    if not isinstance(defaults['check'], bool):
        raise ValueError('Check 模式必须为布尔值')
    if defaults['inventory']:
        inventory = (directory/defaults['inventory']).resolve()
        if not inventory.is_relative_to(directory) or not inventory.exists():
            raise ValueError('默认 Inventory 必须是仓库内已有的文件或目录')
    if defaults['extra'] and not isinstance(json.loads(defaults['extra']), dict):
        raise ValueError('额外变量需要 JSON 对象')
    with config_lock:
        settings = read_settings()
        if workspace_id:
            get_workspace(workspace_id)
        item = dict(id=workspace_id or uuid.uuid4().hex, name=name, directory=str(directory), defaults=defaults)
        settings['workspaces'] = [item if w['id'] == workspace_id else w for w in settings['workspaces']]
        if not workspace_id:
            settings['workspaces'].append(item)
        write_settings(settings)
        return item
