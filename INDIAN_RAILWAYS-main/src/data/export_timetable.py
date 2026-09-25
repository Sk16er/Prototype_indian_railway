import csv
import json
from pathlib import Path

csv_path = Path(r"c:\Users\Pulkit\Prototype_indian_railway\bandhan_ml\data\sample_timetable_500.csv")
sec_path = Path(r"c:\Users\Pulkit\Prototype_indian_railway\bandhan_ml\data\sample_sections_500.csv")
out_dir = Path(r"c:\Users\Pulkit\Prototype_indian_railway\INDIAN_RAILWAYS-main\src\data")
out_dir.mkdir(parents=True, exist_ok=True)

sections_map = {}
if sec_path.exists():
    with open(sec_path, mode='r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            sections_map[row["section_id"]] = {
                "section_id": row["section_id"],
                "section_name": row["section_name"],
                "from_station": row["from_station_id"],
                "to_station": row["to_station_id"],
                "length_km": float(row["length_km"]),
                "max_speed": int(row["max_speed"]),
                "traffic_class": row["traffic_class"],
                "num_tracks": int(row["num_tracks"]),
            }

train_names = {
    "TRN_1001": "12301 Howrah Rajdhani Express",
    "TRN_1002": "12302 New Delhi - Howrah AC Express",
    "TRN_1003": "12004 Lucknow Shatabdi",
    "TRN_1004": "12951 Mumbai Tejas Rajdhani",
    "TRN_1005": "12260 Sealdah Duronto Express",
    "TRN_1006": "22436 Vande Bharat Express",
    "TRN_1007": "12313 Sealdah Rajdhani",
    "TRN_1008": "13005 Amritsar Mail",
    "TRN_1009": "12381 Poorva Express",
    "TRN_1010": "BOXN-Coal Goods Freight",
    "TRN_1011": "BCN-Cement Freight Rake",
    "TRN_1012": "Container Double Stack",
}

day_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

timetable_entries = []
if csv_path.exists():
    with open(csv_path, mode='r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for idx, row in enumerate(reader):
            tid = row["train_id"]
            sec_id = row["section_id"]
            dow = int(row["day_of_week"])
            hour = int(row["scheduled_hour"])
            mins = int(row["occupancy_duration_mins"])
            
            tname = train_names.get(tid, f"{tid} Scheduled Service")
            sec_info = sections_map.get(sec_id, {"section_name": f"Section {sec_id}", "length_km": 25.0, "max_speed": 110})
            
            start_m = (hour * 60 + (idx * 7) % 60) % 1440
            end_m = start_m + mins
            
            sh = start_m // 60
            sm = start_m % 60
            eh = end_m // 60
            em = end_m % 60
            
            entry = {
                "id": f"TT_{idx+1:04d}",
                "train_id": tid,
                "train_name": tname,
                "train_type": row["train_type"],
                "section_id": sec_id,
                "section_name": sec_info["section_name"],
                "day_of_week": dow,
                "day_name": day_names[dow % 7],
                "scheduled_hour": hour,
                "start_time_str": f"{sh:02d}:{sm:02d}",
                "end_time_str": f"{eh:02d}:{em:02d}",
                "occupancy_duration_mins": mins,
                "speed_kmph": sec_info["max_speed"],
                "track_allocated": "Up Main" if idx % 2 == 0 else "Dn Main",
                "headway_buffer_mins": 15 + (idx % 20),
                "is_freight": "Freight" in row["train_type"] or "Goods" in tname,
            }
            timetable_entries.append(entry)

out_data = {
    "sections": list(sections_map.values()),
    "train_count": len(timetable_entries),
    "entries": timetable_entries
}

with open(out_dir / "timetableData.json", "w", encoding="utf-8") as f:
    json.dump(out_data, f, indent=2)

print("Exported timetableData.json with", len(timetable_entries), "entries and", len(sections_map), "sections.")
