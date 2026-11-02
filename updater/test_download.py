"""Offline checks for response size limits, including compressed responses."""
import ast
import gzip
import io
import logging
import pathlib
import time
import unittest
import urllib.request


def functions():
    tree = ast.parse(pathlib.Path(__file__).with_name('update.py').read_text(encoding='utf-8'))
    selected = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in {'iri_to_uri', 'http_get', 'read_limited'}]
    scope = dict(gzip=gzip, io=io, urllib=urllib, time=time, log=logging.getLogger('test'), MAX_DOWNLOAD=4096)
    exec(compile(ast.Module(body=selected, type_ignores=[]), 'update.py', 'exec'), scope)
    return scope


class DownloadTests(unittest.TestCase):
    def fetch(self, data, compressed=True, **kwargs):
        class Response(io.BytesIO):
            headers = {'Content-Encoding': 'gzip'} if compressed else {}
        class Opener:
            def open(self, *args, **kw): return Response(data)
        return functions()['http_get']('https://example.invalid/', {'retries': 0}, 'test', opener=Opener(), raw=True, **kwargs)

    def test_gzip_expansion_is_bounded(self):
        with self.assertRaisesRegex(RuntimeError, 'лимит'):
            self.fetch(gzip.compress(b'A' * 1048576))

    def test_normal_gzip_response(self):
        self.assertEqual(self.fetch(gzip.compress(b'orbits')), b'orbits')

    def test_plain_response_is_bounded(self):
        with self.assertRaisesRegex(RuntimeError, 'лимит'):
            self.fetch(b'A' * 4097, compressed=False)

    def test_image_limit_applies_before_decode(self):
        with self.assertRaisesRegex(RuntimeError, 'лимит'):
            self.fetch(b'A' * 1025, compressed=False, max_bytes=1024)


if __name__ == '__main__': unittest.main()
