#!/usr/bin/env python3
"""Woof Agent: compress 24 artworks to 1200x1200 JPG q82 + generate 1,111 metadata files.
ID ranges (verified against BRIEF.md + WoofAgentNft.sol):
  Common 1-660 (12 x 55), Rare 661-942 (6 x 47), Epic 943-1047 (3 x 35),
  Legendary 1048-1097 (2 x 25), Mythic 1098-1111 (1 x 14).
"""
import json
import os
from PIL import Image

ROOT = os.path.expanduser("~/workspace/woofcard")
ASSETS = os.path.join(ROOT, "assets")
PUSH_ASSETS = os.path.join(ROOT, "push", "assets")
META = os.path.join(ROOT, "metadata")
BASE_IMG = "https://woof-agent.vercel.app/assets/"

# (card display name, file stem, tier, (start, end), flavor)
CARDS = [
    ("Biscuit", "biscuit", "Common", (1, 55), "A chubby golden retriever puppy with honey-golden fur and a heart of gold."),
    ("Milo", "milo", "Common", (56, 110), "A curious beagle with long floppy ears, always following an interesting scent."),
    ("Rocky", "rocky", "Common", (111, 165), "A stocky bulldog with a red bandana and a grin that never backs down."),
    ("Buddy", "buddy", "Common", (166, 220), "A cheerful chocolate labrador whose smile can brighten any day."),
    ("Max", "max", "Common", (221, 275), "A loyal German Shepherd, noble and watchful, guardian of the pack."),
    ("Charlie", "charlie", "Common", (276, 330), "A cheerful corgi with short legs and a big smile, autumn in dog form."),
    ("Cooper", "cooper", "Common", (331, 385), "A clever Shiba Inu with a fox-like face and a mind of its own."),
    ("Duke", "duke", "Common", (386, 440), "An elegant white poodle, proud, poised, and perfectly groomed."),
    ("Teddy", "teddy", "Common", (441, 495), "A fluffy cream Pomeranian with a pink bow - a living teddy bear."),
    ("Bailey", "bailey", "Common", (496, 550), "A golden cocker spaniel with long wavy ears and gentle amber eyes."),
    ("Lucky", "lucky", "Common", (551, 605), "A playful Dalmatian whose spots hide a four-leaf clover's luck."),
    ("Scout", "scout", "Common", (606, 660), "A Siberian Husky with ice-blue eyes, born to run under northern skies."),
    ("Shadow", "shadow", "Rare", (661, 707), "A sleek black Doberman moving through purple shadow, eyes like amber."),
    ("Luna", "luna", "Rare", (708, 754), "A fluffy white Samoyed smiling under the crescent moon."),
    ("Storm", "storm", "Rare", (755, 801), "A grey Staffy wrapped in storm clouds and lightning."),
    ("Blaze", "blaze", "Rare", (802, 848), "A copper Vizsla burning bright with fire in its eyes."),
    ("Nova", "nova", "Rare", (849, 895), "An Akita wrapped in a cosmic nebula, a star given paws."),
    ("Zeus", "zeus", "Rare", (896, 942), "A Great Dane crowned in golden lightning, king of the storm."),
    ("Phantom", "phantom", "Epic", (943, 977), "A spectral Border Collie drifting through blue mist, eyes glowing."),
    ("Titan", "titan", "Epic", (978, 1012), "A massive Mastiff, bronze and stone, immovable as a mountain."),
    ("Aurora", "aurora", "Epic", (1013, 1047), "A Lapphund dancing under the aurora borealis."),
    ("King Bark", "kingbark", "Legendary", (1048, 1072), "A Cavalier wearing a golden crown - royalty of the pack."),
    ("Moonfang", "moonfang", "Legendary", (1073, 1097), "A wolfdog baring its fangs under the full moon."),
    ("The Alpha", "thealpha", "Mythic", (1098, 1111), "The golden-maned leader of the pack.", "alpha"),
]

TIER_OF = {}
for entry in CARDS:
    name, stem, tier, (s, e), flavor = entry[:5]
    for i in range(s, e + 1):
        TIER_OF[i] = (name, stem, tier, flavor)

assert len(TIER_OF) == 1111, f"range coverage {len(TIER_OF)} != 1111"
# Verify contiguity and per-tier totals
from collections import Counter
counts = Counter(t for (_, _, t, _) in TIER_OF.values())
assert counts == {"Common": 660, "Rare": 282, "Epic": 105, "Legendary": 50, "Mythic": 14}, counts
card_counts = Counter(n for (n, _, _, _) in TIER_OF.values())
assert all(v in (55, 47, 35, 25, 14) for v in card_counts.values()), card_counts
print("ranges verified:", dict(counts))

# --- 1. Compress artwork ---
os.makedirs(PUSH_ASSETS, exist_ok=True)
import glob
for entry in CARDS:
    name, stem, tier, (s, e), flavor = entry[:5]
    src_stem = entry[5] if len(entry) > 5 else stem
    tier_slug = tier.lower()
    srcs = glob.glob(os.path.join(ASSETS, f"media-generation-woof-{tier_slug}-{src_stem.lower()}-0-*.webp"))
    assert len(srcs) == 1, f"{name}: found {len(srcs)} sources"
    im = Image.open(srcs[0]).convert("RGB")
    im = im.resize((1200, 1200), Image.LANCZOS)
    out = os.path.join(PUSH_ASSETS, f"{stem}.jpg")
    im.save(out, "JPEG", quality=82)
    print(f"compressed {stem}.jpg ({os.path.getsize(out)//1024} KB)")

# --- 2. Metadata ---
os.makedirs(META, exist_ok=True)
for i in range(1, 1112):
    name, stem, tier, flavor = TIER_OF[i]
    meta = {
        "name": f"Woof Agent #{i}",
        "description": f"Woof Agent #{i} - {name}, a {tier} card in the Woof Agent collection. {flavor}",
        "image": f"{BASE_IMG}{stem}.jpg",
        "attributes": [
            {"trait_type": "Card", "value": name},
            {"trait_type": "Tier", "value": tier},
        ],
    }
    with open(os.path.join(META, str(i)), "w") as f:
        json.dump(meta, f, indent=2)

# Verify samples
for sample in (1, 55, 56, 660, 661, 942, 943, 1047, 1048, 1097, 1098, 1111):
    m = json.load(open(os.path.join(META, str(sample))))
    print(sample, m["name"], "|", m["attributes"][0]["value"], "|", m["attributes"][1]["value"], "|", m["image"])
print("metadata files:", len(os.listdir(META)))
print("OK")
