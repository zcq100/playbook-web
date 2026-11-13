import unittest
from unittest.mock import patch
from pathlib import Path
import server

class RepositoryTests(unittest.TestCase):
    def test_examples_classified(self):
        with patch.object(server, 'root', return_value=server.BASE/'examples'):
            files = {f['path']: f['category'] for f in server.scan()}
            self.assertEqual(files['playbooks/site.yml'], 'playbooks')
            self.assertEqual(files['roles/nginx/tasks/main.yml'], 'roles')
            self.assertEqual(files['group_vars/all.yml'], 'variables')
            self.assertEqual(files['inventory/hosts.ini'], 'inventory')

    def test_path_escape_rejected(self):
        with patch.object(server, 'root', return_value=server.BASE/'examples'):
            for path in ('../server.py', '/etc/passwd'):
                with self.assertRaises(ValueError): server.inside(path)
            self.assertEqual(server.inside('playbooks/site.yml'),server.BASE/'examples/playbooks/site.yml')

if __name__ == '__main__': unittest.main()
