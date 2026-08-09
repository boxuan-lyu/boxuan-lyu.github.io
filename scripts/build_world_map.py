#!/usr/bin/env python3
"""Build the lightweight, interactive SVG used by the visitor report.

Source data: Natural Earth 1:110m Admin 0 Countries (public domain)
https://github.com/nvkelso/natural-earth-vector/

Usage:
    python3 scripts/build_world_map.py /path/to/ne_110m_admin_0_countries.geojson
"""

from __future__ import annotations

import json
import math
import sys
from collections import defaultdict
from pathlib import Path
from xml.sax.saxutils import escape


WIDTH = 1000
HEIGHT = 500
PADDING = 12


def equal_earth(longitude: float, latitude: float) -> tuple[float, float]:
    """Project longitude/latitude using the Equal Earth projection."""

    a1 = 1.340264
    a2 = -0.081106
    a3 = 0.000893
    a4 = 0.003796
    m = math.sqrt(3) / 2
    lon = math.radians(longitude)
    lat = math.radians(latitude)
    theta = math.asin(m * math.sin(lat))
    theta2 = theta * theta
    theta6 = theta2 * theta2 * theta2
    denominator = m * (a1 + 3 * a2 * theta2 + theta6 * (7 * a3 + 9 * a4 * theta2))
    x = lon * math.cos(theta) / denominator
    y = theta * (a1 + a2 * theta2 + theta6 * (a3 + a4 * theta2))
    return x, -y


def iter_rings(geometry: dict):
    if geometry["type"] == "Polygon":
        yield from geometry["coordinates"]
    elif geometry["type"] == "MultiPolygon":
        for polygon in geometry["coordinates"]:
            yield from polygon


def format_number(value: float) -> str:
    return f"{value:.2f}".rstrip("0").rstrip(".")


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Pass the Natural Earth GeoJSON file as the only argument.")

    source = Path(sys.argv[1])
    data = json.loads(source.read_text(encoding="utf-8"))

    countries: dict[str, dict] = defaultdict(lambda: {"name": "", "rings": []})
    projected_points: list[tuple[float, float]] = []

    for feature in data["features"]:
        properties = feature["properties"]
        code = (properties.get("ISO_A2_EH") or properties.get("ISO_A2") or "").upper()
        if len(code) != 2 or code == "AQ":
            continue

        name = properties.get("NAME_EN") or properties.get("ADMIN") or code
        countries[code]["name"] = name

        for ring in iter_rings(feature["geometry"]):
            projected_ring = [equal_earth(lon, lat) for lon, lat in ring]
            if len(projected_ring) < 3:
                continue
            countries[code]["rings"].append(projected_ring)
            projected_points.extend(projected_ring)

    min_x = min(point[0] for point in projected_points)
    max_x = max(point[0] for point in projected_points)
    min_y = min(point[1] for point in projected_points)
    max_y = max(point[1] for point in projected_points)
    scale = min((WIDTH - 2 * PADDING) / (max_x - min_x), (HEIGHT - 2 * PADDING) / (max_y - min_y))
    offset_x = (WIDTH - (max_x - min_x) * scale) / 2 - min_x * scale
    offset_y = (HEIGHT - (max_y - min_y) * scale) / 2 - min_y * scale

    def screen(point: tuple[float, float]) -> tuple[float, float]:
        return point[0] * scale + offset_x, point[1] * scale + offset_y

    paths = []
    for code, country in sorted(countries.items()):
        segments = []
        for ring in country["rings"]:
            points = [screen(point) for point in ring]
            start = points[0]
            commands = [f"M{format_number(start[0])},{format_number(start[1])}"]
            commands.extend(f"L{format_number(x)},{format_number(y)}" for x, y in points[1:])
            commands.append("Z")
            segments.append("".join(commands))

        path_data = "".join(segments)
        paths.append(
            f'  <path id="map-{code.lower()}" data-country="{code}" '
            f'data-name="{escape(country["name"])}" d="{path_data}" />'
        )

    output = Path("assets/world-map.svg")
    output.write_text(
        "\n".join(
            [
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 500" role="img" aria-label="World map">',
                '  <g class="world-map-countries" fill-rule="evenodd">',
                *paths,
                "  </g>",
                "</svg>",
                "",
            ]
        ),
        encoding="utf-8",
    )
    print(f"Wrote {output} with {len(paths)} countries")


if __name__ == "__main__":
    main()
