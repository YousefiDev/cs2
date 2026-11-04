import sys; sys.path.insert(0,'.')
import numpy as np
from old import *
d=np.load('vox.npz'); X0,Z0,Y0,CS,VY=[float(v) for v in d['meta']]
v2=np.load('vox2.npz'); OCC=v2['up']|v2['dn']|v2['wl']; NX,NZ,NY=OCC.shape; OFF=3.2
h=np.load('h_raw.npy'); walk=np.isfinite(h)
def open_band(gx,gz,hh):
    for sx in (0,1):
        for sz in (0,1):
            ix=int((gx-50+sx*0.5+0.25-X0)/CS); iz=int((gz-101+sz*0.5+0.25-Z0)/CS)
            if not(0<=ix<NX and 0<=iz<NZ): return False
            k0=int((hh-OFF+0.45-Y0)/VY); k1=int((hh-OFF+2.4-Y0)/VY)
            if OCC[ix,iz,k0:k1].any(): return False
    return True
MAXGAP=9; new=h.copy(); filled=0
def scan(lines_first,lines_second,get,setv):
    global filled
    for a in range(lines_first):
        b=0
        while b<lines_second:
            if walk[get(a,b)] or False:
                b+=1; continue
            # start of a gap
            s=b
            while b<lines_second and not walk[get(a,b)]: b+=1
            e=b  # gap = [s,e)
            if s==0 or e>=lines_second or e-s>MAXGAP: continue
            p,q=get(a,s-1),get(a,e)
            hp,hq=h[p],h[q]
            if not(np.isfinite(hp) and np.isfinite(hq)) or abs(hp-hq)>0.35: continue
            ok=True
            for t in range(s,e):
                zz,xx=get(a,t); hh=hp+(hq-hp)*(t-s+1)/(e-s+1)
                if not open_band(xx,zz,hh): ok=False;break
            if ok:
                for t in range(s,e):
                    zz,xx=get(a,t); hh=hp+(hq-hp)*(t-s+1)/(e-s+1)
                    if not np.isfinite(new[zz,xx]): new[zz,xx]=round(hh*20)/20; filled+=1
scan(H,W,lambda a,b:(a,b),None)      # rows
scan(W,H,lambda a,b:(b,a),None)      # columns
print('void cells filled',filled)
np.save('h_raw.npy',new)
