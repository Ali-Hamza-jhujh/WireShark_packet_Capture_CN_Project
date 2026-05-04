import { useState, useEffect, useRef, useCallback } from "react";

const API_BASE = "http://localhost:5000";

const FALLBACK_IFACES = [
  { name: "Wi-Fi", icon: "📶", type: "wifi" },
  { name: "Adapter for loopback traffic capture", icon: "🔁", type: "loop" },
  { name: "Local Area Connection* 10", icon: "🔌", type: "eth" },
  { name: "Local Area Connection* 9", icon: "🔌", type: "eth" },
  { name: "Local Area Connection* 8", icon: "🔌", type: "eth" },
  { name: "vEthernet (Default Switch)", icon: "🖧", type: "veth" },
  { name: "Local Area Connection* 2", icon: "🔌", type: "eth" },
];

function protoClass(proto) {
  if (!proto) return "proto-OTHER";
  if (proto.startsWith("TLS")) return "proto-TLS";
  if (["TCP", "UDP", "ICMP", "QUIC"].includes(proto)) return `proto-${proto}`;
  return "proto-OTHER";
}

function buildInfo(p) {
  if (p.protocol === "TCP" && p.src_port && p.dst_port)
    return `${p.src_port} → ${p.dst_port} [ACK] Seq=1 Ack=1 Win=65535 Len=0`;
  if (p.protocol === "UDP" && p.src_port && p.dst_port)
    return `${p.src_port} → ${p.dst_port} Len=${(p.packet_size || 60) - 28}`;
  return `Protocol: ${p.protocol || "OTHER"}`;
}

function parseCSV(text) {
  const lines = text.split("\n");
  const result = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    if (cols.length < 5) continue;
    result.push({
      src_ip: cols[0],
      dst_ip: cols[1],
      protocol: cols[2],
      packet_size: Number(cols[3]),
      info: cols[4],
    });
  }
  return result;
}

// ── IFACEGRAPH CANVAS ────────────────────────────────────────────────────────
function IfaceGraph() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = 120,
      h = 22;
    ctx.clearRect(0, 0, w, h);
    const pts = Array.from({ length: 30 }, () => Math.random() * h * 0.8);
    ctx.beginPath();
    ctx.strokeStyle = "#4a90d9";
    ctx.lineWidth = 1.2;
    pts.forEach((y, i) => {
      const x = (i / (pts.length - 1)) * w;
      i === 0 ? ctx.moveTo(x, h - y) : ctx.lineTo(x, h - y);
    });
    ctx.stroke();
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.fillStyle = "rgba(74,144,217,0.15)";
    ctx.fill();
  }, []);
  return (
    <canvas
      ref={canvasRef}
      width={120}
      height={22}
      style={{ width: "100%", height: 22 }}
    />
  );
}

// ── HEX PANE ─────────────────────────────────────────────────────────────────
function HexPane({ packet }) {
  if (!packet)
    return <div style={{ color: "#aaa", fontSize: 11 }}>No data.</div>;
  const size = packet.packet_size || 80;
  const bytes = [];
  for (let i = 0; i < Math.min(size, 256); i++)
    bytes.push(Math.floor(Math.random() * 256));
  const rows = [];
  for (let i = 0; i < bytes.length; i += 16) {
    const chunk = bytes.slice(i, i + 16);
    const offset = i.toString(16).padStart(4, "0");
    const hexStr = chunk.map((b) => b.toString(16).padStart(2, "0")).join(" ");
    const ascii = chunk
      .map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : "."))
      .join("");
    rows.push(
      <div key={i} style={{ display: "flex", gap: 8, marginBottom: 1 }}>
        <span style={{ color: "#888", minWidth: 36 }}>{offset}</span>
        <span style={{ color: "#003366", flex: 1, letterSpacing: "0.5px" }}>
          {hexStr.padEnd(47, " ")}
        </span>
        <span style={{ color: "#555" }}>{ascii}</span>
      </div>,
    );
  }
  return <>{rows}</>;
}

