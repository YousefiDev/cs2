import json, numpy as np
J=json.load(open('dust2_3d_import/dust2.json'))
B=np.fromfile('dust2_3d_import/dust2.bin',dtype=np.uint8)
S=1/0.0254  # the import was scaled by 0.0254 -> back to meters
def geoms():
    for g in J['geometries']:
        nv=g['vertexCount']; ni=g['indexCount']
        q=np.frombuffer(B[g['pos']:g['pos']+nv*6].tobytes(),dtype=np.uint16).reshape(nv,3).astype(np.float64)/65535.0
        P=(np.array(g['posMin'])+q*np.array(g['posRange']))*S
        it=np.uint32 if g['index32'] else np.uint16
        I=np.frombuffer(B[g['idx']:g['idx']+ni*np.dtype(it).itemsize].tobytes(),dtype=it).reshape(-1,3).astype(np.int64)
        yield g,P,I
if __name__=='__main__':
    mn=np.array([1e9]*3);mx=-mn;nt=0
    for g,P,I in geoms():
        mn=np.minimum(mn,P.min(0));mx=np.maximum(mx,P.max(0));nt+=len(I)
    print('bounds m',mn.round(1),mx.round(1),'tris',nt)
