"""Build the static files the site routes and scores with.

Writes ../public/data/graph.json, dem.json and current.json.
The street graph is every road in osm.json (the whole of Singapore) except the pit lane, plus the two
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
OSM_ATTRIBUTION = '© OpenStreetMap contributors, ODbL 1.0'
DEM_ATTRIBUTION = (
    'Open-Meteo Elevation API (CC BY 4.0). Produced using Copernicus WorldDEM-90 '
    '© DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided '
    'under COPERNICUS by the European Union and ESA; all rights reserved.'
)
SOUTH = (103.86397, 1.28868)
NORTH = (103.86384, 1.29345)
# Anderson Bridge is not in the road extract. Way 29377119 is the deck: Connaught
# Drive, across the river, then the Esplanade Drive junction.
ANDERSON = [
    (103.85241, 1.28834),
    (103.8527757, 1.2874994),
    (103.8532676, 1.2871039),
    (103.8537625, 1.2866054),
]
# Turn 14. A 90° right-hander off northbound Esplanade Drive onto Raffles
# Avenue, apex about 14 m from the lap's earlier pass at the Nicoll junction.
TURN14 = [
    (103.8547869, 1.2912165),
    (103.8548035, 1.2912523),
    (103.8548277, 1.2912834),
    (103.8548581, 1.2913083),
    (103.8548933, 1.2913258),
    (103.8549314, 1.2913350),
    (103.8549707, 1.2913354),
    (103.8550077, 1.2913240),
]
LANE_M = 3.3
RACEWAY_M = 14.0
DEFAULT_LANES = {'motorway': 3, 'trunk': 3, 'primary': 3, 'secondary': 2, 'tertiary': 2}

def layer_of(tags):
    raw = str(tags.get('layer', '0'))
    return int(raw) if raw.lstrip('-').isdigit() else 0

def width_of(tags):
    """Paved width of one OSM way in metres. A dual carriageway is two ways."""
    highway = tags.get('highway', '')
    if highway == 'raceway':
        return RACEWAY_M
    raw = str(tags.get('lanes', ''))
    if raw.isdigit() and int(raw) > 0:
        return int(raw) * LANE_M
    oneway = tags.get('oneway') in ('yes', '1', '-1')
    if highway.endswith('_link'):
        return (1 if oneway else 2) * LANE_M
    return DEFAULT_LANES.get(highway, 1 if oneway else 2) * LANE_M

def build_graph():
    """nodes: (lon, lat) -> xy. edges: (a, b, length_m, name, layer, bridge, grid, raceway, width_m)."""
    nodes = {}
    def nid(lon, lat):
        key = (round(lon, 7), round(lat, 7))
        if key not in nodes:
            nodes[key] = T.transform(lon, lat)
        return key
    edges = []
    seen = set()
    def add(a, b, name, layer, bridge, raceway, width):
        if a == b:
            return
        key = frozenset((a, b))
        if key in seen:
            return
        seen.add(key)
        edges.append([a, b, math.dist(nodes[a], nodes[b]), name, layer, bridge, 0, raceway, width])
    for way in lib.ways:
        if way['tags'].get('name') == 'Pit Lane':
            continue
        # Two-point chord from the bridge onto the southbound carriageway.
        if way.get('id') == 767388313:
            continue
        ids = [nid(p['lon'], p['lat']) for p in way['geometry']]
        name = way['tags'].get('name') or way['tags'].get('highway') or ''
        lay = layer_of(way['tags'])
        bridge = 1 if way['tags'].get('bridge') else 0
        raceway = 1 if way['tags'].get('highway') == 'raceway' else 0
        width = width_of(way['tags'])
        for a, b in zip(ids, ids[1:]):
            add(a, b, name, lay, bridge, raceway, width)
    def snap(lon, lat):
        key, dist = nearest(nodes, lon, lat)
        if dist > 3:
            raise SystemExit(f'gap endpoint {lon},{lat} is {dist:.0f}m from the road network')
        return key
    def chain(points, name, bridge, width, snap_last):
        keys = []
        last = len(points) - 1
        for i, (lon, lat) in enumerate(points):
            if i == 0 or (snap_last and i == last):
                keys.append(snap(lon, lat))
            else:
                keys.append(nid(lon, lat))
        for a, b in zip(keys, keys[1:]):
            add(a, b, name, 0, bridge, 0, width)
        return keys
    def split_road(lon, lat, road_name):
        """Insert a node on an existing road so a hand-drawn link can join it."""
        key = nid(lon, lat)
        xy = np.array(nodes[key], dtype=float)
        best = None
        for i, edge in enumerate(edges):
            a, b, length, name, layer, bridge, grid, raceway, width = edge
            if name != road_name or a == key or b == key:
                continue
            pa = np.array(nodes[a], dtype=float)
            pb = np.array(nodes[b], dtype=float)
            ab = pb - pa
            span = float(ab @ ab) or 1e-9
            t = max(0.0, min(1.0, float((xy - pa) @ ab) / span))
            dist = float(np.linalg.norm(pa + ab * t - xy))
            if best is None or dist < best[0]:
                best = (dist, i)
        if best is None or best[0] > 1:
            raise SystemExit(f'{lon},{lat} is not on {road_name}')
        a, b, length, name, layer, bridge, grid, raceway, width = edges.pop(best[1])
        seen.discard(frozenset((a, b)))
        add(a, key, name, layer, bridge, raceway, width)
        add(key, b, name, layer, bridge, raceway, width)
        return key
    chain(ANDERSON, 'Anderson Bridge', 1, 10.0, snap_last=True)
    split_road(*TURN14[0], 'Esplanade Drive')
    chain(TURN14, 'Turn 14 slip', 0, 14.0, snap_last=True)
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
    for i, (a, b, length, name, layer, bridge, grid, raceway, _) in enumerate(edges):
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
    for a, b, length, name, layer, bridge, grid, raceway, _ in edges:
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
            pair = frozenset((index[prev], index[cur]))
            if pair in edge_of:
                if matched[-1] != cur:
                    matched.append(cur)
            else:
                leg = cheapest(index[prev], index[cur], set())
                if not leg:
                    raise SystemExit(f'gap from {prev} to {cur} is not connected')
                for a, b in zip(leg, leg[1:]):
                    ename = edges[edge_of[frozenset((a, b))]][3]
                    if ename not in ('Anderson Bridge', 'Turn 14 slip'):
                        raise SystemExit(f'gap from {prev} to {cur} leaves the hand-drawn link onto {ename}')
                matched.extend(keys[i] for i in leg[1:])
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
    for a, b, length, name, layer, bridge, grid, raceway, width in edges:
        flags = (1 if bridge else 0) | (2 if grid else 0) | (4 if raceway else 0)
        if grid:
            grid_n += 1
        flat_edges.extend((index[a], index[b], int(round(length * 100)), nid(name), layer, flags, int(round(width * 10))))
    doc = {
        'license': 'ODbL-1.0',
        'attribution': OSM_ATTRIBUTION + '. Pit lane removed. Anderson Bridge and the Turn 14 slip added by hand.',
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
        'license': 'ODbL-1.0',
        'attribution': OSM_ATTRIBUTION,
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
        'license': 'CC-BY-4.0',
        'attribution': DEM_ATTRIBUTION,
        'source': 'https://api.open-meteo.com/v1/elevation',
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
    json.dump({
        'license': 'ODbL-1.0',
        'attribution': OSM_ATTRIBUTION,
        'path': path,
    }, open(os.path.join(folder, 'sim-path.json'), 'w'))
    print(f'fixture path {len(path)}')

def main(dem=True):
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
    if dem:
        write_dem()

if __name__ == '__main__':
    import sys
    mode = sys.argv[1] if len(sys.argv) > 1 else ''
    if mode == 'dem':
        os.makedirs(OUT, exist_ok=True)
        write_dem()
    else:
        main(dem=mode != 'graph')
