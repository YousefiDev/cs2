import sys; sys.path.insert(0,'.')
import numpy as np, json
from scipy import ndimage as ndi
from old import *
d=np.load('vox.npz'); X0,Z0,Y0,CS,VY=[float(v) for v in d['meta']]
fams=np.load('fams.npz'); FJ=fams['jump']; NX,NZ,NY=FJ.shape
h=np.load('h_raw.npy'); OFF=3.2
walk=np.isfinite(h)
# top surface of the jump family per grid cell (highest layer present in >=2 of 4 sub-columns), only where not walkable ground
top=np.full((H,W),np.nan)
for gz in range(H):
    for gx in range(W):
        if walk[gz,gx]: continue
        cnt={}
        for sx in (0,1):
            for sz in (0,1):
                ix=int((gx-50+sx*0.5+0.25-X0)/CS); iz=int((gz-101+sz*0.5+0.25-Z0)/CS)
                if 0<=ix<NX and 0<=iz<NZ:
                    for y in np.where(FJ[ix,iz])[0]: cnt[y]=cnt.get(y,0)+1
        if cnt:
            ys=[y for y,c in cnt.items() if c>=2]
            if ys: top[gz,gx]=min(ys)*VY+Y0+OFF   # lowest well-covered layer: a crate top, not a roof above it
np.save('top_nonwalk.npy',top)
# components of nearly-equal height
valid=np.isfinite(top)
lab=np.zeros((H,W),int); nl=0
for gz in range(H):
    for gx in range(W):
        if valid[gz,gx] and not lab[gz,gx]:
            nl+=1; st=[(gz,gx)]; lab[gz,gx]=nl
            while st:
                z,x=st.pop()
                for dz,dx in ((1,0),(-1,0),(0,1),(0,-1)):
                    a,b=z+dz,x+dx
                    if 0<=a<H and 0<=b<W and valid[a,b] and not lab[a,b] and abs(top[a,b]-top[z,x])<=0.3: lab[a,b]=nl; st.append((a,b))
crates=[]
for L in range(1,nl+1):
    zs,xs=np.where(lab==L); area=len(zs)
    if area>48: continue
    z0,z1,x0,x1=zs.min(),zs.max()+1,xs.min(),xs.max()+1
    if (z1-z0)>10 or (x1-x0)>10: continue
    fill=area/((z1-z0)*(x1-x0))
    if fill<0.7: continue
    # ground: median of walkable ring
    ring=[]
    for z in range(z0-2,z1+2):
        for x in range(x0-2,x1+2):
            if 0<=z<H and 0<=x<W and not (z0<=z<z1 and x0<=x<x1) and walk[z,x]: ring.append(h[z,x])
    if len(ring)<4: continue
    g=float(np.median(ring)); t=float(np.median(top[zs,xs])); hh=t-g
    if 0.7<=hh<=3.2: crates.append(dict(x=int(x0),z=int(z0),w=int(x1-x0),d=int(z1-z0),base=g,h=round(hh*4)/4,top=t,area=area))
print('crate candidates',len(crates))
json.dump(crates,open('crates_auto.json','w'))
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
img=np.zeros((H,W,3)); img[walk]=(.7,.7,.7); img[valid&~walk]=(.9,.8,.5)
fig=plt.figure(figsize=(13,14)); plt.imshow(img,origin='lower')
for c in crates: plt.gca().add_patch(plt.Rectangle((c['x']-.5,c['z']-.5),c['w'],c['d'],fc='r',ec='k',alpha=.8))
plt.title('crate candidates (red)'); plt.tight_layout(); plt.savefig('crates.png',dpi=50)
