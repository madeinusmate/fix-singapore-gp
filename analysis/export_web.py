"""Build the static files the site routes and scores with.

Writes ../public/data/graph.json, dem.json and current.json.
The street graph is every road in osm.json except the pit lane, plus the two
gaps the current lap already bridges (Anderson Bridge and the Turn 14 slip).
Edges of the start/finish straight are marked so a lap can use them only as
the starting grid, not as a shortcut in the middle.
"""
import json, math, os, time, heapq
import requests
import numpy as np
import lib, layouts
from lib import T

ROOT = os.path.dirname(__file__)
OUT = os.path.join(ROOT, '..', 'public', 'data')
SOUTH = (103.86397, 1.28868)
NORTH = (103.86384, 1.29345)
GAPS = [
    ((103.85241, 1.28834), (103.85376, 1.28661), 'Anderson Bridge', 1),
    ((103.85468, 1.2904), (103.8559972, 1.2904752), 'Turn 14 slip', 0),
]

def layer_of(tags):
    raw = str(tags.get('layer', '0'))
    return int(raw) if raw.lstrip('-').isdigit() else 0

def build_graph():
    """nodes: (lon, lat) -> xy. edges: (a, b, length_m, name, layer, bridge, grid)."""
    nodes = {}
    def nid(lon, lat):
        key = (round(lon, 7), round(lat, 7))
        if key not in nodes:
            nodes[key] = T.transform(lon, lat)
        return key
    edges = []
    seen = set()
    def add(a, b, name, layer, bridge, raceway=0):
        if a == b:
            return
        key = frozenset((a, b))
        if key in seen:
            return
        seen.add(key)
        edges.append([a, b, math.dist(nodes[a], nodes[b]), name, layer, bridge, 0, raceway])
    for way in lib.ways:
        if way['tags'].get('name') == 'Pit Lane':
            continue
        ids = [nid(p['lon'], p['lat']) for p in way['geometry']]
        name = way['tags'].get('name') or way['tags'].get('highway') or ''
        lay = layer_of(way['tags'])
        bridge = 1 if way['tags'].get('bridge') else 0
        raceway = 1 if way['tags'].get('highway') == 'raceway' else 0
        for a, b in zip(ids, ids[1:]):
            add(a, b, name, lay, bridge, raceway)
    def snap(lon, lat):
        key, dist = nearest(nodes, lon, lat)
        if dist > 3:
            raise SystemExit(f'gap endpoint {lon},{lat} is {dist:.0f}m from the road network')
        return key
    for a_ll, b_ll, name, bridge in GAPS:
        add(snap(*a_ll), snap(*b_ll), name, 0, bridge, 0)
    return nodes, edges

def nearest(nodes, lon, lat):
    xy = np.array(T.transform(lon, lat))
    best, dist = None, 1e18
    for key, point in nodes.items():
        d = float(np.hypot(*(np.array(point) - xy)))
        if d < dist:
            best, dist = key, d
    return best, dist

