import json,numpy as np,matplotlib;matplotlib.use('Agg');import matplotlib.pyplot as plt
from scipy.ndimage import gaussian_filter1d
import lib; from lib import *; import layouts
RMIN=12.0  # floor on corner radius (street-junction corners; assumption)
G0=9.81; VMAX=330/3.6; ALAT=4*G0; ABRK=5*G0
def accel(v): return max(0.0, 11.0*(1-(v/VMAX)**2))   # simple traction/power-limited accel model (assumption)
def prep(name):
    lib.LINKS.clear(); lib.OFF.clear()
    P=despike(route(getattr(layouts,name)))
    if np.hypot(*(P[0]-P[-1]))<1: P=P[:-1]
    # resample 2 m closed loop
    Q=np.vstack([P,P[:1]]); s=np.r_[0,np.cumsum(np.hypot(*np.diff(Q,axis=0).T))]
    ds=2.0; ss=np.arange(0,s[-1],ds); X=np.c_[np.interp(ss,s,Q[:,0]),np.interp(ss,s,Q[:,1])]
    Xs=gaussian_filter1d(X,sigma=7,axis=0,mode='wrap')   # sigma=14 m smoothing of street polylines
    sf=np.array(T.transform(103.86420,1.29000)); Xs=np.roll(Xs,-int(np.argmin(np.hypot(*(Xs-sf).T))),axis=0)
    d=np.diff(np.vstack([Xs,Xs[:1]]),axis=0); seg=np.hypot(*d.T); L=seg.sum()
    h=np.unwrap(np.arctan2(d[:,1],d[:,0])); dh=np.diff(np.r_[h,h[0]+(h[-1]-h[0]-(h[-1]-h[0]))]) 
    dh=np.angle(np.exp(1j*(np.roll(h,-1)-h)))
    k=gaussian_filter1d(dh/seg,sigma=3,mode='wrap'); k=np.clip(k,-1/RMIN,1/RMIN)
    return dict(name=name,X=Xs,raw=P,L=L,seg=seg,k=k,links=list(lib.LINKS),off=list(lib.OFF))
def sim(D):
    k=np.abs(D['k']); seg=D['seg']; n=len(k)
    vlim=np.minimum(VMAX,np.sqrt(ALAT/np.maximum(k,1e-6)))
    v=vlim.copy()
    for _ in range(3):
        for i in range(1,2*n):
            a,b=(i-1)%n,i%n; v[b]=min(v[b],np.sqrt(v[a]**2+2*accel(v[a])*seg[a]))
        for i in range(2*n,0,-1):
            a,b=i%n,(i-1)%n; v[b]=min(v[b],np.sqrt(v[a]**2+2*ABRK*seg[b]))
    t=np.sum(seg/v); D['v']=v; D['t']=t; D['vlim']=vlim
    return D
def corners(D,kmin=1/200.,gap=40,minang=20):
    k=D['k'];n=len(k);ds=D['seg'].mean();s=np.cumsum(D['seg'])-D['seg']
    m=np.abs(k)>kmin
    # start index at a straight point
    st=np.argmin(np.abs(k)); idx=np.roll(np.arange(n),-st); mm=m[idx]
    runs=[];i=0
    while i<n:
        if mm[i]:
            j=i
            while j<n and mm[j]: j+=1
            runs.append([i,j]);i=j
        else:i+=1
    merged=[]
    for r in runs:
        if merged and (r[0]-merged[-1][1])*ds<gap and np.sign(k[idx[r[0]]])==np.sign(k[idx[merged[-1][1]-1]]): merged[-1][1]=r[1]
        else: merged.append(r)
    C=[]
    for a,b in merged:
        ii=idx[a:b]; ang=np.degrees(np.sum(k[ii]*D['seg'][ii]))
        if abs(ang)>=minang:
            ap=ii[np.argmax(np.abs(k[ii]))]
            C.append(dict(i0=int(ii[0]),i1=int(ii[-1]),apex=int(ap),angle=float(ang),rmin=float(1/abs(k[ap])),vmin=float(D['v'][ii].min()*3.6)))
    C.sort(key=lambda c:(c['i0']-0)%n)  # order from start line (index 0 = grid start)
    D['C']=C
    # straights between consecutive corners
    S=[]
    for a,b in zip(C,C[1:]+C[:1]):
        i0,i1=a['i1'],b['i0']; idxs=np.arange(i0,i1 if i1>i0 else i1+n)%n
        S.append(dict(i0=i0,i1=i1,len=float(D['seg'][idxs].sum()),into=b,vtop=float(D['v'][idxs].max()*3.6),idx=idxs))
    D['S']=S
    return D
