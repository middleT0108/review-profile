/**
 * ==============================================================================
 * VOICELINE.JS - Bộ điều khiển Voiceline HUD công nghệ chiến thuật
 * ==============================================================================
 * Tính năng chính:
 * 1. Web Audio API AnalyserNode thật (fftSize 128, smoothing 0.8) render 56 bars waveform
 * 2. Phối hợp âm lượng nhạc nền (Ducking 25% trong 300ms, phục hồi trong 500ms)
 * 3. Phụ đề gõ chữ (Typewriter) đồng bộ theo tỉ lệ currentTime / duration
 * 4. Kéo tua tiến trình, phím tắt Space (Play/Pause), Mũi tên Trái/Phải (tua 2s)
 * 5. Tự động chuyển bài (Auto-next) tùy chọn
 * 6. Thu gọn / Mở rộng thành biểu tượng tròn nổi HUD
 * 7. Hiệu ứng boot và glitch tiêu đề khi khởi tạo
 */

// ==============================================================================
// CẤU HÌNH DỄ DÀNG TÙY BIẾN (CONFIGURATION)
// ==============================================================================
const VOICELINE_CONFIG = {
    BAR_COUNT: 56,              // Số thanh sóng âm (56 bars)
    MAX_BAR_HEIGHT: 36,         // Chiều cao tối đa của thanh sóng (px)
    FFT_SIZE: 128,              // Kích thước FFT phân tích phổ âm (128 -> 64 bins)
    SMOOTHING: 0.8,             // Độ mượt chuyển đổi sóng âm (0.0 - 1.0)
    TYPEWRITER_SPEED_MS: 22,    // Tốc độ gõ chữ khi không có audio duration (ms)
    DUCK_RATIO: 0.25,           // Giảm âm lượng nhạc nền còn 25% khi phát
    DUCK_TIME_MS: 300,          // Thời gian chuyển mượt khi giảm âm lượng (ms)
    RESTORE_TIME_MS: 500        // Thời gian chuyển mượt khi phục hồi âm lượng (ms)
};

class VoicelineController {
    constructor() {
        this.containerCol = document.getElementById('voicelineCol');
        this.togglePill = document.getElementById('voicelineTogglePill');
        
        // Thẻ audio riêng biệt duy nhất dành cho Voicelines
        this.audio = new Audio();
        this.audio.preload = 'auto';

        // Web Audio API
        this.audioCtx = null;
        this.analyser = null;
        this.sourceNode = null;
        this.freqDataArray = null;
        this.isAudioCtxReady = false;

        // Dữ liệu voicelines
        this.config = {
            characterName: 'OMEN',
            characterRole: 'CONTROLLER // SHADOW',
            autoNext: false,
            list: []
        };
        this.currentIndex = 0;
        this.currentBlobUrl = null;
        this.isPlaying = false;
        this.duration = 0;

        // Vòng lặp cập nhật
        this.rafId = null;
        this.isDraggingProgress = false;

        // Phần tử DOM
        this.hexPlayBtn = null;
        this.trackNameEl = null;
        this.charRoleEl = null;
        this.indexIndicatorEl = null;
        this.subtitleTextEl = null;
        this.subtitleLiveSr = null;
        this.waveformWrap = null;
        this.waveBars = [];
        this.progressBar = null;
        this.progressFill = null;
        this.progressHandle = null;
        this.currentTimeEl = null;
        this.durationEl = null;
        this.playlistWrap = null;
        this.autonextCheckbox = null;
        this.collapseBtn = null;

        this.init();
    }

    async init() {
        if (!this.containerCol && !this.togglePill) return;
        await this.loadData();
        this.cacheElements();
        this.renderWaveformBars();
        this.bindEvents();
        this.applyVisibility();

        if (this.config.list.length > 0) {
            await this.selectTrack(0, false);
            this.triggerBootEffect();
            this.startAutoplaySequence();
        }
    }