def path_nodes(nodes, edges):
    """Node keys along the current lap, pit lane excluded, anticlockwise."""
    index = {key: i for i, key in enumerate(nodes)}
    edge_of = {}
    for i, (a, b, *rest) in enumerate(edges):
        edge_of[frozenset((index[a], index[b]))] = i
    adj = {}
    for i, (a, b, length, name, layer, bridge, grid, raceway) in enumerate(edges):
        ia, ib = index[a], index[b]
        adj.setdefault(ia, []).append((ib, length, name, raceway))
        adj.setdefault(ib, []).append((ia, length, name, raceway))

    def cheapest(start, goal, allowed):
        dist = {start: 0.0}
        prev = {}
        heap = [(0.0, start)]
        while heap:
            d, node = heapq.heappop(heap)
            if d != dist.get(node):
                continue
            if node == goal:
                break
            for nxt, length, name, raceway in adj.get(node, ()):
                ok = name in allowed or (raceway and 'raceway' in allowed) or name in ('Anderson Bridge', 'Turn 14 slip')
                cost = length if ok else length * 25
                nd = d + cost
                if nd < dist.get(nxt, 1e18):
                    dist[nxt] = nd
                    prev[nxt] = node
                    heapq.heappush(heap, (nd, nxt))
        if goal not in dist:
            return None
        seq = [goal]
        node = goal
        while node != start:
            node = prev[node]
            seq.append(node)
        seq.reverse()
        return seq

    keys = list(nodes)
    race_nodes = set()
    for a, b, length, name, layer, bridge, grid, raceway in edges:
        if raceway:
            race_nodes.add(index[a])
            race_nodes.add(index[b])

    def nearest_race(lon, lat):
        xy = np.array(T.transform(lon, lat))
        best, dist = None, 1e18
        for node in race_nodes:
            d = float(np.hypot(*(np.array(nodes[keys[node]]) - xy)))
            if d < dist:
                best, dist = node, d
        return best, dist

    def along_raceway(start, goal):
        dist = {start: 0.0}
        prev = {}
        heap = [(0.0, start)]
        while heap:
            d, node = heapq.heappop(heap)
            if d != dist.get(node):
                continue
            if node == goal:
                break
            for nxt, length, name, raceway in adj.get(node, ()):
                if not raceway:
                    continue
                nd = d + length
                if nd < dist.get(nxt, 1e18):
                    dist[nxt] = nd
                    prev[nxt] = node
                    heapq.heappush(heap, (nd, nxt))
        seq = [goal]
        node = goal
        while node != start:
            node = prev[node]
            seq.append(node)
        seq.reverse()
        return seq

    south_i, ds = nearest_race(*SOUTH)
    north_i, dn = nearest_race(*NORTH)
    print(f'grid snaps south {ds:.1f}m north {dn:.1f}m')
    grid_seq = along_raceway(south_i, north_i)
    matched = [keys[i] for i in grid_seq]
    grid_at = len(matched) - 1
    prev = matched[-1]
    # The first two CURRENT entries are the grid ends. The rest is the lap.
    rest = layouts.CURRENT[2:]
    for nleg, (lon, lat, names) in enumerate(rest):
        if nleg == len(rest) - 1 and names != 'LINK':
            cur, dist = matched[0], 0.0
        else:
            cur, dist = nearest(nodes, lon, lat)
        if dist > 20:
            raise SystemExit(f'waypoint {lon},{lat} is {dist:.0f}m from a road')
        if names == 'LINK':
            if frozenset((index[prev], index[cur])) not in edge_of:
                raise SystemExit(f'gap from {prev} to {cur} is not an edge')
            if matched[-1] != cur:
                matched.append(cur)
        else:
            leg = cheapest(index[prev], index[cur], names)
            if not leg:
                raise SystemExit(f'no route to {lon},{lat}')
            matched.extend(keys[i] for i in leg[1:])
        prev = cur
    missing = [pair for pair in zip(matched, matched[1:]) if frozenset((index[pair[0]], index[pair[1]])) not in edge_of]
    if missing:
        raise SystemExit(f'current lap leaves the graph on {len(missing)} legs')
    return matched, index, grid_at

def mark_grid(nodes, edges, matched, index, at):
    south, north = matched[0], matched[at]
    print(f'grid nodes {at + 1} of {len(matched)}')
    edge_of = {}
    for i, (a, b, *rest) in enumerate(edges):
        edge_of[frozenset((index[a], index[b]))] = i
    for a, b in zip(matched[:at + 1], matched[1:at + 1]):
        edges[edge_of[frozenset((index[a], index[b]))]][6] = 1
    return south, north, matched[at:]

def adjacency(edges, index, skip_grid):
    adj = {}
    for i, (a, b, length, *rest) in enumerate(edges):
        if skip_grid and rest[3] == 1:
            continue
        ia, ib = index[a], index[b]
        adj.setdefault(ia, []).append((ib, length, i))
        adj.setdefault(ib, []).append((ia, length, i))
    return adj

def dijkstra(adj, start, goal):
    dist = {start: 0.0}
    prev = {}
    heap = [(0.0, start)]
    while heap:
        d, node = heapq.heappop(heap)
        if d != dist.get(node):
            continue
        if node == goal:
            break
        for nxt, length, edge in adj.get(node, ()):
            nd = d + length
            if nd < dist.get(nxt, 1e18):
                dist[nxt] = nd
                prev[nxt] = (node, edge)
                heapq.heappush(heap, (nd, nxt))
    if goal not in dist:
        return None
    nodes, edges = [goal], []
    node = goal
    while node != start:
        node, edge = prev[node]
        nodes.append(node)
        edges.append(edge)
    nodes.reverse()
    edges.reverse()
    return nodes, edges

