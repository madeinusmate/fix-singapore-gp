# 2026-regs analysis + grade-separation feasibility. All outputs computed; assumptions listed in ASSUME.
import json,math,time,numpy as np,requests,matplotlib;matplotlib.use('Agg');import matplotlib.pyplot as plt
from scipy.ndimage import gaussian_filter1d
import lib; from lib import *; import layouts
ASSUME=dict(mass_kg=800, note_mass='768 kg FIA minimum (car+driver, no fuel) + ~32 kg average fuel/ballast: assumption',
  P_ice_kW=400, P_k_max_kW=350, a_lat_g=3.5, a_brake_g=4.5, a_trac_g=1.3, rho=1.18, CdA_Z=1.25, CdA_X=0.90, Crr=0.015,
  harvest_cap_MJ=8.5, note_energy='Deployment budget per lap = harvest cap (8.5 MJ; 9.0 MJ with Overtake), assumed fully harvested via braking + super-clipping/partial load; the propulsive cost of super-clipping is not modelled (optimistic). Braking-only regen (350 kW cap) reported separately.', overtake_extra_MJ=0.5, regen_max_kW=350, xmode_min_s=3.0, xmode_min_radius_m=300, RMIN_m=12.0)
A=ASSUME; G0=9.81; m=A['mass_kg']
def pk(vk,ot):  # FIA 2026 TR C5.2.8 MGU-K power limit (kW) vs speed (km/h)
    if ot: return max(0.0,min(350.0,7100-20*vk)) if vk<355 else 0.0
    if vk<340: return min(350.0,1800-5*vk)
    if vk<345: return max(0.0,6900-20*vk)
    return 0.0
def prep(name):
    lib.LINKS.clear(); lib.OFF.clear(); lib.SEGTAGS.clear()
    P=despike(route(getattr(layouts,name)))
    raw_len=float(np.hypot(*np.diff(P,axis=0).T).sum())
    if np.hypot(*(P[0]-P[-1]))<1: P=P[:-1]
    Q=np.vstack([P,P[:1]]); s=np.r_[0,np.cumsum(np.hypot(*np.diff(Q,axis=0).T))]
    ss=np.arange(0,s[-1],2.0); X=np.c_[np.interp(ss,s,Q[:,0]),np.interp(ss,s,Q[:,1])]
    Xs=gaussian_filter1d(X,sigma=7,axis=0,mode='wrap')
    sf=np.array(T.transform(103.86420,1.29000)); Xs=np.roll(Xs,-int(np.argmin(np.hypot(*(Xs-sf).T))),axis=0)
    d=np.diff(np.vstack([Xs,Xs[:1]]),axis=0); seg=np.hypot(*d.T); h=np.arctan2(d[:,1],d[:,0])
    dh=np.angle(np.exp(1j*(np.roll(h,-1)-h))); k=gaussian_filter1d(dh/seg,sigma=3,mode='wrap'); k=np.clip(k,-1/A['RMIN_m'],1/A['RMIN_m'])
    return dict(name=name,X=Xs,L=float(seg.sum()),raw_len=raw_len,seg=seg,k=k,links=list(lib.LINKS),segtags=list(lib.SEGTAGS))
