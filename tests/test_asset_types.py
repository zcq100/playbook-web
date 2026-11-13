import tempfile
import unittest
from pathlib import Path
from assets import read_asset, save_asset, asset_summary, MAX_BYTES
import server

class AssetTypeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)

    def write(self, path, content):
        file = self.base/path
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_bytes(content if isinstance(content,bytes) else content.encode())
        return file

    def test_classification_and_role_membership(self):
        fixtures = {
            'roles/web/tasks/main.yml':('- name: Ping\n  ansible.builtin.ping: {}','tasks'),
            'roles/web/handlers/main.yml':('- name: Restart\n  service: {name: nginx}\n  listen: reload','handlers'),
            'roles/web/defaults/main.yml':('port: 80','variables'),
            'roles/web/templates/nginx.conf':('port {{ port }};','templates'),
            'roles/web/files/logo.png':(b'\x89PNG\x00','files'),
            'tasks/check.yml':('- debug: {msg: hello}','tasks'),
            'handlers.yml':('- service: {name: nginx}','handlers'),
            'restart.yml':('- service: {name: nginx}\n  listen: reload','handlers'),
            'tasks/empty.yml':('# to be filled','tasks'),
            'roles/requirements.yml':('- src: example.web\n  version: v1','dependencies'),
            'collections/requirements.yaml':('collections: [ansible.posix]','dependencies'),
            'templates/service.yml':('port: {{ port }}','templates'),
            'files/setup.sh':('#!/bin/sh\necho hello','files'),
            'files/requirements.yml':('copied resource','files'),
            'ansible.cfg':('[defaults]\nforks=5','config'),
            'settings.yml':('port: 80','config'),
            'site.yml':('- hosts: all','playbooks'),
        }
        for name,(content,kind) in fixtures.items(): self.write(name,content)
        entries = {f['path']:f for f in server.scan(self.base,summaries=True)}
        self.assertEqual(set(entries),set(fixtures))
        for name,(_,kind) in fixtures.items():
            with self.subTest(name=name): self.assertEqual(entries[name]['assetType'],kind)
        self.assertEqual(entries['roles/web/templates/nginx.conf']['role'],'roles/web')
        self.assertEqual(entries['roles/web/files/logo.png']['category'],'roles')
        self.assertIsNone(entries['roles/requirements.yml']['role'])
        self.assertNotIn('playbooks',[f['category'] for f in entries.values() if f['assetType']=='tasks'])

    def test_template_yaml_preserves_jinja_and_comments(self):
        path=self.write('templates/service.yaml','# comment\nport: {{ port }}\n')
        document=read_asset(path)
        self.assertIsNone(document['parseError'])
        saved=save_asset(path,document['content'].replace('port }}','new_port }}'),document['version'])
        self.assertTrue(saved['editable'])
        self.assertIn('# comment',path.read_text())
        self.assertEqual(asset_summary(path,'templates')['expressions'],['new_port'])

    def test_binary_and_large_files_are_metadata_only_and_not_editable(self):
        for name,content in [('files/logo.png',b'\x89PNG\x00'),('files/big.txt',b'x'*(MAX_BYTES+1))]:
            path=self.write(name,content)
            doc=read_asset(path)
            self.assertFalse(doc['editable'])
            self.assertIsNone(doc['version'])
            with self.assertRaises(ValueError): save_asset(path,'replacement',None)
            self.assertEqual(path.read_bytes(),content)

    def test_requirements_old_and_new_formats(self):
        old=self.write('roles/requirements.yml','- src: https://example.com/role.git\n  name: web\n  version: v1.0\n  scm: git\n- include: more.yml\n')
        items=asset_summary(old,'dependencies')['dependencies']
        self.assertEqual(items[0]['name'],'web')
        self.assertEqual(items[0]['version'],'v1.0')
        self.assertEqual(items[1]['kind'],'include')
        new=self.write('requirements.yml','roles: [example.web]\ncollections:\n  - name: ansible.posix\n    version: ">=1.5"\n')
        items=asset_summary(new,'dependencies')['dependencies']
        self.assertEqual([x['kind'] for x in items],['role','collection'])
        self.assertEqual(items[1]['version'],'>=1.5')

if __name__ == '__main__': unittest.main()
