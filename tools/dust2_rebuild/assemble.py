import sys,re,json,base64; sys.path.insert(0,'.')
import numpy as np
from scipy import ndimage as ndi
from old import *
from objs import objs
OFF=3.2
h=np.load('h_final.npy'); ceil=np.load('ceil_clean.npy'); top=np.load('walltop.npy')
crs=json.load(open('crates_final.json')); walk=np.isfinite(h)
def rle(a):  # int16 RLE pairs (value,count)
    out=[]; v=int(a[0]); c=1
    for x in a[1:]:
        x=int(x)
        if x==v and c<32000: c+=1
        else: out+= [v,c]; v=x; c=1
    out+=[v,c]; return base64.b64encode(np.array(out,'<i2').tobytes()).decode()
hr=np.where(walk,np.round(h*100),32767).astype(np.int16).ravel()
cr_=np.full(W*H,32767,np.int16)
def greedy(mask_or_vals, same):
    """cover cells with maximal rectangles of equal value; mask_or_vals: 2D array, NaN/None = skip"""
    V=mask_or_vals; done=np.zeros(V.shape,bool); rects=[]
    for z in range(V.shape[0]):
        for x in range(V.shape[1]):
            v=V[z,x]
            if done[z,x] or v is None or (isinstance(v,float) and np.isnan(v)): continue
            x1=x+1
            while x1<V.shape[1] and not done[z,x1] and same(V[z,x1],v): x1+=1
            z1=z+1
            while z1<V.shape[0] and all((not done[z1,k]) and same(V[z1,k],v) for k in range(x,x1)): z1+=1
            done[z:z1,x:x1]=True; rects.append([x,z,x1,z1,v])
    return rects
eq=lambda a,b: a is not None and not (isinstance(a,float) and np.isnan(a)) and abs(float(a)-float(b))<1e-6
# ---- roofs
roofs=[[a,b,c,d,float(v)] for a,b,c,d,v in greedy(np.where(np.isfinite(ceil),ceil,np.nan),eq)]
# ---- materials from the previous map (areas paint materials only), extended to new cells by nearest neighbour
mat=np.zeros((H,W),int)
for x0,z0,x1,z1,hh,mt in J['areas']: mat[z0:z1,x0:x1]=mt
known=mat>0
idx=ndi.distance_transform_edt(~known,return_distances=False,return_indices=True); mat2=mat[tuple(idx)]
mat2=np.where(walk,np.where(mat2>0,mat2,1),0)
areas=[]
M=np.where(walk&(mat2!=1),mat2.astype(float),np.nan)
for x0,z0,x1,z1,v in greedy(M,eq): areas.append([x0,z0,x1,z1,round(float(np.nanmedian(h[z0:z1,x0:x1])),2),int(v)])
# ---- wall heights (relative to the nearest floor), quantised
idx=ndi.distance_transform_edt(~walk,return_distances=False,return_indices=True); near=h[tuple(idx)]
rel=np.where(~walk&np.isfinite(top),top-near,np.nan)
q=np.array([3.5,4.5,5.5,6.5,8,10,12,14])
def qz(v):
    if not np.isfinite(v): return np.nan
    return float(q[np.argmin(np.abs(q-np.clip(v,3.5,14)))])
# only the walls that touch the playable space matter visually; the rest keeps the skyline noise
near_walk=ndi.binary_dilation(walk,structure=np.ones((3,3)),iterations=2)&~walk
Q=np.vectorize(qz)(np.where(near_walk,rel,np.nan))
Q=ndi.median_filter(np.nan_to_num(Q,nan=0.0),size=3); Q=np.where(near_walk&(Q>0),Q,np.nan)
wallZones=[[a,b,c,d,v] for a,b,c,d,v in greedy(Q,eq)]
# ---- crates
rng=np.random.RandomState(7)
CARCOL=['#9c2b24','#c9b99a','#2f5f86','#6c7a4a','#d9d4c4','#7b4a2c']
crates=[]
for c in crs:
    base=float(h[c['z'],c['x']])
    if not np.isfinite(base) or not np.isfinite(c['top']): continue
    hh=max(0.5,round((c['top']-base)*4)/4)
    if hh>3.4: continue
    e=[c['x'],c['z'],c['w'],c['d'],hh,c['kind']]
    if c['kind']=='car': e.append(CARCOL[(c['x']*7+c['z']*3)%len(CARCOL)])
    crates.append(e)
# ---- props / lamps from the original object list
def cell(o): return (o['gx0']+o['gx1'])/2,(o['gz0']+o['gz1'])/2
def nearwalk(x,z,r=1):
    cx,cz=int(x),int(z); return 0<=cx<W and 0<=cz<H and walk[max(0,cz-r):cz+r+1,max(0,cx-r):cx+r+1].any()
def fl(x,z): 
    cx,cz=int(x),int(z); sub=h[max(0,cz-1):cz+2,max(0,cx-1):cx+2]; return float(np.nanmedian(sub)) if np.isfinite(sub).any() else 0.0