def metrics(D):
    S=D['S']
    hb=[s for s in S if s['len']>400 and abs(s['into']['angle'])>70]
    for s in S:
        # braking zone = where v decreasing at >3g before corner
        v=D['v'][s['idx']]; dv=np.diff(v)
        bz=np.where(dv<0)[0]
        s['brake_len']=float(D['seg'][s['idx'][bz]].sum()) if len(bz) else 0.0
        s['dv']=float(v.max()*3.6-s['into']['vmin'])
        s['bz_idx']=s['idx'][bz]
    drs=sorted(S,key=lambda s:-s['len'])[:3]
    score=sum((s['dv']/100)*(s['len']/500) for s in hb)
    D.update(hb=hb,drs=drs,score=score,longest=max(s['len'] for s in S))
    return D
def gidx(D):
    X=D['X'];a=np.argmin(np.hypot(*(X-np.array(T.transform(103.86440,1.28930))).T));b=np.argmin(np.hypot(*(X-np.array(T.transform(103.86384,1.29345))).T))
    return np.r_[np.arange(a,len(X)),np.arange(0,b)] if a>b else np.arange(a,b)
names={'CURRENT':'Current 2023+ layout (reconstructed)','DESIGN_A':'Redesign A - "Bayfront Paperclip"','DESIGN_B':'Redesign B - "Nicoll Hairpin + Bayfront Loop"'}
R={}
for nm in names:
    D=metrics(corners(sim(prep(nm)))); R[nm]=D
# grid check: first 600 m identical
g=[R[n]['X'][gidx(R[n])] for n in R]
gridcheck=max(np.abs(g[0][:min(len(g[0]),len(x))]-x[:min(len(g[0]),len(x))]).max() for x in g[1:]); print('grid lens',[len(x)*2 for x in g])
print('grid max deviation first 600 m (m):',gridcheck)
bg=[np.array([T.transform(p['lon'],p['lat']) for p in w['geometry']]) for w in ways]
def draw(ax,D,title):
    for q in bg: ax.plot(*q.T,color='0.82',lw=.5,zorder=0)
    X=D['X']; ax.plot(*X.T,color='#1f4fd1',lw=3,zorder=2)
    for s in D['S']:
        if len(s['bz_idx']): ax.scatter(*X[s['bz_idx']].T,s=6,color='red',zorder=3)
    for j,s in enumerate(D['drs']):
        ii=s['idx'];ii=ii[(np.cumsum(D['seg'][ii])>60)]; ii=np.setdiff1d(ii,s['bz_idx'],assume_unique=False) if False else ii[:max(1,len(ii)-len(s['bz_idx']))]
        ax.plot(*X[ii].T,color='lime',lw=7,alpha=.55,zorder=1,label='DRS zone' if j==0 else None)
    ax.plot(*X[gidx(D)].T,color='orange',lw=5,zorder=2.5,label='Start grid / pit straight')
    ax.annotate('S/F',X[0],xytext=(10,-10),textcoords='offset points',fontsize=9,weight='bold')
    for t,c in enumerate(D['C'],1):
        p=X[c['apex']]; ax.text(*p,str(t),fontsize=8,weight='bold',color='white',ha='center',va='center',bbox=dict(boxstyle='circle,pad=0.2',fc='k'),zorder=5)
    for a,b in D['links']: ax.plot([a[0],b[0]],[a[1],b[1]],'m--',lw=2,zorder=4)
    ax.scatter([],[],color='red',s=10,label='Braking zones (sim)'); ax.plot([],[],'m--',label='Temporary link (flagged)')
    ax.set_aspect('equal');pad=250;ax.set_xlim(X[:,0].min()-pad,X[:,0].max()+pad);ax.set_ylim(X[:,1].min()-pad,X[:,1].max()+pad)
    ax.set_xticks([]);ax.set_yticks([])
    ax.set_title(f"{title}\n{D['L']/1000:.3f} km, {len(D['C'])} corners, est. lap {D['t']:.1f} s",fontsize=10)
    ax.legend(loc='lower left',fontsize=7)
