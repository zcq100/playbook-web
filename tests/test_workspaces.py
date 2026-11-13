import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import server
import workspaces

class WorkspaceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.config = self.base/'settings.json'
        self.a, self.b = self.base/'a', self.base/'b'
        for folder, value in ((self.a, 80), (self.b, 90)):
            folder.mkdir()
            (folder/'vars.yml').write_text(f'port: {value}\n')
            (folder/'site.yml').write_text('- hosts: all\n')
        patcher = patch.object(workspaces, 'CONFIG', self.config)
        patcher.start()
        self.addCleanup(patcher.stop)
        patcher = patch.dict(server.runs, {}, clear=True)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.wa = workspaces.save_workspace(dict(name='A', directory=str(self.a)))
        self.wb = workspaces.save_workspace(dict(name='B', directory=str(self.b)))

    def request(self, path, data=None):
        handler = server.Handler.__new__(server.Handler)
        handler.path = path
        handler.reply = lambda data, status=200: (data, status)
        if data is None:
            return handler.do_GET()
        raw = json.dumps(data).encode()
        handler.headers = {'X-App-Token':server.TOKEN,'Content-Length':str(len(raw))}
        handler.rfile = io.BytesIO(raw)
        return handler.do_POST()

    def test_old_directory_migrates_and_new_spaces_survive_reload(self):
        self.config.write_text(json.dumps({'directory': str(self.a)}))
        self.assertEqual(workspaces.get_workspace()['directory'], str(self.a))
        wb = workspaces.save_workspace(dict(name='B', directory=str(self.b)))
        stored = json.loads(self.config.read_text())['workspaces']
        self.assertEqual(len(stored), 2)
        self.assertEqual(workspaces.get_workspace(wb['id'])['name'],'B')
        self.assertEqual(workspaces.get_workspace()['directory'],str(self.a))

    def test_same_path_isolated_for_reads_and_writes(self):
        ida, idb = self.wa['id'], self.wb['id']
        doc, status = self.request('/api/file?path=vars.yml&workspace='+ida)
        self.assertEqual(doc['data']['port'],80)
        other, status = self.request('/api/file?path=vars.yml&workspace='+idb)
        self.assertEqual(other['data']['port'],90)
        payload=dict(workspace=idb,path='vars.yml',content='port: 100\n',version=doc['version'])
        self.assertEqual(self.request('/api/file',payload)[1],409)
        payload['workspace']=ida
        self.assertEqual(self.request('/api/file',payload)[1],200)
        self.assertEqual((self.b/'vars.yml').read_text(),'port: 90\n')
        self.assertEqual((self.a/'vars.yml').read_text(),'port: 100\n')

    def test_history_isolation_and_unknown_space(self):
        server.runs.update(a=dict(id='a',workspace=self.wa['id'],status='success'),
                           b=dict(id='b',workspace=self.wb['id'],status='success'))
        result,status=self.request('/api/runs?workspace='+self.wa['id'])
        self.assertEqual([r['id'] for r in result],['a'])
        self.assertEqual(self.request('/api/state?workspace=missing')[1],400)
        result,status=self.request('/api/state?workspace='+self.wb['id'])
        self.assertEqual(result['directory'],str(self.b))
        self.assertEqual(result['workspace']['name'],'B')

    def test_settings_and_execution_use_workspace_defaults_and_captured_root(self):
        payload=dict(workspace=self.wa['id'],name='Production',directory=str(self.a),
                     defaults=dict(check=True,limit='web',tags='deploy'))
        self.assertEqual(self.request('/api/settings',payload)[1],200)
        with patch.object(server.shutil,'which',return_value='/bin/ansible-playbook'), patch.object(server.threading,'Thread') as thread:
            data,status=self.request('/api/run',dict(workspace=self.wa['id'],path='site.yml'))
            self.assertEqual(status,200)
            args=thread.call_args.kwargs['args']
            self.assertEqual(args[2],str(self.a))
            self.assertIn('--check',args[1])
            self.assertIn('web',args[1])
            self.assertEqual(server.runs[data['id']]['workspace'],self.wa['id'])
            self.assertEqual(self.request('/api/settings',payload)[1],400)
            # A running task only blocks its own workspace.
            self.assertEqual(self.request('/api/run',dict(workspace=self.wb['id'],path='site.yml'))[1],200)

if __name__ == '__main__': unittest.main()