inside_crate=lambda x,z: any(c['x']-.5<=x<=c['x']+c['w']+.5 and c['z']-.5<=z<=c['z']+c['d']+.5 for c in crs)
props=[];lamps=[]
def R(x): return round(x*2)/2
for o in objs:
    n=o['name']; x,z=cell(o); w=o['gx1']-o['gx0']; d=o['gz1']-o['gz0']; hh=o['y1']-o['y0']
    if not nearwalk(x,z): continue
    f=fl(x,z); rot=0.0 if w>=d else 1.5708
    if re.search(r'palm_bark',n): props.append(['palm',R(x),R(z),0,round(float(np.clip(hh/5.5,0.9,1.5)),2)])
    elif re.search(r'olive_bark|sumac_01',n): props.append(['tree',R(x),R(z),0,round(float(np.clip(max(hh,2)/4,0.8,1.3)),2)])
    elif re.search(r'sagebrush|agave',n): props.append(['bush',R(x),R(z),0,round(float(np.clip(max(w,d)/1.6,0.6,1.1)),2)])
    elif re.search(r'street_lamp_0',n): props.append(['lamppost',R(x),R(z),0,1])
    elif re.search(r'street_lantern|street_lamp|light_pole',n): lamps.append([R(x),R(z),round(o['y1'],1),'#ffd9a0',1,13])
    elif re.search(r'hr_dust_tire',n) and not inside_crate(x,z): props.append(['tire',R(x),R(z),0,1])
    elif re.search(r'dust_awning_0\d_\d$|dust_awning_02_1',n) and max(w,d)>=1.8: props.append(['awning',R(x),R(z),rot,round(max(w,d),1),None,round(max(0,o['y1']-f-2.5),1)])
    elif re.search(r'ac_unit',n): props.append(['acunit',R(x),R(z),rot,1,None,round(max(0,o['y0']-f),1)])
    elif re.search(r'small_rocks',n): props.append(['rock',R(x),R(z),0,round(float(np.clip(max(w,d)/1.6,0.6,1.3)),2)])
    elif re.search(r'pottery',n) and not inside_crate(x,z): props.append(['pot',R(x),R(z),0,1])
    elif re.search(r'chainlink_fence_0',n) and max(w,d)>=2: props.append(['fence',R(x),R(z),rot,round(max(w,d),0)])
    elif re.search(r'sign_directional|sign_streets',n) and o['y0']-f<1.0: props.append(['sign',R(x),R(z),rot,1])
# drop duplicates (same kind closer than 0.6 cells) and normalise to [kind,x,z,rot,scale(,color,yOffset)]
out=[]
for p in props:
    if any(p[0]==q[0] and abs(p[1]-q[1])<0.6 and abs(p[2]-q[2])<0.6 for q in out): continue
    if len(p)>=7 and p[6]: out.append([p[0],p[1],p[2],p[3],p[4],p[5] or '',p[6]])
    else: out.append(p[:5])
props=out
# lamps: thin out (min spacing 4 cells)
ls=[]
for l in lamps:
    if all((l[0]-k[0])**2+(l[1]-k[1])**2>16 for k in ls): ls.append(l)
lamps=ls
print('roofs',len(roofs),'areas',len(areas),'wallZones',len(wallZones),'crates',len(crates),'props',len(props),'lamps',len(lamps))
# ---- gameplay (kept from the previous map; spawns snapped onto walkable cells)
def snap(p):
    x,z=int(p[0]),int(p[1])
    if walk[z,x]: return [x,z]
    best=None
    for r in range(1,6):
        for dz in range(-r,r+1):
            for dx in range(-r,r+1):
                a,b=x+dx,z+dz
                if 0<=a<W and 0<=b<H and walk[b,a] and not any(c['x']<=a<c['x']+c['w'] and c['z']<=b<c['z']+c['d'] for c in crs): return [a,b]
    return [x,z]
spawns={t:[snap(p) for p in J['spawns'][t]] for t in ('T','CT')}
callouts=[
 ['T Spawn',94,144,122,163],['Outside Long',112,126,160,172],['Long Doors',98,126,122,142],['Long A',96,74,124,126],['Pit',108,102,126,118],
 ['A Ramp',94,56,124,76],['A Site',93,17,120,46],['Short A',74,28,96,72],['Mid',64,68,100,97],['Suicide',66,97,100,128],
 ['CT Spawn',44,50,65,65],['B Doors',38,48,54,78],['B Site',6,55,47,76],['B Tunnels',20,44,38,134],['Upper Tunnels',4,88,62,112],['Lower Tunnels',4,128,66,148]]
d=dict(id='dust2_cs',name='Dust II (CS)',size=[W,H],scale=1,cs2=True,theme=J['theme'],skyline=dict(min=10,edge=15),
  grid=dict(hr=rle(hr),cr=rle(cr_)),areas=areas,ramps=[],roofs=roofs,crates=crates,doors=[],lamps=lamps,props=props,decals=[],wallZones=wallZones,
  spawns=spawns,yaw=J['yaw'],sites=J['sites'],buy=J['buy'],routes=J['routes'],holds=J['holds'],callouts=callouts)
json.dump(d,open('dust2_cs_new.json','w'),separators=(',',':'))
import os; print('json KB',os.path.getsize('dust2_cs_new.json')//1024)
