/**
 * Red Eclipse 2 ENet join verification harness (protocol 245 / v2.0.0).
 *
 * Connects to a Red Eclipse dedicated server over ENet, handles N_SERVERINIT,
 * sends N_CONNECT with player metadata + version struct, and waits for N_WELCOME.
 *
 * Build on VPS (with redeclipse/base cloned at /opt/redeclipse/base):
 *   g++ -O2 -o enet_join tools/enet_join.cpp \
 *       -I/opt/redeclipse/base/src/enet/include \
 *       /opt/redeclipse/base/src/enet/libenet.a
 *
 * Run:
 *   ./enet_join <vps-ip> 28801 "test-player"
 */
#include <enet/enet.h>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>

static const int RE_PROTOCOL_VERSION = 245;
static const int RE_N_CONNECT        = 0;
static const int RE_N_SERVERINIT     = 1;
static const int RE_N_WELCOME        = 2;
static const int RE_NUM_CHANNELS     = 3;

static void putint(std::vector<uint8_t>& buf, int n) {
    if (n > -127 && n < 128) {
        buf.push_back(static_cast<uint8_t>(n & 0xff));
    } else if (n >= -0x8000 && n < 0x8000) {
        buf.push_back(0x80);
        buf.push_back(static_cast<uint8_t>(n & 0xff));
        buf.push_back(static_cast<uint8_t>((n >> 8) & 0xff));
    } else {
        buf.push_back(0x81);
        buf.push_back(static_cast<uint8_t>(n & 0xff));
        buf.push_back(static_cast<uint8_t>((n >> 8) & 0xff));
        buf.push_back(static_cast<uint8_t>((n >> 16) & 0xff));
        buf.push_back(static_cast<uint8_t>((n >> 24) & 0xff));
    }
}

static void sendstring(std::vector<uint8_t>& buf, const std::string& s) {
    for (unsigned char c : s) {
        putint(buf, static_cast<int>(c));
    }
    putint(buf, 0);
}

struct Reader {
    const uint8_t* data;
    size_t len;
    size_t pos = 0;

    bool ok() const { return pos < len; }

    int getbyte() {
        if (pos >= len) return 0;
        return data[pos++];
    }

    int getint() {
        int c = static_cast<int8_t>(getbyte());
        if (c == -128) {
            int lo = getbyte();
            int hi = static_cast<int8_t>(getbyte());
            return lo | (hi << 8);
        }
        if (c == -127) {
            int b0 = getbyte();
            int b1 = getbyte();
            int b2 = getbyte();
            int b3 = getbyte();
            return b0 | (b1 << 8) | (b2 << 16) | (b3 << 24);
        }
        return c;
    }

    std::string getstring() {
        std::string out;
        while (pos < len) {
            int c = getint();
            if (c == 0) break;
            out.push_back(static_cast<char>(c & 0xff));
        }
        return out;
    }
};

static std::vector<uint8_t> build_connect_packet(const std::string& name) {
    std::vector<uint8_t> p;
    putint(p, RE_N_CONNECT);

    sendstring(p, name);
    putint(p, 0);     // colour
    putint(p, 0);     // model
    putint(p, 0);     // pattern
    sendstring(p, ""); // vanity
    putint(p, 0);     // loadweap length
    putint(p, 0);     // randweap length
    sendstring(p, ""); // password hash
    sendstring(p, ""); // authname

    // clientversion::put() (game.h)
    putint(p, 2);                    // major
    putint(p, 0);                    // minor
    putint(p, 0);                    // patch
    putint(p, RE_PROTOCOL_VERSION);  // game
    putint(p, 0);                    // build
    putint(p, 0);                    // platform
    putint(p, 0);                    // arch
    putint(p, 330);                  // gpuglver
    putint(p, 330);                  // gpuglslver
    putint(p, 0);                    // crc
    sendstring(p, "2.0.0");          // branch
    sendstring(p, "");               // revision
    sendstring(p, "");               // gpuvendor
    sendstring(p, "");               // gpurenderer
    sendstring(p, "");               // gpuversion
    return p;
}

