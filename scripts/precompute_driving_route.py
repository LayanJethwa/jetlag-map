import requests
import json
from geopy import distance

ACCESS_TOKEN = "pk.eyJ1IjoibGF5YW5qZXRod2EiLCJhIjoiY21nZmp4aXgwMDhpcjJqc2NwN2FtdDJ3aiJ9.dREYuWx-eMBTAT0HDkZF5g"

with open("../src/data/locations.json", encoding="utf-8") as l:
    locations = json.load(l)
with open("../src/data/geocoded_locations.json", encoding="utf-8") as g:
    location_coords = json.load(g)

def getDrivingRoute(coords):
    request = requests.get(f"https://api.mapbox.com/directions/v5/mapbox/driving/{coords[0][0]},{coords[0][1]};{coords[1][0]},{coords[1][1]}?geometries=geojson&overview=full&access_token={ACCESS_TOKEN}")
    return request.json()['routes'][0]['geometry']['coordinates']

MAX_DIST = 375
driving_routes = {}

for season in locations:
    for team in season["data"]:
        locs = [location_coords[i] if type(i) == str else i for i in team["locations"]]

        for index in range(len(locs)-1):
            loc1 = locs[index]
            loc2 = locs[index+1]
            if type(loc1[0]) == float and type(loc2[0]) == float:
                if distance.distance(list(reversed(loc1)),list(reversed(loc2))).km <= MAX_DIST:
                    if f'{team["locations"][index]}/{team["locations"][index+1]}' not in driving_routes:
                        driving_routes[f'{team["locations"][index]}/{team["locations"][index+1]}'] = getDrivingRoute([loc1,loc2])

with open("../src/data/driving_routes.json", "w", encoding="utf-8") as file:
    json.dump(driving_routes, file, indent=4)