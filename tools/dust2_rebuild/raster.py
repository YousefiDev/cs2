import numpy as np, time, sys
sys.path.insert(0,'.')
from decode import geoms
X0,Z0,Y0=-64.0,-114.0,-6.0
CS=0.5; VY=0.25
NX=int((115-X0)/CS)+2; NZ=int((79-Z0)/CS)+2; NY=int((36-Y0)/VY)+2
up=np.zeros((NX,NZ,NY),np.uint8); dn=np.zeros_like(up); wl=np.zeros_like(up)
t0=time.time(); ntri=0
def splat(pts,cls):
    ix=((pts[:,0]-X0)/CS).astype(np.int32); iz=((pts[:,2]-Z0)/CS).astype(np.int32); iy=((pts[:,1]-Y0)/VY).astype(np.int32)
    ok=(ix>=0)&(ix<NX)&(iz>=0)&(iz<NZ)&(iy>=0)&(iy<NY)
    cls[ix[ok],iz[ok],iy[ok]]=1
for g,P,I in geoms():
    A=P[I[:,0]];B=P[I[:,1]];C=P[I[:,2]]
    n=np.cross(B-A,C-A); ln=np.linalg.norm(n,axis=1); good=ln>1e-9
    A,B,C,n,ln=A[good],B[good],C[good],n[good],ln[good]
    ny=n[:,1]/ln
    e=np.maximum.reduce([np.linalg.norm(B-A,axis=1),np.linalg.norm(C-A,axis=1),np.linalg.norm(C-B,axis=1)])
    k=np.clip(np.ceil(e/0.2).astype(int),1,700)
    for kk in np.unique(k):
        m=k==kk; a,b,c,y=A[m],B[m],C[m],ny[m]
        ii,jj=np.meshgrid(np.arange(kk+1),np.arange(kk+1),indexing='ij'); s=(ii+jj)<=kk; ii=ii[s];jj=jj[s]
        # chunk
        step=max(1,2_000_000//len(ii))
        for st in range(0,len(a),step):
            aa,bb,cc,yy=a[st:st+step],b[st:st+step],c[st:st+step],y[st:st+step]
            pts=aa[:,None,:]+((bb-aa)[:,None,:]*ii[None,:,None]+(cc-aa)[:,None,:]*jj[None,:,None])/kk
            cl=np.where(yy>0.7,0,np.where(yy<-0.7,1,2))
            for ci,arr in ((0,up),(1,dn),(2,wl)):
                sel=cl==ci
                if sel.any(): splat(pts[sel].reshape(-1,3),arr)
    ntri+=len(I)
    print('geom done',ntri,round(time.time()-t0),'s',flush=True)
np.savez_compressed('vox.npz',up=up,dn=dn,wl=wl,meta=np.array([X0,Z0,Y0,CS,VY]))
print('saved')
