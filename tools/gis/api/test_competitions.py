import os
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from fastapi.testclient import TestClient

tmp = tempfile.TemporaryDirectory()
os.environ['BCBD_COMPETITIONS_DATA'] = tmp.name
import competitions as service

class RegisterTest(unittest.TestCase):
    def test_shared_register(self):
        with TestClient(service.app) as first, TestClient(service.app) as second:
            token = first.get('/api/competitions/session').json()['csrf']
            headers = {'origin':service.ORIGIN,'x-bcbd-csrf':token}
            self.assertEqual(first.post('/api/competitions/participants',json={'name':'José María'}).status_code,403)
            person = first.post('/api/competitions/participants',json={'name':'José María'},headers=headers).json()
            duplicate = first.post('/api/competitions/participants',json={'name':' JOSE  MARIA '},headers=headers).json()
            self.assertEqual(person['id'],duplicate['id'])
            self.assertEqual(second.get('/api/competitions/participants').json(),[person])
            result = {'id':'attempt-1','participant_id':person['id'],'competition':'copa-oba','station':1,'centis':1250}
            with ThreadPoolExecutor(max_workers=2) as executor:
                responses = list(executor.map(lambda _: first.post('/api/competitions/results',json=result,headers=headers),range(2)))
            self.assertTrue(all(r.status_code==200 for r in responses))
            self.assertEqual(len(second.get('/api/competitions/results').json()),1)
            self.assertEqual(first.post('/api/competitions/results',json={**result,'centis':2000},headers=headers).status_code,409)
            for patch in [{'station':5},{'centis':0},{'participant_id':'missing'},{'centis':True},{'competition':'unknown'}]:
                self.assertEqual(first.post('/api/competitions/results',json={**result,**patch},headers=headers).status_code,422)
            with service.connection() as db:
                self.assertEqual(db.execute('PRAGMA integrity_check').fetchone()[0],'ok')
        # A fresh application lifespan reads the same on-disk records.
        with TestClient(service.app) as reopened:
            self.assertEqual(len(reopened.get('/api/competitions/results').json()),1)

if __name__=='__main__': unittest.main()
