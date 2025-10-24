import { useEffect, useRef } from "react"
import mapboxgl from "mapbox-gl"
import mbxGeocoding from "@mapbox/mapbox-sdk/services/geocoding"
import * as turf from '@turf/turf'

import "mapbox-gl/dist/mapbox-gl.css"
import "./App.scss"

import challenges from './data/challenges.json'
import locations from './data/locations.json'
import highlights from './data/highlights.json'
import statesGeoJSON from './data/us-states.json'

mapboxgl.accessToken = "pk.eyJ1IjoibGF5YW5qZXRod2EiLCJhIjoiY21nZmp4aXgwMDhpcjJqc2NwN2FtdDJ3aiJ9.dREYuWx-eMBTAT0HDkZF5g"

const getDrivingRoute = async (coords) => {
    if (coords.length < 2) return null
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coords[0][0]},${coords[0][1]};${coords[1][0]},${coords[1][1]}?geometries=geojson&overview=full&access_token=${mapboxgl.accessToken}`
    const response = await fetch(url)
    const data = await response.json()
    if (!data.routes || !data.routes[0]) return null
    return data.routes[0].geometry.coordinates
}

function createLoop(start, end, smoothness = 100) {
    const [lng1, lat1] = start
    const [lng2, lat2] = end

    const mid = [(lng1 + lng2) / 2, (lat1 + lat2) / 2]
    const bearing = turf.bearing(turf.point(start), turf.point(end))
    const height = turf.distance(start, end)/10

    const offsetMidUp = turf.destination(turf.point(mid), height, bearing + 90, { units: "kilometers" })
    const offsetMidDown = turf.destination(turf.point(mid), height, bearing - 90, { units: "kilometers" })

    const upperArc = turf.bezierSpline(
        turf.lineString([start, offsetMidUp.geometry.coordinates, end]),
        { resolution: smoothness }
    )
    const lowerArc = turf.bezierSpline(
        turf.lineString([end, offsetMidDown.geometry.coordinates, start]),
        { resolution: smoothness }
    )

    const fullLoop = [
        ...upperArc.geometry.coordinates,
        ...lowerArc.geometry.coordinates,
    ]

    return fullLoop
}


function App() {
    let season_number, season_challenges, season_locations, season_highlights, drawMap, resetMap, allCoords
    const colours = {"yellow": "#F8D603", "red": "#DB0100", "green":"#4EA264" }
    const season_colours = ["orange", "blue", "purple"]
    const track_dashes2 = {"red":[2,2],"yellow":[0,2,2,0]}
    const track_dashes3 = {"red":[2,4],"yellow":[0,2,2,2],"green":[0,4,2,0]}
    const max_season = 3
    const maxDistance = 375

    function setSeason(number) {
        season_number = number
        allCoords = []
        if (season_number != 0) {
            season_challenges = [challenges.find(season => season.season == season_number).challenges]
            season_locations = [locations.find(season => season.season == season_number).data]
            season_highlights = highlights.find(season => season.season == season_number).data
        } else {
            season_challenges = []
            season_locations = []
            for (let i=1; i <= max_season; i++) {
                season_challenges.push(challenges.find(season => season.season == i).challenges)
                season_locations.push(locations.find(season => season.season == i).data)
            }
        }
    }

    setSeason(0)

    const mapContainer = useRef(null)
    const map = useRef(null)
    const geocodingClient = mbxGeocoding({ accessToken: mapboxgl.accessToken })

    useEffect(() => {

        drawMap = async () => {
            if (!map.current) return

            for (let season = 0; season < season_challenges.length; season++) {
                const resolvedChallenges = await Promise.all(
                    season_challenges[season].map(async (c) => {
                        if (typeof c.location === "string") {
                            try {
                                const res = await geocodingClient.forwardGeocode({
                                    query: c.location,
                                    limit: 1,
                                }).send()
                                return { ...c, location:res.body.features[0]?.geometry.coordinates || [0, 0] }
                            } catch {
                                return { ...c, location: [0, 0] }
                            }
                        }
                        return c
                    })
                )

                resolvedChallenges.forEach((c) => {
                    allCoords.push(c.location)
                    new mapboxgl.Marker({ color: season_challenges.length == 1 ? colours[c.team] : season_colours[season]})
                        .setLngLat(c.location)
                        .setPopup(
                        new mapboxgl.Popup({
                            closeButton: false,
                            closeOnClick: true,
                            closeOnMove: true,
                            maxWidth: "auto",
                            offset: 25,
                        }).setHTML(
                            `<div style="position: relative; padding: 0.5rem;">
                                ${c.veto ? `
                                    <div style="
                                        position: absolute;
                                        top: 50%;
                                        left: 50%;
                                        transform: translate(-50%, -50%) rotate(-15deg);
                                        color: rgba(255, 0, 0, 0.75);
                                        font-size: 3.5rem;
                                        font-weight: 900;
                                        z-index: 10;
                                        pointer-events: none;
                                        white-space: nowrap;
                                        border: 4px solid rgba(255, 0, 0, 0);
                                        padding: 0.5rem 1rem;
                                        border-radius: 0.5rem;">
                                    [VETO]
                                    </div>
                                ` : ""}

                                <h3>${c.title}</h3>
                                ${c.prize ? `
                                    <h2>PRIZE: ${
                                        `${/^\d/.test(String(c.prize)) ? '$' : ''}${c.prize.toLocaleString("en-US")}`
                                        .replace('$ ', '$')
                                    }</h2>
                                ` : ""}
                                ${c.budget ? `<h4>Budget: \$${c.budget.toLocaleString("en-US")}</h4>` : ""}
                                <p>${c.description}</p>
                                ${c.reward ? `<h5>Reward: ${c.reward.toLocaleString("en-US")}</h5>` : ""}
                            </div>`
                        )
                        )
                    .addTo(map.current)
                })
            }


            for (let season = 0; season < season_locations.length; season++) {
                const resolvedTracks = await Promise.all(
                    season_locations[season].map(async (teamData) => {
                        const coords = await Promise.all(
                            teamData.locations.map(async (loc) => {
                                if (typeof loc === "string") {
                                    try {
                                        const res = await geocodingClient.forwardGeocode({query: loc, limit: 1}).send()
                                        return res.body.features[0]?.geometry.coordinates || [0, 0]
                                    } catch { return [0, 0] }
                                } else if (Array.isArray(loc)) {
                                    return await Promise.all(loc.map(async (place) => {
                                        if (typeof place === "string") {
                                            try {
                                                const res = await geocodingClient.forwardGeocode({ query: place, limit: 1 }).send()
                                                return res.body.features[0]?.geometry.coordinates || [0, 0]
                                            } catch { return [0, 0] }
                                        }
                                        return place
                                    }))
                                }
                                return loc
                            })
                        )

                        var combinedCoords = []

                        for (let i = 0; i < coords.length - 1; i++) {
                            var start = coords[i]
                            var end = coords[i + 1]

                            if (Array.isArray(start[0])) {
                                combinedCoords.push(...createLoop(...start))
                                start = start[1]
                            } else if (Array.isArray(end[0])) {
                                end = end[0]
                            }

                            const distance = turf.distance(start, end)
                            let segmentCoords

                            if (distance <= maxDistance) {
                                segmentCoords = await getDrivingRoute([start, end])
                                const line = turf.lineString(segmentCoords)
                                const length = turf.length(line, { units: 'kilometers' })
                                const resampledCoords = []
                                const spacing = 0.1
                                for (let i = 0; i <= length; i += spacing) {
                                    const pt = turf.along(line, i, { units: 'kilometers' })
                                    resampledCoords.push(pt.geometry.coordinates)
                                }
                                segmentCoords = resampledCoords

                            } else {
                                const line = turf.greatCircle(start, end, { npoints: 50 })
                                segmentCoords = line.geometry.coordinates
                            }

                            if (Array.isArray(segmentCoords[0][0])) {
                                let multiCoords = []
                                multiCoords.push(combinedCoords)
                                multiCoords.push(...segmentCoords)
                                combinedCoords = multiCoords
                            } else {
                                if (combinedCoords.length > 0) {
                                    if (Array.isArray(combinedCoords[0][0])) {
                                        combinedCoords.push(segmentCoords)
                                    } else {
                                        combinedCoords.push(...segmentCoords)
                                    }
                                } else {
                                    combinedCoords.push(...segmentCoords)
                                }
                            }
                        }

                        return {
                            team: teamData.team,
                            coordinates: Array.isArray(combinedCoords[0][0]) ? combinedCoords : [combinedCoords],
                        }

                    })
                )


                resolvedTracks.forEach((team) => {
                    const lineData = {
                        type: "Feature",
                        geometry: {
                            type: "MultiLineString",
                            coordinates: team.coordinates,
                        },
                        properties: {},
                    }

                    map.current.addSource(`${season}-line-${team.team}`, {
                        type: "geojson",
                        data: lineData,
                    })
                    allCoords.push(...lineData.geometry.coordinates)

                    map.current.addLayer({
                        id: `${season}-line-${team.team}`,
                        type: "line",
                        source: `${season}-line-${team.team}`,
                        layout: {
                            "line-join": "round",
                            "line-cap": "round",
                        },
                        paint: {
                            "line-color": season_challenges.length == 1 ? colours[team.team] : season_colours[season],
                            "line-width": 3,
                            "line-opacity": 0.8,
                            "line-dasharray": (season == 2 || season_number == 3) ? track_dashes3[team.team] : track_dashes2[team.team],
                        },
                    })
                })
            }


            if (season_number != 0) {
                season_highlights.forEach((h) => {

                    if (season_number == 1) {
                        const feature = statesGeoJSON.features.find(f => f.properties.NAME === h.name)
                        map.current.addSource(`highlight-state-${h.name}`, {
                            type: "geojson",
                            data: feature
                        })
                        allCoords.push(...turf.getCoords(feature).flat())

                        map.current.addLayer({
                            id: `highlight-state-fill-${h.name}`,
                            type: "fill",
                            source: `highlight-state-${h.name}`,
                            paint: {
                            "fill-color": colours[h.team],
                            "fill-opacity": 0.1,
                            "fill-outline-color": colours[h.team]
                            }
                        })

                        map.current.addLayer({
                            id: `highlight-state-outline-${h.name}`,
                            type: "line",
                            source: `highlight-state-${h.name}`,
                            layout: {
                                "line-join": "round",
                                "line-cap": "round"
                            },
                            paint: {
                                "line-color": colours[h.team],
                                "line-width": 1,
                                "line-opacity": 1
                            }
                        })


                    } else if (season_number == 3) {
                        map.current.addSource(`circle-${h.team}`, {
                            type: "geojson",
                            data: turf.polygon([[h.centre, 
                                ...turf.getCoords(turf.lineArc(h.centre, h.radius, ...h.bearings)), 
                                h.centre]])
                        })

                        map.current.addLayer({
                            id: `circle-fill-${h.team}`,
                            type: "fill",
                            source: `circle-${h.team}`,
                            paint: {
                                "fill-color": colours[h.team],
                                "fill-opacity": 0.1,
                            }
                        })

                        if (!map.current.getSource("circle")) {
                            let circle = turf.lineString(turf.circle(h.centre, h.radius).geometry.coordinates[0])
                            map.current.addSource("circle", {
                                type: "geojson",
                                data: circle
                            })
                            map.current.addLayer({
                                id: "circle-outline",
                                type: "line",
                                source: "circle",
                                paint: {
                                    "line-color": "#242D3D",
                                    "line-width": 5,
                                    "line-opacity": 1
                                }
                            })
                            allCoords.push(...turf.getCoords(circle))
                        }
                    }

                })
            }
            if (season_number != 0) {
                const bbox = turf.bbox(turf.lineString(allCoords))
                map.current.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding: 50, maxZoom: 12, duration: 2000 })
            }
        }

        resetMap = () => {
            if (map.current) {
                map.current.remove()
                map.current = null
            }

            map.current = new mapboxgl.Map({
                container: mapContainer.current,
                style: `mapbox://styles/mapbox/light-v11`,
                center: [0,20],
                zoom: 1.5,
                maxZoom: 18,
                projection: "mercator"
            })

            map.current.addControl(new mapboxgl.NavigationControl(), "top-right")
            map.current.on('load', () => {
                drawMap()
            })
        }

        resetMap()
    }, [])

    return (
        <div>
            <div ref={mapContainer} className="map-container" />

            <div className="map-selector">
                <label htmlFor="season" className="selector-label">Season:</label>
                <select onFocus={(e) => (e.target.size=10)} onBlur={(e) => (e.target.size=0)}
                onChange={(e) => {
                    e.target.size=1
                    e.target.blur()
                    const option = e.target.options[e.target.selectedIndex]
                    e.target.style.color = option.getAttribute("data-colour")
                    setSeason(parseInt(e.target.value, 10))
                    resetMap()
                }}>
                    <option value="0" data-colour="black" style={{ "color":"black" }}>All seasons</option>
                    <option value="1" data-colour={season_colours[0]} style={{ "color":season_colours[0] }}>Season 1</option>
                    <option value="2" data-colour={season_colours[1]} style={{ "color":season_colours[1] }}>Season 2</option>
                    <option value="3" data-colour={season_colours[2]} style={{ "color":season_colours[2] }}>Season 3</option>
                </select>
            </div>
        </div>
    )
}

export default App