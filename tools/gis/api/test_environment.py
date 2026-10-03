"""Offline source/contract tests; never queries public providers."""
import json
import unittest
from unittest.mock import patch
from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient
import environment as env


class EnvironmentTests(unittest.TestCase):
    def setUp(self):
        env.CACHE.clear()
        self.client = TestClient(env.app)

    def test_tide_calendar_and_unavailable_date(self):
        raw = b'<table><tr><th>02/10/2026</th></tr><tr><td>05:46</td><td>1.04 B</td></tr><tr><td>10:44</td><td>3.94 P</td></tr><tr><td>ND</td><td>ND</td></tr></table>'
        with patch.object(env, 'request', return_value=raw) as upstream:
            data = self.client.get('/api/environment/tides?day=2026-10-02').json()
            self.assertTrue(data['prediction'])
            self.assertEqual(data['datum'], 'MLWS')
            self.assertEqual(data['days']['2026-10-02'][0], {'time':'05:46','height_m':1.04,'kind':'bajamar','at':'2026-10-02T05:46:00-05:00'})
            self.client.get('/api/environment/tides?day=2026-10-02')
            self.assertEqual(upstream.call_count, 1)
            self.assertEqual(self.client.get('/api/environment/tides?day=2026-10-03').status_code, 503)
        self.assertEqual(self.client.get('/api/environment/tides?day=2026-02-30').status_code, 422)
        self.assertEqual(self.client.get('/api/environment/tides?day=2026-10-02&cp=https://example.org').json()['station_code'], '374')

    def test_model_zero_and_units(self):
        raw = json.dumps({'latitude':-1.86,'longitude':-79.98,'current':{'time':1790974800,'interval':900,'precipitation':0,'temperature_2m':25,'wind_speed_10m':3}}).encode()
        with patch.object(env,'request',return_value=raw):
            data=self.client.get('/api/environment/weather').json()
            self.assertTrue(data['model_based'])
            self.assertEqual(data['values']['precipitation'],0)
            self.assertEqual(data['interval_seconds'],900)
            self.assertIsNone(data['values']['wind_direction_10m'])
        self.assertEqual(self.client.get('/api/environment/weather?latitude=nan').status_code,422)
        self.assertEqual(self.client.get('/api/environment/weather?latitude=10').status_code,422)

    def test_station_skips_invalid_and_future_and_retains_old(self):
        at=(datetime.now(timezone.utc)-timedelta(hours=5)).isoformat()
        future=(datetime.now(timezone.utc)+timedelta(hours=2)).isoformat()
        raw={'series':[{'code':'029031601h','units':'C','data':[{'date':at,'value':24.9},{'date':future,'value':50},{'date':at,'value':float('nan')}]},
                       {'code':'017140801h','units':'mm','data':[{'date':at,'value':0}]}]}
        with patch.object(env,'request',return_value=json.dumps(raw).encode()):
            data=self.client.get('/api/environment/station').json()
            self.assertEqual(data['code'],'HM002')
            self.assertEqual(data['measurements']['temperature']['value'],24.9)
            self.assertGreater(data['measurements']['temperature']['age_seconds'],4*3600)
            self.assertEqual(data['measurements']['precipitation_hour']['value'],0)

    def test_cache_failure_is_explicitly_stale(self):
        self.assertEqual(env.cached('sample',0,lambda:{'stale':False,'value':1})['value'],1)
        def failure(): raise ValueError('offline')
        result=env.cached('sample',0,failure)
        self.assertTrue(result['stale'])
        self.assertIn('error',result)
        self.assertEqual(result['value'],1)

    def test_partial_sensor_feed(self):
        at=datetime.now(timezone.utc).isoformat()
        raw=json.dumps({'series':[{'code':'017140801h','units':'mm','data':[{'date':at,'value':1.9}]}]}).encode()
        with patch.object(env,'request',side_effect=[ValueError('air offline'),raw]):
            data=self.client.get('/api/environment/station').json()
            self.assertTrue(data['partial'])
            self.assertEqual(data['measurements']['precipitation_hour']['value'],1.9)


if __name__=='__main__': unittest.main(verbosity=2)