def sample_waypoints(nodes, middle, spacing):
    """middle includes the north grid node and the south grid node."""
    xy = [np.array(nodes[key]) for key in middle]
    keep = [middle[0]]
    since = 0.0
    for i in range(1, len(middle) - 1):
        step = float(np.hypot(*(xy[i] - xy[i - 1])))
        since += step
        turn = 0.0
        if 0 < i < len(middle) - 1:
            a = xy[i] - xy[i - 1]
            b = xy[i + 1] - xy[i]
            la, lb = np.hypot(*a), np.hypot(*b)
            if la > 1 and lb > 1:
                turn = abs(math.degrees(math.atan2(a[0] * b[1] - a[1] * b[0], np.dot(a, b))))
        if since >= spacing or turn >= 25:
            keep.append(middle[i])
            since = 0.0
    keep.append(middle[-1])
    return keep

def pinch(nodes, edges, index, middle):
    """Add waypoints until shortest paths reproduce the current lap."""
    adj = adjacency(edges, index, skip_grid=True)
    ids = [index[key] for key in middle]
    wanted = []
    edge_of = {}
    for i, (a, b, *rest) in enumerate(edges):
        edge_of[frozenset((index[a], index[b]))] = i
    for a, b in zip(ids, ids[1:]):
        wanted.append(edge_of[frozenset((a, b))])
    spacing = 150.0
    waypoints = sample_waypoints(nodes, middle, spacing)
    for _ in range(40):
        routed = []
        ok = True
        for a, b in zip(waypoints, waypoints[1:]):
            found = dijkstra(adj, index[a], index[b])
            if not found:
                ok = False
                break
            routed.extend(found[1])
        if ok and routed == wanted:
            return waypoints[1:-1], spacing
        # Insert the original node halfway along the first leg that differs.
        if not ok or len(routed) != len(wanted) or routed != wanted:
            cursor = 0
            inserted = False
            for a, b in zip(waypoints, waypoints[1:]):
                found = dijkstra(adj, index[a], index[b])
                leg = found[1] if found else []
                n = len(leg)
                if wanted[cursor:cursor + n] != leg or not found:
                    span = middle[middle.index(a):middle.index(b) + 1]
                    extra = span[len(span) // 2]
                    if extra not in waypoints:
                        at = waypoints.index(a) + 1
                        waypoints.insert(at, extra)
                        inserted = True
                        break
                cursor += n
            if not inserted:
                spacing *= 0.7
                waypoints = sample_waypoints(nodes, middle, spacing)
    raise SystemExit('could not reproduce the current lap with waypoints')

def ll_of(nodes, key):
    lon, lat = T.transform(nodes[key][0], nodes[key][1], direction='INVERSE')
    return [round(lon, 7), round(lat, 7)]

def write_graph(nodes, edges, south, north):
    keys = list(nodes)
    index = {key: i for i, key in enumerate(keys)}
    names, name_id = [], {}
    def nid(name):
        if name not in name_id:
            name_id[name] = len(names)
            names.append(name)
        return name_id[name]
    flat_nodes = []
    for key in keys:
        lon, lat = ll_of(nodes, key)
        flat_nodes.extend((lon, lat))
    flat_edges = []
    grid_n = 0
    for a, b, length, name, layer, bridge, grid, raceway in edges:
        flags = (1 if bridge else 0) | (2 if grid else 0) | (4 if raceway else 0)
        if grid:
            grid_n += 1
        flat_edges.extend((index[a], index[b], int(round(length * 100)), nid(name), layer, flags))
    doc = {
        'names': names,
        'nodes': flat_nodes,
        'edges': flat_edges,
        'gridSouth': index[south],
        'gridNorth': index[north],
    }
    path = os.path.join(OUT, 'graph.json')
    json.dump(doc, open(path, 'w'), separators=(',', ':'))
    print(f'graph nodes {len(keys)} edges {len(edges)} grid {grid_n} bytes {os.path.getsize(path)}')
    return index

def write_current(nodes, edges, index, matched, south, north, waypoints):
    path = [ll_of(nodes, key) for key in matched]
    if path[0] == path[-1]:
        path = path[:-1]
    at = matched.index(north)
    grid = [ll_of(nodes, key) for key in matched[:at + 1]]
    doc = {
        'title': 'Current 2023+ (reconstructed)',
        'short': 'Current',
        'color': '#e10600',
        'racingSense': 'ccw',
        'path': path,
        'waypoints': [ll_of(nodes, key) for key in waypoints],
        'grid': grid,
    }
    out = os.path.join(OUT, 'current.json')
    json.dump(doc, open(out, 'w'))
    print(f'current path {len(path)} waypoints {len(doc["waypoints"])} grid {len(grid)}')

def write_dem():
    south, north, west, east = 1.272, 1.304, 103.838, 103.878
    dlat = 90 / 110574
    dlon = 90 / (111320 * math.cos(math.radians(1.29)))
    lats = list(np.arange(south, north + 1e-9, dlat))
    lons = list(np.arange(west, east + 1e-9, dlon))
    points = [(lon, lat) for lat in lats for lon in lons]
    elev = []
    for i in range(0, len(points), 40):
        chunk = points[i:i + 40]
        params = {
            'latitude': ','.join(f'{lat:.6f}' for _, lat in chunk),
            'longitude': ','.join(f'{lon:.6f}' for lon, _ in chunk),
        }
        for attempt in range(6):
            try:
                res = requests.get('https://api.open-meteo.com/v1/elevation', params=params, timeout=40)
                if res.status_code == 429:
                    time.sleep(8 + attempt * 4)
                    continue
                res.raise_for_status()
                elev.extend(res.json()['elevation'])
                break
            except Exception as err:
                print('elevation retry', attempt, type(err).__name__)
                time.sleep(5)
        else:
            raise SystemExit('elevation request failed')
        time.sleep(1.1)
        if i % 400 == 0:
            print(f'elevation {i}/{len(points)}')
    if len(elev) != len(points):
        raise SystemExit(f'elevation count {len(elev)} != {len(points)}')
    doc = {
        'west': west, 'south': south, 'east': lons[-1], 'north': lats[-1],
        'cols': len(lons), 'rows': len(lats),
        'z': [None if v is None else round(float(v), 1) for v in elev],
    }
    path = os.path.join(OUT, 'dem.json')
    json.dump(doc, open(path, 'w'), separators=(',', ':'))
    print(f'dem {doc["cols"]}x{doc["rows"]} bytes {os.path.getsize(path)}')

def write_fixture():
    """The polyline the published 2026 metrics were computed on, pit lane included.

    The port is checked against this line. The lap the site shows is current.json,
    which keeps to the start/finish straight and leaves the pit lane out.
    """
    raw = lib.despike(lib.route(layouts.CURRENT))
    if np.hypot(*(raw[0] - raw[-1])) < 1:
        raw = raw[:-1]
    path = []
    for point in raw:
        lon, lat = T.transform(float(point[0]), float(point[1]), direction='INVERSE')
        path.append([round(lon, 7), round(lat, 7)])
    folder = os.path.join(ROOT, 'fixtures')
    os.makedirs(folder, exist_ok=True)
    json.dump({'path': path}, open(os.path.join(folder, 'sim-path.json'), 'w'))
    print(f'fixture path {len(path)}')

def main():
    os.makedirs(OUT, exist_ok=True)
    nodes, edges = build_graph()
    matched, index, grid_at = path_nodes(nodes, edges)
    south, north, middle = mark_grid(nodes, edges, matched, index, grid_at)
    if middle[-1] != south:
        middle = middle + [south]
    waypoints, spacing = pinch(nodes, edges, index, middle)
    print(f'waypoints locked at spacing seed {spacing:.0f}m, count {len(waypoints)}')
    write_graph(nodes, edges, south, north)
    write_current(nodes, edges, index, matched, south, north, waypoints)
    write_fixture()
    write_dem()

if __name__ == '__main__':
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == 'dem':
        os.makedirs(OUT, exist_ok=True)
        write_dem()
    else:
        main()
