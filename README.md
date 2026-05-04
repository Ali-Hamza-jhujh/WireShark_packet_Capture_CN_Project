# 🦈 WireShark Packet Capture — CN Final Semester Project

A network traffic monitoring and analysis platform built for the Computer Networks course. Captures live packets using **Scapy**, processes them via a **Flask** backend, and displays everything in a **Wireshark-inspired React frontend**.

> 🔗 **Repository:** [Ali-Hamza-jhujh/WireShark_packet_Capture_CN_Project](https://github.com/Ali-Hamza-jhujh/WireShark_packet_Capture_CN_Project)

---



## ✨ Features

- 🔴 **Live Packet Capture** — Sniffs real network traffic using Scapy on any available interface
- 📂 **CSV Import / Export** — Load pre-recorded packet datasets or save current capture to CSV
- 🔍 **Protocol Filtering** — Filter by TCP, UDP, ICMP, TLS, or QUIC
- 🌐 **IP Filtering** — Filter by Source IP and/or Destination IP
- 🏷️ **Service Mapping** — Maps common port numbers to service names (HTTP, HTTPS, DNS, etc.)
- 📊 **Packet Statistics** — Total packets, per-protocol counts, average packet size
- 🔬 **Hex & Detail View** — Wireshark-style packet inspection with tree view and hex dump
- 📋 **Capture Log** — Real-time log panel with INFO / WARN / ERROR levels
- 🎨 **Wireshark-style UI** — Familiar interface with colorized protocol rows

---

## 📁 Project Structure

```
WireShark_packet_Capture_CN_Project/
│
├── backened/                        # Python Flask Backend
│   ├── app.py                       # Flask REST API (main server)
│   ├── LivePacketCapture.py         # Scapy-based live packet sniffer
│   ├── statistic.py                 # Statistics computation
│   ├── csv_file.py                  # CSV read/write utilities
│   └── uploads/                     # Uploaded CSV files (auto-created)
│
├── wireshark_frontend/              # React Frontend
│   ├── public/
│   ├── src/
│   │   ├── component/
│   │   │   └── wireshark.jsx        # Main Wireshark UI component
│   │   ├── App.js
│   │   ├── App.css
│   │   ├── index.js
│   │   └── index.css
│   ├── package.json
│   └── package-lock.json
│
├── packet_capture.html              # Standalone HTML version
├── .gitignore
└── README.md
```

---

## 🛠 Tech Stack

| Layer     | Technology                      |
|-----------|---------------------------------|
| Frontend  | React, JavaScript (JSX)         |
| Backend   | Python, Flask, Flask-CORS       |
| Sniffing  | Scapy (`AsyncSniffer`)          |
| Styling   | Inline CSS (Wireshark-inspired) |

---

## ⚙️ Setup & Installation

### Prerequisites

- Python 3.8+
- Node.js 18+ and npm
- **Administrator / root privileges** (required for live packet capture)
- **Npcap** (Windows) or **libpcap** (Linux/macOS)

### 1. Clone the Repository

```bash
git clone https://github.com/Ali-Hamza-jhujh/WireShark_packet_Capture_CN_Project.git
cd WireShark_packet_Capture_CN_Project
```

### 2. Install Backend Dependencies

```bash
cd backened
pip install flask flask-cors scapy
```

### 3. Install Frontend Dependencies

```bash
cd wireshark_frontend
npm install
```

---

## ▶️ Running the Project

### Step 1 — Start the Backend

> ⚠️ Must be run as **Administrator** (Windows) or with `sudo` (Linux/macOS) for live capture.

```bash
cd backened
python app.py
```

Flask server starts at: **`http://localhost:5000`**

### Step 2 — Start the Frontend

```bash
cd wireshark_frontend
npm start
```

App opens at: **`http://localhost:3000`**

---

## 🖥️ Usage

| Step | Action |
|------|--------|
| 1 | On launch, the **Welcome Screen** shows all available network interfaces |
| 2 | Click an interface to begin **live capture** |
| 3 | Use `▶` to start, `⏹` to stop, `🔄` to restart capture |
| 4 | Use `📂` or `File → Open CSV` to load a packet dataset |
| 5 | Use `💾` or `File → Save CSV` to export captured packets |
| 6 | Use the **filter bar** (text) or **advanced filter** (Protocol / Src IP / Dst IP) |
| 7 | Click any row to view the **tree-detail pane** and **hex dump** below |

---

## 📊 Dataset / CSV Format

The system accepts CSV files with the following columns:

```
src_ip, dst_ip, protocol, packet_size, info, src_port, dst_port, service
```

**Example row:**

```
192.168.1.5, 8.8.8.8, TCP, 512, 52341 → 80 [ACK], 52341, 80, HTTP
```

### Protocol Color Coding

| Protocol | Row Color    |
|----------|--------------|
| TCP      | Light green  |
| UDP      | Light blue   |
| ICMP     | Light red    |
| TLS      | Light yellow |
| QUIC     | Light purple |
| Other    | Light grey   |

### Port → Service Mapping

| Port | Service |
|------|---------|
| 80   | HTTP    |
| 443  | HTTPS   |
| 53   | DNS     |

---

## 🔌 API Endpoints

| Method | Endpoint           | Description                             |
|--------|--------------------|-----------------------------------------|
| GET    | `/start?iface=...` | Start sniffing on a specified interface |
| GET    | `/stop`            | Stop sniffing                           |
| GET    | `/packets`         | Return all captured packets as JSON     |
| GET    | `/statistics`      | Return packet statistics                |
| GET    | `/interfaces`      | List available network interfaces       |
| POST   | `/upload_CSV`      | Upload a CSV file for analysis          |

---


## 👤 Author

**Ali Hamza**  
Course: Computer Networks — Final Semester Project  
GitHub: [@Ali-Hamza-jhujh](https://github.com/Ali-Hamza-jhujh)

---

## 📄 License

This project was developed for academic purposes as part of a Computer Networks course assignment.
