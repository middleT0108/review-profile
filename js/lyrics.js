/**
 * ==============================================================================
 * LYRICS.JS - Đồng bộ lời bài hát thời gian thực (Real-time Synced Lyrics)
 * ==============================================================================
 * Các tiêu chuẩn kỹ thuật:
 * 1. Nguồn thời gian duy nhất: audio.currentTime của chính thẻ <audio> đang phát
 * 2. Cập nhật 60fps qua requestAnimationFrame, hủy khi pause / ended / buffering
 * 3. Đồng bộ lập tức ở mọi sự kiện: play, pause, seeking, seeked, timeupdate,
 *    ratechange, loadedmetadata, ended, visibilitychange
 * 4. Phân tích LRC toàn diện: [mm:ss.xx], [hh:mm:ss.xx], minutes > 59, fraction chính xác,
 *    thẻ metadata, [offset:±ms], dòng thông tin đầu bài (mờ, không highlight),
 *    khoảng nghỉ instrumental ♪ ♫ ♪, và fallback plain text
 * 5. Tìm dòng bằng Binary Search, chỉ cập nhật DOM khi đổi dòng, cuộn mượt
 *    chính xác bên trong container (không cuộn trang, tua xa > 3 dòng thì cuộn tức thì)
 * 6. Chống lỗi đua (Race Condition) khi chuyển bài bằng trackId token & AbortController
 * 7. Bù trừ lệch thời gian (Offset) riêng cho từng bài hát (-10s đến +10s, có hiệu lực ngay)
 * 8. Chế độ Debug qua URL ?debug=1 hiển thị HUD trực quan và các cảnh báo console
 */

class LyricsController {
    constructor(listId, scrollWrapId, soundwavesId, musicPlayer = null) {
        this.listEl = document.getElementById(listId);
        this.scrollWrap = document.getElementById(scrollWrapId);
        this.soundwavesEl = document.getElementById(soundwavesId);

        // Nguồn âm thanh duy nhất
        this.musicPlayer = musicPlayer || window.musicPlayer || null;
        this.audio = this.musicPlayer ? this.musicPlayer.audio : null;

        // Dữ liệu lời bài hát hiện tại
        this.lines = [];
        this.lineEls = [];
        this.currentIndex = -1;
        this.hasTimestamps = true;

        // Trạng thái theo dõi bài hát và đồng bộ
        this.currentTrackId = '';
        this.currentTrackTitle = '';
        this.userOffset = 0;
        this.fileOffset = 0;
        this.isBuffering = false;

        // Vòng lặp cập nhật và hủy tác vụ đua (Race Condition)
        this.rafId = null;
        this.abortController = null;

        // Chế độ Debug (?debug=1)
        this.isDebugMode = false;
        this.debugEl = null;

        if (this.listEl && this.scrollWrap) {
            this.init();
        }
    }

    init() {
        this.initDebugMode();
        this.setupOffsetControls();
        this.setupGlobalEvents();

        if (this.audio) {
            this.bindAudio(this.audio);
        }

        // Tự động nạp lời bài hát ban đầu
        this.loadInitialLyrics();
    }

    // ==========================================================================
    // 1. KHỞI TẠO VÀ RÀNG BUỘC THẺ AUDIO (SINGLE SOURCE OF TRUTH)
    // ==========================================================================
    bindMusicPlayer(musicPlayer) {
        this.musicPlayer = musicPlayer;
        if (musicPlayer && musicPlayer.audio) {
            this.bindAudio(musicPlayer.audio);
        }
    }

    bindAudio(audioElement) {
        if (!audioElement || this._boundAudio === audioElement) return;
        this._boundAudio = audioElement;
        this.audio = audioElement;

        // Lắng nghe các sự kiện native trực tiếp từ <audio> để triệt tiêu độ trễ
        this.audio.addEventListener('play', () => {
            this.isBuffering = false;
            this.updatePlayState(true);
            this.updateTimeImmediately();
            this.startRafLoop();
        });

        this.audio.addEventListener('playing', () => {
            this.isBuffering = false;
            this.updatePlayState(true);
            this.updateTimeImmediately();
            this.startRafLoop();
        });

        this.audio.addEventListener('pause', () => {
            this.stopRafLoop();
            this.updatePlayState(false);
        });

        this.audio.addEventListener('waiting', () => {
            this.isBuffering = true;
            this.stopRafLoop();
        });

        this.audio.addEventListener('stalled', () => {
            this.isBuffering = true;
            this.stopRafLoop();
        });

        this.audio.addEventListener('seeking', () => {
            this.updateTimeImmediately();
        });

        this.audio.addEventListener('seeked', () => {
            this.updateTimeImmediately();
        });

        this.audio.addEventListener('timeupdate', () => {
            this.updateTimeImmediately();
        });

        this.audio.addEventListener('ratechange', () => {
            this.updateTimeImmediately();
        });

        this.audio.addEventListener('loadedmetadata', () => {
            this.updateTimeImmediately();
        });

        this.audio.addEventListener('ended', () => {
            this.onEnded();
        });
    }

