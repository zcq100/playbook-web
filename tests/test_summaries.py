import tempfile
import unittest
from pathlib import Path
from assets import asset_summary, inventory_groups
import server

class AssetSummaryTests(unittest.TestCase):
    def test_example_summaries_and_scan(self):
        entries = {entry['path']:entry for entry in server.scan(server.BASE/'examples', summaries=True)}
        play = entries['playbooks/site.yml']['summary']['plays'][0]
        self.assertEqual(play['hosts'],'webservers')
        self.assertEqual(play['roles'],['nginx'])
        self.assertEqual(entries['roles/nginx/tasks/main.yml']['summary']['tasks'],2)
        self.assertIn('http_port',entries['group_vars/all.yml']['summary']['keys'])
        self.assertEqual(entries['inventory/hosts.ini']['summary']['groups'][0]['name'],'webservers')

    def test_nested_inventory_topology(self):
        groups=inventory_groups({'all':{'children':{'web':{'hosts':{'web01':{'ansible_password':'private'}}}},'vars':{'env':'prod'}}})
        self.assertEqual(groups[0]['children'],['web'])
        self.assertEqual(groups[1]['entries'],['web01'])
        self.assertNotIn('private',str(groups))
        ini=inventory_groups({'sections':[{'name':'web:vars','lines':[{'text':'ansible_password=private'}]}]})
        self.assertEqual(ini[0]['entries'],['ansible_password'])

    def test_templates_sections_errors_and_dynamic_inventory(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'nginx.j2'
            path.write_text('listen {{ http_port }};\n# {{ http_port }}\n')
            self.assertEqual(asset_summary(path,'config')['expressions'],['http_port'])
            path=Path(folder)/'ansible.cfg'
            path.write_text('[defaults]\nroles_path=roles\n[ssh_connection]\npipelining=true\n')
            self.assertEqual(asset_summary(path,'config')['sections'],['defaults','ssh_connection'])
            path=Path(folder)/'dynamic.yml'
            path.write_text('plugin: amazon.aws.aws_ec2\n')
            self.assertTrue(asset_summary(path,'inventory')['dynamic'])
            path.write_text('broken: [\n')
            self.assertTrue(asset_summary(path,'config')['error'])

if __name__ == '__main__': unittest.main()
