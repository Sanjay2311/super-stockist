import zipfile, xml.etree.ElementTree as ET, json, re, sys

XLSX = sys.argv[1] if len(sys.argv) > 1 else 'Super Stockist Price List .xlsx'
M = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
ns = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
z = zipfile.ZipFile(XLSX)
shared = [''.join(t.text or '' for t in si.iter(M+'t'))
          for si in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si', ns)]
sheet = ET.fromstring(z.read('xl/worksheets/sheet1.xml'))

def colnum(ref):
    c = ''.join(ch for ch in ref if ch.isalpha()); n = 0
    for ch in c: n = n*26 + (ord(ch)-64)
    return n

rows = []
for row in sheet.iter(M+'row'):
    cells = {}
    for c in row.findall('m:c', ns):
        v = c.find('m:v', ns); t = c.get('t'); val = ''
        if v is not None:
            val = v.text
            if t == 's': val = shared[int(val)]
        cells[colnum(c.get('r'))] = val
    rows.append([cells.get(i, '') for i in range(1, 10)])

VOLATILE_NAMES = {'Almond', 'Cashew', 'Pumpkin Seeds'}
GST = {'Dry Fruits': 12, 'Seeds': 5, 'Flours': 5, 'Spices': 5, 'Other': 5}
JAR_PACKS = [(100, 1, 2), (250, 3, 4), (500, 5, 6), (1000, 7, None)]  # grams, curr col idx, mrp col idx

skus = []
section = None
for r in rows:
    head = r[0].strip()
    if head.startswith('1. DRY FRUITS'): section = 'Dry Fruits'; continue
    if head.startswith('EXTRA PRODUCTS'): section = 'Other'; continue
    if head.startswith('2. SEEDS'): section = 'Seeds'; continue
    if head.startswith('3. WHOLESALE FLOURS'): section = 'Flours'; continue
    if head.startswith('4. SPICES'): section = 'Spices'; continue
    if (not head or head.upper() in ('PRODUCT', 'FLOUR', 'SPICE / PRODUCT')
            or head.startswith('FARM & FARMERS') or head.startswith('Note') or 'GST Inclusive' in head):
        continue
    if section in ('Dry Fruits', 'Seeds', 'Spices'):
        for grams, ci, mi in JAR_PACKS:
            cur = r[ci]
            if not cur: continue
            mrp = r[mi] if mi is not None and r[mi] else None
            skus.append({'product': head, 'category': section,
                         'packLabel': f'{grams}g' if grams < 1000 else '1kg',
                         'packGrams': grams, 'unit': 'G',
                         'currentPaise': round(float(cur) * 100),
                         'mrpPaise': round(float(mrp) * 100) if mrp else None,
                         'volatile': head in VOLATILE_NAMES})
    elif section == 'Flours':
        cur, mrp = r[1], r[2]
        if not cur: continue
        skus.append({'product': head, 'category': 'Flours', 'packLabel': '1kg', 'packGrams': 1000, 'unit': 'KG',
                     'currentPaise': round(float(cur) * 100),
                     'mrpPaise': round(float(mrp) * 100) if mrp else None, 'volatile': False})
    elif section == 'Other':
        variation, cur, mrp = r[1], r[2], r[3]
        if not cur: continue
        m = re.search(r'(\d+)', variation or '')
        skus.append({'product': head, 'category': 'Other', 'packLabel': (variation or '').strip(),
                     'packGrams': int(m.group(1)) if m else None, 'unit': 'G',
                     'currentPaise': round(float(cur) * 100),
                     'mrpPaise': round(float(mrp) * 100) if mrp else None, 'volatile': False})

out = {'brand': 'Farm & Farmers', 'gstInclusive': True, 'gstPctByCategory': GST,
       'volatileNote': 'Almonds, Cashews, Pista & Pumpkin Seeds prices fluctuate with market',
       'skus': skus}
sys.stdout.write(json.dumps(out, indent=2, ensure_ascii=False) + '\n')
sys.stderr.write(f'{len(skus)} SKUs\n')
