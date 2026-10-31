/**
 * ==============================================================================
 * MUSIC-PLAYER.JS - Trình phát nhạc nền (Hỗ trợ Playlist & Spotify Embed)
 * ==============================================================================
 * Hỗ trợ:
 * 1. Chế độ Playlist nội bộ (File tải lên / có sẵn):
 *    - Hỗ trợ nhiều bài hát trong Playlist, chuyển bài Trước (⏮) / Kế tiếp (⏭).
 *    - Tự động chuyển sang bài tiếp theo khi bài hiện tại kết thúc (Auto-next).
 *    - Hộp danh sách phát (Playlist Popover) chọn bài trực tiếp.
 *    - Đồng bộ thời gian thực cho lời bài hát (Live Lyrics).
 * 2. Chế độ Spotify Playlist:
 *    - Nhúng trình phát Spotify chính thức qua URL Playlist / Track / Album.
 * 3. Hiệu ứng Pop-up & Tự động trượt ẩn sau 2 giây không hoạt động.
 */

class MusicPlayer {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.audio = new Audio();
        this.currentBlobUrl = null;
        this.isPlaying = false;
        this.duration = 0;

        // Cấu hình nguồn phát nhạc: 'local' hoặc 'spotify'
        this.sourceConfig = { type: 'local', spotifyUrl: '' };

        // Danh sách phát nội bộ
        this.playlist = [];
        this.currentTrackIndex = 0;

        // Tự động ẩn sau 2s
        this.autoHideTimer = null;
        this.autoHideDelay = 2000;
        this.isHovered = false;
        this.peekTab = null;

        // Quản lý âm lượng người dùng
        const savedVol = localStorage.getItem('profile_music_volume');
        this.userVolume = savedVol !== null ? parseFloat(savedVol) : 0.85;
        if (isNaN(this.userVolume) || this.userVolume < 0) this.userVolume = 0.85;
        if (this.userVolume > 1) this.userVolume = 1.0;
        this.previousVolume = this.userVolume > 0 ? this.userVolume : 0.85;
        this.audio.volume = this.userVolume;

        this.volumeWrap = null;
        this.volumeToggleBtn = null;
        this.volumeTrack = null;
        this.volumeFill = null;
        this.volumeHandle = null;
        this.volHighIcon = null;
        this.volLowIcon = null;
        this.volMuteIcon = null;
        this.isDraggingVolume = false;

        // Pop-up elements
        this.popupToast = null;
        this.toastTimeout = null;
        this.autoplayPromptModal = null;
        this.hasUserInteracted = false;

        // Các thành phần UI Local Player
        this.playBtn = null;
        this.prevBtn = null;
        this.nextBtn = null;
        this.playlistToggleBtn = null;
        this.playlistPopover = null;
        this.playlistBadge = null;
        this.titleEl = null;
        this.currentTimeEl = null;
        this.durationEl = null;
        this.progressBar = null;
        this.progressFill = null;

