"""Coordinator for Gail Evening Commute (Hammersmith → Paddington → Twyford).

Reads London TfL integration sensors directly and builds the trains[].leg2[]
schema the multileg card expects. Anchored on the PAD→TWY (GWR) departure.
"""
from __future__ import annotations

import base64
import logging
from datetime import datetime, timedelta, timezone

import aiohttp

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .const import (
    DOMAIN, NUM_TRAINS, MAX_LEG2,
    SCAN_INTERVAL_PEAK, SCAN_INTERVAL_OFFPEAK, SCAN_INTERVAL_NIGHT,
    PADDINGTON_INTERCHANGE_MINS,
    HSP_URL, HSP_USERNAME, HSP_PASSWORD, HSP_LEGS, HSP_FROM_TIME, HSP_TO_TIME,
    LEG1_HISTORY_PROXY_ENTITY,
    TFL_APP_KEY, TFL_JOURNEY_URL, NAPTAN_HAMMERSMITH, NAPTAN_PADDINGTON,
)

_LOGGER = logging.getLogger(__name__)
HSP_REFRESH = timedelta(hours=1)

HMM_DISTRICT = "sensor.london_tfl_district_940gzzluhsd"               # leg1 HMM → PAD
PAD_GWR      = "sensor.london_tfl_great_western_railway_910gpadton"   # leg2 PAD → TWY

HMM_PAD_MINS = 15   # HMM → PAD via District/Circle
TWY_TRANSIT_MINS = 25  # PAD → TWY on GWR

TWY_KEYWORDS = (
    "reading", "oxford", "swindon", "bristol", "cardiff", "didcot",
    "cheltenham", "worcester", "hereford", "gloucester", "bedwyn",
    "newbury", "twyford", "westbury", "penzance", "plymouth", "taunton",
    "exeter", "weston", "great malvern", "maidenhead", "slough",
)


def _get_scan_interval() -> timedelta:
    h = datetime.now().hour
    if 6 <= h < 10 or 16 <= h < 20:
        return timedelta(seconds=SCAN_INTERVAL_PEAK)
    if 23 <= h or h < 5:
        return timedelta(seconds=SCAN_INTERVAL_NIGHT)
    return timedelta(seconds=SCAN_INTERVAL_OFFPEAK)


def _parse_dt(val):
    if not val:
        return None
    try:
        s = str(val).replace("Z", "+00:00")
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except (ValueError, TypeError):
        return None


def _hhmm(dt):
    return dt.astimezone().strftime("%H:%M") if dt else None


