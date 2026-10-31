/**
 * ==============================================================================
 * LANYARD.JS - Kết nối Discord Realtime Status qua Lanyard WebSocket & REST API
 * ==============================================================================
 * Lanyard API Documentation: https://github.com/Phineas/lanyard
 * WebSocket Endpoint: wss://api.lanyard.rest/socket
 * REST Endpoint: https://api.lanyard.rest/v1/users/{USER_ID}
 * 
 * LƯU Ý: Người dùng Discord CẦN tham gia Discord server Lanyard (https://discord.gg/lanyard)
 * ít nhất một lần để bot Lanyard có thể theo dõi và lấy trạng thái online của bạn.
 */

class LanyardClient {
    constructor() {
        this.userId = null;
        this.socket = null;
        this.heartbeatTimer = null;
        this.reconnectTimer = null;
        this.listeners = new Set();
        this.currentData = null;
        this.isConnecting = false;
    }

    /**
     * Bắt đầu theo dõi trạng thái của một Discord User ID
     * @param {string} userId - ID 17-19 chữ số của người dùng Discord
     */
    watch(userId) {
        if (!userId || typeof userId !== 'string' || userId.trim() === '') {
            this.disconnect();
            this.userId = null;
            this.emitUpdate({ status: 'offline', connected: false, reason: 'no_user_id' });
            return;
        }

        const cleanId = userId.trim();
        if (this.userId === cleanId && this.socket && this.socket.readyState === WebSocket.OPEN) {
            return; // Đang theo dõi ID này rồi
        }

        this.userId = cleanId;
        this.disconnect();

        // 1. Lấy dữ liệu REST ban đầu nhanh chóng
        this.fetchRestStatus(this.userId);

        // 2. Mở kết nối WebSocket thời gian thực
        this.connectWebSocket();
    }

    /**
     * Đăng ký callback khi trạng thái thay đổi
     * @param {Function} callback 
     */
    onUpdate(callback) {
        this.listeners.add(callback);
        if (this.currentData) {
            callback(this.currentData);
        }
        return () => this.listeners.delete(callback);
    }

    emitUpdate(data) {
        this.currentData = data;
        this.listeners.forEach(cb => {
            try {
                cb(data);
            } catch (err) {
                console.error('Lỗi trong Lanyard listener callback:', err);
            }
        });
    }

    /**
     * Gọi REST API để có trạng thái ngay lập tức
     */
    async fetchRestStatus(userId) {
        try {
            const res = await fetch(`https://api.lanyard.rest/v1/users/${userId}`);
            if (!res.ok) {
                if (res.status === 404) {
                    this.emitUpdate({
                        status: 'offline',
                        connected: false,
                        notInLanyardGuild: true,
                        message: 'Người dùng chưa tham gia server Lanyard Discord'
                    });
                }
                return;
            }
            const body = await res.json();
            if (body && body.success && body.data) {
                this.handlePresence(body.data);
            }
        } catch (e) {
            console.warn('REST Lanyard fetch failed:', e);
        }
    }

    /**
     * Kết nối WebSocket Lanyard
     */
    connectWebSocket() {
        if (!this.userId) return;
        if (this.isConnecting || (this.socket && this.socket.readyState === WebSocket.OPEN)) return;

        this.isConnecting = true;
        try {
            this.socket = new WebSocket('wss://api.lanyard.rest/socket');

            this.socket.onopen = () => {
                this.isConnecting = false;
            };

            this.socket.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    const { op, t, d } = message;

                    // Opcode 1: Hello - Nhận heartbeat interval và gửi subscribe
                    if (op === 1) {
                        const interval = d.heartbeat_interval;
                        this.startHeartbeat(interval);

                        // Gửi Initialize packet (Opcode 2)
                        this.socket.send(JSON.stringify({
                            op: 2,
                            d: {
                                subscribe_to_id: this.userId
                            }
                        }));
                    }
                    // Opcode 0: Event (INIT_STATE hoặc PRESENCE_UPDATE)
                    else if (op === 0) {
                        if (t === 'INIT_STATE' || t === 'PRESENCE_UPDATE') {
                            this.handlePresence(d);
                        }
                    }
                } catch (err) {
                    console.error('Lỗi phân tích WebSocket Lanyard message:', err);
                }
            };

            this.socket.onclose = () => {
                this.isConnecting = false;
                this.stopHeartbeat();
                // Tự động kết nối lại sau 4s nếu vẫn còn userId
                if (this.userId) {
                    clearTimeout(this.reconnectTimer);
                    this.reconnectTimer = setTimeout(() => {
                        this.connectWebSocket();
                    }, 4000);
                }
            };

            this.socket.onerror = (err) => {
                console.warn('Lanyard WebSocket gặp lỗi:', err);
                this.socket.close();
            };
        } catch (err) {
            this.isConnecting = false;
            console.error('Không thể tạo kết nối WebSocket Lanyard:', err);
        }
    }

    startHeartbeat(interval) {
        this.stopHeartbeat();
        this.heartbeatTimer = setInterval(() => {
            if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                this.socket.send(JSON.stringify({ op: 3 }));
            }
        }, interval);
    }

    stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }

    disconnect() {
        this.stopHeartbeat();
        clearTimeout(this.reconnectTimer);
        if (this.socket) {
            this.socket.onclose = null; // Ngăn reconnect loop khi chủ động ngắt
            this.socket.close();
            this.socket = null;
        }
        this.isConnecting = false;
    }

    /**
     * Chuẩn hóa dữ liệu trạng thái nhận được từ Lanyard
     */
    handlePresence(data) {
        if (!data) return;

        const discordStatus = data.discord_status || 'offline'; // 'online', 'idle', 'dnd', 'offline'
        const isOnline = discordStatus !== 'offline';
        const user = data.discord_user || {};
        const activities = data.activities || [];

        // Tìm activity chính (Custom Status hoặc Game/Spotify)
        let customStatus = '';
        let currentActivity = '';

        for (const act of activities) {
            if (act.type === 4 && act.state) { // Custom Status
                customStatus = act.state;
            } else if (act.type === 0) { // Playing Game
                currentActivity = `Đang chơi: ${act.name}`;
            } else if (act.type === 2) { // Listening Spotify
                currentActivity = `Đang nghe: ${act.details || act.name}`;
            } else if (act.type === 1) { // Streaming
                currentActivity = `Đang stream: ${act.name}`;
            }
        }

        // Tạo avatar URL Discord
        let avatarUrl = '';
        if (user.id && user.avatar) {
            const format = user.avatar.startsWith('a_') ? 'gif' : 'png';
            avatarUrl = `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${format}?size=128`;
        } else if (user.discriminator) {
            const index = user.discriminator === '0' ? (parseInt(user.id) >> 22) % 6 : parseInt(user.discriminator) % 5;
            avatarUrl = `https://cdn.discordapp.com/embed/avatars/${index}.png`;
        }

        this.emitUpdate({
            connected: true,
            status: discordStatus,
            isOnline: isOnline,
            statusText: isOnline ? 'Đang online' : 'Ngoại tuyến',
            username: user.global_name || user.username || 'Discord User',
            tag: user.username ? `@${user.username}` : '',
            avatarUrl: avatarUrl,
            customStatus: customStatus,
            currentActivity: currentActivity,
            raw: data
        });
    }
}

// Khởi tạo đối tượng toàn cục
window.LanyardService = new LanyardClient();
