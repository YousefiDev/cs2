import sys; sys.path.insert(0,'.')
import numpy as np, json
from scipy import ndimage as ndi
from old import *
h=np.load('h_raw.npy'); walk=np.isfinite(h)
# ---- 1. keep only space that can be reached from the spawns (steps up to 1.3 m count: a jump)
import collections
seeds=[tuple(J['spawns'][t][0]) for t in ('T','CT')]
reach=np.zeros((H,W),bool); q=collections.deque()
for sx,sz in seeds: reach[sz,sx]=True; q.append((sx,sz))
while q:
    x,z=q.popleft()
    for dx,dz in ((1,0),(-1,0),(0,1),(0,-1),(1,1),(1,-1),(-1,1),(-1,-1)):
        a,b=x+dx,z+dz
        if 0<=a<W and 0<=b<H and walk[b,a] and not reach[b,a] and abs(h[b,a]-h[z,x])<=1.3: reach[b,a]=True; q.append((a,b))
print('cut-off cells removed',(walk&~reach).sum())
walk=walk&reach; h=np.where(walk,h,np.nan)
# ---- 2. bumps (crates / small blocks) inside walkable space: ground = grey opening with a 9x9 window
hf=np.where(walk,h,np.nanmin(h)-5)
hfill=h.copy()
# fill holes with nearest to make opening meaningful
idx=ndi.distance_transform_edt(~walk,return_distances=False,return_indices=True); hfill=h[tuple(idx)]
ground=ndi.grey_opening(hfill,size=(9,9))
bump=walk&((h-ground)>0.7)
bl,bn=ndi.label(bump,structure=np.array([[0,1,0],[1,1,1],[0,1,0]]))
inner=[]
for L in range(1,bn+1):
    zs,xs=np.where(bl==L); area=len(zs)
    z0,z1,x0,x1=zs.min(),zs.max()+1,xs.min(),xs.max()+1
    if area>60 or (z1-z0)>12 or (x1-x0)>12: continue
    fill=area/((z1-z0)*(x1-x0))
    if fill<0.6: continue
    g=float(np.median(ground[zs,xs])); t=float(np.median(h[zs,xs]))
    ring=[h[z,x] for z in range(z0-2,z1+2) for x in range(x0-2,x1+2) if 0<=z<H and 0<=x<W and not(z0<=z<z1 and x0<=x<x1) and walk[z,x] and bl[z,x]==0]
    if len(ring)<4: continue
    g=min(g,float(np.percentile(ring,25)))
    if t-g<0.7 or t-g>3.4 or t-float(np.median(ring))<0.45: continue
    inner.append(dict(x=int(x0),z=int(z0),w=int(x1-x0),d=int(z1-z0),base=g,h=round((t-g)*4)/4,top=t,area=area,src='bump'))
print('bump crates',len(inner))
auto=json.load(open('crates_auto.json'))
for c in auto: c['src']='ring'
allc=inner+auto
# remove duplicates (overlapping footprints)
final=[]
for c in sorted(allc,key=lambda c:-c['area']):
    if any(not(c['x']>=f['x']+f['w'] or f['x']>=c['x']+c['w'] or c['z']>=f['z']+f['d'] or f['z']>=c['z']+c['d']) for f in final): continue
    final.append(c)
print('crates total',len(final))
# floors under crates = ground
for c in final:
    for z in range(c['z'],c['z']+c['d']):
        for x in range(c['x'],c['x']+c['w']):
            if c['src']=='bump': h[z,x]=ground[z,x]
            else: h[z,x]=c['base']; walk[z,x]=True
# ---- 3. smooth the floor: median over the 3x3 neighbourhood where it does not cross a step; snap to 5 cm
hm=h.copy()
for it in range(2):
    for z in range(1,H-1):
        for x in range(1,W-1):
            if not walk[z,x]: continue
            nb=[hm[z+dz,x+dx] for dz in (-1,0,1) for dx in (-1,0,1) if np.isfinite(hm[z+dz,x+dx]) and abs(hm[z+dz,x+dx]-hm[z,x])<0.45]
            if len(nb)>=5:
                m=float(np.median(nb))
                if abs(m-hm[z,x])<0.3: hm[z,x]=0.5*hm[z,x]+0.5*m if it==0 else m
# ---- 3b. slope limiter: a 1 m cell cannot hold a ramp steeper than the engine's step (0.55 m), so spread such slopes over neighbouring cells.
# Differences above 1.1 m are real ledges and stay (they can be jumped).
LIM=0.5
for it in range(60):
    acc=np.zeros((H,W)); cnt=np.zeros((H,W)); worst=0
    for dz,dx in ((0,1),(1,0)):
        A=hm[:H-dz,:W-dx]; B=hm[dz:,dx:]; ok=np.isfinite(A)&np.isfinite(B)
        dd=B-A; ad=np.abs(dd); m=ok&(ad>LIM+0.01)&(ad<=1.1)
        sh=np.where(m,(ad-LIM)/2*np.sign(dd),0.0)    # A moves up by sh, B moves down by sh (towards each other)
        acc[:H-dz,:W-dx]+=sh; acc[dz:,dx:]-=sh
        cnt[:H-dz,:W-dx]+=m; cnt[dz:,dx:]+=m
        worst=max(worst,float(ad[m].max()) if m.any() else 0)
    if worst==0: break
    hm=np.where(cnt>0,hm+acc/np.maximum(cnt,1)*1.0,hm)
print('slope limiter iterations',it,'worst remaining',worst)
h=np.where(walk,np.round(hm*20)/20,np.nan)
np.save('h_final.npy',h); json.dump(final,open('crates_final.json','w'))
print('walk cells',np.isfinite(h).sum(),'height range',np.nanmin(h),np.nanmax(h))
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
fig,ax=plt.subplots(1,2,figsize=(24,12))
ax[0].imshow(h,origin='lower',cmap='terrain',vmin=0,vmax=10); ax[0].set_title('final floor')
for c in final: ax[0].add_patch(plt.Rectangle((c['x']-.5,c['z']-.5),c['w'],c['d'],fc='r',alpha=.7))
ax[1].imshow(hOld,origin='lower',cmap='terrain',vmin=0,vmax=10); ax[1].set_title('old floor')
plt.tight_layout(); plt.savefig('floor_new.png',dpi=45)
