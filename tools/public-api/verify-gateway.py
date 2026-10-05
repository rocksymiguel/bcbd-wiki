"""Non-mutating allowlist checks; denied writes target the health route only."""
import argparse
import json
from urllib.error import HTTPError
from urllib.request import Request, urlopen

parser = argparse.ArgumentParser()
parser.add_argument('url')
args = parser.parse_args()
base = args.url.rstrip('/')

def check(path, status, method='GET'):
    request = Request(base + path, method=method,
                      headers={'Origin': 'https://rocksymiguel.github.io'})
    try:
        response = urlopen(request, timeout=20)
    except HTTPError as error:
        response = error
    with response:
        assert response.status == status, (method, path, response.status)
        assert response.headers.get('Access-Control-Allow-Origin') == 'https://rocksymiguel.github.io'
        assert response.headers.get('Access-Control-Allow-Credentials') is None
        if path == '/api/environment/health' and status == 200 and method == 'GET':
            assert json.load(response)['status'] == 'ok'

check('/api/environment/health', 200)
check('/api/environment/health', 405, 'OPTIONS')
for method in ['POST', 'PUT', 'PATCH', 'DELETE']:
    check('/api/environment/health', 405, method)
for path in ['/', '/api/gis/reports', '/api/gis/session', '/api/gis/media/123',
             '/api/competitions/participants', '/api/competitions/results',
             '/api/competitions/session', '/tools/gis/api/app.py', '/.git/config',
             '/api/environment/unknown']:
    check(path, 404)
print('PASS gateway health/CORS, 5 denied methods, 10 denied private/unknown paths')
