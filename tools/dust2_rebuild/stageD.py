import sys; sys.path.insert(0,'.')
import numpy as np, json
from scipy import ndimage as ndi
from old import *
d=np.load('vox.npz'); X0,Z0,Y0,CS,VY=[float(v) for v in d['meta']]
v2=np.load('vox2.npz'); F=v2['F']; UP=v2['up']; DN=v2['dn']; WL=v2['wl']; NX,NZ,NY=F.shape
cov_strict=np.load('cov_strict.npy'); oldw=~np.isnan(hOld)
OFF=3.2
mask=oldw|cov_strict
# --- candidate layers per grid cell (grid heights) from every walkable voxel, 4 sub-columns
def cand(gx,gz):
    out=[]
    for sx in (0,1):
        for sz in (0,1):
            ix=int((gx-50+sx*0.5+0.25-X0)/CS); iz=int((gz-101+sz*0.5+0.25-Z0)/CS)
            if 0<=ix<NX and 0<=iz<NZ: out.append(np.where(F[ix,iz])[0]*VY+Y0+OFF)
    return out
C=[[None]*W for _ in range(H)]
for gz in range(H):
    for gx in range(W):
        if mask[gz,gx]: C[gz][gx]=cand(gx,gz)
def pick(subcols,guide,tol):
    vals=[]
    for l in subcols:
        if len(l):
            k=np.argmin(np.abs(l-guide))
            if abs(l[k]-guide)<=tol: vals.append(l[k])
    return float(np.median(vals)) if vals else None
h=np.full((H,W),np.nan)
# pass 1: old-guided
for gz in range(H):
    for gx in range(W):
        if oldw[gz,gx]:
            v=pick(C[gz][gx],hOld[gz,gx],0.5)
            h[gz,gx]=v if v is not None else np.nan
print('pass1 matched',np.isfinite(h).sum(),'of',oldw.sum())
# pass 2: propagate to cells without a match (old kept as fallback, mesh-only cells guided by neighbours)
for it in range(6):
    changed=0
    for gz in range(H):
        for gx in range(W):
            if not mask[gz,gx] or np.isfinite(h[gz,gx]): continue
            nb=[h[gz+dz,gx+dx] for dz in (-1,0,1) for dx in (-1,0,1) if (dx or dz) and 0<=gz+dz<H and 0<=gx+dx<W and np.isfinite(h[gz+dz,gx+dx])]
            if len(nb)<2: continue
            g=float(np.median(nb)); v=pick(C[gz][gx],g,0.6)
            if v is None and oldw[gz,gx] and abs(hOld[gz,gx]-g)<0.8: v=float(hOld[gz,gx])
            if v is not None: h[gz,gx]=v; changed+=1
    print('iter',it,'filled',changed)
    if not changed: break
# old cells still unmatched: keep old value (they were playable)
for gz in range(H):
    for gx in range(W):
        if oldw[gz,gx] and not np.isfinite(h[gz,gx]): h[gz,gx]=hOld[gz,gx]
print('walkable cells',np.isfinite(h).sum())
np.save('h_raw.npy',h)
