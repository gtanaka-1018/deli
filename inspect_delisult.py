import urllib.request, re
html = urllib.request.urlopen('http://delisult.app/').read().decode('utf-8', 'ignore')
print('---HEAD---')
print(html[:4000])
print('---SCRIPTS---')
for m in re.finditer(r'<script[^>]*src=["\']([^"\']+)["\']', html):
    print(m.group(1))
print('---INLINE---')
for m in re.finditer(r'<script[^>]*>(.*?)</script>', html, re.S):
    txt = m.group(1).strip()
    if txt and len(txt) < 500:
        print('INLINE', txt[:300].replace('\n', ' '))
