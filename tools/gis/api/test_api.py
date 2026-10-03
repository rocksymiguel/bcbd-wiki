"""Run in the test image with no network and an ephemeral /data directory."""
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from PIL import Image
from fastapi.testclient import TestClient

work = tempfile.TemporaryDirectory()
os.environ['BCBD_DATA'] = work.name
import app as service


def feature(identifier='example'):
    return {'type': 'Feature', 'geometry': {'type': 'Point', 'coordinates': [-79.98, -1.86]},
            'properties': {'id': identifier, 'name': 'Prueba <img src=x onerror=alert(1)>',
                           'note': 'Comprobación de API', 'kind': 'flood',
                           'observed_at': '2026-10-02T14:30:00-05:00'}}


class API(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(service.app).__enter__()
        csrf = cls.client.get('/api/gis/session').json()['csrf']
        cls.headers = {'origin': service.ORIGIN, 'x-bcbd-csrf': csrf}

    @classmethod
    def tearDownClass(cls):
        cls.client.__exit__(None, None, None)
        work.cleanup()

    def create(self, identifier, files=()):
        return self.client.post('/api/gis/reports', headers=self.headers,
                                data={'report': json.dumps(feature(identifier))}, files=files)

    def test_shared_text_and_ownership(self):
        result = self.create('text')
        self.assertEqual(result.status_code, 200, result.text)
        identifier = result.json()['id']
        guest = TestClient(service.app)
        reports = guest.get('/api/gis/reports').json()['features']
        f = next(f for f in reports if f['properties']['id'] == identifier)
        self.assertIn('<img', f['properties']['name'])
        self.assertFalse(f['properties']['can_delete'])
        token = guest.get('/api/gis/session').json()['csrf']
        self.assertEqual(guest.delete('/api/gis/reports/' + identifier,
                                     headers={'origin': service.ORIGIN, 'x-bcbd-csrf': token}).status_code, 403)
        self.assertEqual(self.client.delete('/api/gis/reports/' + identifier, headers=self.headers).status_code, 200)

    def test_csrf_and_coordinates(self):
        self.assertEqual(self.client.post('/api/gis/reports', data={'report': json.dumps(feature())}).status_code, 403)
        f = feature(); f['geometry']['coordinates'] = [0, 0]
        r = self.client.post('/api/gis/reports', headers=self.headers, data={'report': json.dumps(f)})
        self.assertEqual(r.status_code, 422)
        self.assertEqual(self.client.post('/api/gis/reports', headers={**self.headers, 'content-length': str(211*1024*1024)}).status_code, 413)

    def test_image_normalization_and_rejection(self):
        image = Image.new('RGB', (48, 32), 'blue')
        data = io.BytesIO(); image.save(data, 'PNG'); raw = data.getvalue() + b'<script>bad()</script>'
        r = self.create('photo', [('media', ('foto.png', raw, 'image/png'))])
        self.assertEqual(r.status_code, 200, r.text)
        identifier = r.json()['id']
        f = next(f for f in self.client.get('/api/gis/reports').json()['features'] if f['properties']['id'] == identifier)
        url = f['properties']['attachments'][0]['url']
        media = self.client.get(url)
        self.assertEqual(media.headers['content-type'], 'image/jpeg')
        self.assertNotIn(b'<script>', media.content)
        self.assertEqual(Image.open(io.BytesIO(media.content)).size, (48, 32))
        self.assertEqual(self.create('fake', [('media', ('foto.jpg', b'MZ fake executable', 'image/jpeg'))]).status_code, 422)
        self.assertEqual(self.create('exe', [('media', ('foto.exe', b'MZ fake', 'image/jpeg'))]).status_code, 415)
        self.assertEqual(self.create('svg', [('media', ('foto.svg', b'<svg onload="bad()"/>', 'image/svg+xml'))]).status_code, 415)
        self.assertEqual(self.client.delete('/api/gis/reports/' + identifier, headers=self.headers).status_code, 200)
        self.assertEqual(self.client.get(url).status_code, 404)

    def test_video_transcode(self):
        path = Path(work.name) / 'fixture.mp4'
        subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=64x48:d=1',
                        '-c:v', 'libx264', '-threads', '1', '-y', str(path)], check=True)
        r = self.create('video', [('media', ('video.mp4', path.read_bytes(), 'video/mp4'))])
        self.assertEqual(r.status_code, 200, r.text)
        f = next(f for f in self.client.get('/api/gis/reports').json()['features'] if f['properties']['id'] == r.json()['id'])
        media = self.client.get(f['properties']['attachments'][0]['url'])
        self.assertEqual(media.headers['content-type'], 'video/mp4')
        self.assertGreater(len(media.content), 100)
        self.assertEqual(self.create('fake-video', [('media', ('video.mp4', b'<html>bad</html>', 'video/mp4'))]).status_code, 422)
        self.client.delete('/api/gis/reports/' + r.json()['id'], headers=self.headers)

    def test_import_atomicity_dedup_and_limits(self):
        body = {'type': 'FeatureCollection', 'features': [feature('import')]}
        r = self.client.post('/api/gis/import', headers=self.headers, json=body)
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()['created'], 1)
        self.assertEqual(self.client.post('/api/gis/import', headers=self.headers, json=body).json()['created'], 0)
        bad = feature('bad'); bad['geometry']['coordinates'] = [999, 0]
        body['features'] = [feature('not-inserted'), bad]
        self.assertEqual(self.client.post('/api/gis/import', headers=self.headers, json=body).status_code, 422)
        self.assertFalse(any(f['properties']['client_id'] == 'not-inserted' for f in self.client.get('/api/gis/reports').json()['features']))
        health = self.client.get('/api/gis/health').json()
        self.assertEqual(health['image_limit_bytes'], 50*1024*1024)
        self.assertEqual(health['video_limit_bytes'], 100*1024*1024)
        old = service.QUOTA; service.QUOTA = 0
        try:
            image = io.BytesIO(); Image.new('RGB', (8,8)).save(image, 'PNG')
            self.assertEqual(self.create('quota', [('media', ('test.png', image.getvalue(), 'image/png'))]).status_code, 507)
        finally:
            service.QUOTA = old


if __name__ == '__main__':
    unittest.main(verbosity=2)
