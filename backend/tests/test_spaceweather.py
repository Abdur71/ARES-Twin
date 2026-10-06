"""Space-weather parsing, de-duplication and offline assembly from the bundled cache."""
import asyncio
from datetime import date

import pytest

from app.spaceweather import donki, horizons, noaa
from app.spaceweather.service import mission_spaceweather, radiation_inputs, received_dose

NOAA_HTML = """
<tr><td>2024 05/10 1335</td><td>2024 05/10 1745</td><td>208</td><td>13664</td><td>S17W36</td>
<td>X3.9 05/10 0654</td></tr>
<tr><td>2024 06/08 0255</td><td>2024 06/08 0800</td><td>1,030</td><td>13696</td><td>S17W58</td>
<td>M9.7 06/08 0149</td></tr>
<tr><td>header</td><td>row</td><td>ignored</td></tr>
"""


def sep(t, linked, instrument="GOES-P: SEISS >10 MeV"):
    return {"sepID": f"{t}-SEP", "eventTime": t, "instruments": [{"displayName": instrument}],
            "linkedEvents": [{"activityID": x} for x in linked], "link": "https://example"}


def test_noaa_parse():
    events = noaa.parse(NOAA_HTML)
    assert [e["peak_pfu"] for e in events] == [208, 1030]
    assert events[0]["start"] == "2024-05-10T13:35:00"


def test_donki_chunks_respect_60_day_limit():
    parts = donki.chunks(date(2024, 1, 1), date(2024, 9, 27))
    assert parts[0] == ("2024-01-01", "2024-02-29")
    assert parts[-1][1] == "2024-09-27"
    for s, e in parts:
        assert (date.fromisoformat(e) - date.fromisoformat(s)).days < donki.MAX_RANGE_DAYS


def test_donki_dedup_merges_instrument_duplicates():
    records = [
        sep("2024-05-10T12:59Z", ["F1"], "SOHO: COSTEP"),
        sep("2024-05-10T13:35Z", ["F1"]),
        sep("2024-05-10T14:50Z", ["F1"], "STEREO A: IMPACT"),
        sep("2024-06-08T03:00Z", ["F2"]),
    ]
    groups = donki.group_records(records)
    assert [g["records"] for g in groups] == [3, 1]
    assert len(groups[0]["instruments"]) == 3


def test_merge_unique_across_chunks():
    a = [{"sepID": "x"}, {"sepID": "y"}]
    assert len(donki.merge_unique([a, [{"sepID": "y"}, {"sepID": "z"}]], "sepID")) == 3


def test_flare_ordering():
    assert donki.strongest_flare(["a", "b"], {"a": "M9.7", "b": "X1.1"}) == "X1.1"


def test_horizons_parse_and_trajectory():
    result = "head\n$$SOE\n2460310.5, A.D. 2024-Jan-01, -0.1658, 0.9692, 0.0,\n" \
             "2460311.5, A.D. 2024-Jan-02, -0.1830, 0.9661, 0.0,\n$$EOE\n"
    xy = horizons.parse_vectors(result)
    assert xy[0] == [-0.1658, 0.9692]
    traj = horizons.trajectory(horizons.analytic_earth(date(2024, 1, 1), 270), 270)
    assert traj[0]["r_au"] == pytest.approx(1.0, abs=1e-3)
    assert traj[-1]["r_au"] == pytest.approx(horizons.R_MARS_AU, abs=1e-3)
    assert traj[0]["comm_delay_min"] < 1 < traj[-1]["comm_delay_min"]
    assert all(a["r_au"] <= b["r_au"] for a, b in zip(traj, traj[1:]))


def test_offline_assembly_from_bundled_cache():
    sw = asyncio.run(mission_spaceweather())
    assert sw["offline_mode"] is True
    assert sw["sources"]["noaa_spe_list"]["status"] in {"cache", "stale-cache"}
    noaa_events = [e for e in sw["events"] if e["peak_pfu"]]
    assert len(noaa_events) == 10  # real NOAA events, 2024-01-01 → 2024-09-27
    june = next(e for e in noaa_events if e["date"] == "2024-06-08")
    assert june["s_scale"] == "S3" and june["r_au"] > 1.3
    assert june["dose_at_craft_msv"] < june["dose_1au_msv"]  # 1/r² scaling
    assert sw["raw_counts"]["donki_sep_records"] > len(sw["events"])  # de-duplication happened


def test_radiation_inputs_shelter_override_and_extra_storm():
    sw = asyncio.run(mission_spaceweather())
    base = radiation_inputs(sw)
    target = next(e for e in base.events if e["shelter_default"])
    unsheltered = radiation_inputs(sw, shelter_overrides={target["id"]: False})
    assert unsheltered.spe_msv.sum() > base.spe_msv.sum()
    storm = radiation_inputs(sw, extra_storms=[{"day": 100, "peak_pfu": 20000, "sheltered": False}])
    assert storm.spe_msv[100] > base.spe_msv[100] + 30
    assert sum(received_dose(e) for e in base.events) == pytest.approx(base.spe_msv.sum())
