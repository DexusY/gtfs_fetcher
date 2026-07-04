"""Display string tables and language detection for gtfs_app templates."""
from __future__ import annotations

from urllib.parse import urlparse

_TLD_LANG_MAP: dict[str, str] = {
    "pl": "pl",
    "de": "de",
    "uk": "en",
    "com": "en",
    "org": "en",
    "eu": "en",
}
_DEFAULT_LANG = "en"

_STRINGS: dict[str, dict[str, str]] = {
    "en": {
        "unknown_destination": "Unknown",
        "station_fallback": "Station {id}",
        "stop_fallback": "Stop {id}",
        "destination": "Destination",
        "line": "Line",
        "departs": "Departs",
        "no_departures": "No departures",
        "no_data": "No data available",
        "updated": "Updated",
        "delay_min": "+{min} min",
        "delay_min_neg": "{min} min",
        "departed": "<<",
        "now": "<<",
        "arriving": "<<<",
        "time_min": "{min} min",
        "line_scheme": "Line scheme",
    },
    "pl": {
        "unknown_destination": "Nieznany",
        "station_fallback": "Stacja {id}",
        "stop_fallback": "Przystanek {id}",
        "destination": "Kierunek",
        "line": "Linia",
        "departs": "Odjazd",
        "no_departures": "Brak odjazdów",
        "no_data": "Brak danych",
        "updated": "Aktualizacja",
        "delay_min": "+{min} min",
        "delay_min_neg": "{min} min",
        "departed": "<<",
        "now": "<<",
        "arriving": "<<<",
        "time_min": "{min} min",
        "line_scheme": "Schemat linii",
    },
    "de": {
        "unknown_destination": "Unbekannt",
        "station_fallback": "Bahnhof {id}",
        "stop_fallback": "Haltestelle {id}",
        "destination": "Ziel",
        "line": "Linie",
        "departs": "Abfahrt",
        "no_departures": "Keine Abfahrten",
        "no_data": "Keine Daten",
        "updated": "Aktualisiert",
        "delay_min": "+{min} Min",
        "delay_min_neg": "{min} Min",
        "departed": "<<",
        "now": "<<",
        "arriving": "<<<",
        "time_min": "{min} Min",
        "line_scheme": "Linienplan",
    },
}


def detect_lang(static_url: str) -> str:
    try:
        host = urlparse(static_url).hostname or ""
        tld = host.rsplit(".", 1)[-1].lower()
        return _TLD_LANG_MAP.get(tld, _DEFAULT_LANG)
    except Exception:
        return _DEFAULT_LANG


def get_locale(lang: str) -> dict[str, str]:
    return _STRINGS.get(lang, _STRINGS[_DEFAULT_LANG])
