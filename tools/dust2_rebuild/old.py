import json, base64, numpy as np
J=json.load(open('old_dust2_cs.json'))
W,H=J['size']
def dec(b64):
    v=np.frombuffer(base64.b64decode(b64),dtype='<i2'); out=np.zeros(W*H,np.int16); k=0
    for i in range(0,len(v)-1,2):
        c=int(v[i+1]); out[k:k+c]=v[i]; k+=c
    return out.reshape(H,W)
hr=dec(J['grid']['hr']); cr=dec(J['grid']['cr'])
hOld=np.where(hr==32767,np.nan,hr/100.0); cOld=np.where(cr==32767,np.nan,cr/100.0)
