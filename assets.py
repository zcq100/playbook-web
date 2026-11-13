"""Asset inspection and lossless source editing helpers."""
import hashlib
import json
import os
from pathlib import Path
import tempfile
import yaml

MAX_BYTES = 1024 * 1024

class AnsibleLoader(yaml.SafeLoader):
    pass

def tagged(loader, tag, node):
    if isinstance(node, yaml.ScalarNode):
        return loader.construct_scalar(node)
    if isinstance(node, yaml.SequenceNode):
        return loader.construct_sequence(node)
    return loader.construct_mapping(node)

AnsibleLoader.add_multi_constructor('!', tagged)

def parse_source(path, content):
    suffix = Path(path).suffix
    if is_template(Path(path)):
        return None
    if suffix in ('.yaml', '.yml'):
        # Aliases remain valid YAML, but recursive alias structures cannot be JSON views.
        data = yaml.load(content, Loader=AnsibleLoader)
        return json.loads(json.dumps(data, default=str))
    if suffix == '.json':
        return json.loads(content)
    if suffix in ('.cfg', '.ini') or Path(path).name in ('hosts', 'inventory'):
        groups = []
        current = dict(name='ungrouped', lines=[])
        for index, raw in enumerate(content.splitlines(), 1):
            line = raw.strip()
            if not line or line.startswith(('#', ';')):
                continue
            if line.startswith('[') and line.endswith(']'):
                if current['lines'] or current['name'] != 'ungrouped':
                    groups.append(current)
                current = dict(name=line[1:-1], lines=[])
            else:
                current['lines'].append(dict(line=index, text=raw))
        if current['lines'] or current['name'] != 'ungrouped':
            groups.append(current)
        return dict(sections=groups)
    return None

def version(path, raw):
    return hashlib.sha256(str(path).encode() + b'\0' + raw).hexdigest()

def read_asset(path):
    with path.open('rb') as stream:
        raw = stream.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        return dict(content='', version=None, data=None, parseError=None, editable=False, previewReason='文件超过 1 MB，仅展示文件信息')
    try:
        content = raw.decode('utf-8')
        if '\x00' in content:
            raise ValueError('binary')
    except (UnicodeError, ValueError):
        return dict(content='', version=None, data=None, parseError=None, editable=False, previewReason='二进制文件，仅展示文件信息')
    data, error = None, None
    try:
        data = parse_source(path, content)
    except Exception as exc:
        error = str(exc)
    return dict(content=content, version=version(path, raw), data=data, parseError=error, editable=True)

def save_asset(path, content, expected):
    if not read_asset(path).get('editable', True):
        raise ValueError('此文件不支持文本编辑')
    if not isinstance(content, str):
        raise ValueError('文件内容必须为文本')
    raw = content.encode('utf-8')
    if len(raw) > MAX_BYTES:
        raise ValueError('文件超过 1 MB，无法保存')
    # Validate syntax, but never serialize the parsed object back over comments/Jinja.
    parse_source(path, content)
    previous = path.read_bytes()
    if version(path, previous) != expected:
        raise FileExistsError('文件已被其他程序或窗口修改，请重新打开后再编辑。当前草稿仍保留。')
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent, prefix='.playbook-edit-', delete=False) as stream:
            temporary = stream.name
            os.fchmod(stream.fileno(), path.stat().st_mode & 0o777)
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())
        # Check again after staging the replacement.
        if version(path, path.read_bytes()) != expected:
            raise FileExistsError('文件已变更，请重新打开后再编辑')
        os.replace(temporary, path)
    finally:
        if temporary and os.path.exists(temporary):
            os.unlink(temporary)
    return read_asset(path)

# Play-level keywords only: a task/module list must not become an executable asset.
PLAY_KEYS = frozenset('''name hosts tasks pre_tasks post_tasks handlers roles vars vars_files
vars_prompt gather_facts gather_subset gather_timeout fact_path become become_user
become_method become_flags become_exe become_pass connection collections environment
remote_user port order serial strategy force_handlers max_fail_percentage
any_errors_fatal ignore_errors ignore_unreachable check_mode diff tags debugger
module_defaults no_log run_once throttle timeout connection_user sudo sudo_user
sudo_pass sudo_exe sudo_flags accelerate accelerate_port accelerate_ipv6
transport user vault_password_file'''.split())
IMPORT_KEYS = frozenset(('import_playbook', 'ansible.builtin.import_playbook'))

