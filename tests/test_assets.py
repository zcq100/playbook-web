import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import assets
import server

class AssetTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.file = self.base/'vars.yml'
        self.file.write_bytes(b'# keep comments\r\nport: 80\r\nexpr: "{{ port }}"\r\n')

    def test_edit_preserves_comments_newlines_and_mode(self):
        self.file.chmod(0o640)
        doc = assets.read_asset(self.file)
        content = doc['content'].replace('80', '8080')
        saved = assets.save_asset(self.file, content, doc['version'])
        self.assertEqual(self.file.read_bytes(), content.encode())
        self.assertNotEqual(doc['version'], saved['version'])
        self.assertEqual(self.file.stat().st_mode & 0o777, 0o640)
        self.assertEqual(saved['data']['expr'], '{{ port }}')
        self.assertFalse(list(self.base.glob('.playbook-edit-*')))

    def test_conflict_never_overwrites(self):
        doc = assets.read_asset(self.file)
        self.file.write_text('port: 81\n')
        with self.assertRaises(FileExistsError):
            assets.save_asset(self.file, 'port: 90\n', doc['version'])
        self.assertEqual(self.file.read_text(), 'port: 81\n')

    def test_invalid_yaml_preserves_original_and_can_be_repaired(self):
        doc = assets.read_asset(self.file)
        with self.assertRaises(Exception):
            assets.save_asset(self.file, 'port: [\n', doc['version'])
        self.assertEqual(assets.read_asset(self.file)['content'],doc['content'])
        self.file.write_text('port: [\n')
        broken = assets.read_asset(self.file)
        self.assertTrue(broken['parseError'])
        self.assertEqual(assets.save_asset(self.file,'port: 80\n',broken['version'])['data'],{'port':80})

    def test_inventory_groups_and_ansible_tags(self):
        parsed=assets.parse_source('hosts.ini','[web]\nweb01 ansible_host=10.0.0.1\n[web:vars]\nport=80\n[all:children]\nweb\n')
        self.assertEqual([g['name'] for g in parsed['sections']],['web','web:vars','all:children'])
        self.assertEqual(parsed['sections'][0]['lines'][0]['line'],2)
        self.assertEqual(assets.parse_source('vars.yml','secret: !vault |\n  $ANSIBLE_VAULT;1.1;AES256\n')['secret'],'$ANSIBLE_VAULT;1.1;AES256\n')
        self.assertIsNone(assets.parse_source('nginx.j2','{% if enabled %}'))

    def test_file_api_save_and_conflict(self):
        handler=server.Handler.__new__(server.Handler)
        handler.reply=lambda data,status=200:(data,status)
        with patch.object(server,'root',return_value=self.base):
            handler.path='/api/file?path=vars.yml'
            data,status=handler.do_GET()
            self.assertEqual(status,200)
            request=dict(path='vars.yml',content='port: 99\n',version=data['version'])
            def post(payload, token=server.TOKEN):
                body=json.dumps(payload).encode()
                handler.path='/api/file'
                handler.rfile=io.BytesIO(body)
                handler.headers={'X-App-Token':token,'Content-Length':str(len(body))}
                return handler.do_POST()
            self.assertEqual(post(request)[0]['data'],{'port':99})
            self.assertEqual(post(request)[1],409)
            self.assertEqual(post(request,'invalid')[1],403)
            self.assertEqual(post({**request,'path':'../outside.yml'})[1],400)

if __name__ == '__main__': unittest.main()