def lapsim(D,xmode,ot=False,vcut=None):
    k=np.abs(D['k']);seg=D['seg'];n=len(k)
    vlim=np.minimum(360/3.6,np.sqrt(A['a_lat_g']*G0/np.maximum(k,1e-6)))
    cda=np.where(xmode,A['CdA_X'],A['CdA_Z'])
    v=vlim.copy(); kw=np.zeros(n)
    for _ in range(2):
        for i in range(1,2*n+1):
            a,b=(i-1)%n,i%n; va=max(v[a],5.0); vk=va*3.6
            pK=pk(vk,ot) if (vcut is None or vk<vcut) else 0.0
            F=min((A['P_ice_kW']+pK)*1000/va, A['a_trac_g']*G0*m) - 0.5*A['rho']*cda[a]*va*va - A['Crr']*m*G0
            v[b]=min(v[b],math.sqrt(max(1.0,va*va+2*F/m*seg[a])))
        for i in range(2*n,0,-1):
            a,b=i%n,(i-1)%n; va=v[a]
            dec=A['a_brake_g']*G0+(0.5*A['rho']*cda[b]*va*va)/m
            v[b]=min(v[b],math.sqrt(va*va+2*dec*seg[b]))
    dt=seg/v; acc=np.diff(np.r_[v,v[0]])>0
    vk=v*3.6; pK=np.array([pk(x,ot) if (vcut is None or x<vcut) else 0.0 for x in vk])
    # deployment only while accelerating / at full throttle (not braking)
    brk=np.diff(np.r_[v,v[0]])<-1e-3
    Edep=float(np.sum(np.where(~brk,pK,0)*dt))/1000   # MJ
    # regen under braking capped at 350 kW (lift/partial-load harvest ignored: assumption)
    Pb=np.minimum(A['regen_max_kW'],m*A['a_brake_g']*G0*v/1000)
    Ereg=float(np.sum(np.where(brk,Pb,0)*dt))/1000
    return dict(v=v,t=float(dt.sum()),Edep=Edep,Ereg=Ereg,brk=brk,dt=dt)
def energy_limited(D,xmode,ot=False):
    cap=A['harvest_cap_MJ']+(A['overtake_extra_MJ'] if ot else 0)
    r=lapsim(D,xmode,ot); budget=cap
    if r['Edep']<=budget: r.update(vcut=None,budget=budget);return r
    lo,hi=60.0,360.0
    for _ in range(14):
        mid=(lo+hi)/2; rr=lapsim(D,xmode,ot,mid); b=cap
        if rr['Edep']>b: hi=mid
        else: lo=mid
    rr=lapsim(D,xmode,ot,lo); rr.update(vcut=lo,budget=cap); return rr
def corners(D,v,kmin=1/200.,gap=40,minang=20):
    k=D['k'];n=len(k);ds=D['seg'].mean();m_=np.abs(k)>kmin
    st=np.argmin(np.abs(k)); idx=np.roll(np.arange(n),-st); mm=m_[idx]; runs=[];i=0
    while i<n:
        if mm[i]:
            j=i
            while j<n and mm[j]: j+=1
            runs.append([i,j]);i=j
        else:i+=1
    mg=[]
    for r in runs:
        if mg and (r[0]-mg[-1][1])*ds<gap and np.sign(k[idx[r[0]]])==np.sign(k[idx[mg[-1][1]-1]]): mg[-1][1]=r[1]
        else: mg.append(r)
    C=[]
    for a,b in mg:
        ii=idx[a:b]; ang=np.degrees(np.sum(k[ii]*D['seg'][ii]))
        if abs(ang)>=minang:
            ap=ii[np.argmax(np.abs(k[ii]))]; C.append(dict(i0=int(ii[0]),i1=int(ii[-1]),apex=int(ap),angle=float(ang),rmin=float(1/abs(k[ap]))))
    C.sort(key=lambda c:c['i0']); S=[]
    for a,b in zip(C,C[1:]+C[:1]):
        i0,i1=a['i1'],b['i0']; idxs=np.arange(i0,i1 if i1>i0 else i1+n)%n
        S.append(dict(idx=idxs,len=float(D['seg'][idxs].sum()),into=b))
    return C,S
def xmode_mask(D,r):
    # X-mode (low drag) on full-throttle stretches on near-straight track lasting >= 3 s (F1.com: "any straight longer than three seconds")
    n=len(D['k']); ok=(~r['brk'])&(np.abs(D['k'])<1/A['xmode_min_radius_m'])
    mask=np.zeros(n,bool); st=np.argmin(ok)
    idx=np.roll(np.arange(n),-st); i=0
    while i<n:
        if ok[idx[i]]:
            j=i
            while j<n and ok[idx[j]]: j+=1
            ii=idx[i:j]
            if r['dt'][ii].sum()>=A['xmode_min_s']: mask[ii]=True
            i=j
        else: i+=1
    return mask
