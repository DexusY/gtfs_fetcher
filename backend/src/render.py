"""Template dispatcher — maps template name to render function."""
from __future__ import annotations

from .templates.rti_display.image     import render_rti_display
from .templates.board_graphic.image   import render_board_graphic
from .templates.line_scheme.image     import render_line_scheme
from .templates.route_strip.image     import render_route_strip
from .templates.osm_map.image         import render_osm_map
from .templates.gtfs_routes_map.image import render_gtfs_routes_map
from .templates.active_routes_map.image import render_active_routes_map

TEMPLATES: dict[str, callable] = {
    "rti_display":       render_rti_display,
    "board_graphic":     render_board_graphic,
    "line_scheme":       render_line_scheme,
    "route_strip":       render_route_strip,
    "osm_map":           render_osm_map,
    "gtfs_routes_map":   render_gtfs_routes_map,
    "active_routes_map": render_active_routes_map,
}


def register_template(name: str, fn) -> None:
    TEMPLATES[name] = fn


def render(data: dict, template: str = "rti_display", **options) -> bytes:
    fn = TEMPLATES.get(template)
    if fn is None:
        raise ValueError(f"Unknown template {template!r}")
    return fn(data, options)
