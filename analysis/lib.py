import json,math,os,networkx as nx,numpy as np
from pyproj import Transformer
T=Transformer.from_crs(4326,3414,always_xy=True)  # SVY21 metres
d=json.load(open(os.path.join(os.path.dirname(__file__),'osm.json')))['elements']
ways=[e for e in d if e['type']=='way']
def build(names):
    directed = names is not None and '__DIR__' in names
    G=nx.DiGraph() if directed else nx.Graph()
    for w in ways:
        n=w['tags'].get('name',''); h=w['tags']['highway']
        ok = names is None or n in names or (h=='raceway' and 'raceway' in names)
        if h=='raceway' and not ok: continue
        pts=[T.transform(p['lon'],p['lat']) for p in w['geometry']]
        ids=[(round(p['lon'],7),round(p['lat'],7)) for p in w['geometry']]
        for a,b,pa,pb in zip(ids,ids[1:],pts,pts[1:]):
            G.add_edge(a,b,weight=math.dist(pa,pb)*(1 if ok else 25),name=n or h,ok=ok,tags=w['tags'],L=math.dist(pa,pb)); G.nodes[a]['xy']=pa; G.nodes[b]['xy']=pb
            if directed and w['tags'].get('oneway')!='yes': G.add_edge(b,a,**G[a][b])
    return G
def near(G,lon,lat):
    x,y=T.transform(lon,lat)
    return min(G.nodes,key=lambda n:(G.nodes[n]['xy'][0]-x)**2+(G.nodes[n]['xy'][1]-y)**2)
OFF=[];LINKS=[];SEGTAGS=[]
def route(legs):
    """legs: list of (lon,lat,names) - path from previous waypoint to this one within names"""
    out=[];prev=None;prevxy=None
    global LINKS
    for lon,lat,names in legs:
        if names=='LINK':
            xy=T.transform(lon,lat); a=np.array(out[-1] if out else prevxy); b=np.array(xy); n=max(2,int(np.hypot(*(b-a))/5))
            seg=[tuple(a+(b-a)*t) for t in np.linspace(0,1,n)[1:]]; LINKS.append((tuple(a),tuple(b))); out+=seg
            prev=None; prevxy=xy; continue
        G=build(names)
        cur=near(G,lon,lat)
        if prevxy is not None:
            p=prev if (prev is not None and prev in G) else near(G,*T.transform(*prevxy,direction='INVERSE'))
            path=nx.shortest_path(G,p,cur,weight='weight')
            out+= [G.nodes[n]['xy'] for n in path][(1 if out else 0):]
            for a,b in zip(path,path[1:]):
                if not G[a][b]['ok']: OFF.append((G[a][b]['name'],G[a][b]['weight']/25))
                SEGTAGS.append((G.nodes[a]['xy'],G.nodes[b]['xy'],G[a][b]['tags']))
        prev=cur;prevxy=G.nodes[cur]['xy']
    return np.array(out)

def road_pts(name):
    return np.array([T.transform(p['lon'],p['lat']) for w in ways if w['tags'].get('name')==name for p in w['geometry']])
def junction(a,b,hint,r=250):
    h=np.array(T.transform(*hint))
    A=road_pts(a);B=road_pts(b)
    A=A[np.hypot(*(A-h).T)<r];B=B[np.hypot(*(B-h).T)<r]
    D=np.hypot(A[:,None,0]-B[None,:,0],A[:,None,1]-B[None,:,1])
    i,j=np.unravel_index(D.argmin(),D.shape)
    m=(A[i]+B[j])/2
    return T.transform(*m,direction='INVERSE'),D.min()
def despike(P,win=60.0,tol=12.0):
    # remove out-and-back loops: if a later point within arclength<win*10 comes back within tol of an earlier point, cut between
    P=list(map(tuple,P));changed=True
    while changed:
        changed=False
        s=np.r_[0,np.cumsum(np.hypot(*np.diff(np.array(P),axis=0).T))]
        A=np.array(P)
        for i in range(len(P)):
            js=np.where((s>s[i]+3*tol)&(s<s[i]+600))[0]
            if len(js)==0: continue
            dd=np.hypot(*(A[js]-A[i]).T)
            k=np.where(dd<tol)[0]
            if len(k):
                j=js[k[-1]]
                # only cut if the loop is a spike (encloses little area)
                L=A[i:j+1];area=0.5*abs(np.dot(L[:,0],np.roll(L[:,1],1))-np.dot(L[:,1],np.roll(L[:,0],1)))
                if area < 0.15*(s[j]-s[i])**2/4/np.pi*1.0 and area<4000:
                    P=P[:i+1]+P[j+1:];changed=True;break
    return np.array(P)
