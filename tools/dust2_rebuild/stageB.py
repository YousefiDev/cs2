import sys,re; sys.path.insert(0,'.')
import numpy as np, json
from scipy import ndimage as ndi
from old import *
d=np.load('vox.npz'); up,dn,wl=d['up'].astype(bool),d['dn'].astype(bool),d['wl'].astype(bool); X0,Z0,Y0,CS,VY=[float(v) for v in d['meta']]
NX,NZ,NY=up.shape; S=1/0.0254
JUNK=re.compile(r'blocklight|steam|lightshaft|palm_frond|wire|power_pole|hammer_mesh|lantern|satellite|chainlink|window_bars|ladder|cart_|awning|garbage|electric|breeze|dust_door_|rollupdoor|window_frame|windows_|kasbah_windows|window_insets|vents|braces|rope|ornament|trim_decoractive|metal_trim|grape_leaves|sagebrush|sumac|olive_branch|zebra_grass|weeds|agave|laundry|umbrella|patio|cell_tower|light_pole|street_lamp|hanging_light',re.I)
MJ=json.load(open('dust2_3d_import/dust2.json'))
upc,dnc,wlc=up.copy(),dn.copy(),wl.copy(); nrem=0
for c in MJ['colliders']:
    n=c['name']
    if not JUNK.search(n): continue
    mn=np.array(c['min'])*S+0.08; mx=np.array(c['max'])*S-0.08
    if (mx-mn).max()>14 or (mx<=mn).any(): continue
    a=[max(0,int((mn[0]-X0)/CS)),max(0,int((mn[2]-Z0)/CS)),max(0,int((mn[1]+0.4-Y0)/VY))];  b=[int((mx[0]-X0)/CS)+1,int((mx[2]-Z0)/CS)+1,int((mx[1]-Y0)/VY)+1]
    for arr in (upc,dnc,wlc): arr[a[0]:b[0],a[1]:b[1],a[2]:b[2]]=False
    nrem+=1
print('junk boxes removed',nrem)
occ=upc|dnc|wlc
cs=np.cumsum(occ,axis=2,dtype=np.int32); K=7
ab=np.zeros_like(cs); ab[:,:,:NY-K-1]=cs[:,:,K+1:]-cs[:,:,1:NY-K]
F=upc&(ab==0)
np.savez_compressed('vox2.npz',up=upc,dn=dnc,wl=wlc,F=F)
def sp(t): gx,gz=J['spawns'][t][0]; return int((gx-50+.5-X0)/CS),int((gz-101+.5-Z0)/CS)
Fd=ndi.binary_dilation(F,structure=np.ones((1,1,3),bool)); lab,n=ndi.label(Fd,structure=np.ones((3,3,3),bool)); lab=lab*F
T=set(int(v) for v in lab[sp('T')] if v>0); C=set(int(v) for v in lab[sp('CT')] if v>0)
print('strict 0.5m: T',T,'CT',C,'SAME' if T&C else 'sep')
Fd=ndi.binary_dilation(F,structure=np.ones((1,1,5),bool)); lab,n=ndi.label(Fd,structure=np.ones((3,3,3),bool)); lab=lab*F
T=set(int(v) for v in lab[sp('T')] if v>0); C=set(int(v) for v in lab[sp('CT')] if v>0)
print('0.75m: T',T,'CT',C,'SAME' if T&C else 'sep')
