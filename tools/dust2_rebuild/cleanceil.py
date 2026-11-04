import sys; sys.path.insert(0,'.')
import numpy as np
from scipy import ndimage as ndi
ceil=np.load('ceil_final.npy'); cv=np.isfinite(ceil)
er=ndi.binary_opening(cv,structure=np.ones((2,2)))
clean=cv&ndi.binary_dilation(er,structure=np.ones((3,3)),iterations=1)
lab2,n2=ndi.label(clean,structure=np.ones((3,3))); sz=ndi.sum(clean,lab2,range(1,n2+1))
clean=np.isin(lab2,[i+1 for i,s in enumerate(sz) if s>=10])
np.save('ceil_clean.npy',np.where(clean,ceil,np.nan)); print('ceil cells',clean.sum())