    /**
     * Tự động phát chuỗi voiceline từ đầu đến cuối một lần duy nhất khi vừa vào trang
     */
    startAutoplaySequence() {
        if (!this.config.list || this.config.list.length === 0) return;

        let hasStarted = false;

        const tryPlay = async () => {
            if (hasStarted || this.isPlaying) return true;
            try {
                this.ensureAudioContext();
                if (this.audioCtx && this.audioCtx.state === 'suspended') {
                    await this.audioCtx.resume();
                }
                const success = await this.play();
                if (success) {
                    hasStarted = true;
                    cleanup();
                    return true;
                }
                return false;
            } catch (err) {
                return false;
            }
        };

        const onUserGesture = async () => {
            const ok = await tryPlay();
            if (ok) cleanup();
        };

        const events = ['click', 'pointerdown', 'mousedown', 'touchstart', 'keydown'];
        const cleanup = () => {
            events.forEach(evt => window.removeEventListener(evt, onUserGesture, { capture: true }));
        };

        // Lắng nghe mọi tương tác đầu tiên của người dùng trên toàn màn hình
        events.forEach(evt => window.addEventListener(evt, onUserGesture, { capture: true, passive: true }));

        // Đồng thời thử tự động phát ngay sau khi hoàn thành boot (600ms)
        setTimeout(async () => {
            const ok = await tryPlay();
            if (ok) cleanup();
        }, 600);
    }

    // ==========================================================================
    // 1. TẢI DỮ LIỆU TỪ STORAGE
    // ==========================================================================
    async loadData() {
        if (window.ProfileStorage && typeof window.ProfileStorage.getStoredVoicelinesConfig === 'function') {
            this.config = window.ProfileStorage.getStoredVoicelinesConfig();
        }
        if (!this.config || !Array.isArray(this.config.list)) {
            this.config = {
                characterName: 'OMEN',
                characterRole: 'CONTROLLER // SHADOW',
                autoNext: false,
                list: []
            };
        }
    }

    applyVisibility() {
        const hasItems = this.config.list && this.config.list.length > 0;
        if (!hasItems) {
            if (this.containerCol) this.containerCol.classList.add('hidden');
            if (this.togglePill) this.togglePill.classList.add('hidden');
        } else {
            // Mở khung đầy đủ khi tải trang để phát chuỗi voiceline mở đầu
            if (this.containerCol) this.containerCol.classList.remove('hidden');
            if (this.togglePill) this.togglePill.classList.add('hidden');
        }
    }

    // ==========================================================================
    // 2. TẠO CẤU TRÚC DOM & SÓNG ÂM 56 BARS
    // ==========================================================================
    cacheElements() {
        if (!this.containerCol) return;

        this.hexPlayBtn = document.getElementById('vlHexPlayBtn');
        this.trackNameEl = document.getElementById('vlTrackName');
        this.charRoleEl = document.getElementById('vlCharRole');
        this.indexIndicatorEl = document.getElementById('vlIndexIndicator');
        this.subtitleTextEl = document.getElementById('vlSubtitleText');
        this.subtitleLiveSr = document.getElementById('vlSubtitleSr');
        this.waveformWrap = document.getElementById('vlWaveformWrap');
        this.progressBar = document.getElementById('vlProgressBar');
        this.progressFill = document.getElementById('vlProgressFill');
        this.progressHandle = document.getElementById('vlProgressHandle');
        this.currentTimeEl = document.getElementById('vlCurrentTime');
        this.durationEl = document.getElementById('vlDuration');
        this.playlistWrap = document.getElementById('vlPlaylistWrap');
        this.collapseBtn = document.getElementById('vlCollapseBtn');
        this.vlMuteBtn = document.getElementById('vlMuteBtn');
    }

    renderWaveformBars() {
        if (!this.waveformWrap) return;
        this.waveformWrap.innerHTML = '';
        this.waveBars = [];

        for (let i = 0; i < VOICELINE_CONFIG.BAR_COUNT; i++) {
            const bar = document.createElement('div');
            bar.className = 'vl-wave-bar';
            bar.dataset.index = i;
            this.waveformWrap.appendChild(bar);
            this.waveBars.push(bar);
        }
    }

    // ==========================================================================
    // 3. KHỞI TẠO WEB AUDIO API (ANALYSERNODE)
    // ==========================================================================
    ensureAudioContext() {
        if (this.isAudioCtxReady) {
            if (this.audioCtx && this.audioCtx.state === 'suspended') {
                this.audioCtx.resume();
            }
            return;
        }

        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) return;

