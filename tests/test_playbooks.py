import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from assets import is_playbook
import server

class PlaybookRecognitionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)

    def identify(self, source, name='sample.yml'):
        path = self.base/name
        path.write_text(source)
        return is_playbook(path)

    def test_valid_plays(self):
        for source in (
            '- hosts: all\n',
            '- name: Deploy\n  hosts: [web, db]\n  roles: [nginx]\n',
            '- hosts: "{{ target }}"\n  tasks:\n    - name: Ping\n      ansible.builtin.ping: {}\n',
            '- import_playbook: web.yml\n  vars: {port: 80}\n',
            '- ansible.builtin.import_playbook: web.yml\n',
            '- hosts: all\n- import_playbook: db.yml\n',
        ):
            with self.subTest(source=source): self.assertTrue(self.identify(source))

    def test_non_playbooks_rejected(self):
        for source in (
            '', '# comments only', '[]', '{}', 'port: 80',
            'hosts: all', '- name: Install\n  ansible.builtin.package: {name: nginx}',
            '- name: deployment\n  value: production',
            '- hosts: all\n  unknown_module: {}', '- hosts: []', '- hosts: null',
            '- hosts: ""', '- hosts: all\n  tasks: {}',
            '- hosts: all\n  roles: nginx', '- hosts: all\n  roles: [{}]',
            '- hosts: all\n- name: not a play', '- import_playbook: null',
            '- import_playbook: web.yml\n  hosts: all', '- hosts: [',
            '- just a string', '---\n- hosts: all\n---\n- hosts: web',
        ):
            with self.subTest(source=source): self.assertFalse(self.identify(source))
        self.assertFalse(self.identify('- hosts: all', 'sample.json'))

    def test_scan_reclassifies_after_edit_and_keeps_asset_categories(self):
        (self.base/'playbooks').mkdir()
        play=self.base/'playbooks/site.yml'
        play.write_text('- hosts: all\n')
        (self.base/'tasks.yml').write_text('- name: Ping\n  ping: {}\n')
        (self.base/'vars.yml').write_text('port: 80\n')
        (self.base/'inventory').mkdir()
        (self.base/'inventory/hosts.yml').write_text('all: {hosts: {web01: {}}}')
        with patch.object(server,'root',return_value=self.base):
            entries={f['path']:f['category'] for f in server.scan()}
            self.assertEqual(entries['playbooks/site.yml'],'playbooks')
            self.assertEqual(entries['tasks.yml'],'tasks')
            self.assertEqual(entries['vars.yml'],'config')
            self.assertEqual(entries['inventory/hosts.yml'],'inventory')
            play.write_text('port: 80\n')
            self.assertFalse(any(f['category']=='playbooks' for f in server.scan()))

    def test_execution_rechecks_current_content(self):
        path = self.base/'site.yml'
        path.write_text('- hosts: all\n')
        with patch.object(server, 'root', return_value=self.base):
            self.assertEqual(server.scan()[0]['category'], 'playbooks')
            path.write_text('- name: Just a task\n  ping: {}\n')
            body = json.dumps({'path': 'site.yml'}).encode()
            handler = server.Handler.__new__(server.Handler)
            handler.path = '/api/run'
            handler.headers = {'X-App-Token': server.TOKEN, 'Content-Length': str(len(body))}
            handler.rfile = io.BytesIO(body)
            handler.reply = lambda data, status=200: (data, status)
            with patch.object(server.subprocess, 'Popen') as spawn:
                data, status = handler.do_POST()
                self.assertEqual(status, 400)
                self.assertIn('不是有效的 Playbook', data['error'])
                spawn.assert_not_called()

if __name__ == '__main__': unittest.main()
