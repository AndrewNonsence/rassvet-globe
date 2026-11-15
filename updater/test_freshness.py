"""Offline checks for ageing data and the refresh schedule."""
import ast
import datetime as dt
import json
import pathlib
import unittest


def helpers():
    tree = ast.parse(pathlib.Path(__file__).with_name('update.py').read_text(encoding='utf-8'))
    names = {'parse_iso', 'iso', 'refresh_constellation_health', 'next_update', 'update_constellation'}
    selected = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in names]
    scope = {'dt': dt, 'UTC': dt.timezone.utc, 'env_int': lambda name, default: default}
    exec(compile(ast.Module(body=selected, type_ignores=[]), 'update.py', 'exec'), scope)
    return scope


class FreshnessTests(unittest.TestCase):
    def setUp(self):
        self.now = dt.datetime(2026, 11, 15, 16, tzinfo=dt.timezone.utc)
        self.f = helpers()

    def test_unchanged_old_elements_are_reclassified_and_preserved(self):
        model = {'dataset': {'warning': 'obsolete snapshot', 'freshnessPolicy': {'currentMaxAgeDays': 7}},
                 'satellites': [
                     {'noradId': 1, 'elements': {'epoch': '2026-10-04T22:11:04Z', 'freshness': 'current'}},
                     {'noradId': 2, 'elements': {'epoch': '2026-11-15T03:00:00Z'}},
                     {'noradId': 3, 'elements': {'epoch': '2026-06-06T00:00:00Z'}, 'status': {'value': 'decayed'}}]}
        self.f['update_constellation'](model, {}, self.now, [])
        self.assertEqual(model['satellites'][0]['elements']['freshness'], 'expired')
        self.assertEqual(model['satellites'][0]['elements']['epoch'], '2026-10-04T22:11:04Z')
        coverage = model['dataset']['elementsCoverage']
        self.assertEqual((coverage['active'], coverage['current'], coverage['expired']), (2, 1, 1))
        self.assertNotIn('02.10.2026', model['dataset']['warning'])

    def test_seven_day_boundary_uses_seconds(self):
        model = {'satellites': [{'elements': {'epoch': '2026-11-08T15:59:59Z'}}]}
        self.f['refresh_constellation_health'](model, self.now, 30)
        self.assertEqual(model['dataset']['elementsCoverage']['current'], 0)

    def test_schedule_keeps_utc_anchor_and_catches_day_rollover(self):
        next_run = self.f['next_update']
        self.assertEqual(next_run(self.now, 3, 6), self.now.replace(hour=21))
        self.assertEqual(next_run(self.now.replace(hour=23), 3, 6),
                         self.now.replace(hour=3) + dt.timedelta(days=1))
        self.assertEqual(next_run(self.now.replace(hour=3), 3, 6), self.now.replace(hour=9))

    def test_schedule_rejects_excessive_source_requests(self):
        for interval in (0, 1, 5, 25):
            with self.assertRaises(ValueError):
                self.f['next_update'](self.now, 3, interval)


if __name__ == '__main__':
    unittest.main()
