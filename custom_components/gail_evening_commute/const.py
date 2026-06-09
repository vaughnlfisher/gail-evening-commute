"""Constants for gail_evening_commute."""

DOMAIN = "gail_evening_commute"

DARWIN_TOKEN = "001105bc-e005-48d1-a443-595d23aba5aa"

# CRS codes
LEG1_FROM = "HMM"   # Hammersmith
LEG1_TO   = "PAD"   # Paddington
LEG2_FROM = "PAD"   # Paddington
LEG2_TO   = "TWY"   # Twyford

# Interchange time at Paddington (District/Circle → Elizabeth/GWR)
PADDINGTON_INTERCHANGE_MINS = 8

NUM_TRAINS = 3
MAX_LEG2   = 3

SCAN_INTERVAL_PEAK    = 120
SCAN_INTERVAL_OFFPEAK = 300
SCAN_INTERVAL_NIGHT   = 900

HUXLEY_ROWS = 25

# Westbound termini from Hammersmith towards Paddington (District/Circle)
PADDINGTON_TERMINI = {
    "paddington", "edgware road", "hammersmith",
    "victoria", "westminster", "embankment",
    "tower hill", "aldgate", "upminster",
    "wimbledon", "richmond", "ealing broadway",
}

# Twyford-bound termini from Paddington (GWR + Elizabeth line westbound)
TWYFORD_TERMINI = {
    "twyford", "reading", "didcot", "didcot parkway", "oxford",
    "swindon", "bristol", "bristol temple meads", "cheltenham",
    "newbury", "bedwyn", "great malvern", "worcester",
    "maidenhead", "slough", "henley", "henley-on-thames",
    "cardiff", "cardiff central", "taunton", "exeter", "plymouth",
    "penzance", "westbury", "hereford", "gloucester",
}

# HSP
HSP_URL      = "https://hsp-prod.rockshore.net/api/v1/serviceMetrics"
HSP_USERNAME = "YOUR_NRE_USERNAME"
HSP_PASSWORD = "YOUR_NRE_PASSWORD"

# leg1 (HMM→PAD) is District/Circle (TfL) — proxy from Vaughn's evening leg2
LEG1_HISTORY_PROXY_ENTITY = "sensor.morning_commute_leg_2_historical_reliability"

# leg2 (PAD→TWY) is GWR/Elizabeth — same as Vaughn's evening leg3, use NR HSP directly
HSP_LEGS = [
    {"key": "leg2", "from": "PAD", "to": "TWY", "label": "Paddington → Twyford"},
]
HSP_FROM_TIME = "1600"
HSP_TO_TIME   = "2000"