def classify(D):
    # per-sample OSM structure class via nearest routed segment
    segs=D['segtags']; A0=np.array([s[0] for s in segs]); B0=np.array([s[1] for s in segs])
    X=D['X']; cls=[]; layer=[]; names=[]
    AB=B0-A0; L2=np.maximum((AB**2).sum(1),1e-9)
    links=D['links']
    for p in X:
        t=np.clip(((p-A0)*AB).sum(1)/L2,0,1); P=A0+AB*t[:,None]; d=np.hypot(*(P-p).T); j=int(np.argmin(d)); tg=segs[j][2]
        # straight-line links
        dl=min([np.hypot(*(p-(np.array(a)+np.clip(np.dot(p-np.array(a),np.array(b)-np.array(a))/max(1e-9,np.dot(np.array(b)-np.array(a),np.array(b)-np.array(a))),0,1)*(np.array(b)-np.array(a))))) for a,b in links] or [1e9])
        if dl<d[j]-1: cls.append('link'); layer.append(0); names.append('temporary/missing link'); continue
        lay=int(tg.get('layer','0') or 0) if str(tg.get('layer','0')).lstrip('-').isdigit() else 0
        bn=tg.get('bridge:name',''); hw=tg.get('highway'); tun=tg.get('tunnel')
        if tun and tun!='building_passage': c='tunnel_infeasible'
        elif hw in('motorway','motorway_link','trunk_link') and tg.get('bridge'): c='raised_expressway_infeasible'
        elif tg.get('bridge') and (lay>=2 or 'Benjamin Sheares' in bn): c='raised_expressway_infeasible'
        elif tg.get('bridge') and bn=='Esplanade Bridge': c='river_bridge_ok_current'
        elif tg.get('bridge'): c='low_bridge_verify'
        elif tun=='building_passage': c='covered_passage_ok_current'
        else: c='at_grade'
        cls.append(c); layer.append(lay); names.append((tg.get('name') or hw)+(f" ({bn})" if bn else ''))
    return cls,layer,names
def elevation(lls):
    out=[]
    for i in range(0,len(lls),100):
        ch=lls[i:i+100]
        for tr in range(4):
            try:
                r=requests.get('https://api.open-meteo.com/v1/elevation',params=dict(latitude=','.join(f'{a[1]:.6f}' for a in ch),longitude=','.join(f'{a[0]:.6f}' for a in ch)),timeout=30)
                out+=r.json()['elevation'];break
            except Exception as e: time.sleep(3)
        else: out+=[None]*len(ch)
        time.sleep(0.4)
    return out
def ll(X): return [list(map(lambda v:round(v,7),T.transform(x,y,direction='INVERSE'))) for x,y in X]
NAMES={'CURRENT':'Current 2023+ (reconstructed)','DESIGN_A':'v1 Redesign A (Bayfront Paperclip): superseded','DESIGN_B':'v1 Redesign B (Nicoll + Bayfront Loop): superseded',
       'DESIGN_A2':'Redesign A2: Esplanade-Collyer Paperclip (at-grade)','DESIGN_B2':'Redesign B2: Padang + Collyer Hairpin (at-grade)'}
