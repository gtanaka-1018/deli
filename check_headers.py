import urllib.request
req=urllib.request.Request('http://delisult.app/', method='HEAD')
with urllib.request.urlopen(req, timeout=15) as r:
    print('status', r.status)
    for k, v in r.getheaders():
        print(f'{k}: {v}')