class GailEveningCoordinator(DataUpdateCoordinator):

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        super().__init__(hass, _LOGGER, name=DOMAIN, update_interval=_get_scan_interval())
        self.entry = entry
        self._history: dict = {}
        self._history_last_fetch: datetime | None = None

    def schedule_hsp_fetch(self) -> None:
        self.hass.async_create_background_task(
            self._async_hsp_fetch(),
            name="gail_evening_commute_hsp_fetch",
        )

    async def _async_hsp_fetch(self) -> None:
        import asyncio as _aio
        await _aio.sleep(30)
        try:
            result = await self._fetch_all_history()
            if result:
                self._history = result
                if self.data:
                    self.data["history"] = result
                    if isinstance(self.data.get("summary"), dict):
                        self.data["summary"]["history"] = result
                    self.async_set_updated_data(self.data)
        except Exception as err:
            _LOGGER.warning("HSP Gail evening error: %s", err)

    async def _fetch_all_history(self) -> dict:
        now = datetime.now()
        if (
            self._history_last_fetch is not None
            and (now - self._history_last_fetch) < HSP_REFRESH
            and self._history
        ):
            return self._history

        today = now.date()
        from_date = (today - timedelta(days=30)).strftime("%Y-%m-%d")
        to_date = today.strftime("%Y-%m-%d")
        auth = base64.b64encode(f"{HSP_USERNAME}:{HSP_PASSWORD}".encode()).decode()
        headers = {"Authorization": f"Basic {auth}", "Content-Type": "application/json"}

        out = {}
        for leg in HSP_LEGS:  # leg2 PAD→TWY (real NR HSP)
            payload = {
                "from_loc": leg["from"], "to_loc": leg["to"],
                "from_time": HSP_FROM_TIME, "to_time": HSP_TO_TIME,
                "from_date": from_date, "to_date": to_date,
                "days": "WEEKDAY", "tolerance": [0, 5, 10, 15, 30],
            }
            try:
                connector = aiohttp.TCPConnector(ssl=False)
                async with aiohttp.ClientSession(connector=connector) as session:
                    async with session.post(
                        HSP_URL, json=payload, headers=headers,
                        timeout=aiohttp.ClientTimeout(total=30),
                    ) as resp:
                        if resp.status != 200:
                            continue
                        data = await resp.json(content_type=None)
                        services = data.get("Services", [])
            except Exception as err:
                _LOGGER.warning("HSP %s error: %s", leg["key"], err)
                continue
            parsed = self._parse_hsp(services, today)
            if parsed:
                parsed["label"] = leg["label"]
                out[leg["key"]] = parsed

        # leg1 HMM→PAD: District (TfL) — proxy
        try:
            s = self.hass.states.get(LEG1_HISTORY_PROXY_ENTITY)
            if s and s.state not in (None, "unknown", "unavailable", ""):
                attrs = s.attributes
                out["leg1"] = {
                    "label": "Hammersmith → Paddington (District line)",
                    "on_time_pct_today": attrs.get("on_time_pct_today"),
                    "on_time_pct_7day": attrs.get("on_time_pct_7day"),
                    "on_time_pct_30day": attrs.get("on_time_pct_30day"),
                    "daily_breakdown": attrs.get("daily_breakdown", []),
                    "best_day": attrs.get("best_day"),
                    "worst_day": attrs.get("worst_day"),
                    "proxy": True,
                }
        except Exception as err:
            _LOGGER.warning("HSP leg1 proxy error: %s", err)

        if out:
            self._history = out
            self._history_last_fetch = now
        return out

    @staticmethod
    def _parse_hsp(all_services, today) -> dict | None:
        by_date: dict = {}
        for svc in all_services:
            if not isinstance(svc, dict):
                continue
            sam = svc.get("serviceAttributesMetrics", {})
            if not isinstance(sam, dict):
                continue
            rids = sam.get("rids", [])
            if not rids:
                continue
            metrics = svc.get("Metrics", [])
            pct_at_5 = None
            for m in (metrics if isinstance(metrics, list) else []):
                if isinstance(m, dict) and str(m.get("tolerance_value", "")) == "5":
                    pct_at_5 = m.get("percent_tolerance")
                    break
            if pct_at_5 is None:
                continue
            for rid in rids:
                raw = str(rid)[:8]
                if raw.isdigit() and len(raw) == 8:
                    ds = raw[:4] + "-" + raw[4:6] + "-" + raw[6:8]
                    if ds not in by_date:
                        by_date[ds] = {"pct_sum": 0.0, "pct_count": 0}
                    by_date[ds]["pct_sum"] += float(pct_at_5)
                    by_date[ds]["pct_count"] += 1
        if not by_date:
            return None
        daily = []
        for ds in sorted(by_date.keys())[-30:]:
            d = by_date[ds]
            pct = round(d["pct_sum"] / d["pct_count"], 2) if d["pct_count"] else None
            daily.append({"date": ds, "on_time_pct": pct, "total_observations": d["pct_count"]})
        dwd = [d for d in daily if d["on_time_pct"] is not None]
        today_str = today.strftime("%Y-%m-%d")
        last7 = [d for d in dwd if d["date"] >= (today - timedelta(days=7)).strftime("%Y-%m-%d")]
        def avg(days):
            v = [d["on_time_pct"] for d in days if d["on_time_pct"] is not None]
            return round(sum(v) / len(v), 1) if v else None
        td = next((d for d in daily if d["date"] == today_str), None)
        best = max(dwd, key=lambda d: d["on_time_pct"] or 0) if dwd else None
        worst = min(dwd, key=lambda d: d["on_time_pct"] if d["on_time_pct"] is not None else 100) if dwd else None
        return {
            "on_time_pct_today": td["on_time_pct"] if td else None,
            "on_time_pct_7day": avg(last7),
            "on_time_pct_30day": avg(dwd),
            "daily_breakdown": daily,
            "best_day": best,
            "worst_day": worst,
        }

    def _tfl_departures(self, entity_id, filter_fn=None):
        s = self.hass.states.get(entity_id)
        if not s or "departures" not in s.attributes:
            return []
        now = datetime.now(timezone.utc)
        out = []
        for d in s.attributes["departures"]:
            dt = _parse_dt(d.get("expected"))
            if not dt or dt <= now:
                continue
            if filter_fn and not filter_fn(d):
                continue
            out.append({"dt": dt, "destination": d.get("destination", "")})
        out.sort(key=lambda x: x["dt"])
        return out


    async def _fetch_journey(self, frm, to, depart_dt):
        """TfL Journey Planner: real timetabled tube connections from depart_dt onward."""
        url = TFL_JOURNEY_URL.format(frm=frm, to=to)
        params = {
            "mode": "tube",
            "timeIs": "Departing",
            "date": depart_dt.strftime("%Y%m%d"),
            "time": depart_dt.strftime("%H%M"),
            "app_key": TFL_APP_KEY,
        }
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    url, params=params, headers={"Accept": "application/json"},
                    timeout=aiohttp.ClientTimeout(total=15),
                ) as resp:
                    if resp.status != 200:
                        _LOGGER.warning("TfL Journey %s->%s HTTP %s", frm, to, resp.status)
                        return []
                    data = await resp.json(content_type=None)
        except Exception as err:
            _LOGGER.warning("TfL Journey %s->%s error: %s", frm, to, err)
            return []

        out = []
        for jn in (data.get("journeys") or []):
            start = _parse_dt(jn.get("startDateTime"))
            arr = _parse_dt(jn.get("arrivalDateTime"))
            if not start:
                continue
            lines = []
            for lg in (jn.get("legs") or []):
                ro = (lg.get("routeOptions") or [{}])
                nm = ro[0].get("name") if ro else None
                if nm and nm not in lines:
                    lines.append(nm)
            out.append({"dt": start, "arr": arr, "duration": jn.get("duration"), "lines": lines})
        out.sort(key=lambda x: x["dt"])
        return out

    async def _async_update_data(self) -> dict:
        self.update_interval = _get_scan_interval()
        try:
            # Leg 2 anchor: PAD → TWY (GWR) — only services that call at Twyford
            pad = self._tfl_departures(
                PAD_GWR,
                filter_fn=lambda d: any(k in (d.get("destination") or "").lower() for k in TWY_KEYWORDS),
            )
            # Leg 1: HMM → PAD via the TfL Journey Planner (real Circle/H&C timetabled trains).
            # For each GWR PAD→TWY departure, find the latest HMM tube that reaches PAD in time.
            trains = []
            for l2 in pad[:NUM_TRAINS]:
                l2_dt = l2["dt"]
                # Leg 2 is the live, anchored GWR PAD→TWY service
                leg2 = [{
                    "time": _hhmm(l2_dt),
                    "destination": l2["destination"] or "Twyford",
                    "status": "On time",
                    "delay_minutes": 0,
                    "platform": None,
                    "operator": "Great Western Railway",
                    "operator_code": "GW",
                    "wait_mins": PADDINGTON_INTERCHANGE_MINS,
                    "transit_mins": TWY_TRANSIT_MINS,
                }]

                # Must reach PAD by (GWR departure − interchange). Search HMM journeys
                # departing in a window before that and pick the latest that arrives in time.
                must_arrive_pad = l2_dt - timedelta(minutes=PADDINGTON_INTERCHANGE_MINS)
                search_from = must_arrive_pad - timedelta(minutes=HMM_PAD_MINS + 20)
                journeys = await self._fetch_journey(
                    NAPTAN_HAMMERSMITH, NAPTAN_PADDINGTON, search_from
                )
                chosen = None
                for jn in journeys:
                    if jn.get("arr") and jn["arr"] <= must_arrive_pad:
                        chosen = jn  # keep latest that still makes it
                    elif jn.get("arr") and jn["arr"] > must_arrive_pad:
                        break
                if chosen is None and journeys:
                    chosen = journeys[0]

                if chosen:
                    line_summary = " + ".join(chosen["lines"]) if chosen["lines"] else "Circle / H&C"
                    hmm_dt = chosen["dt"]
                    total = round((l2_dt - hmm_dt).total_seconds() / 60) + TWY_TRANSIT_MINS
                    trains.append({
                        "time": _hhmm(hmm_dt),
                        "destination": f"Paddington ({line_summary})",
                        "status": "On time",
                        "delay_minutes": 0,
                        "platform": None,
                        "operator": line_summary,
                        "operator_code": "LU",
                        "transit_mins": chosen["duration"] if chosen["duration"] else HMM_PAD_MINS,
                        "total_transit_mins": total,
                        "leg2": leg2,
                    })
                else:
                    hmm_dep = l2_dt - timedelta(minutes=PADDINGTON_INTERCHANGE_MINS + HMM_PAD_MINS)
                    trains.append({
                        "time": _hhmm(hmm_dep),
                        "destination": "Paddington",
                        "status": "On time",
                        "delay_minutes": 0,
                        "platform": None,
                        "operator": "Circle / H&C line",
                        "operator_code": "LU",
                        "transit_mins": HMM_PAD_MINS,
                        "total_transit_mins": round((l2_dt - hmm_dep).total_seconds() / 60) + TWY_TRANSIT_MINS,
                        "leg2": leg2,
                    })

            data = {
                "summary": {
                    "state": trains[0]["time"] if trains else "No service",
                    "leg1_from": "HMM",
                    "leg1_to": "PAD",
                    "leg2_to": "TWY",
                    "paddington_interchange_mins": PADDINGTON_INTERCHANGE_MINS,
                    "farringdon_interchange_mins": PADDINGTON_INTERCHANGE_MINS,
                    "trains": trains,
                    "last_updated": datetime.now().astimezone().isoformat(),
                    "history": self._history,
                },
                "history": self._history,
            }
            for i, t in enumerate(trains, 1):
                data[f"train_{i}"] = {"state": t["time"], **t}
            return data

        except Exception as err:
            raise UpdateFailed(f"Error updating Gail evening commute: {err}") from err