def is_playbook(path):
    """Conservative structural recognition, without executing inventory or plugins."""
    if path.suffix not in ('.yaml', '.yml'):
        return False
    try:
        with path.open('rb') as stream:
            raw = stream.read(MAX_BYTES + 1)
        if len(raw) > MAX_BYTES:
            return False
        plays = yaml.load(raw.decode('utf-8'), Loader=AnsibleLoader)
        if not isinstance(plays, list) or not plays:
            return False
        for play in plays:
            if not isinstance(play, dict) or not play or not all(isinstance(k, str) for k in play):
                return False
            imports = IMPORT_KEYS.intersection(play)
            if imports:
                if len(imports) != 1 or not set(play) <= IMPORT_KEYS | {'name', 'vars', 'tags', 'when'}:
                    return False
                target = play[next(iter(imports))]
                if not isinstance(target, str) or not target.strip():
                    return False
                continue
            if not set(play) <= PLAY_KEYS:
                return False
            hosts = play.get('hosts')
            if isinstance(hosts, str):
                if not hosts.strip():
                    return False
            elif isinstance(hosts, list):
                if not hosts or not all(isinstance(h, str) and h.strip() for h in hosts):
                    return False
            else:
                return False
            for key in ('tasks', 'pre_tasks', 'post_tasks', 'handlers'):
                if key in play and (not isinstance(play[key], list) or not all(isinstance(t, dict) and t for t in play[key])):
                    return False
            if 'roles' in play and (not isinstance(play['roles'], list) or not all(
                isinstance(r, str) and r.strip() or isinstance(r, dict) and isinstance(r.get('role'), str) and r['role'].strip()
                for r in play['roles']
            )):
                return False
        return True
    except (OSError, UnicodeError, yaml.YAMLError, ValueError, RecursionError):
        return False


def inventory_groups(data):
    """Declared groups only; never invoke an inventory plugin or expand ranges."""
    groups = []
    if isinstance(data, dict) and isinstance(data.get('sections'), list):
        for section in data['sections']:
            name = section['name']
            mode = 'vars' if name.endswith(':vars') else 'children' if name.endswith(':children') else 'hosts'
            groups.append(dict(name=name, kind=mode, entries=[line['text'].split('=', 1)[0].strip() if mode == 'vars' else line['text'].strip().split()[0] for line in section['lines']]))
    elif isinstance(data, dict):
        def visit(mapping, depth=0):
            if depth > 12 or not isinstance(mapping, dict):
                return
            for name, group in mapping.items():
                if not isinstance(group, dict):
                    continue
                hosts = group.get('hosts', {})
                children = group.get('children', {})
                variables = group.get('vars', {})
                groups.append(dict(name=str(name), kind='hosts', entries=list(map(str, hosts)) if isinstance(hosts, (dict, list)) else [],
                                   children=list(map(str, children)) if isinstance(children, dict) else [],
                                   variables=list(map(str, variables)) if isinstance(variables, dict) else []))
                visit(children, depth + 1)
        visit(data)
    return groups


def asset_summary(path, category):
    try:
        document = read_asset(path)
        data, content = document['data'], document['content']
        summary = dict(lines=len(content.splitlines()), error=document['parseError'])
        if not document.get('editable', True):
            return dict(editable=False, reason=document['previewReason'])
        summary['editable'] = True
        if document['parseError']:
            return summary
        if category == 'playbooks' and isinstance(data, list):
            summary['plays'] = [dict(name=p.get('name', '未命名 Play'), hosts=p.get('hosts'),
                imported=p.get('import_playbook', p.get('ansible.builtin.import_playbook')),
                roles=[r if isinstance(r, str) else str(r.get('role', '')) for r in p.get('roles', [])],
                tasks=sum(len(p.get(k, [])) for k in ('pre_tasks', 'tasks', 'post_tasks', 'handlers')))
                for p in data]
        elif category == 'inventory':
            summary['groups'] = inventory_groups(data)
            summary['dynamic'] = isinstance(data, dict) and 'plugin' in data
        elif category in ('tasks', 'handlers'):
            summary['items'] = task_items(data)
            summary['tasks'] = len(data) if isinstance(data, list) else 0
        elif category == 'dependencies':
            summary['dependencies'] = dependency_items(data)
        elif category in ('variables', 'roles'):
            summary['keys'] = list(map(str, data)) if isinstance(data, dict) else []
            summary['tasks'] = len(data) if isinstance(data, list) else 0
        elif category in ('config', 'templates'):
            import re
            summary['sections'] = [g['name'] for g in data['sections']] if isinstance(data, dict) and isinstance(data.get('sections'), list) else []
            summary['expressions'] = list(dict.fromkeys(re.findall(r'{{\s*(.*?)\s*}}', content, re.S)))[:20] if is_template(path) else []
        return summary
    except Exception as exc:
        return dict(error=str(exc))