int main(int argc, char** argv) {
    if (argc < 2) {
        std::fprintf(stderr, "Usage: %s <host> [port=28801] [name=test-player]\n", argv[0]);
        return 2;
    }

    const char* host_str = argv[1];
    enet_uint16 port = argc >= 3 ? static_cast<enet_uint16>(std::atoi(argv[2])) : 28801;
    std::string name = argc >= 4 ? argv[3] : "test-player";

    if (enet_initialize() != 0) {
        std::fprintf(stderr, "enet_initialize failed\n");
        return 1;
    }

    ENetHost* client = enet_host_create(nullptr, 1, RE_NUM_CHANNELS, 0, 0);
    if (!client) {
        std::fprintf(stderr, "enet_host_create failed\n");
        enet_deinitialize();
        return 1;
    }

    ENetAddress addr{};
    if (enet_address_set_host(&addr, host_str) != 0) {
        std::fprintf(stderr, "Failed to resolve host: %s\n", host_str);
        enet_host_destroy(client);
        enet_deinitialize();
        return 1;
    }
    addr.port = port;

    ENetPeer* peer = enet_host_connect(client, &addr, RE_NUM_CHANNELS, 0);
    if (!peer) {
        std::fprintf(stderr, "enet_host_connect failed\n");
        enet_host_destroy(client);
        enet_deinitialize();
        return 1;
    }

    bool connected = false;
    bool got_serverinit = false;
    bool got_welcome = false;
    int exit_code = 1;

    ENetEvent ev{};
    for (int step = 0; step < 50; ++step) {
        if (enet_host_service(client, &ev, 100) <= 0) continue;

        if (ev.type == ENET_EVENT_TYPE_CONNECT) {
            connected = true;
            std::printf("[1] ENet connected (RTT %u ms)\n", peer->roundTripTime);
        } else if (ev.type == ENET_EVENT_TYPE_RECEIVE) {
            Reader r{ev.packet->data, ev.packet->dataLength};
            while (r.ok()) {
                int msg = r.getint();
                if (msg == RE_N_SERVERINIT) {
                    int cn = r.getint();
                    int ver = r.getint();
                    std::string hostip = r.getstring();
                    int sessionid = r.getint();
                    int flags = r.getint();
                    (void)hostip;
                    (void)sessionid;
                    (void)flags;
                    got_serverinit = true;
                    std::printf("[2] <- N_SERVERINIT (id=%d, ver=%d, %zu bytes)\n",
                                cn, ver, ev.packet->dataLength);
                    if (ver != RE_PROTOCOL_VERSION) {
                        std::fprintf(stderr, "Protocol mismatch: %d != %d\n", ver, RE_PROTOCOL_VERSION);
                        break;
                    }
                    auto pkt_bytes = build_connect_packet(name);
                    ENetPacket* pkt = enet_packet_create(pkt_bytes.data(), pkt_bytes.size(), ENET_PACKET_FLAG_RELIABLE);
                    enet_peer_send(peer, 1, pkt);
                    enet_host_flush(client);
                    std::printf("[3] sent N_CONNECT (%zu bytes) as \"%s\"\n", pkt_bytes.size(), name.c_str());
                } else if (msg == RE_N_WELCOME) {
                    int mastermode = r.getint();
                    got_welcome = true;
                    std::printf("[4] <- N_WELCOME (mastermode=%d)\nRESULT: JOIN ACCEPTED\n", mastermode);
                    exit_code = 0;
                    break;
                } else {
                    break;
                }
            }
            enet_packet_destroy(ev.packet);
            if (got_welcome) break;
        } else if (ev.type == ENET_EVENT_TYPE_DISCONNECT) {
            std::printf("Disconnected (reason code=%u)\n", ev.data);
            break;
        }
    }

    if (connected && got_serverinit && !got_welcome) {
        std::fprintf(stderr, "Server sent N_SERVERINIT but did not complete N_WELCOME\n");
    } else if (!connected) {
        std::fprintf(stderr, "Timed out waiting for ENet connection to %s:%u\n", host_str, port);
    }

    enet_peer_disconnect(peer, 0);
    enet_host_flush(client);
    enet_host_destroy(client);
    enet_deinitialize();
    return exit_code;
}