FILES={'CURRENT':'current','DESIGN_A':'v1_redesign_A','DESIGN_B':'v1_redesign_B','DESIGN_A2':'redesign_A2','DESIGN_B2':'redesign_B2'}
def main():
    R={}
    for nm in NAMES:
        D=prep(nm)
        r0=lapsim(D,np.zeros(len(D['k']),bool)); xm=xmode_mask(D,r0); D['xm']=xm
        dfn=energy_limited(D,xm,False); att=energy_limited(D,xm,True); D['def']=dfn; D['att']=att
        C,S=corners(D,dfn['v']); D['C']=C; D['S']=S
        tD=np.cumsum(dfn['dt']); tA=np.cumsum(att['dt'])
        hb=[];score=0;ot_gain=[]
        for s in S:
            ii=s['idx']; vD=dfn['v'][ii]; s['dv']=float(vD.max()*3.6-dfn['v'][s['into']['apex']]*3.6)
            s['bz']=ii[dfn['brk'][ii]]
            gain_s=float(dfn['dt'][ii].sum()-att['dt'][ii].sum())  # time attacker gains on this straight (both laps energy-limited)
            s['gain_s']=gain_s; s['gain_m']=gain_s*float(att['v'][ii].max())
            s['xlen']=float(D['seg'][ii[xm[ii]]].sum())
            if s['len']>400 and abs(s['into']['angle'])>70: hb.append(s)
            if s['len']>300 and abs(s['into']['angle'])>70: score+=max(0,s['gain_m'])/5*(s['dv']/100)
        cls,layer,nms=classify(D); D.update(cls=cls,layer=layer,segnames=nms,hb=hb,score26=score)
        R[nm]=D; print(nm,'done',round(D['L']),round(dfn['t'],2),round(att['t'],2),round(score,2))
    # elevation profiles
    for nm,D in R.items():
        ii=np.arange(0,len(D['X']),12); lls=ll(D['X'][ii]); D['elev_idx']=ii; D['elev']=elevation(lls)
    # ---- metrics
    def segclass_len(D):
        out={}
        for c,sg in zip(D['cls'],D['seg']): out[c]=out.get(c,0)+sg
        return {k:round(v) for k,v in out.items()}
    M={}
    for nm,D in R.items():
        dfn,att=D['def'],D['att']; S=D['S']
        # contiguous structure stretches
        stretches=[];cur=None
        for i,(c,nmx) in enumerate(zip(D['cls'],D['segnames'])):
            if c in('at_grade',):cur=None;continue
            if cur and cur['class']==c and cur['name']==nmx: cur['len']+=D['seg'][i]
            else: cur={'class':c,'name':nmx,'len':float(D['seg'][i]),'s0':float(np.sum(D['seg'][:i]))}; stretches.append(cur)
        stretches=[dict(x,len=round(x['len']),s0=round(x['s0'])) for x in stretches if x['len']>=10]
        ev=[e for e in D['elev'] if e is not None]
        M[nm]=dict(name=NAMES[nm],length_km=round(D['L']/1000,3),routed_length_km=round(D['raw_len']/1000,3),corners=len(D['C']),
          slow90=sum(1 for c in D['C'] if abs(c['angle'])>60 and dfn['v'][c['apex']]*3.6<120),
          longest_straight_m=round(max(s['len'] for s in S)),heavy_braking_zones=len(D['hb']),
          xmode_zones=[round(s['xlen']) for s in sorted(S,key=lambda s:-s['xlen']) if s['xlen']>0],
          xmode_total_m=round(float(D['seg'][D['xm']].sum())),
          lap_s=round(dfn['t'],2),lap_overtake_s=round(att['t'],2),overtake_gain_lap_s=round(dfn['t']-att['t'],2),
          top_kmh=round(dfn['v'].max()*3.6),top_overtake_kmh=round(att['v'].max()*3.6),
          energy_regen_MJ=round(dfn['Ereg'],2),energy_budget_MJ=round(dfn['budget'],2),energy_deployed_MJ=round(dfn['Edep'],2),
          clip_speed_kmh=None if dfn['vcut'] is None else round(dfn['vcut']),clip_speed_overtake_kmh=None if att['vcut'] is None else round(att['vcut']),
          overtaking_score_2026=round(D['score26'],2),
          hb=[dict(len=round(s['len']),angle=round(s['into']['angle']),dv=round(s['dv']),gain_m=round(s['gain_m'],1)) for s in D['hb']],
          best_overtake_straights=[dict(len=round(s['len']),gain_m=round(s['gain_m'],1),gain_s=round(s['gain_s'],3)) for s in sorted(S,key=lambda s:-s['gain_m'])[:3]],
          links_m=[round(math.dist(a,b)) for a,b in D['links']],structure_m=segclass_len(D),structures=stretches,
          feasible=not any(c in('raised_expressway_infeasible','tunnel_infeasible') for c in D['cls']),
          elev_min=min(ev) if ev else None,elev_max=max(ev) if ev else None,
          corners_list=[dict(n=t,angle=round(c['angle']),r=round(c['rmin']),v=round(dfn['v'][c['apex']]*3.6)) for t,c in enumerate(D['C'],1)])
    json.dump(dict(assumptions=ASSUME,layouts=M),open('metrics2026.json','w'),indent=1)
    # ---- geojson + traces
    def gidx(D):
        X=D['X'];a=np.argmin(np.hypot(*(X-np.array(T.transform(103.86440,1.28930))).T));b=np.argmin(np.hypot(*(X-np.array(T.transform(103.86384,1.29345))).T))
        return np.r_[np.arange(a,len(X)),np.arange(0,b)] if a>b else np.arange(a,b)
    def runs(mask):
        n=len(mask);out=[];i=0
        while i<n:
            if mask[i]:
                j=i
                while j<n and mask[j]: j+=1
                out.append(np.arange(i,j));i=j
            else:i+=1
        return out
    TR={}
    for nm,D in R.items():
        fn=FILES[nm]; X=D['X']; F=[]
        F.append({'type':'Feature','properties':{'kind':'centerline','layout':NAMES[nm],'length_m':round(D['L'])},'geometry':{'type':'LineString','coordinates':ll(np.vstack([X,X[:1]]))}})
        F.append({'type':'Feature','properties':{'kind':'grid_unchanged'},'geometry':{'type':'LineString','coordinates':ll(X[gidx(D)])}})
        for t,c in enumerate(D['C'],1): F.append({'type':'Feature','properties':{'kind':'turn','turn':t,'angle_deg':round(c['angle']),'min_radius_m':round(c['rmin']),'sim_min_speed_kmh':round(D['def']['v'][c['apex']]*3.6)},'geometry':{'type':'Point','coordinates':ll([X[c['apex']]])[0]}})
        for j,ii in enumerate(runs(D['xm']),1):
            if len(ii)>3: F.append({'type':'Feature','properties':{'kind':'xmode_zone','n':j,'len_m':round(float(D['seg'][ii].sum()))},'geometry':{'type':'LineString','coordinates':ll(X[ii])}})
        for s in D['S']:
            if len(s['bz'])>1: F.append({'type':'Feature','properties':{'kind':'braking_zone','len_m':round(float(D['seg'][s['bz']].sum())),'heavy':bool(any(s is h for h in D['hb']))},'geometry':{'type':'LineString','coordinates':ll(X[s['bz']])}})
        # overtake detection: 1 s before the start of the best overtake straight's braking; activation at the start of that straight (illustrative placement)
        best=max(D['S'],key=lambda s:s['gain_m'])
        F.append({'type':'Feature','properties':{'kind':'overtake_activation','gain_m':round(best['gain_m'],1)},'geometry':{'type':'Point','coordinates':ll([X[best['idx'][0]]])[0]}})
        cls=np.array(D['cls'])
        for c in set(D['cls'])-{'at_grade'}:
            for ii in runs(cls==c):
                if len(ii)>3: F.append({'type':'Feature','properties':{'kind':'structure','class':c,'name':D['segnames'][ii[0]],'layer':D['layer'][ii[0]],'len_m':round(float(D['seg'][ii].sum()))},'geometry':{'type':'LineString','coordinates':ll(X[ii])}})
        json.dump({'license':'ODbL-1.0','attribution':'© OpenStreetMap contributors','type':'FeatureCollection','features':F},open(f'{fn}.geojson','w'))
        s=np.r_[0,np.cumsum(D['seg'])[:-1]]; ii=np.arange(0,len(s),3)
        tD=np.r_[0,np.cumsum(D['def']['dt'])[:-1]]; tA=np.r_[0,np.cumsum(D['att']['dt'])[:-1]]
        ev=np.interp(ii,D['elev_idx'],[e if e is not None else np.nan for e in D['elev']])
        TR[fn]=dict(s=[round(x,1) for x in s[ii]],v=[round(x*3.6,1) for x in D['def']['v'][ii]],vo=[round(x*3.6,1) for x in D['att']['v'][ii]],
          t=[round(x,3) for x in tD[ii]],to=[round(x,3) for x in tA[ii]],lap=round(D['def']['t'],2),lapo=round(D['att']['t'],2),ll=ll(X[ii]),
          xm=[int(x) for x in D['xm'][ii]],elev=[None if np.isnan(e) else round(float(e),1) for e in ev],layer=[D['layer'][i] for i in ii],
          cls=[D['cls'][i] for i in ii])
    json.dump({'license':'ODbL-1.0','attribution':'© OpenStreetMap contributors',**TR},open('traces2026.json','w'))
    # ---- static maps
    bg=[np.array([T.transform(p['lon'],p['lat']) for p in w['geometry']]) for w in ways]
    CC={'raised_expressway_infeasible':'#ff00ff','low_bridge_verify':'#ffa500','river_bridge_ok_current':'#00bfff','covered_passage_ok_current':'#999999','link':'#8a2be2','tunnel_infeasible':'#ff00ff'}
    def draw(ax,D,title):
        for q in bg: ax.plot(*q.T,color='0.85',lw=.5,zorder=0)
        X=D['X']; ax.plot(*X.T,color='#1f4fd1',lw=3,zorder=2)
        for ii in runs(D['xm']): ax.plot(*X[ii].T,color='lime',lw=8,alpha=.45,zorder=1)
        for s in D['S']:
            if len(s['bz']): ax.scatter(*X[s['bz']].T,s=6,color='red',zorder=3)
        cls=np.array(D['cls'])
        for c,col in CC.items():
            for ii in runs(cls==c):
                if len(ii)>3: ax.plot(*X[ii].T,color=col,lw=2.2,zorder=4)
        ax.plot(*X[gidx(D)].T,color='orange',lw=5,zorder=2.5)
        for t,c in enumerate(D['C'],1):
            ax.text(*X[c['apex']],str(t),fontsize=8,weight='bold',color='white',ha='center',va='center',bbox=dict(boxstyle='circle,pad=0.2',fc='k'),zorder=5)
        from matplotlib.lines import Line2D
        h=[Line2D([],[],color='lime',lw=6,alpha=.5,label='X-mode (low-drag) zone'),Line2D([],[],color='red',marker='.',ls='',label='Braking (sim)'),Line2D([],[],color='orange',lw=5,label='Grid / pit straight')]+[Line2D([],[],color=c,lw=2.5,label=k) for k,c in CC.items() if k in set(D['cls'])]
        ax.legend(handles=h,loc='lower left',fontsize=7)
        ax.set_aspect('equal');pad=250;ax.set_xlim(X[:,0].min()-pad,X[:,0].max()+pad);ax.set_ylim(X[:,1].min()-pad,X[:,1].max()+pad);ax.set_xticks([]);ax.set_yticks([])
        ax.set_title(f"{title}\n{D['L']/1000:.3f} km, {len(D['C'])} corners, est. lap {D['def']['t']:.1f} s (2026 sim)",fontsize=10)
    for nm in NAMES:
        fig,ax=plt.subplots(figsize=(10,10));draw(ax,R[nm],NAMES[nm]);fig.text(.01,.01,'© OpenStreetMap contributors (ODbL)',fontsize=7);fig.savefig(f'{FILES[nm]}_2026.png',dpi=120,bbox_inches='tight');plt.close()
    fig,axs=plt.subplots(1,3,figsize=(24,10))
    for ax,nm in zip(axs,['CURRENT','DESIGN_A2','DESIGN_B2']): draw(ax,R[nm],NAMES[nm])
    fig.savefig('comparison_2026.png',dpi=100,bbox_inches='tight');plt.close()
    print(json.dumps({k:{x:v[x] for x in v if x not in('corners_list','structures','hb')} for k,v in M.items()},indent=1))

if __name__=="__main__":
    main()
