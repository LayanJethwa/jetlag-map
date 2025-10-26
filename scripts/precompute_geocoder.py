import mapbox
import json

ACCESS_TOKEN = "pk.eyJ1IjoibGF5YW5qZXRod2EiLCJhIjoiY21nZmp4aXgwMDhpcjJqc2NwN2FtdDJ3aiJ9.dREYuWx-eMBTAT0HDkZF5g"

geocoder = mapbox.Geocoder(access_token=ACCESS_TOKEN)

with open("../src/data/challenges.json", encoding="utf-8") as c:
    challenges = json.load(c)
with open("../src/data/locations.json", encoding="utf-8") as l:
    locations = json.load(l)

def geocodeLocation(location):
    response = geocoder.forward(location)
    coords = response.json()["features"][0]["geometry"]["coordinates"]
    return coords

geocoded_locations = {}

for season in challenges:
    for challenge in season["challenges"]:
        loc = challenge["location"]
        if type(loc) == str:
            if loc not in geocoded_locations:
                geocoded_locations[loc] = geocodeLocation(loc)

for season in locations:
    for team in season["data"]:
        for loc in team["locations"]:
            if type(loc) == str:
                if loc not in geocoded_locations:
                    geocoded_locations[loc] = geocodeLocation(loc)

with open("../src/data/geocoded_locations.json", "w", encoding="utf-8") as file:
    json.dump(geocoded_locations, file, indent=4)