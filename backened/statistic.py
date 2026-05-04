import LivePacketCapture

def Statistic_information():
    packets = LivePacketCapture.get_packets()

    tcp_count = 0
    udp_count = 0
    icmp_count = 0
    total_size = 0

    for packet in packets:

        size = packet.get("packet_size", 0)
        proto = packet.get("protocol", "OTHER")

        total_size += int(size)

        if proto == "TCP":
            tcp_count += 1
        elif proto == "UDP":
            udp_count += 1
        elif proto == "ICMP":
            icmp_count += 1

    total = len(packets)
    avg_size = total_size / total if total > 0 else 0

    return {
        "total_packets": total,
        "tcp_count": tcp_count,
        "udp_count": udp_count,
        "icmp_count": icmp_count,
        "average_packet_size": avg_size
    }