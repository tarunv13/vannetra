import json

import pytest

from vannetra import lexicon
from vannetra.extract.cases import cluster, summarise
from vannetra.extract.events import extract, find_places, is_enforcement_candidate
from vannetra.privacy import assert_public_safe, find_pii, scrub
from vannetra.schema import Record


def rec(title, **kw):
    return Record(url=f"https://example.org/{abs(hash(title))}", title=title, **kw)


# ------------------------------------------------------------------ lexicon
def test_lexicon_parses_and_has_groups():
    lex = lexicon.load()
    assert len(lex["groups"]) >= 15
    for gid, g in lex["groups"].items():
        assert g["label"] and g["terms"], gid


@pytest.mark.parametrize("text,group", [
    ("Asli kasturi ki kimat", "musk_deer"),
    ("Original Hatha Jodi test", "monitor_lizard"),
    ("दोमुंहा सांप बेचने वाले गिरफ्तार", "sand_boa"),
    ("12 kg pangolin scales seized", "pangolin"),
    ("Polisi sita sisik trenggiling", "pangolin"),
    ("Thu giữ sừng tê giác", "rhino"),
    ("ఎర్రచందనం smuggling", "red_sanders"),
])
def test_multilingual_species_match(text, group):
    assert group in lexicon.species_groups(text)


def test_no_false_species_from_substrings():
    assert lexicon.species_groups("The tigerish mood of the market") == []


# ------------------------------------------------------------------ privacy
@pytest.mark.parametrize("s", ["call 8010363896", "+91 98348 18574", "wa.me/919999999999", "mail x.y@z.com"])
def test_scrub_removes_contacts(s):
    assert not find_pii(scrub(s))


def test_publish_gate_blocks_pii_and_identity_fields():
    with pytest.raises(ValueError):
        assert_public_safe([{"summary": "Seizure · call 9876543210"}])
    with pytest.raises(ValueError):
        assert_public_safe([{"summary": "ok", "channel": "seller"}])
    assert_public_safe([{"summary": "Seizure · Pangolin · 12 kg · Odisha"}])


# --------------------------------------------------------------- extraction
def test_extract_full_event():
    e = extract(rec("DRI seizes 12 kg of pangolin scales worth Rs 1.2 crore at Imphal; two persons arrested. "
                    "The consignment was bound for Myanmar by truck.", country_hint="IN"))
    assert e.species == ["pangolin"]
    assert e.place["name"] == "Imphal" and e.place["admin1"] == "Manipur"
    assert e.route == ["Imphal", "Myanmar"]
    assert {"value": 12.0, "unit": "kg"} in e.quantities
    assert e.value_inr == 1.2e7
    assert e.people_arrested == 2
    assert "DRI" in e.agencies and "road" in e.modes
    assert {"seizure", "arrest"} <= set(e.event_types)


def test_place_longest_match_wins():
    names = [p.name for _, p in find_places("Seized near New Delhi and in West Bengal")]
    assert "Delhi" in names and "West Bengal" in names


def test_candidate_needs_species_and_enforcement():
    assert is_enforcement_candidate("Tiger skin seized in Nagpur")
    assert not is_enforcement_candidate("Tiger census shows rise in Nagpur")
    assert not is_enforcement_candidate("Gold seized at Chennai airport")


# --------------------------------------------------------------- clustering
def test_same_incident_merges_and_summary_has_no_headline_names():
    a = extract(rec("Ramesh Kumar held with 5 kg pangolin scales in Bhubaneswar", published="2026-08-01", outlet="a.in"))
    b = extract(rec("Pangolin scales 5 kg seized in Bhubaneswar, one held", published="2026-08-02", outlet="b.in"))
    c = extract(rec("Tiger skin seized in Nagpur", published="2026-08-01", outlet="c.in"))
    groups = cluster([a, b, c])
    assert sorted(len(g) for g in groups) == [1, 2]
    merged = summarise(next(g for g in groups if len(g) == 2))
    assert merged["n_sources"] == 2
    assert "Ramesh" not in json.dumps(merged["summary"])
    assert merged["place"]["name"] == "Bhubaneswar"


# ------------------------------------------------ real headlines (GDELT, Sep 2026)
@pytest.mark.parametrize("title,place,qty,arrested", [
    ("352 Pangolin Scales Seized in Malkangiri Forest , Six Arrested", "Malkangiri", (352.0, "scales"), 6),
    ("2 Held in Pudukkottai for Poaching Monitor Lizards", "Pudukkottai", None, 2),
    ("3 arrested with 4 monitor lizards in Paonta Sahib", "Pāonta Sāhib", (4.0, "lizards"), 3),
])
def test_real_headlines(title, place, qty, arrested):
    e = extract(rec(title, country_hint="IN"))
    assert e.place and e.place["name"] == place
    if qty:
        assert {"value": qty[0], "unit": qty[1]} in e.quantities
    assert e.people_arrested == arrested


def test_country_level_report_merges_with_district_report():
    a = extract(rec("30 tokay geckos seized in Golaghat, two held", published="2026-09-20", country_hint="IN"))
    b = extract(rec("India: 30 tokay geckos seized, two arrested", published="2026-09-20", country_hint="IN"))
    assert len(cluster([a, b])) == 1
    assert summarise(cluster([a, b])[0])["place"]["name"] == "Golaghat"


def test_developing_story_threads_within_state_but_not_across_states():
    a = extract(rec("Five orangutans rescued in Balasore forest, smuggling suspected", published="2026-09-08"))
    b = extract(rec("Odisha STF probes orangutan smuggling network after Balasore rescue", published="2026-09-16"))
    c = extract(rec("Orangutan seized in Ranchi, Jharkhand", published="2026-09-14"))
    groups = cluster([a, b, c])
    assert sorted(len(g) for g in groups) == [1, 2]


def test_codeword_hits_flag_but_do_not_make_species():
    from vannetra import lexicon
    t = "Selling striped t-shirt, call now"
    assert [h["term"] for h in lexicon.codeword_hits(t)] == ["striped t-shirt"]
    assert lexicon.species_groups(t) == []
