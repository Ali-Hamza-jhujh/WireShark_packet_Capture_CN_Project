import csv
import os

def read_CSV_file(filename):
    packets = []

    if not os.path.exists(filename):
        return packets

    with open(filename, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)

        for row in reader:
            if "packet_size" in row:
                row["packet_size"] = int(row["packet_size"])
            packets.append(row)

    return packets