    setupGlobalEvents() {
        // Tab ẩn/hiện: Khi tab được mở lại (visibilitychange), lập tức bắt kịp thời gian hiện tại
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && this.audio) {
                this.updateTimeImmediately();
                if (!this.audio.paused && !this.audio.ended) {
                    this.startRafLoop();
                }
            }
        });

        // Báo hiệu chuyển bài từ MusicPlayer
        window.addEventListener('music-trackchanged', (e) => {
            if (e.detail) {
                const trackId = e.detail.trackId || (e.detail.track && e.detail.track.id);
                this.loadLyricsForTrack(trackId, e.detail.title);
            }
        });

        // Lắng nghe cập nhật offset hoặc lyrics từ Dashboard
        window.addEventListener('profile-data-updated', (e) => {
            if (e.detail && (e.detail.type === 'lyrics' || e.detail.type === 'lyrics_offset')) {
                this.refreshCurrentTrack();
            }
        });

        window.addEventListener('storage', (e) => {
            if (e.key && (e.key.startsWith('profile_lyrics') || e.key === 'profile_sync_ping')) {
                this.refreshCurrentTrack();
            }
        });
    }

    // ==========================================================================
    // 2. VÒNG LẶP RAF (REQUEST ANIMATION FRAME)
    // ==========================================================================
    startRafLoop() {
        this.stopRafLoop();
        const step = () => {
            if (!this.audio || this.audio.paused || this.audio.ended || this.isBuffering) {
                this.rafId = null;
                return;
            }
            this.updateTime(this.audio.currentTime);
            this.rafId = requestAnimationFrame(step);
        };
        this.rafId = requestAnimationFrame(step);
    }

    stopRafLoop() {
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
    }

    updateTimeImmediately() {
        if (!this.audio) return;
        this.updateTime(this.audio.currentTime);
    }

    // ==========================================================================
    // 3. PHÂN TÍCH FILE LRC (LRC PARSER TOÀN DIỆN)
    // ==========================================================================
    parseLRC(text) {
        if (!text || typeof text !== 'string') {
            return { lines: [], fileOffset: 0, hasTimestamps: false };
        }

        const lines = text.split(/\r?\n/);
        let fileOffset = 0;
        const rawTimestampedItems = [];
        const plainLines = [];

        // Hỗ trợ [mm:ss], [mm:ss.x], [mm:ss.xx], [mm:ss.xxx], [hh:mm:ss.xx]
        // Phút có thể vượt 59 (ví dụ [75:30.00])
        const TIME_TAG_REGEX = /\[(?:(\d{1,2}):)?(\d{1,3}):(\d{2})(?:\.(\d+))?\]/g;
        const META_TAG_REGEX = /^\[(ti|ar|al|by|length|re|ve):/i;

        for (const rawLine of lines) {
            const trimmed = rawLine.trim();
            if (!trimmed) continue;

            // Đọc thẻ offset trong file: [offset:±ms]
            // Offset dương giúp lyric xuất hiện sớm hơn
            const offsetMatch = trimmed.match(/^\[offset:\s*([+-]?\d+)\s*\]/i);
            if (offsetMatch) {
                fileOffset = parseInt(offsetMatch[1], 10) / 1000;
                continue;
            }

            // Bỏ qua các thẻ metadata tiêu chuẩn
            if (META_TAG_REGEX.test(trimmed)) {
                continue;
            }

            const matches = [...trimmed.matchAll(TIME_TAG_REGEX)];
            if (matches.length > 0) {
                const textPart = trimmed.replace(TIME_TAG_REGEX, '').trim();
                const isInstrumental = textPart.length === 0;
                const displayText = isInstrumental ? '♪ ♫ ♪' : textPart;

                for (const m of matches) {
                    const hours = m[1] ? parseInt(m[1], 10) : 0;
                    const minutes = parseInt(m[2], 10);
                    const seconds = parseInt(m[3], 10);
                    const fracStr = m[4] || '';

                    // Tính phần thập phân chính xác: .5 -> 0.5, .05 -> 0.05, .500 -> 0.5
                    const fraction = fracStr ? (parseInt(fracStr, 10) / Math.pow(10, fracStr.length)) : 0;
                    const totalSeconds = hours * 3600 + minutes * 60 + seconds + fraction;

                    rawTimestampedItems.push({
                        time: totalSeconds,
                        text: displayText,
                        isInstrumental: isInstrumental,
                        isInfo: false
                    });
                }
            } else {
                plainLines.push(trimmed);
            }
        }

        // Cảnh báo nếu mốc thời gian trong file LRC không tăng dần
        for (let i = 1; i < rawTimestampedItems.length; i++) {
            if (rawTimestampedItems[i].time < rawTimestampedItems[i - 1].time) {
                console.warn('[Lyrics] Mốc thời gian trong file LRC không tăng dần:', rawTimestampedItems[i - 1], rawTimestampedItems[i]);
                break;
            }
        }

        // Trường hợp file không có mốc thời gian nào
        if (rawTimestampedItems.length === 0) {
            return {
                lines: plainLines.map(t => ({
                    time: -1,
                    text: t,
                    isInstrumental: false,
                    isInfo: false
                })),
                fileOffset: 0,
                hasTimestamps: false
            };
        }

        // Sắp xếp tăng dần theo thời gian
        rawTimestampedItems.sort((a, b) => a.time - b.time);

        // Loại bỏ các mục trùng lặp thời gian và nội dung
        const sorted = [];
        for (const item of rawTimestampedItems) {
            if (sorted.length > 0) {
                const last = sorted[sorted.length - 1];
                if (Math.abs(last.time - item.time) < 0.001 && last.text === item.text) {
                    continue;
                }
            }
            sorted.push(item);
        }

        // Nhận diện dòng thông tin ở đầu bài (Prod. by, Composer, Song Title...)
        // Hiển thị mờ, không bao giờ được highlight như câu hát
        const infoKeywordRegex = /(?:prod|producer|composer|lyricist|written|mix|master|lời|nhạc|sản xuất|album|feat\.|intro|version)/i;
        let passedFirstSinging = false;

        for (let i = 0; i < sorted.length; i++) {
            const item = sorted[i];
            if (passedFirstSinging) {
                item.isInfo = false;
                continue;
            }

            if (item.isInstrumental) {
                item.isInfo = false;
                continue;
            }

            const isHeaderLine = i === 0 && item.time < 3.0 && (item.text.includes('-') || item.text.includes(':'));
            if (infoKeywordRegex.test(item.text) || isHeaderLine) {
                item.isInfo = true;
            } else {
                item.isInfo = false;
                passedFirstSinging = true;
            }
        }

        return {
            lines: sorted,
            fileOffset: fileOffset,
            hasTimestamps: true
        };
    }

    // ==========================================================================
    // 4. CHỐNG LỖI ĐUA (RACE CONDITION) & NẠP LỜI BÀI HÁT
    // ==========================================================================
    prepareForNewTrack(trackId, title = '') {
        this.stopRafLoop();

        if (this.abortController) {
            this.abortController.abort();
        }
        this.abortController = new AbortController();

        const cleanTrackId = trackId || (window.ProfileStorage ? window.ProfileStorage.getLyricsKeyForTitle(title) : 'unknown');
        this.currentTrackId = cleanTrackId;
        this.currentTrackTitle = title || '';
        this.currentIndex = -1;
        this.lines = [];
        this.lineEls = [];

        // Xóa sạch nội dung cũ ngay lập tức
        if (this.listEl) {
            this.listEl.innerHTML = `
                <div class="lyrics-loading-msg">
                    <span>Đang tải lời bài hát...</span>
                </div>
            `;
        }
        if (this.scrollWrap) {
            this.scrollWrap.scrollTo({ top: 0, behavior: 'auto' });
        }
    }

    loadLyricsForTrack(trackId, trackTitle = '') {
        const title = trackTitle || this.currentTrackTitle;
        const cleanTrackId = trackId || (window.ProfileStorage ? window.ProfileStorage.getLyricsKeyForTitle(title) : this.currentTrackId);

        // Khóa định danh yêu cầu hiện tại để chống ghi đè bài cũ
        const requestId = cleanTrackId;
        this.prepareForNewTrack(cleanTrackId, title);

        const rawLyricsText = window.ProfileStorage ? window.ProfileStorage.getLyricsForTrack(title || cleanTrackId) : '';

        // Kiểm tra xem bài hát có bị chuyển tiếp trước khi dữ liệu trả về không
        if (this.currentTrackId !== requestId) {
            console.warn('[Lyrics] ID bài khi trả kết quả không khớp, hủy cập nhật:', requestId, 'hiện tại:', this.currentTrackId);
            return;
        }

        // Lấy offset riêng của bài hát này
        this.userOffset = window.ProfileStorage ? window.ProfileStorage.getSongOffset(cleanTrackId) : 0;
        this.updateOffsetDisplay();

        const parsed = this.parseLRC(rawLyricsText);
        this.lines = parsed.lines;
        this.fileOffset = parsed.fileOffset;
        this.hasTimestamps = parsed.hasTimestamps;

        if (rawLyricsText && rawLyricsText.trim().length > 0 && this.lines.length === 0) {
            console.warn('[Lyrics] Mảng lyric trống dù bài có lyric:', cleanTrackId);
        }

        this.renderLines();

        // Đồng bộ tức thì nếu bài đang phát
        if (this.audio) {
            this.updateTimeImmediately();
            if (!this.audio.paused && !this.audio.ended) {
                this.startRafLoop();
            }
        }
    }

    loadInitialLyrics() {
        let title = '';
        let trackId = '';

        if (this.musicPlayer && this.musicPlayer.playlist && this.musicPlayer.playlist.length > 0) {
            const idx = this.musicPlayer.currentTrackIndex || 0;
            const t = this.musicPlayer.playlist[idx];
            if (t) {
                title = t.title || t.fileName || '';
                trackId = t.id || t.key || '';
            }
        }

        if (!title && window.ProfileStorage) {
            title = window.ProfileStorage.getStoredSongName() || 'Dangrangto - đánh rơi (feat. MICKEY)';
        }

        this.loadLyricsForTrack(trackId, title);
    }

    refreshCurrentTrack() {
        if (this.currentTrackId || this.currentTrackTitle) {
            this.loadLyricsForTrack(this.currentTrackId, this.currentTrackTitle);
        }
    }

    // ==========================================================================
    // 5. HIỂN THỊ DOM (RENDER)
    // ==========================================================================
    renderLines() {
        if (!this.listEl) return;
        this.listEl.innerHTML = '';
        this.lineEls = [];
        this.currentIndex = -1;

        if (!this.lines || this.lines.length === 0) {
            this.listEl.innerHTML = `
                <div class="lyrics-empty-msg">
                    <span>Đang phát nhạc không lời<br>hoặc chưa có lời bài hát.</span>
                </div>
            `;
            return;
        }

        // Trường hợp file không có mốc thời gian: Hiển thị văn bản tĩnh + ghi chú
        if (!this.hasTimestamps) {
            const noticeEl = document.createElement('div');
            noticeEl.className = 'lyrics-no-timestamp-notice';
            noticeEl.textContent = 'Lyric chưa có mốc thời gian';
            this.listEl.appendChild(noticeEl);

            this.lines.forEach((item) => {
                const lineEl = document.createElement('div');
                lineEl.className = 'lyric-line static-line';
                lineEl.textContent = item.text;
                this.listEl.appendChild(lineEl);
                this.lineEls.push(lineEl);
            });
            return;
        }

        // Trường hợp lời đồng bộ: DOM và mảng lyric dùng chung 1 chỉ số (100% khớp nhau)
        this.lines.forEach((item, index) => {
            const lineEl = document.createElement('div');
            lineEl.className = 'lyric-line' +
                (item.isInfo ? ' info-line' : '') +
                (item.isInstrumental ? ' instrumental' : '');

            lineEl.dataset.index = index;
            lineEl.dataset.time = item.time;
            lineEl.textContent = item.text;

            // Nhấp vào câu hát để tua (chỉ áp dụng cho câu hát hợp lệ, không áp dụng cho info line)
            if (!item.isInfo && item.time >= 0) {
                lineEl.addEventListener('click', () => {
                    this.seekToLyric(item.time);
                });
                lineEl.title = `Tua đến [${this.formatTime(item.time)}]`;
            }

            this.listEl.appendChild(lineEl);
            this.lineEls.push(lineEl);
        });
    }

    // ==========================================================================
    // 6. TÌM KIẾM NHỊ PHÂN VÀ ĐỒNG BỘ THỜI GIAN
    // ==========================================================================
    findActiveIndex(effectiveTime) {
        if (!this.lines || this.lines.length === 0) return -1;
        if (effectiveTime < this.lines[0].time) return -1;

        let low = 0;
        let high = this.lines.length - 1;
        let result = -1;

        while (low <= high) {
            const mid = (low + high) >> 1;
            if (this.lines[mid].time <= effectiveTime) {
                result = mid;
                low = mid + 1; // Tìm tiếp phần tử lớn nhất thỏa mãn <= effectiveTime
            } else {
                high = mid - 1;
            }
        }

        return result;
    }

    updateTime(currentTime) {
        if (typeof currentTime !== 'number' || isNaN(currentTime)) return;

        // Cập nhật Debug HUD nếu đang bật
        if (this.isDebugMode) {
            this.updateDebugHud(currentTime);
        }

        if (!this.hasTimestamps || !this.lines || this.lines.length === 0) return;

        // Mọi việc xác định dòng lyric hiện tại PHẢI dựa vào audio.currentTime
        // effectiveTime = audio.currentTime + offset_người_dùng + offset_file
        const totalOffset = this.userOffset + this.fileOffset;
        const effectiveTime = currentTime + totalOffset;

        // Tìm dòng bằng Binary Search
        const rawIdx = this.findActiveIndex(effectiveTime);

        // Các dòng thông tin đầu bài không bao giờ được tô sáng như lời hát
        let activeIdx = rawIdx;
        if (activeIdx >= 0 && this.lines[activeIdx].isInfo) {
            activeIdx = -1;
        }

        // CHỈ cập nhật DOM khi chỉ số dòng thay đổi, không render lại mỗi khung hình
        if (activeIdx === this.currentIndex) return;

        const oldIdx = this.currentIndex;
        this.currentIndex = activeIdx;

        this.applyActiveLine(oldIdx, activeIdx);
    }

    applyActiveLine(oldIndex, newIndex) {
        if (oldIndex >= 0 && this.lineEls[oldIndex]) {
            this.lineEls[oldIndex].classList.remove('active');
        }

        if (newIndex >= 0 && this.lineEls[newIndex]) {
            const activeEl = this.lineEls[newIndex];
            activeEl.classList.add('active');

            // Cuộn mượt dòng mới vào chính giữa khung nhìn của scrollWrap (KHÔNG cuộn trang)
            const containerHeight = this.scrollWrap.clientHeight;
            if (containerHeight > 0) {
                const targetTop = activeEl.offsetTop - (containerHeight / 2) + (activeEl.clientHeight / 2);
                
                // Khi tua nhảy xa (chênh quá 3 dòng) thì cuộn tức thì không animation
                const isFarJump = oldIndex === -1 || Math.abs(newIndex - oldIndex) > 3;

                this.scrollWrap.scrollTo({
                    top: Math.max(0, targetTop),
                    behavior: isFarJump ? 'auto' : 'smooth'
                });
            }
        }
    }

    // ==========================================================================
    // 7. XỬ LÝ SỰ KIỆN PHÁT NHẠC & TUA
    // ==========================================================================
    seekToLyric(time) {
        if (!this.audio) {
            if (window.musicPlayer && window.musicPlayer.audio) {
                this.bindAudio(window.musicPlayer.audio);
            }
        }

        if (this.audio) {
            this.audio.currentTime = Math.max(0, time);
            this.updateTimeImmediately();

            if (this.musicPlayer) {
                if (!this.musicPlayer.isPlaying) {
                    this.musicPlayer.play();
                }
                this.musicPlayer.showPlayer();
            }
        }
    }

    onEnded() {
        this.stopRafLoop();
        this.currentIndex = -1;
        this.lineEls.forEach(el => el.classList.remove('active'));
        if (this.scrollWrap) {
            this.scrollWrap.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }

    updatePlayState(isPlaying) {
        if (this.soundwavesEl) {
            if (isPlaying) {
                this.soundwavesEl.classList.add('playing');
            } else {
                this.soundwavesEl.classList.remove('playing');
            }
        }
    }

    // ==========================================================================
    // 8. ĐIỀU KHIỂN ĐỘ LỆCH THỜI GIAN (OFFSET) BỞI NGƯỜI DÙNG
    // ==========================================================================
    setupOffsetControls() {
        this.offsetMinusBtn = document.getElementById('lyricsOffsetMinus');
        this.offsetPlusBtn = document.getElementById('lyricsOffsetPlus');
        this.offsetResetBtn = document.getElementById('lyricsOffsetReset');
        this.offsetDisplayEl = document.getElementById('lyricsOffsetDisplay');

        if (this.offsetMinusBtn) {
            this.offsetMinusBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.adjustUserOffset(-0.1);
            });
        }

        if (this.offsetPlusBtn) {
            this.offsetPlusBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.adjustUserOffset(+0.1);
            });
        }

        if (this.offsetResetBtn) {
            this.offsetResetBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.resetUserOffset();
            });
        }

        this.updateOffsetDisplay();
    }

    adjustUserOffset(delta) {
        const next = Math.max(-10, Math.min(10, Math.round((this.userOffset + delta) * 10) / 10));
        this.setUserOffset(next);
    }

    resetUserOffset() {
        const defaultOffset = (window.ProfileStorage && window.ProfileStorage.DEFAULT_SONG_OFFSETS && window.ProfileStorage.DEFAULT_SONG_OFFSETS[this.currentTrackId]) !== undefined
            ? window.ProfileStorage.DEFAULT_SONG_OFFSETS[this.currentTrackId]
            : 0.50;
        this.setUserOffset(defaultOffset);
    }

    setUserOffset(val) {
        const clamped = Math.max(-10, Math.min(10, Math.round(val * 100) / 100));
        this.userOffset = clamped;

        if (this.currentTrackId && window.ProfileStorage) {
            window.ProfileStorage.saveSongOffset(this.currentTrackId, clamped);
        }

        this.updateOffsetDisplay();

        // Có hiệu lực ngay lập tức mà không cần phát lại
        this.updateTimeImmediately();
    }

    updateOffsetDisplay() {
        if (this.offsetDisplayEl) {
            const sign = this.userOffset > 0 ? '+' : '';
            this.offsetDisplayEl.textContent = `${sign}${this.userOffset.toFixed(1)}s`;
        }
    }

    // ==========================================================================
    // 9. CHẾ ĐỘ DEBUG (?debug=1)
    // ==========================================================================
    initDebugMode() {
        const params = new URLSearchParams(window.location.search);
        this.isDebugMode = params.get('debug') === '1';

        if (!this.isDebugMode) return;

        this.debugEl = document.createElement('div');
        this.debugEl.className = 'lyrics-debug-bar';
        this.debugEl.id = 'lyricsDebugBar';
        this.debugEl.innerHTML = `
            <span class="debug-badge">DEBUG</span>
            <span>Time: <strong id="debugCurTime">0.00</strong>s</span>
            <span>Line: <strong id="debugLineIdx">-1</strong></span>
            <span>LineTime: <strong id="debugLineTime">--</strong></span>
            <span>Offset: <strong id="debugOffset">+0.00</strong>s</span>
            <span>Track: <strong id="debugTrackId">none</strong></span>
        `;
        document.body.appendChild(this.debugEl);
    }

    updateDebugHud(currentTime) {
        if (!this.debugEl) return;
        const timeEl = this.debugEl.querySelector('#debugCurTime');
        const idxEl = this.debugEl.querySelector('#debugLineIdx');
        const lineTimeEl = this.debugEl.querySelector('#debugLineTime');
        const offEl = this.debugEl.querySelector('#debugOffset');
        const trackEl = this.debugEl.querySelector('#debugTrackId');

        if (timeEl) timeEl.textContent = currentTime.toFixed(2);
        if (idxEl) idxEl.textContent = this.currentIndex;
        if (lineTimeEl) {
            if (this.currentIndex >= 0 && this.lines[this.currentIndex]) {
                lineTimeEl.textContent = `${this.lines[this.currentIndex].time.toFixed(2)}s`;
            } else {
                lineTimeEl.textContent = '--';
            }
        }
        if (offEl) {
            const total = this.userOffset + this.fileOffset;
            offEl.textContent = `${total >= 0 ? '+' : ''}${total.toFixed(2)}s`;
        }
        if (trackEl) {
            trackEl.textContent = this.currentTrackId || 'none';
        }
    }

    formatTime(seconds) {
        if (isNaN(seconds) || seconds < 0) return '00:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
}

window.LyricsController = LyricsController;
