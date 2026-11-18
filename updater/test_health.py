import datetime as dt
import json
import unittest

from health import problems, report


class HealthTests(unittest.TestCase):
    now = dt.datetime(2026, 11, 15, 16, tzinfo=dt.timezone.utc)

    def page(self, epoch, generated='2026-11-15T15:00:00Z'):
        data = {'data-meta': {'generatedAt': generated},
                'data-rassvet': {'satellites': [{'elements': {'epoch': epoch}}]},
                'data-stations': {'fields': ['epoch'], 'rows': [[epoch]]}}
        return ''.join('<script type="application/json" id="' + key + '">' + json.dumps(value) + '</script>'
                       for key, value in data.items())

    def test_fresh_page_with_expired_orbits_fails(self):
        data = report(self.page('2026-10-04T22:11:04Z'), self.now)
        self.assertEqual(data['systems']['data-rassvet']['expired'], 1)
        self.assertEqual(len(problems(data, self.now)), 2)

    def test_recent_elements_pass(self):
        self.assertFalse(problems(report(self.page('2026-11-15T03:00:00Z'), self.now), self.now))

    def test_fresh_previous_publication_cannot_confirm_redeploy(self):
        page = self.page('2026-11-15T03:00:00Z')
        old, new = '1' * 32, '2' * 32
        for actual in (None, old, new):
            with self.subTest(actual=actual):
                served = page if actual is None else page.replace('"generatedAt":', '"publicationId":"' + actual + '","generatedAt":')
                data = report(served, self.now)
                self.assertFalse(problems(data, self.now))
                self.assertEqual(not problems(data, self.now, publication_id=new), actual == new)

    def test_stale_publication_and_missing_systems_fail(self):
        self.assertTrue(problems({'generatedAt': '2026-11-13T00:00:00Z', 'systems': {}}, self.now))

    def test_decayed_satellites_do_not_lower_active_coverage(self):
        page = self.page('2026-11-15T03:00:00Z').replace('"satellites": [',
            '"satellites": [{"status":{"value":"decayed"},"elements":{"epoch":"2026-06-01T00:00:00Z"}},')
        data = report(page, self.now)
        self.assertEqual(data['systems']['data-rassvet']['total'], 1)
        self.assertFalse(problems(data, self.now))


if __name__ == '__main__':
    unittest.main()
