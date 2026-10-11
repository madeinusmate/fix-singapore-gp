import osmnx as ox, json, requests
ox.settings.use_cache=True
bbox=(103.840,1.275,103.875,1.302) # w,s,e,n
G=ox.graph_from_bbox(bbox,network_type='drive',simplify=True,retain_all=False)
ox.save_graphml(G,'drive.graphml')
print(len(G.nodes),len(G.edges))
q='[out:json][timeout:60];(way["highway"="raceway"](1.275,103.840,1.302,103.875);relation["name"~"Marina Bay"](1.275,103.840,1.302,103.875););out geom;'
r=requests.post('https://overpass-api.de/api/interpreter',data={'data':q},timeout=90)
d=r.json(); json.dump(d,open('raceway.json','w'))
for e in d['elements']: print(e['type'],e['id'],e.get('tags',{}).get('name'),e.get('tags',{}).get('highway'),len(e.get('geometry',[])))