for nm,fn in [('CURRENT','current'),('DESIGN_A','redesign_A'),('DESIGN_B','redesign_B')]:
    fig,ax=plt.subplots(figsize=(10,10));draw(ax,R[nm],names[nm]);fig.text(.01,.01,'Street background © OpenStreetMap contributors (ODbL)',fontsize=7);fig.savefig(f'{fn}.png',dpi=130,bbox_inches='tight');plt.close()
import shutil; shutil.copy('redesign_B.png','redesign.png')
fig,axs=plt.subplots(1,3,figsize=(24,10))
for ax,nm in zip(axs,names): draw(ax,R[nm],names[nm])
fig.text(.01,.01,'Street background © OpenStreetMap contributors (ODbL)',fontsize=8);fig.savefig('comparison.png',dpi=110,bbox_inches='tight');plt.close()
# speed traces
fig,ax=plt.subplots(figsize=(12,4))
for nm in names: D=R[nm];ax.plot(np.cumsum(D['seg'])/1000,D['v']*3.6,label=names[nm])
ax.set_xlabel('distance (km)');ax.set_ylabel('sim speed km/h');ax.legend();ax.grid(alpha=.3);fig.savefig('speed_traces.png',dpi=110,bbox_inches='tight')
# geojson
def ll(X): return [list(map(lambda v:round(v,7),T.transform(x,y,direction='INVERSE'))) for x,y in X]
out={}
for nm,fn in [('CURRENT','current'),('DESIGN_A','redesign_A'),('DESIGN_B','redesign_B')]:
    D=R[nm];F=[{'type':'Feature','properties':{'kind':'centerline','layout':names[nm],'length_m':round(D['L'],1)},'geometry':{'type':'LineString','coordinates':ll(np.vstack([D['X'],D['X'][:1]]))}},
       {'type':'Feature','properties':{'kind':'grid_unchanged'},'geometry':{'type':'LineString','coordinates':ll(D['X'][gidx(D)])}}]
    for t,c in enumerate(D['C'],1): F.append({'type':'Feature','properties':{'kind':'turn','turn':t,'angle_deg':round(c['angle'],1),'min_radius_m':round(c['rmin'],1),'sim_min_speed_kmh':round(c['vmin'],1)},'geometry':{'type':'Point','coordinates':ll([D['X'][c['apex']]])[0]}})
    for j,s in enumerate(D['drs'],1): F.append({'type':'Feature','properties':{'kind':'drs_zone','n':j,'straight_len_m':round(s['len'])},'geometry':{'type':'LineString','coordinates':ll(D['X'][s['idx']])}})
    for s in D['S']:
        if len(s['bz_idx'])>1: F.append({'type':'Feature','properties':{'kind':'braking_zone','len_m':round(s['brake_len'])},'geometry':{'type':'LineString','coordinates':ll(D['X'][s['bz_idx']])}})
    json.dump({'type':'FeatureCollection','features':F},open(f'{fn}.geojson','w'))
    out[nm]=dict(length_km=round(D['L']/1000,3),corners=len(D['C']),longest_straight_m=round(D['longest']),heavy_braking_zones=len(D['hb']),overtaking_score=round(D['score'],2),lap_s=round(D['t'],1),
      top_kmh=round(D['v'].max()*3.6),drs=[round(s['len']) for s in D['drs']],hb=[(round(s['len']),round(s['into']['angle']),round(s['into']['vmin'])) for s in D['hb']],
      corners_list=[(t,round(c['angle']),round(c['rmin']),round(c['vmin'])) for t,c in enumerate(D['C'],1)],links=[round(np.hypot(a[0]-b[0],a[1]-b[1])) for a,b in D['links']],
      slow90=sum(1 for c in D['C'] if abs(c['angle'])>60 and c['vmin']<120))
json.dump(out,open('metrics.json','w'),indent=1); print(json.dumps(out,indent=1))
tr={}
for nm,fn in [('CURRENT','current'),('DESIGN_A','redesign_A'),('DESIGN_B','redesign_B')]:
    D=R[nm]; s=np.r_[0,np.cumsum(D['seg'])[:-1]]; ii=np.arange(0,len(s),3)
    t=np.r_[0,np.cumsum(D['seg']/D['v'])[:-1]]
    tr[fn]=dict(s=[round(x,1) for x in s[ii]],v=[round(x*3.6,1) for x in D['v'][ii]],t=[round(x,3) for x in t[ii]],lap=round(D['t'],2),ll=ll(D['X'][ii]))
json.dump(tr,open('traces.json','w'))
