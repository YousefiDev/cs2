import sys; sys.path.insert(0,'.')
import json, re, numpy as np
from objs import objs
cr=json.load(open('crates_final.json'))
def near(c,pat,pad=0.7):
    r=re.compile(pat,re.I); out=[]
    for o in objs:
        if not r.search(o['name']): continue
        cx=(o['gx0']+o['gx1'])/2; cz=(o['gz0']+o['gz1'])/2
        if c['x']-pad<=cx<=c['x']+c['w']+pad and c['z']-pad<=cz<=c['z']+c['d']+pad: out.append(o)
    return out
import collections
cnt=collections.Counter()
for c in cr:
    k='crate'
    if near(c,r'300d|car_wreck|flatbed|dust_r5|truck'): k='car'
    elif near(c,r'garbage_container|dumpster'): k='dumpster'
    elif near(c,r'oil_drum|propane|barrel'): k='barrel'
    elif near(c,r'concrete_barrier|jersey'): k='jersey'
    elif near(c,r'sack|sandbag'): k='sandbags'
    elif near(c,r'shipping_crate|crate|wood'): k='crate'
    elif max(c['w'],c['d'])>=5 and 2<=c['h']<=3.2: k='cont'
    elif c['h']<=1.3 and max(c['w'],c['d'])<=2: k='crate'
    else: k='concrete'
    c['kind']=k; cnt[k]+=1
print(cnt)
json.dump(cr,open('crates_final.json','w'))
