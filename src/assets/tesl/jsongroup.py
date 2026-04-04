import json

with open("core_set.json") as f:
    data = json.load(f)

# Filter out entries where deckCodeId is null
filtered = [x for x in data if x.get("deckCodeId") is not None]

# Sort by attributes, then id
sorted_data = sorted(filtered, key=lambda x: (x["attributes"], x["id"]))

# Output flat list of deckCodeId values
result = [item["id"] for item in sorted_data]

with open("output.json", "w") as f:
    json.dump(result, f, indent=2)
