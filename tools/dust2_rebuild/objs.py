import json,re,numpy as np
MJ=json.load(open('dust2_3d_import/dust2.json')); S=1/0.0254; OFF=3.2
def short(n):
    n=re.sub(r'^n\d+_lr\d+_c\d+_s_','',n); n=re.sub(r'^n\d+_lr\d+_','',n); n=re.sub(r'^(agg_(no)?merge_|agg_prop_|agg_nomerge_)','',n)
    return re.sub(r'_fragment\d*(\.meshset_\d+)?$|\.meshset_\d+$','',n)
objs=[]
for c in MJ['colliders']:
    mn=np.array(c['min'])*S; mx=np.array(c['max'])*S
    objs.append(dict(name=short(c['name']),gx0=mn[0]+50,gx1=mx[0]+50,gz0=mn[2]+101,gz1=mx[2]+101,y0=mn[1]+OFF,y1=mx[1]+OFF))
def sel(pat): 
    r=re.compile(pat,re.I); return [o for o in objs if r.search(o['name'])]
if __name__=='__main__':
    for pat in ['shipping_crate','fruit_crate|crates_dishes','300d|car_wreck|flatbed|dust_r5','garbage_container|garbage_dumpster|dumpster','oil_drum|propane','pallet','concrete_barrier','tire','sacks|trash_bag','cart_','palm_bark','olive_bark|sumac_01|sagebrush','street_lamp|street_lantern|light_pole|power_pole_0','awning_0|awning_fabric','ac_unit','chainlink_fence_0','kasbah_small_rocks','dust_door_80x128|dust_door_46x106|trap_door','rollupdoor_metal']:
        L=sel(pat); print('%-60s %3d'%(pat,len(L)), ' '.join('(%.0f,%.0f %.1fx%.1fx%.1f)'%((o['gx0']+o['gx1'])/2,(o['gz0']+o['gz1'])/2,o['gx1']-o['gx0'],o['gz1']-o['gz0'],o['y1']-o['y0']) for o in L[:4]))
