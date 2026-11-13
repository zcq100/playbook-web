import unittest
from pathlib import Path
from unittest.mock import patch
import server

class ReleaseTests(unittest.TestCase):
    def test_health_is_independent_of_repository_configuration(self):
        handler = server.Handler.__new__(server.Handler)
        handler.path = '/api/health'
        handler.reply = lambda data, status=200: (data,status)
        with patch.object(server.workspaces,'get_workspace',side_effect=ValueError('broken settings')):
            result,status = handler.do_GET()
        self.assertEqual(status,200)
        self.assertEqual(result,dict(status='ok',version=Path('VERSION').read_text().strip()))

    def test_state_reports_application_version(self):
        handler = server.Handler.__new__(server.Handler)
        handler.path = '/api/state'
        handler.reply = lambda data,status=200: (data,status)
        with patch.object(server,'root',return_value=server.BASE/'examples'):
            result,status=handler.do_GET()
        self.assertEqual(status,200)
        self.assertEqual(result['version'],'0.1.0')

if __name__ == '__main__': unittest.main()
