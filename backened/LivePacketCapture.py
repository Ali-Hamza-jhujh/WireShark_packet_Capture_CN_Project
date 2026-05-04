from scapy.all import AsyncSniffer, IP, TCP, UDP, ICMP,DNS, get_if_list, get_if_addr
import threading

sniffer = None
packets = []
lock = threading.Lock()


def get_protocol_name(packet):
    if packet.haslayer(TCP):
        return "TCP"
    elif packet.haslayer(UDP):
        return "UDP"
    elif packet.haslayer(ICMP):
        return "ICMP"
    else:
        return "OTHER"


def get_service(port):
    if port == 80:
        return "HTTP"
    elif port == 443:
        return "HTTPS"
    elif port == 53:
        return "DNS"
    else:
        return "OTHER"


def Process_packets(packet):
    if packet.haslayer(IP):

        ip_layer = packet[IP]

        data = {
            "src_ip": ip_layer.src,
            "dst_ip": ip_layer.dst,
            "protocol": get_protocol_name(packet),
            "packet_size": len(packet),
        }

        if packet.haslayer(TCP):
            data["src_port"] = packet[TCP].sport
            data["dst_port"] = packet[TCP].dport
            data["service"] = get_service(data["dst_port"])

        elif packet.haslayer(UDP):
            data["src_port"] = packet[UDP].sport
            data["dst_port"] = packet[UDP].dport
            data["service"] = get_service(data["dst_port"])

        else:
            data["src_port"] = None
            data["dst_port"] = None
            data["service"] = None
        print(data)
        with lock:
            packets.append(data)


def start_sniffing(iface):
    global sniffer, packets

    if sniffer:
        return

    with lock:
        packets.clear()

    sniffer = AsyncSniffer(iface=iface, prn=Process_packets)
    sniffer.start()


def stop_sniffing():
    global sniffer
    if sniffer:
        sniffer.stop()
        sniffer = None


def get_packets():
    with lock:
        return packets.copy()


def get_interfaces():
    interfaces = []

    for iface in get_if_list():
        try:
            ip = get_if_addr(iface)
        except:
            ip = None

        # clean name mapping
        clean_name = iface

        if "Wi-Fi" in iface or "wlan" in iface.lower():
            clean_name = "Wi-Fi"
        elif "eth" in iface.lower():
            clean_name = "Ethernet"
        elif "loopback" in iface.lower() or "lo" == iface.lower():
            clean_name = "Loopback"
        elif "virtual" in iface.lower():
            clean_name = "Virtual Adapter"

        interfaces.append({
            "id": iface,          
            "name": clean_name,  
            "ip": ip             
        })

    return interfaces