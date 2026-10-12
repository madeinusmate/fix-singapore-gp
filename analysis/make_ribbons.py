# Builds *_ribbon.geojson (3D track ribbons, height by structure class) from traces2026.json
import json,numpy as np
from shapely.geometry import LineString,mapping
from shapely.ops import transform as stf
from lib import T
H={'at_grade':1.5,'covered_passage_ok_current':1.5,'river_bridge_ok_current':6,'low_bridge_verify':8,'raised_expressway_infeasible':14,'link':1.5,'tunnel_infeasible':0.5}
inv=lambda x,y,z=None: T.transform(x,y,direction='INVERSE')
for fn,d in json.load(open('traces2026.json')).items():
    if not isinstance(d, dict) or 'll' not in d: continue
    xy=np.array([T.transform(*p) for p in d['ll']]);F=[];n=len(xy)
    for i in range(0,n,4):
        seg=xy[i:i+5] if i+4<n else np.vstack([xy[i:],xy[:1]])
        F.append({'type':'Feature','properties':{'cls':d['cls'][i],'h':H.get(d['cls'][i],1.5)},'geometry':mapping(stf(inv,LineString(seg).buffer(7,cap_style=2)))})
    json.dump({'license':'ODbL-1.0','attribution':'© OpenStreetMap contributors','type':'FeatureCollection','features':F},open(f'{fn}_ribbon.geojson','w'))
