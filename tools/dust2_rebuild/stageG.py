import sys; sys.path.insert(0,'.')
import numpy as np, json
from scipy import ndimage as ndi
from old import *
d=np.load('vox.npz'); X0,Z0,Y0,CS,VY=[float(v) for v in d['meta']]
v2=np.load('vox2.npz'); OCC=v2['up']|v2['dn']|v2['wl']; NX,NZ,NY=OCC.shape; OFF=3.2
h=np.load('h_final.npy'); walk=np.isfinite(h)
crates=json.load(open('crates_final.json'))
cr_mask=np.zeros((H,W),bool)
for c in crates: cr_mask[c['z']:c['z']+c['d'],c['x']:c['x']+c['w']]=True
# ---- ceilings
ceil=np.full((H,W),np.nan)
for gz in range(H):
    for gx in range(W):
        if not walk[gz,gx] or cr_mask[gz,gx]: continue
        fy=h[gz,gx]-OFF; found=[]
        for sx in (0,1):
            for sz in (0,1):
                ix=int((gx-50+sx*0.5+0.25-X0)/CS); iz=int((gz-101+sz*0.5+0.25-Z0)/CS)
                if not(0<=ix<NX and 0<=iz<NZ): continue
                k0=int((fy+2.0-Y0)/VY); k1=min(NY,int((fy+9.0-Y0)/VY))
                col=OCC[ix,iz,k0:k1]
                if col.any(): found.append((k0+int(np.argmax(col)))*VY+Y0+OFF)
        if len(found)>=2: ceil[gz,gx]=float(np.median(found))
cv=np.isfinite(ceil)
# blobs of ceiling: drop tiny ones (wires / awning fragments), keep >=6 cells
lab,n=ndi.label(cv,structure=np.array([[0,1,0],[1,1,1],[0,1,0]])); sz=ndi.sum(cv,lab,range(1,n+1))
keep=np.isin(lab,[i+1 for i,s in enumerate(sz) if s>=6]); ceil=np.where(keep,ceil,np.nan)
# smooth ceilings: median within blobs, snap to 0.25
cm=ceil.copy()
for z in range(1,H-1):
    for x in range(1,W-1):
        if np.isfinite(ceil[z,x]):
            nb=[ceil[z+dz,x+dx] for dz in (-1,0,1) for dx in (-1,0,1) if np.isfinite(ceil[z+dz,x+dx]) and abs(ceil[z+dz,x+dx]-ceil[z,x])<0.8]
            cm[z,x]=np.median(nb)
ceil=np.where(np.isfinite(cm),np.round(cm*4)/4,np.nan)
# a roof must leave at least 2.6 m of headroom
ceil=np.where(np.isfinite(ceil)&(ceil-h>=2.6),ceil,np.nan)
print('ceiling cells',np.isfinite(ceil).sum())
np.save('ceil_final.npy',ceil)
# ---- wall heights for non-walkable cells: top of anything solid in the column (junk removed), relative to the nearest floor
top=np.full((H,W),np.nan)
for gz in range(H):
    for gx in range(W):
        if walk[gz,gx]: continue
        best=-1e9
        for sx in (0,1):
            for sz in (0,1):
                ix=int((gx-50+sx*0.5+0.25-X0)/CS); iz=int((gz-101+sz*0.5+0.25-Z0)/CS)
                if 0<=ix<NX and 0<=iz<NZ:
                    ys=np.where(OCC[ix,iz])[0]
                    if len(ys): best=max(best,ys[-1]*VY+Y0+OFF)
        if best>-1e8: top[gz,gx]=best
np.save('walltop.npy',top)
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
fig,ax=plt.subplots(1,2,figsize=(24,12))
ax[0].imshow(ceil,origin='lower',cmap='viridis',vmin=2,vmax=20); ax[0].set_title('ceilings (roofs)')
ax[1].imshow(np.where(walk,np.nan,top),origin='lower',cmap='magma',vmin=0,vmax=30); ax[1].set_title('solid top height')
plt.tight_layout(); plt.savefig('ceil_wall.png',dpi=45)