// ── DETAIL TREE ITEM ─────────────────────────────────────────────────────────
function TreeItem({ label, children, defaultOpen }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div>
      <div
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 2,
          padding: "2px 2px 2px 4px",
          cursor: "pointer",
          borderRadius: 2,
          lineHeight: 1.4,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "#e8f0f8")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "")}
      >
        <span
          style={{
            color: open ? "#4a90d9" : "#888",
            fontSize: 10,
            minWidth: 10,
            marginTop: 1,
          }}
        >
          {open ? "▼" : "▶"}
        </span>
        <span style={{ flex: 1, fontSize: 11.5 }}>{label}</span>
      </div>
      {open && (
        <div style={{ paddingLeft: 8 }}>
          {children.map((c, i) => {
            const [k, ...vs] = c.split(": ");
            return (
              <div
                key={i}
                style={{
                  padding: "1px 2px 1px 8px",
                  fontSize: 11,
                  color: "#333",
                  lineHeight: 1.5,
                }}
              >
                {vs.length ? (
                  <>
                    <span style={{ color: "#555" }}>{k}:</span>{" "}
                    <span style={{ color: "#000080" }}>{vs.join(": ")}</span>
                  </>
                ) : (
                  <span style={{ color: "#555" }}>{k}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── DETAIL PANE ──────────────────────────────────────────────────────────────
function DetailPane({ packet, rowIndex }) {
  if (!packet)
    return (
      <div style={{ color: "#aaa", fontSize: 11, padding: 8 }}>
        Select a packet to see details.
      </div>
    );
  const size = packet.packet_size || 80;
  const sections = [
    {
      label: `Frame ${rowIndex + 1}: Packet, ${size} bytes on wire (${size * 8} bits), ${size} bytes captured (${size * 8} bits)`,
      children: [
        "Encapsulation type: Ethernet (1)",
        `Arrival Time: Apr 24, 2026 20:28:${(30 + (rowIndex % 30)).toString().padStart(2, "0")}.000000000 PKT`,
        `Frame Number: ${rowIndex + 1}`,
        `Frame Length: ${size} bytes (${size * 8} bits)`,
        `Capture Length: ${size} bytes (${size * 8} bits)`,
      ],
    },
    {
      label: "Ethernet II, Src: be:13:87:5a:12:83, Dst: dc:90:09:d0:b8:a8",
      children: [
        "Destination: dc:90:09:d0:b8:a8",
        "Source: be:13:87:5a:12:83",
        "Type: IPv6 (0x86dd)",
      ],
    },
    {
      label: `Internet Protocol Version 6, Src: ${packet.src_ip}, Dst: ${packet.dst_ip}`,
      children: [
        "Version: 6",
        "Traffic Class: 0x00 (DSCP: CS0, ECN: Not-ECT)",
        "Flow Label: 0x00000",
        `Payload Length: ${size - 40}`,
        `Next Header: ${packet.protocol === "TCP" ? "TCP (6)" : packet.protocol === "UDP" ? "UDP (17)" : "ICMPv6 (58)"}`,
        "Hop Limit: 64",
        `Source Address: ${packet.src_ip}`,
        `Destination Address: ${packet.dst_ip}`,
      ],
    },
    packet.src_port
      ? {
          label: `${packet.protocol}, Src Port: ${packet.src_port}, Dst Port: ${packet.dst_port}`,
          children: [
            `Source Port: ${packet.src_port}`,
            `Destination Port: ${packet.dst_port}`,
            packet.protocol === "TCP"
              ? "Sequence Number: 1"
              : `Length: ${size - 40}`,
            packet.protocol === "TCP"
              ? "Acknowledgment Number: 1"
              : "Checksum: 0x0000",
            ...(packet.protocol === "TCP"
              ? ["Flags: 0x010 (ACK)", "Window: 65535"]
              : []),
          ],
        }
      : null,
    {
      label: `Data (${Math.max(0, size - 60)} bytes)`,
      children: [`Data: ${size - 60} bytes`],
    },
  ].filter(Boolean);

  return (
    <>
      {sections.map((sec, i) => (
        <TreeItem
          key={i}
          label={sec.label}
          children={sec.children}
          defaultOpen={i < 2}
        />
      ))}
    </>
  );
}

// ── LOG PANEL ─────────────────────────────────────────────────────────────────
function LogPanel({ logs, onClear }) {
  const [collapsed, setCollapsed] = useState(false);
  const bodyRef = useRef(null);
  const errorCount = logs.filter((l) => l.level === "error").length;

  useEffect(() => {
    if (bodyRef.current)
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [logs]);

  return (
    <div
      style={{
        background: "#1e1e1e",
        borderTop: "2px solid #b0b0b0",
        display: "flex",
        flexDirection: "column",
        maxHeight: collapsed ? 22 : 130,
        minHeight: 22,
        transition: "max-height 0.2s ease",
        flexShrink: 0,
      }}
    >
      <div
        onClick={() => setCollapsed((v) => !v)}
        style={{
          background: "#2d2d2d",
          borderBottom: "1px solid #444",
          padding: "2px 8px",
          display: "flex",
          alignItems: "center",
          gap: 6,
          cursor: "pointer",
          flexShrink: 0,
          height: 22,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "#ccc",
            display: "flex",
            alignItems: "center",
            gap: 5,
            flex: 1,
          }}
        >
          <span>📋</span>
          <span>Capture Log</span>
          {errorCount > 0 && (
            <span
              style={{
                background: "#cc4444",
                color: "white",
                borderRadius: 8,
                fontSize: 9,
                padding: "0 4px",
                minWidth: 16,
                textAlign: "center",
              }}
            >
              {errorCount}
            </span>
          )}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClear();
          }}
          style={{
            fontSize: 10,
            color: "#888",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "1px 5px",
            borderRadius: 2,
          }}
        >
          Clear
        </button>
        <span style={{ fontSize: 9, color: "#888" }}>
          {collapsed ? "▼" : "▲"}
        </span>
      </div>
      {!collapsed && (
        <div
          ref={bodyRef}
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "2px 0",
            fontFamily: "'Courier New', monospace",
            fontSize: 11,
          }}
        >
          {logs.map((l, i) => (
            <div
              key={i}
              style={{
                padding: "1px 8px",
                display: "flex",
                gap: 10,
                lineHeight: 1.5,
                borderBottom: "1px solid #2a2a2a",
              }}
            >
              <span style={{ color: "#6a9955", whiteSpace: "nowrap" }}>
                {l.ts}
              </span>
              <span
                style={{
                  whiteSpace: "nowrap",
                  fontWeight: 600,
                  minWidth: 40,
                  color:
                    l.level === "info"
                      ? "#4ec9b0"
                      : l.level === "warn"
                        ? "#ce9178"
                        : "#f44747",
                }}
              >
                {l.level.toUpperCase()}
              </span>
              <span style={{ color: "#d4d4d4" }}>{l.msg}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── STATISTICS PANEL ──────────────────────────────────────────────────────────
function StatCard({ val, label, color }) {
  return (
    <div
      style={{
        background: "white",
        border: "1px solid #d0d0d0",
        borderRadius: 3,
        padding: "4px 10px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        minWidth: 80,
        flexShrink: 0,
        borderTop: `3px solid ${color}`,
      }}
    >
      <span
        style={{
          fontSize: 16,
          fontWeight: 700,
          color: "#1a1a1a",
          fontFamily: "'Courier New', monospace",
          lineHeight: 1.2,
        }}
      >
        {val}
      </span>
      <span
        style={{
          fontSize: 10,
          color: "#666",
          whiteSpace: "nowrap",
          marginTop: 1,
        }}
      >
        {label}
      </span>
    </div>
  );
}

function StatsPanel({ packets, filteredPackets }) {
  let tcp = 0,
    udp = 0,
    icmp = 0,
    other = 0,
    totalSize = 0;
  packets.forEach((p) => {
    const proto = (p.protocol || "OTHER").toUpperCase();
    totalSize += parseInt(p.packet_size || 0);
    if (proto === "TCP") tcp++;
    else if (proto === "UDP") udp++;
    else if (proto === "ICMP") icmp++;
    else other++;
  });
  const avg = packets.length > 0 ? Math.round(totalSize / packets.length) : 0;
  return (
    <div
      style={{
        background: "#f9f9f9",
        borderTop: "2px solid #b0b0b0",
        borderBottom: "1px solid #d0d0d0",
        padding: "5px 10px",
        display: "flex",
        alignItems: "center",
        gap: 0,
        flexShrink: 0,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "#333",
          whiteSpace: "nowrap",
          marginRight: 10,
        }}
      >
        📊 Statistics
      </div>
      <div
        style={{
          display: "flex",
          gap: 6,
          flexWrap: "nowrap",
          overflowX: "auto",
          flex: 1,
        }}
      >
        <StatCard val={packets.length} label="Total Packets" color="#888" />
        <StatCard val={tcp} label="TCP" color="#44aa44" />
        <StatCard val={udp} label="UDP" color="#4a90d9" />
        <StatCard val={icmp} label="ICMP" color="#cc4444" />
        <StatCard val={avg} label="Avg Size (B)" color="#aa7700" />
        <StatCard val={other} label="Other" color="#888" />
        <StatCard
          val={filteredPackets.length}
          label="Displayed"
          color="#55aa99"
        />
      </div>
    </div>
  );
}

// ── WELCOME OVERLAY ───────────────────────────────────────────────────────────
function WelcomeOverlay({ onClose, onStartCapture }) {
  const [ifaces, setIfaces] = useState(FALLBACK_IFACES);
  const [selectedIface, setSelectedIface] = useState(null);

  useEffect(() => {
    fetch(`${API_BASE}/interfaces`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setIfaces(
            data.map((n) => ({
              name: n,
              icon: n.toLowerCase().includes("wi")
                ? "📶"
                : n.toLowerCase().includes("loop")
                  ? "🔁"
                  : "🔌",
              type: "eth",
            })),
          );
        }
      })
      .catch(() => {});
  }, []);

  const handleIfaceClick = (iface) => {
    setSelectedIface(iface.name);
    setTimeout(() => {
      onClose();
      onStartCapture(iface.name);
    }, 150);
  };

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(240,240,240,0.97)",
        zIndex: 100,
        display: "flex",
        flexDirection: "column",
        overflow: "auto",
      }}
    >
      <div
        style={{
          background: "linear-gradient(135deg, #1a5fa8 0%, #2980d4 100%)",
          padding: "16px 24px",
          color: "white",
          fontSize: 20,
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <span style={{ fontSize: 28 }}>🦈</span>
        <div>
          <div>Welcome to Wireshark</div>
          <div style={{ fontSize: 13, fontWeight: 400, opacity: 0.85 }}>
            Network Protocol Analyzer
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 0, flex: 1 }}>
        <div style={{ flex: 1, padding: "16px 20px" }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "#333",
              borderBottom: "1px solid #d0d0d0",
              paddingBottom: 4,
              marginBottom: 8,
            }}
          >
            Open
          </div>
          <ul style={{ listStyle: "none" }}>
            {[
              {
                text: "C:\\Users\\User\\Desktop\\icmp-ethereal-trace-2 (not found)",
                notFound: true,
              },
              {
                text: "C:\\Users\\User\\Desktop\\icmp-ethereal-trace-1 (not found)",
                notFound: true,
              },
              {
                text: "C:\\Users\\User\\Downloads\\wireshark-traces\\NAT_ISP_side.pcap (84 KB)",
              },
              {
                text: "C:\\Users\\User\\Downloads\\wireshark-traces\\NAT_home_side.pcap (78 KB)",
              },
              {
                text: "C:\\Users\\User\\Downloads\\wireshark-traces\\ip-ethereal-trace-1 (261 KB)",
              },
              {
                text: "C:\\Users\\User\\Downloads\\wireshark-traces\\icmp-ethereal-trace-2 (11 KB)",
              },
              {
                text: "C:\\Users\\User\\Downloads\\wireshark-traces\\tcp-ethereal-trace-1 (177 KB)",
              },
              {
                text: "C:\\Users\\User\\Desktop\\al.pcapng (not found)",
                notFound: true,
              },
            ].map((f, i) => (
              <li
                key={i}
                style={{
                  padding: "3px 0",
                  color: f.notFound ? "#888" : "#4a90d9",
                  cursor: "pointer",
                  fontSize: 12,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                📄 {f.text}
              </li>
            ))}
          </ul>
          <div style={{ marginTop: 20 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "#333",
                borderBottom: "1px solid #d0d0d0",
                paddingBottom: 4,
                marginBottom: 8,
              }}
            >
              Learn
            </div>
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
              {[
                "User's Guide",
                "Wiki",
                "Questions and Answers",
                "Mailing Lists",
                "SharkFest",
                "Wireshark Discord",
                "Donate",
              ].map((l) => (
                <span
                  key={l}
                  style={{ color: "#4a90d9", cursor: "pointer", fontSize: 12 }}
                >
                  {l}
                </span>
              ))}
            </div>
            <div style={{ fontSize: 11, color: "#666", marginTop: 8 }}>
              You are running Wireshark 4.6.0 (v4.6.0-0-gcdfb6721e77c). You
              receive automatic updates.
            </div>
          </div>
        </div>
        <div
          style={{
            width: 340,
            padding: "16px 20px",
            borderLeft: "1px solid #d0d0d0",
            background: "#fafafa",
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "#333",
              borderBottom: "1px solid #d0d0d0",
              paddingBottom: 4,
              marginBottom: 8,
            }}
          >
            Capture
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginBottom: 12,
            }}
          >
            <label
              style={{ fontSize: 11, color: "#555", whiteSpace: "nowrap" }}
            >
              …using this filter:
            </label>
            <input
              type="text"
              placeholder="Enter a capture filter …"
              style={{
                flex: 1,
                height: 22,
                border: "1px solid #b0b0b0",
                borderRadius: 2,
                padding: "2px 6px",
                fontSize: 12,
                outline: "none",
              }}
            />
          </div>
          <div style={{ fontSize: 11, color: "#555", marginBottom: 6 }}>
            Select interface to start capturing:
          </div>
          <ul style={{ listStyle: "none" }}>
            {ifaces.map((iface) => (
              <li
                key={iface.name}
                onClick={() => handleIfaceClick(iface)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "5px 8px",
                  cursor: "pointer",
                  borderRadius: 3,
                  border:
                    selectedIface === iface.name
                      ? "1px solid #4a90d9"
                      : "1px solid transparent",
                  background:
                    selectedIface === iface.name ? "#c3d7f0" : "white",
                  marginBottom: 3,
                  gap: 8,
                }}
              >
                <span style={{ fontSize: 16 }}>{iface.icon}</span>
                <span style={{ fontWeight: 600, fontSize: 12, flex: 1 }}>
                  {iface.name}
                </span>
                <div style={{ flex: 2, height: 22 }}>
                  <IfaceGraph />
                </div>
              </li>
            ))}
          </ul>
          <div style={{ marginTop: 12, textAlign: "right" }}>
            <button
              onClick={onClose}
              style={{
                padding: "4px 14px",
                background: "#e0e0e0",
                border: "1px solid #aaa",
                borderRadius: 3,
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── MAIN APP ──────────────────────────────────────────────────────────────────
export default function WiresharkAnalyzer() {
  const [packets, setPackets] = useState([]);
  const [filteredPackets, setFilteredPackets] = useState([]);
  const [selectedRow, setSelectedRow] = useState(-1);
  const [capturing, setCapturing] = useState(false);
  const [colorize, setColorize] = useState(true);
  const [selectedIface, setSelectedIface] = useState(null);
  const [showWelcome, setShowWelcome] = useState(true);
  const [statusState, setStatusState] = useState("stopped");
  const [statusText, setStatusText] = useState("Ready to load or capture");
  const [titleText, setTitleText] = useState("The Wireshark Network Analyzer");
  const [logs, setLogs] = useState([]);
  const [filterText, setFilterText] = useState("");
  const [filterProto, setFilterProto] = useState("");
  const [filterSrcIP, setFilterSrcIP] = useState("");
  const [filterDstIP, setFilterDstIP] = useState("");
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const pollRef = useRef(null);
  const csvInputRef = useRef(null);
  const tableWrapRef = useRef(null);
  const packetsRef = useRef(packets);
  packetsRef.current = packets;

  const addLog = useCallback((level, msg) => {
    const now = new Date();
    const ts =
      now.toTimeString().slice(0, 8) +
      "." +
      String(now.getMilliseconds()).padStart(3, "0");
    setLogs((prev) => [...prev, { level, msg, ts }]);
  }, []);

  const clearLog = useCallback(() => {
    setLogs([
      {
        level: "info",
        msg: "Log cleared.",
        ts: new Date().toTimeString().slice(0, 8) + ".000",
      },
    ]);
  }, []);

  const applyFilter = useCallback((pkts, text, proto, src, dst) => {
    const q = (text || "").toLowerCase().trim();
    const p = (proto || "").toLowerCase();
    const s = (src || "").toLowerCase().trim();
    const d = (dst || "").toLowerCase().trim();
    return pkts.filter((pk) => {
      const matchQ =
        !q ||
        (pk.protocol || "").toLowerCase().includes(q) ||
        (pk.src_ip || "").toLowerCase().includes(q) ||
        (pk.dst_ip || "").toLowerCase().includes(q) ||
        (pk.service || "").toLowerCase().includes(q);
      const matchProto = !p || (pk.protocol || "").toLowerCase() === p;
      const matchSrc = !s || (pk.src_ip || "").toLowerCase().includes(s);
      const matchDst = !d || (pk.dst_ip || "").toLowerCase().includes(d);
      return matchQ && matchProto && matchSrc && matchDst;
    });
  }, []);

  useEffect(() => {
    const filtered = applyFilter(
      packets,
      filterText,
      filterProto,
      filterSrcIP,
      filterDstIP,
    );
    setFilteredPackets(filtered);
  }, [packets, filterText, filterProto, filterSrcIP, filterDstIP, applyFilter]);

  const fetchPackets = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/packets`);
      if (!r.ok) return;
      const data = await r.json();
      if (data.length !== packetsRef.current.length) setPackets(data);
    } catch {
      addLog("error", "Backend unreachable — no live data.");
    }
  }, [addLog]);

  const startCaptureOnIface = useCallback(
    async (iface) => {
      setCapturing(true);
      setPackets([]);
      setFilteredPackets([]);
      setSelectedRow(-1);
      setStatusState("capturing");
      setStatusText(`Capturing on ${iface} …`);
      setTitleText(`Capturing from ${iface}`);
      addLog("info", `Capture started on interface: ${iface}`);
      try {
        await fetch(`${API_BASE}/start?iface=${encodeURIComponent(iface)}`);
      } catch {}
      pollRef.current = setInterval(fetchPackets, 800);
    },
    [addLog, fetchPackets],
  );

  const stopCapture = useCallback(async () => {
    if (!capturing) return;
    clearInterval(pollRef.current);
    setCapturing(false);
    setStatusState("stopped");
    setStatusText("Capture stopped.");
    setTitleText("The Wireshark Network Analyzer");
    addLog(
      "info",
      `Capture stopped. Total packets: ${packetsRef.current.length}`,
    );
    try {
      await fetch(`${API_BASE}/stop`);
    } catch {}
  }, [capturing, addLog]);

  const restartCapture = useCallback(() => {
    stopCapture();
    setTimeout(() => {
      if (selectedIface) startCaptureOnIface(selectedIface);
    }, 300);
  }, [stopCapture, selectedIface, startCaptureOnIface]);

  const startCapture = useCallback(() => {
    if (capturing) return;
    if (!selectedIface) {
      setShowWelcome(true);
      return;
    }
    startCaptureOnIface(selectedIface);
  }, [capturing, selectedIface, startCaptureOnIface]);

  const handleStartCapture = useCallback(
    (iface) => {
      setSelectedIface(iface);
      startCaptureOnIface(iface);
    },
    [startCaptureOnIface],
  );

  const saveCSV = useCallback(() => {
    if (filteredPackets.length === 0) {
      addLog("warn", "No packets to save.");
      alert("No packets to save.");
      return;
    }
    const rows = [
      "src_ip,dst_ip,protocol,packet_size,info,src_port,dst_port,service",
    ];
    filteredPackets.forEach((p) => {
      const info = (p.info || buildInfo(p)).replace(/,/g, ";");
      rows.push(
        [
          p.src_ip || "",
          p.dst_ip || "",
          p.protocol || "OTHER",
          p.packet_size || 0,
          info,
          p.src_port || "",
          p.dst_port || "",
          p.service || "",
        ].join(","),
      );
    });
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    a.download = `capture_${ts}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    addLog("info", `Saved ${filteredPackets.length} packets → ${a.download}`);
  }, [filteredPackets, addLog]);

  const handleCSVFile = useCallback(
    (e) => {
      const file = e.target.files[0];
      if (!file) {
        alert("No file selected");
        return;
      }
      stopCapture();
      setStatusState("stopped");
      setStatusText("Loading CSV file...");
      const reader = new FileReader();
      reader.onload = (ev) => {
        const pkts = parseCSV(ev.target.result);
        setPackets(pkts);
        setSelectedRow(-1);
        setStatusText(`CSV Loaded Successfully (${pkts.length} packets)`);
        addLog(
          "info",
          `CSV file loaded: "${file.name}" — ${pkts.length} packets imported.`,
        );
      };
      reader.readAsText(file);
      e.target.value = "";
    },
    [stopCapture, addLog],
  );

  const applyAdvFilter = useCallback(() => {
    const parts = [];
    if (filterProto) parts.push(`protocol=${filterProto}`);
    if (filterSrcIP) parts.push(`src=${filterSrcIP}`);
    if (filterDstIP) parts.push(`dst=${filterDstIP}`);
    if (parts.length) {
      const cnt = applyFilter(
        packets,
        filterText,
        filterProto,
        filterSrcIP,
        filterDstIP,
      ).length;
      addLog(
        "info",
        `Filter applied [${parts.join(", ")}] → ${cnt} packets displayed.`,
      );
    }
  }, [
    filterProto,
    filterSrcIP,
    filterDstIP,
    packets,
    filterText,
    applyFilter,
    addLog,
  ]);

  const resetAdvFilter = useCallback(() => {
    setFilterProto("");
    setFilterSrcIP("");
    setFilterDstIP("");
    addLog("info", "Filters reset — showing all packets.");
  }, [addLog]);

  useEffect(() => {
    addLog(
      "info",
      "Wireshark Network Analyzer started. Ready to capture or load file.",
    );
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (e.ctrlKey && e.key === "/") {
        e.preventDefault();
        document.getElementById("filterInput")?.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Auto scroll
  useEffect(() => {
    if (capturing && tableWrapRef.current) {
      const el = tableWrapRef.current;
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 20) {
        el.scrollTop = el.scrollHeight;
      }
    }
  }, [filteredPackets, capturing]);

  const packetCount =
    filteredPackets.length > 0
      ? `Packets: ${packets.length}  Displayed: ${filteredPackets.length}  Marked: 0  Dropped: 0`
      : "No Packets";

  const protoColors = {
    "proto-TCP": "#d9f0d9",
    "proto-UDP": "#d9ecff",
    "proto-TLS": "#fff8cc",
    "proto-ICMP": "#ffdede",
    "proto-QUIC": "#eedeff",
    "proto-OTHER": "#f5f5f5",
  };

  return (
    <div
      style={{
        fontFamily: "'Segoe UI', Tahoma, sans-serif",
        fontSize: 12,
        background: "#f0f0f0",
        color: "#1a1a1a",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        userSelect: "none",
        position: "relative",
      }}
    >
      {/* TITLE BAR */}
      <div
        style={{
          background: "linear-gradient(to bottom, #e8e8e8, #d8d8d8)",
          borderBottom: "1px solid #b0b0b0",
          padding: "4px 8px",
          fontSize: 12,
          fontWeight: 600,
          color: "#222",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span>🦈</span>
        <span style={{ flex: 1 }}>{titleText}</span>
        <div style={{ display: "flex", gap: 0 }}>
          {["─", "□", "✕"].map((btn, i) => (
            <button
              key={i}
              style={{
                width: 30,
                height: 20,
                border: "none",
                background: "transparent",
                fontSize: 11,
                cursor: "pointer",
                color: "#333",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {btn}
            </button>
          ))}
        </div>
      </div>

      {/* MENU BAR */}
      <div
        style={{
          background: "#f5f5f5",
          borderBottom: "1px solid #d0d0d0",
          display: "flex",
          padding: "0 4px",
        }}
      >
        <div
          style={{ position: "relative" }}
          onMouseEnter={() => setFileMenuOpen(true)}
          onMouseLeave={() => setFileMenuOpen(false)}
        >
          <div
            style={{
              padding: "3px 8px",
              cursor: "pointer",
              borderRadius: 2,
              fontSize: 12,
              background: fileMenuOpen ? "#4a90d9" : "transparent",
              color: fileMenuOpen ? "white" : "#1a1a1a",
            }}
          >
            File
          </div>
          {fileMenuOpen && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                background: "white",
                border: "1px solid #b0b0b0",
                minWidth: 140,
                color: "#000",
                boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
                zIndex: 999,
              }}
            >
              <div
                onClick={() => {
                  csvInputRef.current?.click();
                  setFileMenuOpen(false);
                }}
                style={{ padding: "6px 10px", cursor: "pointer" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#4a90d9";
                  e.currentTarget.style.color = "white";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "";
                  e.currentTarget.style.color = "";
                }}
              >
                Open CSV
              </div>
              <div
                onClick={() => {
                  saveCSV();
                  setFileMenuOpen(false);
                }}
                style={{ padding: "6px 10px", cursor: "pointer" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#4a90d9";
                  e.currentTarget.style.color = "white";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "";
                  e.currentTarget.style.color = "";
                }}
              >
                Save CSV
              </div>
            </div>
          )}
        </div>
        <input
          ref={csvInputRef}
          type="file"
          accept=".csv"
          style={{ display: "none" }}
          onChange={handleCSVFile}
        />
        {[
          "Edit",
          "View",
          "Go",
          "Capture",
          "Analyze",
          "Statistics",
          "Telephony",
          "Wireless",
          "Tools",
          "Help",
        ].map((m) => (
          <div
            key={m}
            style={{
              padding: "3px 8px",
              cursor: "pointer",
              borderRadius: 2,
              fontSize: 12,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#4a90d9";
              e.currentTarget.style.color = "white";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "";
              e.currentTarget.style.color = "";
            }}
          >
            {m}
          </div>
        ))}
      </div>

      {/* TOOLBAR */}
      <div
        style={{
          background: "#e8e8e8",
          borderBottom: "1px solid #b0b0b0",
          padding: "3px 4px",
          display: "flex",
          alignItems: "center",
          gap: 2,
        }}
      >
        {[
          {
            icon: "▶",
            title: "Start capturing packets",
            onClick: startCapture,
            disabled: capturing,
            active: !capturing,
          },
          {
            icon: "⏹",
            title: "Stop capturing",
            onClick: stopCapture,
            disabled: !capturing,
          },
          { icon: "🔄", title: "Restart", onClick: restartCapture },
        ].map((btn, i) => (
          <button
            key={i}
            title={btn.title}
            onClick={btn.onClick}
            disabled={btn.disabled}
            style={{
              width: 28,
              height: 26,
              border: "1px solid transparent",
              background: "transparent",
              cursor: btn.disabled ? "default" : "pointer",
              borderRadius: 3,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14,
              color: btn.active ? "#cc0000" : "#333",
              opacity: btn.disabled ? 0.35 : 1,
            }}
          >
            {btn.icon}
          </button>
        ))}
        <div
          style={{
            width: 1,
            height: 22,
            background: "#b0b0b0",
            margin: "0 3px",
          }}
        />
        <button
          title="Open"
          onClick={() => csvInputRef.current?.click()}
          style={{
            width: 28,
            height: 26,
            border: "1px solid transparent",
            background: "transparent",
            cursor: "pointer",
            borderRadius: 3,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
            color: "#333",
          }}
        >
          📂
        </button>
        <button
          title="Save as CSV"
          onClick={saveCSV}
          style={{
            width: 28,
            height: 26,
            border: "1px solid transparent",
            background: "transparent",
            cursor: "pointer",
            borderRadius: 3,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
            color: "#333",
          }}
        >
          💾
        </button>
        <button
          title="Close"
          style={{
            width: 28,
            height: 26,
            border: "1px solid transparent",
            background: "transparent",
            cursor: "pointer",
            borderRadius: 3,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
            color: "#333",
          }}
        >
          ✕
        </button>
        <div
          style={{
            width: 1,
            height: 22,
            background: "#b0b0b0",
            margin: "0 3px",
          }}
        />
        {["🔍", "◀", "▶", "⏮", "⏭"].map((icon, i) => (
          <button
            key={i}
            style={{
              width: 28,
              height: 26,
              border: "1px solid transparent",
              background: "transparent",
              cursor: "pointer",
              borderRadius: 3,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14,
              color: "#333",
            }}
          >
            {icon}
          </button>
        ))}
        <div
          style={{
            width: 1,
            height: 22,
            background: "#b0b0b0",
            margin: "0 3px",
          }}
        />
        <button
          title="Colorize"
          onClick={() => setColorize((v) => !v)}
          style={{
            width: 28,
            height: 26,
            border: "1px solid transparent",
            background: "transparent",
            cursor: "pointer",
            borderRadius: 3,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
            color: "#333",
          }}
        >
          🎨
        </button>
        {["🔎", "🔍", "⊡", "⇔"].map((icon, i) => (
          <button
            key={i}
            style={{
              width: 28,
              height: 26,
              border: "1px solid transparent",
              background: "transparent",
              cursor: "pointer",
              borderRadius: 3,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14,
              color: "#333",
            }}
          >
            {icon}
          </button>
        ))}
      </div>

      {/* DISPLAY FILTER BAR */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "3px 4px",
          background: "#e8e8e8",
          borderBottom: "1px solid #b0b0b0",
          gap: 4,
        }}
      >
        <span style={{ color: "#555", fontSize: 11, whiteSpace: "nowrap" }}>
          Apply a display filter … &lt;Ctrl-/&gt;
        </span>
        <input
          id="filterInput"
          type="text"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          style={{
            flex: 1,
            height: 22,
            border: "1px solid #b0b0b0",
            borderRadius: 2,
            padding: "2px 6px",
            fontSize: 12,
            background: "white",
            color: "#1a1a1a",
            outline: "none",
          }}
        />
        <button
          style={{
            height: 22,
            padding: "0 10px",
            background: "linear-gradient(to bottom, #f0f0f0, #dcdcdc)",
            border: "1px solid #b0b0b0",
            borderRadius: 2,
            cursor: "pointer",
            fontSize: 11,
            color: "#333",
          }}
        >
          →
        </button>
      </div>

      {/* ADVANCED FILTER BAR */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "3px 6px",
          background: "#efefef",
          borderBottom: "2px solid #b0b0b0",
          gap: 6,
          flexWrap: "wrap",
        }}
      >
        <label
          style={{
            fontSize: 11,
            color: "#444",
            whiteSpace: "nowrap",
            fontWeight: 600,
          }}
        >
          Protocol:
        </label>
        <select
          value={filterProto}
          onChange={(e) => setFilterProto(e.target.value)}
          style={{
            height: 21,
            border: "1px solid #b0b0b0",
            borderRadius: 2,
            padding: "1px 5px",
            fontSize: 11,
            background: "white",
            minWidth: 80,
            outline: "none",
          }}
        >
          <option value="">All</option>
          <option value="TCP">TCP</option>
          <option value="UDP">UDP</option>
          <option value="ICMP">ICMP</option>
          <option value="TLS">TLS</option>
          <option value="QUIC">QUIC</option>
        </select>
        <div
          style={{
            width: 1,
            height: 18,
            background: "#b0b0b0",
            margin: "0 2px",
          }}
        />
        <label
          style={{
            fontSize: 11,
            color: "#444",
            whiteSpace: "nowrap",
            fontWeight: 600,
          }}
        >
          Src IP:
        </label>
        <input
          type="text"
          placeholder="e.g. 192.168.1.5"
          value={filterSrcIP}
          onChange={(e) => setFilterSrcIP(e.target.value)}
          style={{
            height: 21,
            border: "1px solid #b0b0b0",
            borderRadius: 2,
            padding: "1px 5px",
            fontSize: 11,
            background: "white",
            width: 130,
            outline: "none",
          }}
        />
        <div
          style={{
            width: 1,
            height: 18,
            background: "#b0b0b0",
            margin: "0 2px",
          }}
        />
        <label
          style={{
            fontSize: 11,
            color: "#444",
            whiteSpace: "nowrap",
            fontWeight: 600,
          }}
        >
          Dst IP:
        </label>
        <input
          type="text"
          placeholder="e.g. 8.8.8.8"
          value={filterDstIP}
          onChange={(e) => setFilterDstIP(e.target.value)}
          style={{
            height: 21,
            border: "1px solid #b0b0b0",
            borderRadius: 2,
            padding: "1px 5px",
            fontSize: 11,
            background: "white",
            width: 130,
            outline: "none",
          }}
        />
        <div
          style={{
            width: 1,
            height: 18,
            background: "#b0b0b0",
            margin: "0 2px",
          }}
        />
        <button
          onClick={applyAdvFilter}
          style={{
            height: 21,
            padding: "0 9px",
            background: "linear-gradient(to bottom, #f0f0f0, #dcdcdc)",
            border: "1px solid #b0b0b0",
            borderRadius: 2,
            cursor: "pointer",
            fontSize: 11,
            color: "#333",
          }}
        >
          Filter
        </button>
        <button
          onClick={resetAdvFilter}
          style={{
            height: 21,
            padding: "0 9px",
            background: "linear-gradient(to bottom, #fff0f0, #f8d8d8)",
            border: "1px solid #c88",
            borderRadius: 2,
            cursor: "pointer",
            fontSize: 11,
            color: "#800",
          }}
        >
          Reset
        </button>
      </div>

      {/* MAIN AREA */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* PACKET TABLE */}
        <div
          ref={tableWrapRef}
          style={{
            flex: 3,
            overflow: "auto",
            borderBottom: "3px solid #b0b0b0",
            background: "white",
          }}
        >
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 12,
              fontFamily: "'Segoe UI', Tahoma, sans-serif",
              tableLayout: "fixed",
            }}
          >
            <colgroup>
              <col style={{ width: 55 }} />
              <col style={{ width: 110 }} />
              <col style={{ width: 200 }} />
              <col style={{ width: 200 }} />
              <col style={{ width: 80 }} />
              <col style={{ width: 65 }} />
              <col />
            </colgroup>
            <thead>
              <tr>
                {[
                  "No.▾",
                  "Time",
                  "Source",
                  "Destination",
                  "Protocol",
                  "Length",
                  "Info",
                ].map((h) => (
                  <th
                    key={h}
                    style={{
                      background: "#e0e0e0",
                      borderRight: "1px solid #b0b0b0",
                      borderBottom: "2px solid #b0b0b0",
                      padding: "3px 6px",
                      textAlign: "left",
                      fontWeight: 600,
                      fontSize: 11,
                      whiteSpace: "nowrap",
                      position: "sticky",
                      top: 0,
                      cursor: "col-resize",
                      zIndex: 10,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredPackets.map((p, i) => {
                const cls = colorize ? protoClass(p.protocol) : "";
                const info = p.info || buildInfo(p);
                const bg = colorize
                  ? protoColors[cls] || "#f5f5f5"
                  : i % 2 === 0
                    ? "#ffffff"
                    : "#f7f7f7";
                return (
                  <tr
                    key={i}
                    onClick={() => setSelectedRow(i)}
                    style={{
                      borderBottom: "1px solid #e8e8e8",
                      cursor: "pointer",
                      background: selectedRow === i ? "#c3d7f0" : bg,
                    }}
                  >
                    <td
                      style={{
                        padding: "2px 6px",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        borderRight: "1px solid #e8e8e8",
                      }}
                    >
                      {i + 1}
                    </td>
                    <td
                      style={{
                        padding: "2px 6px",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        borderRight: "1px solid #e8e8e8",
                      }}
                    >
                      {(i * 0.037 + Math.random() * 0.005).toFixed(9)}
                    </td>
                    <td
                      title={p.src_ip}
                      style={{
                        padding: "2px 6px",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        borderRight: "1px solid #e8e8e8",
                      }}
                    >
                      {p.src_ip}
                    </td>
                    <td
                      title={p.dst_ip}
                      style={{
                        padding: "2px 6px",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        borderRight: "1px solid #e8e8e8",
                      }}
                    >
                      {p.dst_ip}
                    </td>
                    <td
                      style={{
                        padding: "2px 6px",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        borderRight: "1px solid #e8e8e8",
                      }}
                    >
                      {p.protocol || "OTHER"}
                    </td>
                    <td
                      style={{
                        padding: "2px 6px",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        borderRight: "1px solid #e8e8e8",
                      }}
                    >
                      {p.packet_size || 0}
                    </td>
                    <td
                      title={info}
                      style={{
                        padding: "2px 6px",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {info}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* LOWER PANES */}
        <div
          style={{
            flex: 2,
            display: "flex",
            minHeight: 0,
            borderTop: "2px solid #b0b0b0",
          }}
        >
          <div
            style={{
              flex: 1,
              overflow: "auto",
              borderRight: "3px solid #b0b0b0",
              background: "white",
              padding: 4,
            }}
          >
            <DetailPane
              packet={filteredPackets[selectedRow]}
              rowIndex={selectedRow}
            />
          </div>
          <div
            style={{
              flex: 1,
              overflow: "auto",
              background: "#fafafa",
              padding: 4,
              fontFamily: "'Courier New', monospace",
              fontSize: 11,
            }}
          >
            <HexPane packet={filteredPackets[selectedRow]} />
          </div>
        </div>
      </div>

      {/* STATISTICS PANEL */}
      <StatsPanel packets={packets} filteredPackets={filteredPackets} />

      {/* LOG PANEL */}
      <LogPanel logs={logs} onClear={clearLog} />

      {/* STATUS BAR */}
      <div
        style={{
          background: "#c8c8c8",
          borderTop: "1px solid #b0b0b0",
          padding: "2px 8px",
          display: "flex",
          alignItems: "center",
          gap: 16,
          fontSize: 11,
          height: 20,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: statusState === "capturing" ? "#22aa22" : "#888",
              animation:
                statusState === "capturing" ? "blink 1s infinite" : "none",
            }}
          />
          <span>{statusText}</span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            marginLeft: "auto",
          }}
        >
          <span>{packetCount}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span>Profile: Default</span>
        </div>
      </div>

      {/* WELCOME OVERLAY */}
      {showWelcome && (
        <WelcomeOverlay
          onClose={() => setShowWelcome(false)}
          onStartCapture={handleStartCapture}
        />
      )}

      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
