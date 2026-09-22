# Labelling codebook: online wildlife-trade listings (R / IR)

The classifier can only be as consistent as its labels. The 2022 WCS-OWT sheets
mix two definitions of **R**: "about the species" and "offers the species for
sale". The model learns both, so `Common Myna Alarm Call` (R) and
`Do Muh Wala Saap price Video` (IR) contradict each other. Use this codebook for
every new or corrected label.

## R: relevant (a trade signal)

Label **R** when the item **offers, advertises, prices, or promotes buying**
a wildlife product or live animal, or teaches buyers how to "test" one. It
counts even when the product is probably fake.

- Price/value talk: *kimat, kimmat, price, crore mein, rate*
- Authenticity tests: *original test, asli pehchan, tester, power test*
- Contact or sale cues: phone number, WhatsApp, "call for", "available", "for sale"
- Ritual or luck-product promotion tied to purchase: *hatha jodi ke fayde + contact*
- Instructions to process an animal for trade: e.g. "how to skin pangolin"

## IR: irrelevant

- Rescue, release, awareness, education, documentary, wildlife photography
- Sounds, pet care without sale, zoo visits
- Same words in unrelated senses: songs, films, names ("Sridhar Kasturi"), recipes
- News about a seizure (that is an **enforcement** item, collected separately)

## When unsure

Leave `new_label` empty and add a note. Unclear items stay out of training.

## Loop

1. `vannetra train` writes `review_queue.csv`, ordered by how confidently the model
   disagrees with the current label.
2. Fill `new_label` with R or IR for the rows you have checked.
3. `vannetra relabel` merges them into `corrections.csv`.
4. `vannetra train` again. Compare `models/relevance_report.json` between runs.

`review_queue.csv` and `corrections.csv` are gitignored because they hold video
titles. Share corrections as `id,label` only.
