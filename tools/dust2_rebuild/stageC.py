import sys; sys.path.insert(0,'.')
import numpy as np, json
from scipy import ndimage as ndi
from old import *
d=np.load('vox.npz'); X0,Z0,Y0,CS,VY=[float(v) for v in d['meta']]
v2=np.load('vox2.npz'); F=v2['F']; NX,NZ,NY=F.shape
def sp(t): gx,gz=J['spawns'][t][0]; return int((gx-50+.5-X0)/CS),int((gz-101+.5-Z0)/CS)
fams={}
for name,dil in (('strict',3),('jump',11)):
    Fd=ndi.binary_dilation(F,structure=np.ones((1,1,dil),bool)); lab,n=ndi.label(Fd,structure=np.ones((3,3,3),bool)); lab=lab*F
    L=set(int(v) for v in lab[sp('T')] if v>0)|set(int(v) for v in lab[sp('CT')] if v>0)
    fams[name]=np.isin(lab,list(L))&F
    print(name,'family voxels',fams[name].sum())
np.savez_compressed('fams.npz',**fams)
def footprint(M):
    cov=np.zeros((H,W),bool)
    for gz in range(H):
        for gx in range(W):
            ix=int((gx-50+.25-X0)/CS); iz=int((gz-101+.25-Z0)/CS)
            if M[ix:ix+2,iz:iz+2].any(): cov[gz,gx]=True
    return cov
cs_=footprint(fams['strict']); cj=footprint(fams['jump'])
oldw=~np.isnan(hOld)
print('strict',cs_.sum(),'jump',cj.sum(),'old',oldw.sum(),'strict&old',(cs_&oldw).sum(),'old only',(oldw&~cs_).sum(),'strict only',(cs_&~oldw).sum())
np.save('cov_strict.npy',cs_); np.save('cov_jump.npy',cj)
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
img=np.zeros((H,W,3)); img[oldw&cs_]=(.6,.6,.6); img[oldw&~cs_]=(1,0,0); img[cs_&~oldw]=(0,.5,1); img[cj&~cs_&~oldw]=(1,.8,0)
plt.figure(figsize=(12,13)); plt.imshow(img,origin='lower'); plt.title('grey both | red old only | blue mesh(strict) only | yellow jump-reachable only'); plt.tight_layout(); plt.savefig('cmp2.png',dpi=55)