# Assets keep their role membership separately from their type.
TASK_KEYWORDS = frozenset('''name when tags register become become_user become_method become_flags
become_exe check_mode diff changed_when failed_when ignore_errors ignore_unreachable
notify listen vars environment loop loop_control with_items with_dict with_fileglob
with_first_found with_nested with_sequence with_subelements until retries delay
run_once delegate_to delegate_facts throttle timeout no_log any_errors_fatal
collections connection remote_user module_defaults args poll async debugger'''.split())

def is_template(path):
    return path.suffix == '.j2' or 'templates' in path.parts[:-1]


def task_list(data):
    if not isinstance(data, list) or not data:
        return False
    for task in data:
        if not isinstance(task, dict) or not task or 'hosts' in task or IMPORT_KEYS.intersection(task):
            return False
        if any(k in task for k in ('block', 'rescue', 'always')):
            if not all(task_list(task[k]) or task[k] == [] for k in ('block', 'rescue', 'always') if k in task):
                return False
        else:
            modules = [k for k in task if isinstance(k, str) and k not in TASK_KEYWORDS and not k.startswith('with_')]
            if len(modules) != 1:
                return False
            action = task[modules[0]]
            if action is not None and not isinstance(action, (dict, str)):
                return False
    return True


def classify_asset(relative, path):
    parts = relative.parts
    folders = parts[:-1]
    yaml_file = path.suffix in ('.yaml', '.yml')
    if 'files' in folders:
        return 'files'
    if is_template(relative):
        return 'templates'
    if path.name in ('requirements.yml', 'requirements.yaml'):
        return 'dependencies'
    if any(x in folders for x in ('group_vars', 'host_vars', 'vars', 'defaults')):
        return 'variables'
    if any(x in folders for x in ('inventory', 'inventories')) or path.name in ('hosts', 'inventory'):
        return 'inventory'
    if yaml_file and ('handlers' in folders or path.stem == 'handlers'):
        return 'handlers'
    if yaml_file and 'tasks' in folders:
        return 'tasks'
    if is_playbook(path):
        return 'playbooks'
    if yaml_file:
        try:
            with path.open('rb') as stream:
                raw = stream.read(MAX_BYTES + 1)
            if len(raw) <= MAX_BYTES:
                data = yaml.load(raw.decode('utf-8'), Loader=AnsibleLoader)
                if task_list(data):
                    return 'handlers' if any('listen' in task for task in data) else 'tasks'
        except (OSError, UnicodeError, yaml.YAMLError, ValueError, RecursionError):
            pass
    return 'config'


def dependency_items(data):
    result = []
    def add(items, kind):
        if not isinstance(items, list):
            return
        for item in items:
            if isinstance(item, str):
                result.append(dict(kind=kind, name=item, source=item, version='未指定'))
            elif isinstance(item, dict):
                if 'include' in item:
                    result.append(dict(kind='include', name=str(item['include']), source=str(item['include']), version='—'))
                else:
                    result.append(dict(kind=kind, name=str(item.get('name', item.get('src', '未命名依赖'))),
                        source=str(item.get('src', item.get('source', item.get('name', 'Galaxy')))),
                        version=str(item.get('version', '未指定')), scm=str(item.get('scm', ''))))
    if isinstance(data, list):
        add(data, 'role')
    elif isinstance(data, dict):
        add(data.get('roles'), 'role')
        add(data.get('collections'), 'collection')
    return result


def task_items(data):
    if not isinstance(data, list):
        return []
    return [dict(name=str(t.get('name', '未命名任务')), modules=[str(k) for k in t if k not in TASK_KEYWORDS and not str(k).startswith('with_')],
                 listen=t.get('listen'), notify=t.get('notify'), when=t.get('when')) for t in data if isinstance(t, dict)]
