import sys; sys.path.insert(0,'.')
import numpy as np, json, matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
from old import *
h=np.load('h_final.npy'); ceil=np.load('ceil_clean.npy'); cr=json.load(open('crates_final.json'))
fig,ax=plt.subplots(figsize=(15,16))
ax.imshow(h,origin='upper',cmap='terrain',vmin=-2,vmax=9)   # z grows downwards: T spawn ends up at the bottom like the radar
ov=np.zeros((H,W,4)); ov[np.isfinite(ceil)]=(0.1,0.1,0.1,0.35); ax.imshow(ov,origin='upper')
col={'crate':'#c0392b','concrete':'#7f8c8d','car':'#2980b9','dumpster':'#27ae60','barrel':'#f39c12','jersey':'#8e44ad','sandbags':'#d35400','cont':'#16a085'}
for c in cr: ax.add_patch(plt.Rectangle((c['x']-.5,c['z']-.5),c['w'],c['d'],fc=col.get(c['kind'],'r'),ec='k',lw=.4))
for t,c in (('T','r'),('CT','b')):
    for p in J['spawns'][t]: ax.plot(p[0],p[1],c+'.',ms=4)
ax.set_xticks(range(0,W,10)); ax.set_yticks(range(0,H,10)); ax.grid(alpha=.3); ax.set_xlim(0,W); ax.set_ylim(H,0)
plt.tight_layout(); plt.savefig('radar.png',dpi=62)