            this.audioCtx = new AudioContextClass();
            this.analyser = this.audioCtx.createAnalyser();
            this.analyser.fftSize = VOICELINE_CONFIG.FFT_SIZE;
            this.analyser.smoothingTimeConstant = VOICELINE_CONFIG.SMOOTHING;

            // Kết nối MediaElementSource duy nhất cho audio
            this.sourceNode = this.audioCtx.createMediaElementSource(this.audio);
            this.sourceNode.connect(this.analyser);
            this.analyser.connect(this.audioCtx.destination);

            this.freqDataArray = new Uint8Array(this.analyser.frequencyBinCount);
            this.isAudioCtxReady = true;

            if (this.audioCtx.state === 'suspended') {
                this.audioCtx.resume();
            }
        } catch (err) {
            console.warn('[Voiceline] Web Audio API không khả dụng, sử dụng sóng âm mô phỏng:', err);
            this.isAudioCtxReady = false;
        }
    }

    // ==========================================================================
    // 4. LẮNG NGHE SỰ KIỆN & PHÍM TẮT
    // ==========================================================================
    bindEvents() {
        // Nút phát lục giác
        if (this.hexPlayBtn) {
            this.hexPlayBtn.addEventListener('click', () => {
                this.ensureAudioContext();
                this.togglePlay();
            });
        }

        // Bật / Tắt tiếng Voiceline
        if (this.vlMuteBtn) {
            this.vlMuteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.audio.muted = !this.audio.muted;
                const onIcon = this.vlMuteBtn.querySelector('.vl-icon-vol-on');
                const offIcon = this.vlMuteBtn.querySelector('.vl-icon-vol-off');
                if (onIcon) onIcon.style.display = this.audio.muted ? 'none' : 'block';
                if (offIcon) offIcon.style.display = this.audio.muted ? 'block' : 'none';
            });
        }

        // Thu gọn khung
        if (this.collapseBtn) {
            this.collapseBtn.addEventListener('click', () => {
                this.setCollapsed(true);
            });
        }

        // Mở lại khung từ biểu tượng tròn
        if (this.togglePill) {
            this.togglePill.addEventListener('click', () => {
                this.setCollapsed(false);
            });
        }

        // Kéo tua tiến trình
        if (this.progressBar) {
            const onSeekMove = (e) => {
                if (!this.isDraggingProgress) return;
                this.seekFromEvent(e);
            };

            const onSeekEnd = () => {
                if (this.isDraggingProgress) {
                    this.isDraggingProgress = false;
                    window.removeEventListener('mousemove', onSeekMove);
                    window.removeEventListener('mouseup', onSeekEnd);
                    window.removeEventListener('touchmove', onSeekMove);
                    window.removeEventListener('touchend', onSeekEnd);
                }
            };

            this.progressBar.addEventListener('mousedown', (e) => {
                this.isDraggingProgress = true;
                this.seekFromEvent(e);
                window.addEventListener('mousemove', onSeekMove);
                window.addEventListener('mouseup', onSeekEnd);
            });

            this.progressBar.addEventListener('touchstart', (e) => {
                this.isDraggingProgress = true;
                this.seekFromEvent(e.touches[0]);
                window.addEventListener('touchmove', onSeekMove);
                window.addEventListener('touchend', onSeekEnd);
            }, { passive: true });
        }

        // Phím tắt điều khiển (Space, Mũi tên Trái / Phải) khi khung được focus
        const cardEl = document.getElementById('voicelineCard');
        if (cardEl) {
            cardEl.addEventListener('keydown', (e) => {
                if (e.code === 'Space') {
                    e.preventDefault();
                    this.ensureAudioContext();
                    this.togglePlay();
                } else if (e.code === 'ArrowLeft') {
                    e.preventDefault();
                    this.seekRelative(-2);
                } else if (e.code === 'ArrowRight') {
                    e.preventDefault();
                    this.seekRelative(+2);
                }
            });
        }

        // Native audio events
        this.audio.addEventListener('loadedmetadata', () => {
            this.duration = this.audio.duration || 0;
            if (this.durationEl) {
                this.durationEl.textContent = this.formatTime(this.duration);
            }
        });

        this.audio.addEventListener('ended', () => {
            this.onEnded();
        });

        this.audio.addEventListener('pause', () => {
            this.setPlayState(false);
            this.restoreBackgroundMusic();
        });

        this.audio.addEventListener('play', () => {
            this.setPlayState(true);
            this.duckBackgroundMusic();
            this.startLoop();
        });

        // Lắng nghe cập nhật từ Dashboard
        window.addEventListener('profile-data-updated', async (e) => {
            if (e.detail && (e.detail.type === 'voicelines' || e.detail.type === 'voicelines_audio')) {
                await this.refreshFromStorage();
            }
        });

        window.addEventListener('storage', async (e) => {
            if (e.key === 'profile_voicelines' || e.key === 'profile_sync_ping') {
                await this.refreshFromStorage();
            }
        });
    }

    async refreshFromStorage() {
        const oldId = this.config.list[this.currentIndex]?.id;
        await this.loadData();
        this.applyVisibility();
        this.renderPlaylist();

        let newIdx = 0;
        if (oldId) {
            const found = this.config.list.findIndex(item => item.id === oldId);
            if (found >= 0) newIdx = found;
        }

        if (this.config.list.length > 0) {
            await this.selectTrack(newIdx, this.isPlaying);
        } else {
            this.audio.pause();
            this.setPlayState(false);
            this.restoreBackgroundMusic();
        }
    }

    // ==========================================================================
    // 5. CHỌN BÀI & NẠP AUDIO
    // ==========================================================================
    async selectTrack(index, autoPlay = false) {
        if (!this.config.list || this.config.list.length === 0) return;
        this.currentIndex = Math.max(0, Math.min(this.config.list.length - 1, index));
        const track = this.config.list[this.currentIndex];

        // Cập nhật text metadata
        if (this.trackNameEl) this.trackNameEl.textContent = track.title || `Voiceline ${this.currentIndex + 1}`;
        if (this.charRoleEl) {
            const name = (this.config.characterName || 'OMEN').toUpperCase();
            const role = (this.config.characterRole || 'CONTROLLER // SHADOW').toUpperCase();
            this.charRoleEl.textContent = `${name} // ${role}`;
        }
        if (this.indexIndicatorEl) {
            const currentStr = String(this.currentIndex + 1).padStart(2, '0');
            const totalStr = String(this.config.list.length).padStart(2, '0');
            this.indexIndicatorEl.textContent = `${currentStr} / ${totalStr}`;
        }

        // Cập nhật aria-live cho phụ đề (chỉ đọc lại khi đổi bài)
        if (this.subtitleLiveSr) {
            this.subtitleLiveSr.textContent = track.subtitle || '';
        }

        // Reset phụ đề hiển thị
        this.updateSubtitle(0, track.subtitle || '');

        // Nạp audio từ IndexedDB hoặc Blob
        if (this.currentBlobUrl) {
            URL.revokeObjectURL(this.currentBlobUrl);
            this.currentBlobUrl = null;
        }

        let audioLoaded = false;
        if (window.ProfileStorage && typeof window.ProfileStorage.getVoicelineAudio === 'function') {
            const audioData = await window.ProfileStorage.getVoicelineAudio(track.id);
            if (audioData && audioData.blob) {
                this.currentBlobUrl = URL.createObjectURL(audioData.blob);
                this.audio.src = this.currentBlobUrl;
                this.audio.load();
                audioLoaded = true;
            }
        }

/**
 * Bộ tạo âm thanh mẫu tổng hợp chuẩn WAV (Atmospheric Dark Drone)
 * Đảm bảo các voiceline mẫu có thể phát, nhảy sóng âm và gõ phụ đề ngay lập tức
 */
function createSyntheticWavBlobUrl(seconds = 3.5, baseFreq = 100) {
    try {
        const sampleRate = 22050;
        const numSamples = Math.floor(sampleRate * seconds);
        const buffer = new ArrayBuffer(44 + numSamples * 2);
        const view = new DataView(buffer);

        const writeStr = (offset, str) => {
            for (let i = 0; i < str.length; i++) {
                view.setUint8(offset + i, str.charCodeAt(i));
            }
        };

        writeStr(0, 'RIFF');
        view.setUint32(4, 36 + numSamples * 2, true);
        writeStr(8, 'WAVE');
        writeStr(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true); // PCM
        view.setUint16(22, 1, true); // Mono
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        writeStr(36, 'data');
        view.setUint32(40, numSamples * 2, true);

        for (let i = 0; i < numSamples; i++) {
            const t = i / sampleRate;
            const env = Math.sin((Math.PI * i) / numSamples);
            const s1 = Math.sin(2 * Math.PI * baseFreq * t);
            const s2 = Math.sin(2 * Math.PI * (baseFreq * 1.5) * t) * 0.4;
            const s3 = Math.sin(2 * Math.PI * (baseFreq * 0.5) * t) * 0.5;
            const noise = (Math.random() * 2 - 1) * 0.08;
            const sample = Math.max(-1, Math.min(1, (s1 + s2 + s3 + noise) * env * 0.6));
            view.setInt16(44 + i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
        }

        const blob = new Blob([buffer], { type: 'audio/wav' });
        return URL.createObjectURL(blob);
    } catch (e) {
        console.warn('Lỗi tạo synthetic wav:', e);
        return '';
    }
}
window.createSyntheticWavBlobUrl = createSyntheticWavBlobUrl;

        // Nếu track có file cục bộ mẫu / fallback URL
        if (!audioLoaded && track.audioUrl) {
            this.audio.src = track.audioUrl;
            this.audio.load();
            audioLoaded = true;
        }

        // Tạo âm thanh tổng hợp nếu chưa có file audio được tải lên (đảm bảo demo hoạt động mượt mà)
        if (!audioLoaded) {
            const toneFreq = 95 + (this.currentIndex * 15);
            this.currentBlobUrl = createSyntheticWavBlobUrl(track.duration || 3.5, toneFreq);
            this.audio.src = this.currentBlobUrl;
            this.audio.load();
            audioLoaded = true;
        }

        this.renderPlaylist();

        if (autoPlay && audioLoaded) {
            this.ensureAudioContext();
            this.play();
        } else {
            this.setPlayState(false);
            this.resetWaveform();
            if (this.progressFill) this.progressFill.style.width = '0%';
            if (this.currentTimeEl) this.currentTimeEl.textContent = '00:00';
        }
    }

    renderPlaylist() {
        if (!this.playlistWrap) return;
        this.playlistWrap.innerHTML = '';

        this.config.list.forEach((item, idx) => {
            const row = document.createElement('div');
            row.className = `vl-item-row ${idx === this.currentIndex ? 'active' : ''}`;
            row.setAttribute('role', 'button');
            row.setAttribute('tabindex', '0');
            row.setAttribute('aria-label', `Chọn ${item.title}`);

            const numStr = String(idx + 1).padStart(2, '0');
            const durStr = item.duration ? this.formatTime(item.duration) : '--:--';

            row.innerHTML = `
                <div class="vl-item-left">
                    <span class="vl-item-num">${numStr}.</span>
                    <span class="vl-item-title">${item.title || 'Voiceline'}</span>
                </div>
                <span class="vl-item-dur">${durStr}</span>
            `;

            row.addEventListener('click', () => {
                this.ensureAudioContext();
                this.selectTrack(idx, true);
            });

            row.addEventListener('keydown', (e) => {
                if (e.code === 'Enter' || e.code === 'Space') {
                    e.preventDefault();
                    this.ensureAudioContext();
                    this.selectTrack(idx, true);
                }
            });

            this.playlistWrap.appendChild(row);
        });
    }

    // ==========================================================================
    // 6. PHÁT, DỪNG VÀ ĐIỀU KHIỂN ÂM LƯỢNG (DUCKING)
    // ==========================================================================
    togglePlay() {
        if (this.isPlaying) {
            this.pause();
        } else {
            this.play().catch(() => {});
        }
    }

    play() {
        if (!this.audio || !this.audio.src) return Promise.resolve(false);
        this.ensureAudioContext();

        return this.audio.play().then(() => {
            this.setPlayState(true);
            this.duckBackgroundMusic();
            this.startLoop();
            return true;
        }).catch(err => {
            console.warn('[Voiceline] Trình duyệt chặn tự động phát:', err);
            throw err;
        });
    }

    pause() {
        this.audio.pause();
        this.setPlayState(false);
        this.restoreBackgroundMusic();
        this.stopLoop();
    }

    onEnded() {
        this.stopLoop();

        // Tự động chạy tuần tự các voiceline có sẵn (chỉ chạy đến hết danh sách, không lặp lại)
        if (this.currentIndex < this.config.list.length - 1) {
            const nextIdx = this.currentIndex + 1;
            this.selectTrack(nextIdx, true);
        } else {
            // Đã chạy hết toàn bộ voiceline: Dừng lại, phục hồi nhạc nền và không lặp lại
            this.setPlayState(false);
            this.restoreBackgroundMusic();
            this.audio.currentTime = 0;
            this.updateSubtitle(0, this.config.list[this.currentIndex]?.subtitle || '');
            if (this.progressFill) this.progressFill.style.width = '0%';
            if (this.currentTimeEl) this.currentTimeEl.textContent = '00:00';
            this.resetWaveform();

            // Tự động thu nhỏ khung sau khi phát xong toàn bộ voiceline (đợi 1 giây để đọc nốt phụ đề)
            setTimeout(() => {
                this.setCollapsed(true);
            }, 1000);
        }
    }

    setPlayState(isPlaying) {
        this.isPlaying = isPlaying;
        if (this.hexPlayBtn) {
            this.hexPlayBtn.setAttribute('aria-pressed', isPlaying ? 'true' : 'false');
            this.hexPlayBtn.setAttribute('aria-label', isPlaying ? 'Tạm dừng voiceline' : 'Phát voiceline');
            this.hexPlayBtn.innerHTML = isPlaying
                ? `<svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14"></rect><rect x="14" y="5" width="4" height="14"></rect></svg>`
                : `<svg viewBox="0 0 24 24"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>`;
        }
    }

    // Giảm âm lượng nhạc nền xuống 25% trong 300ms
    duckBackgroundMusic() {
        if (window.musicPlayer && typeof window.musicPlayer.duckVolume === 'function') {
            window.musicPlayer.duckVolume(VOICELINE_CONFIG.DUCK_RATIO, VOICELINE_CONFIG.DUCK_TIME_MS);
        }
    }

    // Phục hồi âm lượng nhạc nền ban đầu trong 500ms
    restoreBackgroundMusic() {
        if (window.musicPlayer && typeof window.musicPlayer.restoreVolume === 'function') {
            window.musicPlayer.restoreVolume(VOICELINE_CONFIG.RESTORE_TIME_MS);
        }
    }

    // ==========================================================================
    // 7. VÒNG LẶP RENDER SÓNG ÂM THẬT & TIẾN ĐỘ (RAF)
    // ==========================================================================
    startLoop() {
        this.stopLoop();
        const step = () => {
            if (!this.isPlaying) return;
            this.renderFrame();
            this.rafId = requestAnimationFrame(step);
        };
        this.rafId = requestAnimationFrame(step);
    }

    stopLoop() {
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
    }

    renderFrame() {
        const current = this.audio.currentTime || 0;
        const dur = this.audio.duration || this.duration || 1;
        const progressRatio = Math.max(0, Math.min(1, current / dur));

        // 1. Cập nhật thanh tiến trình
        if (this.progressFill && !this.isDraggingProgress) {
            this.progressFill.style.width = `${progressRatio * 100}%`;
        }
        if (this.currentTimeEl) {
            this.currentTimeEl.textContent = this.formatTime(current);
        }

        // 2. Cập nhật phụ đề gõ chữ đồng bộ âm thanh
        const currentSubtitle = this.config.list[this.currentIndex]?.subtitle || '';
        this.updateSubtitle(progressRatio, currentSubtitle);

        // 3. Đọc dữ liệu phổ âm từ AnalyserNode
        let hasFreq = false;
        if (this.analyser && this.freqDataArray) {
            this.analyser.getByteFrequencyData(this.freqDataArray);
            hasFreq = true;
        }

        const playedIndex = Math.floor(progressRatio * VOICELINE_CONFIG.BAR_COUNT);

        // Ánh xạ 56 thanh sóng âm
        for (let i = 0; i < VOICELINE_CONFIG.BAR_COUNT; i++) {
            const bar = this.waveBars[i];
            if (!bar) continue;

            let h = 3;
            if (hasFreq) {
                // Ánh xạ 56 bars từ frequency bins
                const val = this.freqDataArray[i] || 0;
                h = Math.max(3, Math.min(VOICELINE_CONFIG.MAX_BAR_HEIGHT, (val / 255) * VOICELINE_CONFIG.MAX_BAR_HEIGHT));
            } else {
                // Mô phỏng sóng tự nhiên nếu không có AudioContext
                const wave = Math.sin(Date.now() * 0.008 + i * 0.3) * 0.5 + 0.5;
                h = Math.max(3, wave * 28);
            }

            bar.style.height = `${h}px`;

            // Phần đã phát sáng #9bb0ff, chưa phát #3d5cff
            if (i <= playedIndex) {
                bar.classList.add('played');
            } else {
                bar.classList.remove('played');
            }
        }
    }

    resetWaveform() {
        for (let i = 0; i < this.waveBars.length; i++) {
            const bar = this.waveBars[i];
            if (bar) {
                bar.style.height = '3px';
                bar.classList.remove('played');
            }
        }
    }

    // ==========================================================================
    // 8. ĐỒNG BỘ PHỤ ĐỀ (TYPEWRITER SYNC)
    // ==========================================================================
    updateSubtitle(ratio, fullText) {
        if (!this.subtitleTextEl) return;
        if (!fullText) {
            this.subtitleTextEl.textContent = '...';
            return;
        }

        const charCount = Math.floor(ratio * fullText.length);
        const visibleStr = fullText.slice(0, Math.max(0, charCount));
        this.subtitleTextEl.textContent = visibleStr;
    }

    // ==========================================================================
    // 9. TUA TIẾN TRÌNH & PHÍM TẮT
    // ==========================================================================
    seekFromEvent(e) {
        if (!this.progressBar) return;
        const rect = this.progressBar.getBoundingClientRect();
        const clientX = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
        const clickX = Math.max(0, Math.min(rect.width, clientX - rect.left));
        const ratio = clickX / rect.width;

        if (this.progressFill) {
            this.progressFill.style.width = `${ratio * 100}%`;
        }

        const dur = this.audio.duration || this.duration || 0;
        if (dur > 0) {
            this.audio.currentTime = ratio * dur;
            if (this.currentTimeEl) {
                this.currentTimeEl.textContent = this.formatTime(this.audio.currentTime);
            }
        }
    }

    seekRelative(deltaSeconds) {
        const dur = this.audio.duration || this.duration || 0;
        if (dur <= 0) return;
        const target = Math.max(0, Math.min(dur, this.audio.currentTime + deltaSeconds));
        this.audio.currentTime = target;
        if (this.currentTimeEl) {
            this.currentTimeEl.textContent = this.formatTime(target);
        }
    }

    // ==========================================================================
    // 10. THU GỌN / MỞ RỘNG & BOOT EFFECT
    // ==========================================================================
    setCollapsed(isCollapsed) {
        if (isCollapsed) {
            if (this.containerCol) {
                this.containerCol.classList.add('collapsing');
                setTimeout(() => {
                    if (this.containerCol) {
                        this.containerCol.classList.add('hidden');
                        this.containerCol.classList.remove('collapsing');
                    }
                    if (this.togglePill) {
                        this.togglePill.classList.remove('hidden');
                        this.togglePill.classList.add('pulse-pill');
                        setTimeout(() => {
                            if (this.togglePill) this.togglePill.classList.remove('pulse-pill');
                        }, 1200);
                    }
                }, 280);
            }
            this.pause();
        } else {
            if (this.containerCol) {
                this.containerCol.classList.remove('hidden');
            }
            if (this.togglePill) {
                this.togglePill.classList.add('hidden');
            }
            this.triggerBootEffect();
        }
    }

    triggerBootEffect() {
        if (!this.containerCol) return;
        this.containerCol.classList.remove('booting');
        void this.containerCol.offsetWidth; // Trigger reflow
        this.containerCol.classList.add('booting');

        setTimeout(() => {
            if (this.containerCol) this.containerCol.classList.remove('booting');
        }, 500);
    }

    formatTime(seconds) {
        if (isNaN(seconds) || seconds < 0) return '00:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
}

// Khởi tạo global
window.VoicelineController = VoicelineController;
