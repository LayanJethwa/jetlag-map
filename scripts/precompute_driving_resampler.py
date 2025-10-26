import json
from geopy.distance import geodesic

SPACING = 0.1

def resample_line(coords):
    coords = [[lat, lng] for [lng, lat] in coords]
    resampled_coords = []
    for i in range(len(coords)-1):
        start = coords[i]
        end = coords[i+1]
        dist = geodesic(coords[i], coords[i+1]).km
        for s in range(int(SPACING/dist)+1):
            resampled_coords.append([start[1]+(end[1]-start[1])*SPACING*s,start[0]+(end[0]-start[0])*SPACING*s])
    return resampled_coords

with open("../src/data/driving_routes.json", encoding="utf-8") as d:
    driving_routes = json.load(d)

resampled_routes = {}

for route in driving_routes:
    resampled_routes[route] = resample_line(driving_routes[route])

with open("../src/data/resampled_driving_routes.json", "w", encoding="utf-8") as file:
    json.dump(resampled_routes, file, indent=4)