        if (this.container) {
            this.init();
        }
    }

    async init() {
        this.setupAutoHide();
        await this.loadAudioSource();

        // Lắng nghe thay đổi dữ liệu từ storage
        window.addEventListener('profile-data-updated', (e) => {
            if (e.detail) {
                if (e.detail.type === 'audio' || e.detail.type === 'song_name' || e.detail.type === 'audio_source') {
                    this.loadAudioSource();
                }
            }
        });

        window.addEventListener('storage', (e) => {
            if (e.key === 'profile_audio_source' || e.key === 'profile_song_name' || e.key === 'profile_sync_ping') {
                this.loadAudioSource();
            }
        });
    }

    // ==========================================================================
    // NẠP VÀ CHUYỂN ĐỔI NGUỒN PHÁT NHẠC (LOCAL PLAYLIST vs SPOTIFY)
    // ==========================================================================
    async loadAudioSource() {
        this.sourceConfig = window.ProfileStorage ? window.ProfileStorage.getAudioSourceConfig() : { type: 'local' };

        if (this.sourceConfig.type === 'spotify' && this.sourceConfig.spotifyUrl) {
            // Chế độ SPOTIFY
            this.pause();
            this.buildSpotifyUI();
        } else {
            // Chế độ LOCAL PLAYLIST
            await this.loadLocalPlaylist();
        }
    }

    // ==========================================================================
    // 1. GIAO DIỆN & HOẠT ĐỘNG SPOTIFY EMBED
    // ==========================================================================
    buildSpotifyUI() {
        const embedUrl = this.formatSpotifyEmbedUrl(this.sourceConfig.spotifyUrl);
        this.container.classList.remove('hidden');

        this.container.innerHTML = `
            <div class="spotify-embed-container">
                <iframe 
                    src="${embedUrl}" 
                    width="100%" 
                    height="80" 
                    frameBorder="0" 
                    allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" 
                    loading="lazy">
                </iframe>
            </div>
        `;

        this.ensurePeekTab('Spotify Playlist');
        this.showPlayer();
        this.showPopupToast('Spotify Playlist');

        // Báo hiệu play state cho soundwaves
        window.dispatchEvent(new CustomEvent('music-playstate', { detail: { isPlaying: true } }));
    }

    formatSpotifyEmbedUrl(url) {
        if (!url) return 'https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M?utm_source=generator&theme=0';
        
        // Dạng URI: spotify:playlist:xxx
        if (url.startsWith('spotify:')) {
            const parts = url.split(':');
            if (parts.length >= 3) {
                return `https://open.spotify.com/embed/${parts[1]}/${parts[2]}?utm_source=generator&theme=0`;
            }
        }

        // Dạng URL web: https://open.spotify.com/playlist/xxx
        const match = url.match(/open\.spotify\.com\/(playlist|track|album|artist)\/([a-zA-Z0-9]+)/);
        if (match) {
            return `https://open.spotify.com/embed/${match[1]}/${match[2]}?utm_source=generator&theme=0`;
        }

        if (url.includes('/embed/')) {
            return url.includes('theme=0') ? url : (url + (url.includes('?') ? '&theme=0' : '?theme=0'));
        }

        return `https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M?utm_source=generator&theme=0`;
    }

    // ==========================================================================
    // 2. GIAO DIỆN & HOẠT ĐỘNG LOCAL PLAYLIST
    // ==========================================================================
    async loadLocalPlaylist() {
        this.playlist = window.ProfileStorage ? await window.ProfileStorage.getPlaylistTracks() : [];

        if (!this.playlist || this.playlist.length === 0) {
            this.container.classList.add('hidden');
            if (this.peekTab) this.peekTab.classList.remove('visible');
            this.clearAutoHideTimer();
            this.pause();
            return;
        }

        this.buildLocalPlayerUI();
        this.setupAudioEvents();

        if (this.currentTrackIndex >= this.playlist.length) {
            this.currentTrackIndex = 0;
        }

        await this.loadTrack(this.currentTrackIndex, true);
    }

    buildLocalPlayerUI() {
        this.container.classList.remove('hidden');

        this.container.innerHTML = `
            <div class="player-inner">
                <div class="player-controls-group">
                    <button class="player-btn secondary-btn" aria-label="Bài trước" id="prevBtn" title="Bài trước (⏮)">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                            <polygon points="19 20 9 12 19 4 19 20"></polygon>
                            <line x1="5" y1="19" x2="5" y2="5" stroke="currentColor" stroke-width="2.5"></line>
                        </svg>
                    </button>

                    <button class="player-btn play-toggle" aria-label="Phát nhạc" id="playBtn" title="Phát / Tạm dừng">
                        <svg class="icon-play" viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                            <polygon points="5 3 19 12 5 21 5 3"></polygon>
                        </svg>
                        <svg class="icon-pause" viewBox="0 0 24 24" width="18" height="18" fill="currentColor" style="display:none;">
                            <rect x="6" y="4" width="4" height="16"></rect>
                            <rect x="14" y="4" width="4" height="16"></rect>
                        </svg>
                    </button>

                    <button class="player-btn secondary-btn" aria-label="Bài tiếp" id="nextBtn" title="Bài tiếp theo (⏭)">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                            <polygon points="5 4 15 12 5 20 5 4"></polygon>
                            <line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" stroke-width="2.5"></line>
                        </svg>
                    </button>
                </div>

                <div class="player-info">
                    <div class="player-title-row">
                        <span class="player-music-icon">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                            </svg>
                        </span>
                        <span class="player-song-title" id="playerSongTitle">Đang tải bài hát...</span>
                    </div>

                    <div class="player-progress-container" id="playerProgressContainer">
                        <div class="player-progress-bar" id="playerProgressBar">
                            <div class="player-progress-fill" id="playerProgressFill"></div>
                        </div>
                    </div>
                </div>

                <div class="player-time">
                    <span id="playerCurrentTime">00:00</span>
                    <span class="player-time-sep">/</span>
                    <span id="playerDuration">00:00</span>
                </div>

                <!-- NÚT ĐIỀU CHỈNH ÂM LƯỢNG (EXPANDABLE SLIDER) -->
                <div class="player-volume-wrap" id="playerVolumeWrap">
                    <button type="button" class="player-btn secondary-btn" aria-label="Âm lượng" id="volumeToggleBtn" title="Bật / Tắt tiếng (Mute)">
                        <svg class="vol-icon vol-high" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor"></polygon>
                            <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                            <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
                        </svg>
                        <svg class="vol-icon vol-low" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" style="display:none;">
                            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor"></polygon>
                            <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                        </svg>
                        <svg class="vol-icon vol-mute" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" style="display:none;">
                            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor"></polygon>
                            <line x1="23" y1="9" x2="17" y2="15"></line>
                            <line x1="17" y1="9" x2="23" y2="15"></line>
                        </svg>
                    </button>
                    <div class="player-volume-slider-box" id="volumeSliderBox">
                        <div class="player-volume-track" id="volumeTrack" role="slider" aria-label="Mức âm lượng" aria-valuemin="0" aria-valuemax="100" aria-valuenow="85">
                            <div class="player-volume-fill" id="volumeFill"></div>
                            <div class="player-volume-handle" id="volumeHandle"></div>
                        </div>
                    </div>
                </div>

                <div class="player-playlist-wrap" style="position: relative;">
                    <button class="player-btn secondary-btn" aria-label="Danh sách phát" id="playlistToggleBtn" title="Danh sách bài hát">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="8" y1="6" x2="21" y2="6"></line>
                            <line x1="8" y1="12" x2="21" y2="12"></line>
                            <line x1="8" y1="18" x2="21" y2="18"></line>
                            <line x1="3" y1="6" x2="3.01" y2="6"></line>
                            <line x1="3" y1="12" x2="3.01" y2="12"></line>
                            <line x1="3" y1="18" x2="3.01" y2="18"></line>
                        </svg>
                        <span class="playlist-count-badge" id="playlistBadge">${this.playlist.length}</span>
                    </button>

                    <!-- Popover hiển thị danh sách bài hát -->
                    <div class="playlist-popover" id="playlistPopover">
                        <div class="playlist-popover-header">
                            <span>DANH SÁCH BÀI HÁT (${this.playlist.length})</span>
                            <span class="close-popover-btn" id="closePlaylistPopoverBtn" title="Đóng">✕</span>
                        </div>
                        <div class="playlist-items-scroll" id="playlistItemsList"></div>
                    </div>
                </div>
            </div>
        `;

        this.playBtn = this.container.querySelector('#playBtn');
        this.prevBtn = this.container.querySelector('#prevBtn');
        this.nextBtn = this.container.querySelector('#nextBtn');
        this.playlistToggleBtn = this.container.querySelector('#playlistToggleBtn');
        this.playlistPopover = this.container.querySelector('#playlistPopover');
        this.playlistBadge = this.container.querySelector('#playlistBadge');

        this.iconPlay = this.container.querySelector('.icon-play');
        this.iconPause = this.container.querySelector('.icon-pause');
        this.titleEl = this.container.querySelector('#playerSongTitle');
        this.currentTimeEl = this.container.querySelector('#playerCurrentTime');
        this.durationEl = this.container.querySelector('#playerDuration');
        this.progressBar = this.container.querySelector('#playerProgressContainer');
        this.progressFill = this.container.querySelector('#playerProgressFill');

        this.ensurePeekTab('Phát nhạc');
        this.ensurePopupToast();
        this.ensureAutoplayModal();

        // Sự kiện điều khiển
        this.playBtn.addEventListener('click', () => {
            this.togglePlay();
            this.showPlayer();
        });

        this.prevBtn.addEventListener('click', () => {
            this.prevTrack();
            this.showPlayer();
        });

        this.nextBtn.addEventListener('click', () => {
            this.nextTrack();
            this.showPlayer();
        });

        this.playlistToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.togglePlaylistPopover();
            this.showPlayer();
        });

        const closeBtn = this.container.querySelector('#closePlaylistPopoverBtn');
        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.playlistPopover.classList.remove('open');
            });
        }

        document.addEventListener('click', (e) => {
            if (this.playlistPopover && this.playlistPopover.classList.contains('open')) {
                if (!this.playlistPopover.contains(e.target) && !this.playlistToggleBtn.contains(e.target)) {
                    this.playlistPopover.classList.remove('open');
                }
            }
        });

        this.progressBar.addEventListener('click', (e) => {
            this.seek(e);
            this.showPlayer();
        });

        this.renderPlaylistItems();
        this.setupVolumeEvents();
    }

    setupVolumeEvents() {
        this.volumeWrap = this.container.querySelector('#playerVolumeWrap');
        this.volumeToggleBtn = this.container.querySelector('#volumeToggleBtn');
        this.volumeTrack = this.container.querySelector('#volumeTrack');
        this.volumeFill = this.container.querySelector('#volumeFill');
        this.volumeHandle = this.container.querySelector('#volumeHandle');
        this.volHighIcon = this.container.querySelector('.vol-high');
        this.volLowIcon = this.container.querySelector('.vol-low');
        this.volMuteIcon = this.container.querySelector('.vol-mute');

        this.updateVolumeUI(this.userVolume);

        if (this.volumeToggleBtn) {
            this.volumeToggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.userVolume > 0) {
                    this.previousVolume = this.userVolume;
                    this.setVolume(0);
                } else {
                    this.setVolume(this.previousVolume > 0 ? this.previousVolume : 0.85);
                }
                this.showPlayer();
            });
        }

        if (this.volumeTrack) {
            const handleVolSeek = (e) => {
                const rect = this.volumeTrack.getBoundingClientRect();
                const clientX = e.touches ? e.touches[0].clientX : e.clientX;
                let ratio = (clientX - rect.left) / rect.width;
                ratio = Math.max(0, Math.min(1, ratio));
                this.setVolume(ratio);
                this.showPlayer();
            };

            this.volumeTrack.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                this.isDraggingVolume = true;
                if (this.volumeWrap) this.volumeWrap.classList.add('active');
                handleVolSeek(e);

                const onMove = (moveEvt) => {
                    if (this.isDraggingVolume) handleVolSeek(moveEvt);
                };
                const onUp = () => {
                    this.isDraggingVolume = false;
                    if (this.volumeWrap) this.volumeWrap.classList.remove('active');
                    window.removeEventListener('mousemove', onMove);
                    window.removeEventListener('mouseup', onUp);
                };
                window.addEventListener('mousemove', onMove);
                window.addEventListener('mouseup', onUp);
            });

            this.volumeTrack.addEventListener('touchstart', (e) => {
                e.stopPropagation();
                this.isDraggingVolume = true;
                if (this.volumeWrap) this.volumeWrap.classList.add('active');
                handleVolSeek(e);

                const onTouchMove = (moveEvt) => {
                    if (this.isDraggingVolume) handleVolSeek(moveEvt);
                };
                const onTouchEnd = () => {
                    this.isDraggingVolume = false;
                    if (this.volumeWrap) this.volumeWrap.classList.remove('active');
                    window.removeEventListener('touchmove', onTouchMove);
                    window.removeEventListener('touchend', onTouchEnd);
                };
                window.addEventListener('touchmove', onTouchMove, { passive: true });
                window.addEventListener('touchend', onTouchEnd);
            }, { passive: true });
        }
    }

    setVolume(val) {
        val = Math.max(0, Math.min(1, Math.round(val * 100) / 100));
        this.userVolume = val;
        if (val > 0) this.previousVolume = val;

        const effectiveVol = this._isDucked ? val * 0.25 : val;
        if (this.audio) {
            this.audio.volume = effectiveVol;
        }

        try {
            localStorage.setItem('profile_music_volume', String(val));
        } catch (e) {}

        this.updateVolumeUI(val);
    }

    updateVolumeUI(val) {
        const percent = Math.round(val * 100);
        if (this.volumeFill) this.volumeFill.style.width = `${percent}%`;
        if (this.volumeHandle) this.volumeHandle.style.left = `${percent}%`;
        if (this.volumeTrack) this.volumeTrack.setAttribute('aria-valuenow', percent);

        if (this.volHighIcon && this.volLowIcon && this.volMuteIcon) {
            if (val <= 0) {
                this.volHighIcon.style.display = 'none';
                this.volLowIcon.style.display = 'none';
                this.volMuteIcon.style.display = 'block';
            } else if (val < 0.5) {
                this.volHighIcon.style.display = 'none';
                this.volLowIcon.style.display = 'block';
                this.volMuteIcon.style.display = 'none';
            } else {
                this.volHighIcon.style.display = 'block';
                this.volLowIcon.style.display = 'none';
                this.volMuteIcon.style.display = 'none';
            }
        }
    }

    renderPlaylistItems() {
        const listEl = this.container.querySelector('#playlistItemsList');
        if (!listEl) return;
        listEl.innerHTML = '';

        this.playlist.forEach((item, idx) => {
            const row = document.createElement('div');
            row.className = `playlist-item ${idx === this.currentTrackIndex ? 'active' : ''}`;
            row.innerHTML = `
                <span class="playlist-item-num">${idx + 1}.</span>
                <span class="playlist-item-title">${item.title || item.fileName}</span>
                ${idx === this.currentTrackIndex ? '<span>🔊</span>' : ''}
            `;
            row.addEventListener('click', () => {
                this.loadTrack(idx, false);
                this.play();
                this.playlistPopover.classList.remove('open');
            });
            listEl.appendChild(row);
        });
    }

    togglePlaylistPopover() {
        if (!this.playlistPopover) return;
        this.playlistPopover.classList.toggle('open');
        this.renderPlaylistItems();
    }

    async loadTrack(index, isInitial = false) {
        if (!this.playlist || this.playlist.length === 0) return;
        this.currentTrackIndex = (index + this.playlist.length) % this.playlist.length;
        const track = this.playlist[this.currentTrackIndex];
        const trackId = track.id || track.key || (window.ProfileStorage ? window.ProfileStorage.getLyricsKeyForTitle(track.title || track.fileName) : `track_${this.currentTrackIndex}`);
        const title = track.title || track.fileName || `Bài ${this.currentTrackIndex + 1}`;

        // Chống lỗi đua: Hủy request cũ và xóa khung lyric bài trước ngay lập tức
        if (window.lyricsController) {
            window.lyricsController.prepareForNewTrack(trackId, title);
        }

        if (this.currentBlobUrl) {
            URL.revokeObjectURL(this.currentBlobUrl);
        }

        this.currentBlobUrl = URL.createObjectURL(track.blob);
        this.audio.src = this.currentBlobUrl;
        this.audio.load();

        if (this.titleEl) {
            this.titleEl.textContent = title;
            this.titleEl.title = title;
        }

        this.renderPlaylistItems();

        // Gắn audio.src và lyrics của cùng một bài trong cùng một hàm
        if (window.lyricsController) {
            window.lyricsController.loadLyricsForTrack(trackId, title);
        }

        // Báo hiệu đổi bài hát để các thành phần khác đồng bộ
        window.dispatchEvent(new CustomEvent('music-trackchanged', {
            detail: {
                track: track,
                trackId: trackId,
                index: this.currentTrackIndex,
                title: title
            }
        }));

        if (isInitial) {
            this.showPlayer();
            this.tryAutoplay(title);
        }
    }

    prevTrack() {
        this.loadTrack(this.currentTrackIndex - 1);
        this.play();
    }

    nextTrack() {
        this.loadTrack(this.currentTrackIndex + 1);
        this.play();
    }

    // ==========================================================================
    // CÁC THÀNH PHẦN HỖ TRỢ (PEEK TAB, POP-UP TOAST, AUTOPLAY MODAL)
    // ==========================================================================
    ensurePeekTab(defaultText) {
        if (this.peekTab) return;
        this.peekTab = document.createElement('div');
        this.peekTab.className = 'player-peek-tab';
        this.peekTab.id = 'playerPeekTab';
        this.peekTab.title = 'Mở thanh phát nhạc';
        this.peekTab.innerHTML = `
            <span class="peek-icon">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                    <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                </svg>
            </span>
            <span class="peek-text">${defaultText || 'Phát nhạc'}</span>
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="18 15 12 9 6 15"></polyline>
            </svg>
        `;
        if (this.container.parentNode) {
            this.container.parentNode.appendChild(this.peekTab);
        } else {
            document.body.appendChild(this.peekTab);
        }

        this.peekTab.addEventListener('click', () => this.showPlayer());
        this.peekTab.addEventListener('mouseenter', () => this.showPlayer());
    }

    ensurePopupToast() {
        if (this.popupToast) return;
        this.popupToast = document.createElement('div');
        this.popupToast.className = 'music-popup-toast';
        this.popupToast.id = 'musicPopupToast';
        this.popupToast.innerHTML = `
            <span class="toast-icon">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                    <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                </svg>
            </span>
            <span class="toast-text" id="musicToastText">Đang phát nhạc</span>
        `;
        document.body.appendChild(this.popupToast);
    }

    ensureAutoplayModal() {
        if (this.autoplayPromptModal) return;
        this.autoplayPromptModal = document.createElement('div');
        this.autoplayPromptModal.className = 'autoplay-prompt-modal';
        this.autoplayPromptModal.id = 'autoplayPromptModal';
        this.autoplayPromptModal.innerHTML = `
            <div class="autoplay-prompt-card">
                <div class="autoplay-prompt-icon">
                    <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
                        <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                    </svg>
                </div>
                <div class="autoplay-prompt-title">Trang có phát nhạc nền</div>
                <div class="autoplay-prompt-desc">Nhấn vào bất kỳ đâu để bật âm thanh và vào trang</div>
                <button class="autoplay-prompt-btn" type="button">Bắt đầu nghe nhạc</button>
            </div>
        `;
        document.body.appendChild(this.autoplayPromptModal);

        this.autoplayPromptModal.addEventListener('click', () => {
            this.dismissAutoplayPromptAndPlay();
        });
    }

    // ==========================================================================
    // CƠ CHẾ TỰ ĐỘNG ẨN SAU 2 GIÂY (AUTO-HIDE)
    // ==========================================================================
    setupAutoHide() {
        this.container.addEventListener('mouseenter', () => {
            this.isHovered = true;
            this.clearAutoHideTimer();
        });

        this.container.addEventListener('mouseleave', () => {
            this.isHovered = false;
            this.startAutoHideTimer();
        });

        const onActivity = () => {
            this.showPlayer();
        };

        let throttle = false;
        const throttledActivity = () => {
            if (throttle) return;
            throttle = true;
            setTimeout(() => { throttle = false; }, 80);
            onActivity();
        };

        window.addEventListener('mousemove', throttledActivity, { passive: true });
        window.addEventListener('touchstart', throttledActivity, { passive: true });
        window.addEventListener('keydown', throttledActivity, { passive: true });

        const unlockAudioOnFirstGesture = () => {
            if (!this.hasUserInteracted) {
                this.hasUserInteracted = true;
                if (!this.isPlaying && this.audio.src) {
                    this.play();
                }
                // Đồng thời kích hoạt Voiceline nếu đang chờ tương tác đầu tiên
                if (window.voicelineController && !window.voicelineController.isPlaying) {
                    window.voicelineController.ensureAudioContext();
                    if (window.voicelineController.audioCtx && window.voicelineController.audioCtx.state === 'suspended') {
                        window.voicelineController.audioCtx.resume();
                    }
                    window.voicelineController.play().catch(() => {});
                }
            }
        };

        const gestureEvents = ['click', 'pointerdown', 'mousedown', 'touchstart', 'keydown'];
        const onGesture = () => {
            unlockAudioOnFirstGesture();
            gestureEvents.forEach(evt => window.removeEventListener(evt, onGesture, { capture: true }));
        };
        gestureEvents.forEach(evt => window.addEventListener(evt, onGesture, { capture: true, passive: true }));
    }

    startAutoHideTimer() {
        this.clearAutoHideTimer();
        if (this.container.classList.contains('hidden') || this.isHovered) return;

        this.autoHideTimer = setTimeout(() => {
            this.hidePlayer();
        }, this.autoHideDelay);
    }

    clearAutoHideTimer() {
        if (this.autoHideTimer) {
            clearTimeout(this.autoHideTimer);
            this.autoHideTimer = null;
        }
    }

    showPlayer() {
        if (this.container.classList.contains('hidden')) return;

        if (this.container.classList.contains('auto-hidden')) {
            this.container.classList.remove('auto-hidden');
        }
        if (this.peekTab) {
            this.peekTab.classList.remove('visible');
        }

        this.startAutoHideTimer();
    }

    hidePlayer() {
        if (this.isHovered || this.container.classList.contains('hidden')) return;

        // Nếu playlist popover đang mở thì không ẩn
        if (this.playlistPopover && this.playlistPopover.classList.contains('open')) return;

        this.container.classList.add('auto-hidden');
        if (this.peekTab) {
            this.peekTab.classList.add('visible');
        }
    }

    showPopupToast(title) {
        this.ensurePopupToast();
        const textEl = this.popupToast.querySelector('#musicToastText');
        if (textEl) {
            textEl.textContent = `Đang phát: ${title}`;
        }
        this.popupToast.classList.add('show');

        if (this.toastTimeout) clearTimeout(this.toastTimeout);
        this.toastTimeout = setTimeout(() => {
            this.popupToast.classList.remove('show');
        }, 2500);
    }

    showAutoplayPrompt() {
        this.ensureAutoplayModal();
        if (this.autoplayPromptModal) {
            this.autoplayPromptModal.classList.add('show');
        }
    }

    dismissAutoplayPromptAndPlay() {
        if (this.autoplayPromptModal) {
            this.autoplayPromptModal.classList.remove('show');
        }
        this.play();
        this.showPlayer();

        // Đồng thời khởi chạy Voiceline mở đầu nếu chưa phát
        if (window.voicelineController && !window.voicelineController.isPlaying) {
            window.voicelineController.ensureAudioContext();
            if (window.voicelineController.audioCtx && window.voicelineController.audioCtx.state === 'suspended') {
                window.voicelineController.audioCtx.resume();
            }
            window.voicelineController.play().catch(() => {});
        }
    }

    tryAutoplay(displayTitle) {
        if (!this.audio.src) return;

        this.container.classList.remove('pop-up-entry');
        void this.container.offsetWidth;
        this.container.classList.add('pop-up-entry');
        setTimeout(() => {
            this.container.classList.remove('pop-up-entry');
        }, 800);

        const playPromise = this.audio.play();
        if (playPromise !== undefined) {
            playPromise.then(() => {
                this.isPlaying = true;
                this.hasUserInteracted = true;
                this.updatePlayStateUI();
                this.showPopupToast(displayTitle);
                this.startAutoHideTimer();
            }).catch((err) => {
                console.log('Trình duyệt yêu cầu tương tác để phát nhạc:', err);
                // Nếu đang có màn hình bìa Cover Screen thì không hiện popup modal nhỏ
                const cover = document.getElementById('coverScreen');
                if (!cover || cover.style.display === 'none' || cover.classList.contains('hidden')) {
                    this.showAutoplayPrompt();
                }
            });
        }
    }

    startTickLoop() {
        if (this._tickRafId) cancelAnimationFrame(this._tickRafId);
        const tick = () => {
            if (!this.isPlaying || !this.audio || this.audio.paused) {
                this._tickRafId = null;
                return;
            }
            const current = this.audio.currentTime;
            const dur = this.audio.duration || this.duration || 0;
            if (dur > 0) {
                if (this.currentTimeEl) {
                    this.currentTimeEl.textContent = this.formatTime(current);
                }
                const percent = (current / dur) * 100;
                if (this.progressFill) {
                    this.progressFill.style.width = `${percent}%`;
                }
                window.dispatchEvent(new CustomEvent('music-timeupdate', {
                    detail: { currentTime: current, duration: dur, isPlaying: true }
                }));
            }
            this._tickRafId = requestAnimationFrame(tick);
        };
        this._tickRafId = requestAnimationFrame(tick);
    }

    stopTickLoop() {
        if (this._tickRafId) {
            cancelAnimationFrame(this._tickRafId);
            this._tickRafId = null;
        }
    }

    setupAudioEvents() {
        if (this._audioEventsBound) return;
        this._audioEventsBound = true;

        this.audio.addEventListener('loadedmetadata', () => {
            this.duration = this.audio.duration;
            if (this.durationEl) {
                this.durationEl.textContent = this.formatTime(this.duration);
            }
            if (window.lyricsController) {
                window.lyricsController.updateTimeImmediately();
            }
        });

        this.audio.addEventListener('timeupdate', () => {
            if (!this.duration) return;
            const current = this.audio.currentTime;
            if (this.currentTimeEl) {
                this.currentTimeEl.textContent = this.formatTime(current);
            }
            const percent = (current / this.duration) * 100;
            if (this.progressFill) {
                this.progressFill.style.width = `${percent}%`;
            }

            window.dispatchEvent(new CustomEvent('music-timeupdate', {
                detail: { currentTime: current, duration: this.duration, isPlaying: this.isPlaying }
            }));
        });

        this.audio.addEventListener('ended', () => {
            this.stopTickLoop();
            if (window.lyricsController) {
                window.lyricsController.onEnded();
            }

            // Tự động chuyển bài kế tiếp khi hết bài (Auto-next)
            if (this.playlist.length > 1) {
                this.nextTrack();
            } else {
                this.isPlaying = false;
                this.updatePlayStateUI();
                if (this.progressFill) this.progressFill.style.width = '0%';
                if (this.currentTimeEl) this.currentTimeEl.textContent = '00:00';
                this.showPlayer();
            }
        });

        this.audio.addEventListener('play', () => {
            this.isPlaying = true;
            this.updatePlayStateUI();
            this.startTickLoop();
        });

        this.audio.addEventListener('pause', () => {
            this.isPlaying = false;
            this.updatePlayStateUI();
            this.stopTickLoop();
        });
    }

    togglePlay() {
        if (!this.audio.src) return;
        if (this.isPlaying) {
            this.pause();
        } else {
            this.play();
        }
    }

    play() {
        if (this._isDucked) {
            this.audio.volume = Math.max(0, Math.min(1, (this.userVolume !== undefined ? this.userVolume : 1.0) * 0.25));
        } else {
            this.audio.volume = this.userVolume !== undefined ? this.userVolume : 1.0;
        }
        this.audio.play().then(() => {
            this.isPlaying = true;
            this.updatePlayStateUI();
            this.startTickLoop();
            if (this.autoplayPromptModal) {
                this.autoplayPromptModal.classList.remove('show');
            }
            if (this.titleEl) {
                this.showPopupToast(this.titleEl.textContent);
            }
        }).catch(err => {
            console.warn('Không thể phát nhạc:', err);
        });
    }

    // ==========================================================================
    // PHỐI HỢP ÂM LƯỢNG VỚI VOICELINE (DUCKING)
    // ==========================================================================
    duckVolume(targetRatio = 0.25, durationMs = 300) {
        if (!this.audio) return;
        this._isDucked = true;
        const baseVol = this.userVolume !== undefined ? this.userVolume : (this.audio.volume || 1.0);
        const targetVol = Math.max(0, Math.min(1, baseVol * targetRatio));
        this._fadeVolume(targetVol, durationMs);
    }

    restoreVolume(durationMs = 500) {
        if (!this.audio) return;
        if (!this._isDucked) return;
        this._isDucked = false;
        const targetVol = this.userVolume !== undefined ? this.userVolume : 1.0;
        this._fadeVolume(targetVol, durationMs);
    }

    _fadeVolume(targetVol, durationMs) {
        if (this._fadeInterval) {
            clearInterval(this._fadeInterval);
            this._fadeInterval = null;
        }
        const startVol = this.audio.volume;
        const startTime = performance.now();
        const duration = Math.max(20, durationMs);

        this._fadeInterval = setInterval(() => {
            const elapsed = performance.now() - startTime;
            const progress = Math.min(1, elapsed / duration);
            this.audio.volume = startVol + (targetVol - startVol) * progress;
            if (progress >= 1) {
                clearInterval(this._fadeInterval);
                this._fadeInterval = null;
            }
        }, 20);
    }

    pause() {
        this.audio.pause();
        this.isPlaying = false;
        this.stopTickLoop();
        this.updatePlayStateUI();
    }

    seek(e) {
        if (!this.duration) return;
        const rect = this.progressBar.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const width = rect.width;
        const ratio = Math.max(0, Math.min(1, clickX / width));
        this.audio.currentTime = ratio * this.duration;
        if (window.lyricsController) {
            window.lyricsController.updateTimeImmediately();
        }
        window.dispatchEvent(new CustomEvent('music-timeupdate', {
            detail: { currentTime: this.audio.currentTime, duration: this.duration, isPlaying: this.isPlaying }
        }));
    }

    updatePlayStateUI() {
        if (this.iconPlay && this.iconPause) {
            if (this.isPlaying) {
                this.iconPlay.style.display = 'none';
                this.iconPause.style.display = 'block';
                this.container.classList.add('is-playing');
            } else {
                this.iconPlay.style.display = 'block';
                this.iconPause.style.display = 'none';
                this.container.classList.remove('is-playing');
            }
        }

        window.dispatchEvent(new CustomEvent('music-playstate', {
            detail: { isPlaying: this.isPlaying }
        }));
    }

    formatTime(seconds) {
        if (isNaN(seconds) || seconds < 0) return '00:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
}

window.MusicPlayer = MusicPlayer;
