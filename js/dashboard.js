/**
 * ==============================================================================
 * DASHBOARD.JS - Xử lý logic Quản trị Liên kết, Nhạc nền & Discord ID
 * ==============================================================================
 */

document.addEventListener('DOMContentLoaded', async () => {
    // -------------------------------------------------------------------------
    // 1. QUẢN LÝ LIÊN KẾT (THÊM, SỬA, XÓA)
    // -------------------------------------------------------------------------
    const linksListEl = document.getElementById('dashboardLinksList');
    const emptyLinksNotice = document.getElementById('emptyLinksNotice');
    const addLinkBtn = document.getElementById('addLinkBtn');
    
    // Modal elements
    const linkModal = document.getElementById('linkModal');
    const modalTitle = document.getElementById('modalTitle');
    const linkForm = document.getElementById('linkForm');
    const linkIdInput = document.getElementById('linkIdInput');
    const linkTitleInput = document.getElementById('linkTitleInput');
    const linkUrlInput = document.getElementById('linkUrlInput');
    const iconGrid = document.getElementById('iconGrid');
    const customIconUpload = document.getElementById('customIconUpload');
    const customIconPreview = document.getElementById('customIconPreview');
    const cancelModalBtn = document.getElementById('cancelModalBtn');

    let currentSelectedIcon = 'facebook';
    let currentCustomIconBase64 = null;

    // Render danh sách icon có sẵn trong modal
    function renderIconGrid() {
        iconGrid.innerHTML = '';
        window.SOCIAL_ICON_PRESETS.forEach(preset => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `icon-choice-btn ${preset.id === currentSelectedIcon && !currentCustomIconBase64 ? 'selected' : ''}`;
            btn.title = preset.label;
            btn.innerHTML = `<img src="${preset.file}" alt="${preset.label}">`;
            btn.addEventListener('click', () => {
                currentSelectedIcon = preset.id;
                currentCustomIconBase64 = null;
                customIconPreview.style.display = 'none';
                customIconUpload.value = '';
                renderIconGrid();
            });
            iconGrid.appendChild(btn);
        });
    }

    // Xử lý upload ảnh icon tuỳ chọn
    customIconUpload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            alert('Vui lòng chọn một file hình ảnh (PNG, SVG, JPG)!');
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            currentCustomIconBase64 = event.target.result;
            currentSelectedIcon = 'custom';
            customIconPreview.src = currentCustomIconBase64;
            customIconPreview.style.display = 'block';
            renderIconGrid();
        };
        reader.readAsDataURL(file);
    });

    // Mở modal thêm liên kết
    addLinkBtn.addEventListener('click', () => {
        modalTitle.textContent = 'Thêm Liên Kết Mới';
        linkIdInput.value = '';
        linkTitleInput.value = '';
        linkUrlInput.value = '';
        currentSelectedIcon = 'facebook';
        currentCustomIconBase64 = null;
        customIconPreview.style.display = 'none';
        customIconUpload.value = '';
        renderIconGrid();
        linkModal.classList.add('active');
    });

    // Đóng modal
    cancelModalBtn.addEventListener('click', () => {
        linkModal.classList.remove('active');
    });
    linkModal.addEventListener('click', (e) => {
        if (e.target === linkModal) {
            linkModal.classList.remove('active');
        }
    });

    // Lưu liên kết (Thêm mới hoặc Cập nhật)
    linkForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const id = linkIdInput.value.trim();
        const title = linkTitleInput.value.trim();
        let url = linkUrlInput.value.trim();

        if (!url) {
            alert('Vui lòng nhập địa chỉ liên kết (URL)!');
            return;
        }

        // Tự động thêm https:// nếu người dùng quên nhập
        if (!/^https?:\/\//i.test(url)) {
            url = 'https://' + url;
        }

        try {
            new URL(url);
        } catch (_) {
            alert('Địa chỉ URL không hợp lệ! Vui lòng kiểm tra lại.');
            return;
        }

        const links = window.ProfileStorage.getStoredLinks();

        if (id) {
            // Sửa liên kết đã có
            const index = links.findIndex(l => l.id === id);
            if (index !== -1) {
                links[index].title = title;
                links[index].url = url;
                links[index].icon = currentSelectedIcon;
                links[index].customIcon = currentCustomIconBase64;
            }
        } else {
            // Thêm liên kết mới
            const newLink = {
                id: 'link_' + Date.now(),
                title: title,
                url: url,
                icon: currentSelectedIcon,
                customIcon: currentCustomIconBase64
            };
            links.push(newLink);
        }

        window.ProfileStorage.saveStoredLinks(links);
        renderLinksList();
        linkModal.classList.remove('active');
    });

    // Di chuyển vị trí liên kết (Sắp xếp Lên / Xuống / Kéo thả)
    let draggedItemIndex = null;

    function moveLink(fromIndex, toIndex) {
        const links = window.ProfileStorage.getStoredLinks();
        if (!links || fromIndex < 0 || fromIndex >= links.length || toIndex < 0 || toIndex >= links.length || fromIndex === toIndex) return;
        const [moved] = links.splice(fromIndex, 1);
        links.splice(toIndex, 0, moved);
        window.ProfileStorage.saveStoredLinks(links);
        renderLinksList();
    }

    // Render danh sách liên kết trong Dashboard
    function renderLinksList() {
        const links = window.ProfileStorage.getStoredLinks();
        linksListEl.innerHTML = '';

        if (!links || links.length === 0) {
            emptyLinksNotice.style.display = 'block';
            return;
        }

        emptyLinksNotice.style.display = 'none';

        links.forEach((link, index) => {
            const item = document.createElement('div');
            item.className = 'link-manage-item';
            item.draggable = true;
            item.dataset.index = index;

            const iconSrc = window.getIconSrc(link);
            const displayTitle = link.title && link.title.trim() 
                ? escapeHtml(link.title) 
                : `<span style="color:var(--primary-light);font-style:italic;">(Chỉ hiển thị icon)</span>`;

            item.innerHTML = `
                <div class="link-manage-left">
                    <div class="drag-handle" title="Kéo thả để sắp xếp vị trí" aria-label="Kéo thả sắp xếp">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                            <circle cx="9" cy="6" r="1.5"></circle>
                            <circle cx="15" cy="6" r="1.5"></circle>
                            <circle cx="9" cy="12" r="1.5"></circle>
                            <circle cx="15" cy="12" r="1.5"></circle>
                            <circle cx="9" cy="18" r="1.5"></circle>
                            <circle cx="15" cy="18" r="1.5"></circle>
                        </svg>
                    </div>
                    <div class="link-manage-icon">
                        <img src="${iconSrc}" alt="${link.title || 'Icon'}">
                    </div>
                    <div class="link-manage-info">
                        <span class="link-manage-title">${displayTitle}</span>
                        <a href="${link.url}" target="_blank" rel="noopener noreferrer" class="link-manage-url">${escapeHtml(link.url)}</a>
                    </div>
                </div>
                <div class="link-manage-actions">
                    <button type="button" class="icon-btn move-up" title="Di chuyển lên" ${index === 0 ? 'disabled' : ''}>
                        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5">
                            <polyline points="18 15 12 9 6 15"></polyline>
                        </svg>
                    </button>
                    <button type="button" class="icon-btn move-down" title="Di chuyển xuống" ${index === links.length - 1 ? 'disabled' : ''}>
                        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5">
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                    </button>
                    <button type="button" class="icon-btn edit" title="Chỉnh sửa liên kết">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                    </button>
                    <button type="button" class="icon-btn delete" title="Xóa liên kết">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                </div>
            `;

            // Nút di chuyển lên / xuống
            const moveUpBtn = item.querySelector('.move-up');
            if (moveUpBtn && index > 0) {
                moveUpBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    moveLink(index, index - 1);
                });
            }

            const moveDownBtn = item.querySelector('.move-down');
            if (moveDownBtn && index < links.length - 1) {
                moveDownBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    moveLink(index, index + 1);
                });
            }

            // Kéo thả sắp xếp (Drag & Drop)
            item.addEventListener('dragstart', (e) => {
                draggedItemIndex = index;
                item.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', String(index));
            });

            item.addEventListener('dragend', () => {
                item.classList.remove('dragging');
                document.querySelectorAll('.link-manage-item').forEach(el => el.classList.remove('drag-over-top', 'drag-over-bottom'));
            });

            item.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (draggedItemIndex === null || draggedItemIndex === index) return;

                const rect = item.getBoundingClientRect();
                const midY = rect.top + rect.height / 2;
                if (e.clientY < midY) {
                    item.classList.add('drag-over-top');
                    item.classList.remove('drag-over-bottom');
                } else {
                    item.classList.add('drag-over-bottom');
                    item.classList.remove('drag-over-top');
                }
            });

            item.addEventListener('dragleave', () => {
                item.classList.remove('drag-over-top', 'drag-over-bottom');
            });

            item.addEventListener('drop', (e) => {
                e.preventDefault();
                item.classList.remove('drag-over-top', 'drag-over-bottom');
                if (draggedItemIndex === null || draggedItemIndex === index) return;

                const rect = item.getBoundingClientRect();
                const midY = rect.top + rect.height / 2;
                let targetIndex = index;
                if (e.clientY >= midY && draggedItemIndex < index) {
                    targetIndex = index;
                } else if (e.clientY < midY && draggedItemIndex > index) {
                    targetIndex = index;
                }
                moveLink(draggedItemIndex, targetIndex);
                draggedItemIndex = null;
            });

            // Bấm Sửa
            item.querySelector('.edit').addEventListener('click', () => {
                modalTitle.textContent = 'Chỉnh Sửa Liên Kết';
                linkIdInput.value = link.id;
                linkTitleInput.value = link.title;
                linkUrlInput.value = link.url;
                currentSelectedIcon = link.icon || 'facebook';
                currentCustomIconBase64 = link.customIcon || null;

                if (currentCustomIconBase64) {
                    customIconPreview.src = currentCustomIconBase64;
                    customIconPreview.style.display = 'block';
                } else {
                    customIconPreview.style.display = 'none';
                }
                customIconUpload.value = '';
                renderIconGrid();
                linkModal.classList.add('active');
            });

            // Bấm Xóa
            item.querySelector('.delete').addEventListener('click', () => {
                if (confirm(`Bạn có chắc muốn xóa liên kết "${link.title || link.url}"?`)) {
                    const currentLinks = window.ProfileStorage.getStoredLinks();
                    const filtered = currentLinks.filter(l => l.id !== link.id);
                    window.ProfileStorage.saveStoredLinks(filtered);
                    renderLinksList();
                }
            });

            linksListEl.appendChild(item);
        });
    }

    renderLinksList();

    // -------------------------------------------------------------------------
    // 2. TÙY CHỌN BACKGROUND (VIDEO YOUTUBE / MP4 LOCAL / ẢNH NỀN / GRADIENT)
    // -------------------------------------------------------------------------
    const bgTypeSelect = document.getElementById('bgTypeSelect');
    const bgYoutubeBox = document.getElementById('bgYoutubeBox');
    const bgYoutubeInput = document.getElementById('bgYoutubeInput');
    const saveBgYoutubeBtn = document.getElementById('saveBgYoutubeBtn');
    const bgVideoFileBox = document.getElementById('bgVideoFileBox');
    const bgVideoFileInput = document.getElementById('bgVideoFileInput');
    const bgVideoFileStatus = document.getElementById('bgVideoFileStatus');
    const bgImageBox = document.getElementById('bgImageBox');
    const bgImageFileInput = document.getElementById('bgImageFileInput');
    const bgImageStatus = document.getElementById('bgImageStatus');

    let currentBgConfig = window.ProfileStorage.getStoredBackgroundConfig();
    if (bgTypeSelect) {
        bgTypeSelect.value = currentBgConfig.type || 'youtube';
        bgYoutubeInput.value = currentBgConfig.youtubeId || 'LUd14Xdfk68';

        function updateBgUI() {
            const type = bgTypeSelect.value;
            bgYoutubeBox.style.display = type === 'youtube' ? 'block' : 'none';
            bgVideoFileBox.style.display = type === 'mp4_file' ? 'block' : 'none';
            bgImageBox.style.display = type === 'image' ? 'block' : 'none';
        }

        async function checkCurrentMediaFiles() {
            const video = await window.ProfileStorage.getBackgroundVideoFile();
            if (video) {
                bgVideoFileStatus.textContent = `✓ Đã lưu video tùy biến: ${video.fileName} (${(video.blob.size/(1024*1024)).toFixed(1)} MB)`;
            } else {
                bgVideoFileStatus.textContent = '✓ Đang sử dụng video hoạt họa gốc: assets/background.mp4 (4K Omen Wallpaper)';
            }

            const img = await window.ProfileStorage.getBackgroundImageFile();
            if (img) {
                bgImageStatus.textContent = `✓ Đã lưu ảnh: ${img.fileName} (${(img.blob.size/(1024*1024)).toFixed(1)} MB)`;
            } else {
                bgImageStatus.textContent = 'Chưa có file ảnh nào được tải lên.';
            }
        }

        updateBgUI();
        await checkCurrentMediaFiles();

        bgTypeSelect.addEventListener('change', () => {
            currentBgConfig.type = bgTypeSelect.value;
            window.ProfileStorage.saveStoredBackgroundConfig(currentBgConfig);
            updateBgUI();
        });

        saveBgYoutubeBtn.addEventListener('click', () => {
            let val = bgYoutubeInput.value.trim();
            if (!val) {
                alert('Vui lòng nhập link hoặc Video ID YouTube!');
                return;
            }
            currentBgConfig.youtubeId = val;
            currentBgConfig.type = 'youtube';
            bgTypeSelect.value = 'youtube';
            window.ProfileStorage.saveStoredBackgroundConfig(currentBgConfig);
            updateBgUI();
            alert('Đã lưu cấu hình video YouTube thành công!');
        });

        bgVideoFileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            bgVideoFileStatus.textContent = 'Đang lưu video vào IndexedDB...';
            try {
                await window.ProfileStorage.saveBackgroundVideoFile(file, file.name);
                currentBgConfig.type = 'mp4_file';
                bgTypeSelect.value = 'mp4_file';
                window.ProfileStorage.saveStoredBackgroundConfig(currentBgConfig);
                await checkCurrentMediaFiles();
                alert('Đã tải lên và lưu file video MP4 nền thành công vào IndexedDB! Trang chính sẽ phát video này mượt mà 100% không bao giờ gặp lỗi.');
            } catch (err) {
                console.error(err);
                alert('Lỗi khi lưu video vào IndexedDB.');
            }
        });

        bgImageFileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            bgImageStatus.textContent = 'Đang lưu ảnh vào IndexedDB...';
            try {
                await window.ProfileStorage.saveBackgroundImageFile(file, file.name);
                currentBgConfig.type = 'image';
                bgTypeSelect.value = 'image';
                window.ProfileStorage.saveStoredBackgroundConfig(currentBgConfig);
                await checkCurrentMediaFiles();
                alert('Đã lưu ảnh nền Wallpaper thành công vào IndexedDB!');
            } catch (err) {
                console.error(err);
                alert('Lỗi khi lưu ảnh vào IndexedDB.');
            }
        });
    }

    // -------------------------------------------------------------------------
    // 3. QUẢN LÝ NHẠC NỀN & PLAYLIST (INDEXEDDB & SPOTIFY)
    // -------------------------------------------------------------------------
    const audioSourceTypeSelect = document.getElementById('audioSourceTypeSelect');
    const spotifySourceBox = document.getElementById('spotifySourceBox');
    const localSourceBox = document.getElementById('localSourceBox');
    const spotifyUrlInput = document.getElementById('spotifyUrlInput');
    const saveSpotifyUrlBtn = document.getElementById('saveSpotifyUrlBtn');
    
    const playlistFilesInput = document.getElementById('playlistFilesInput');
    const dashboardPlaylistList = document.getElementById('dashboardPlaylistList');
    const playlistEmptyNotice = document.getElementById('playlistEmptyNotice');
    const playlistCountText = document.getElementById('playlistCountText');
    const clearPlaylistBtn = document.getElementById('clearPlaylistBtn');

    // Nạp cấu hình nguồn phát hiện tại
    const audioSourceConfig = window.ProfileStorage.getAudioSourceConfig();
    if (audioSourceTypeSelect) {
        audioSourceTypeSelect.value = audioSourceConfig.type || 'local';
        spotifyUrlInput.value = audioSourceConfig.spotifyUrl || '';

        function toggleAudioSourceDisplay() {
            const isSpotify = audioSourceTypeSelect.value === 'spotify';
            spotifySourceBox.style.display = isSpotify ? 'block' : 'none';
            localSourceBox.style.display = isSpotify ? 'none' : 'block';
        }

        toggleAudioSourceDisplay();

        audioSourceTypeSelect.addEventListener('change', () => {
            const currentCfg = window.ProfileStorage.getAudioSourceConfig();
            currentCfg.type = audioSourceTypeSelect.value;
            window.ProfileStorage.saveAudioSourceConfig(currentCfg);
            toggleAudioSourceDisplay();
        });

        // Lưu link Spotify
        saveSpotifyUrlBtn.addEventListener('click', () => {
            const url = spotifyUrlInput.value.trim();
            if (!url) {
                alert('Vui lòng dán liên kết Spotify Playlist hoặc Track!');
                return;
            }
            const currentCfg = window.ProfileStorage.getAudioSourceConfig();
            currentCfg.type = 'spotify';
            currentCfg.spotifyUrl = url;
            window.ProfileStorage.saveAudioSourceConfig(currentCfg);
            alert('Đã lưu cấu hình Spotify Playlist thành công! Trang chính sẽ nhúng trình phát Spotify.');
        });
    }

    // Nạp và hiển thị danh sách bài hát trong Playlist cục bộ
    let currentPlaylistPreviewUrls = [];

    async function loadDashboardPlaylist() {
        // Dọn dẹp object URLs nghe thử cũ
        currentPlaylistPreviewUrls.forEach(url => URL.revokeObjectURL(url));
        currentPlaylistPreviewUrls = [];

        const tracks = await window.ProfileStorage.getPlaylistTracks();
        dashboardPlaylistList.innerHTML = '';

        if (!tracks || tracks.length === 0) {
            playlistCountText.textContent = '0';
            dashboardPlaylistList.appendChild(playlistEmptyNotice);
            playlistEmptyNotice.style.display = 'block';
            return;
        }

        playlistCountText.textContent = tracks.length.toString();
        playlistEmptyNotice.style.display = 'none';

        tracks.forEach((track, idx) => {
            const row = document.createElement('div');
            row.className = 'playlist-track-row';

            const sizeMB = track.size ? (track.size / (1024 * 1024)).toFixed(2) : '0';
            const audioObjUrl = track.blob ? URL.createObjectURL(track.blob) : '';
            if (audioObjUrl) currentPlaylistPreviewUrls.push(audioObjUrl);

            row.innerHTML = `
                <div class="playlist-track-left">
                    <span class="playlist-track-idx">#${idx + 1}</span>
                    <div class="playlist-track-info">
                        <input type="text" class="playlist-track-title-input" value="${escapeHtml(track.title || track.fileName)}" title="Bấm để chỉnh sửa tên hiển thị">
                        <div class="playlist-track-meta">
                            <span>📁 ${escapeHtml(track.fileName || 'track.mp3')}</span>
                            <span>⚖️ ${sizeMB} MB</span>
                        </div>
                    </div>
                </div>
                <div class="playlist-track-actions">
                    ${audioObjUrl ? `<audio controls src="${audioObjUrl}" style="height: 32px; max-width: 170px;"></audio>` : ''}
                    <button type="button" class="icon-btn save-title-btn" title="Lưu tên bài hát">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                    </button>
                    <button type="button" class="icon-btn delete delete-track-btn" title="Xóa bài hát khỏi playlist">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                </div>
            `;

            // Bắt sự kiện đổi tên bài hát
            const titleInput = row.querySelector('.playlist-track-title-input');
            const saveBtn = row.querySelector('.save-title-btn');
            const deleteBtn = row.querySelector('.delete-track-btn');

            const handleSaveTitle = async () => {
                const newTitle = titleInput.value.trim();
                if (!newTitle) return;
                track.title = newTitle;
                await window.ProfileStorage.savePlaylistTracks(tracks);
                saveBtn.style.color = '#38ef7d';
                setTimeout(() => { saveBtn.style.color = ''; }, 1200);
            };

            saveBtn.addEventListener('click', handleSaveTitle);
            titleInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSaveTitle();
                }
            });

            // Bắt sự kiện xóa bài hát
            deleteBtn.addEventListener('click', async () => {
                if (confirm(`Bạn có chắc muốn xóa bài "${track.title || track.fileName}" khỏi danh sách phát?`)) {
                    tracks.splice(idx, 1);
                    await window.ProfileStorage.savePlaylistTracks(tracks);
                    await loadDashboardPlaylist();
                }
            });

            dashboardPlaylistList.appendChild(row);
        });

        if (typeof populateLyricsSongSelect === 'function') {
            populateLyricsSongSelect();
        }
    }

    await loadDashboardPlaylist();

    // Tải lên nhiều file âm thanh vào playlist
    playlistFilesInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        const validFiles = files.filter(f => f.type.startsWith('audio/') || /\.(mp3|ogg|wav|m4a)$/i.test(f.name));
        if (validFiles.length === 0) {
            alert('Vui lòng chọn các file âm thanh hợp lệ (.mp3, .ogg, .wav, .m4a)!');
            return;
        }

        try {
            const currentTracks = await window.ProfileStorage.getPlaylistTracks();
            for (let i = 0; i < validFiles.length; i++) {
                const file = validFiles[i];
                const cleanTitle = file.name.replace(/\.[^/.]+$/, '');
                currentTracks.push({
                    id: 'track_' + Date.now() + '_' + i,
                    fileName: file.name,
                    title: cleanTitle,
                    blob: file,
                    type: file.type || 'audio/mpeg',
                    size: file.size
                });
            }

            await window.ProfileStorage.savePlaylistTracks(currentTracks);
            playlistFilesInput.value = '';
            await loadDashboardPlaylist();
            alert(`Đã tải lên và thêm thành công ${validFiles.length} bài hát vào danh sách phát!`);
        } catch (err) {
            console.error('Lỗi lưu danh sách bài hát:', err);
            alert('Có lỗi xảy ra khi lưu file nhạc vào IndexedDB.');
        }
    });

    // Xóa toàn bộ playlist
    clearPlaylistBtn.addEventListener('click', async () => {
        const tracks = await window.ProfileStorage.getPlaylistTracks();
        if (!tracks || tracks.length === 0) {
            alert('Danh sách phát hiện đang trống.');
            return;
        }
        if (confirm('Bạn có chắc chắn muốn xóa TOÀN BỘ bài hát trong danh sách phát?')) {
            await window.ProfileStorage.savePlaylistTracks([]);
            await loadDashboardPlaylist();
            alert('Đã xóa toàn bộ playlist!');
        }
    });

    // =========================================================================
    // PHẦN 4: QUẢN LÝ VOICELINE (HUD CÔNG NGHỆ CHIẾN THUẬT)
    // =========================================================================
    const vlCharNameInput = document.getElementById('vlCharNameInput');
    const vlCharRoleInput = document.getElementById('vlCharRoleInput');
    const saveCharInfoBtn = document.getElementById('saveCharInfoBtn');
    const dashboardVoicelineList = document.getElementById('dashboardVoicelineList');
    const voicelineCountBadge = document.getElementById('voicelineCountBadge');
    const newVlTitle = document.getElementById('newVlTitle');
    const newVlSubtitle = document.getElementById('newVlSubtitle');
    const newVlAudioFile = document.getElementById('newVlAudioFile');
    const addVoicelineBtn = document.getElementById('addVoicelineBtn');
    const vlFormAlert = document.getElementById('vlFormAlert');
    const vlCharCount = document.getElementById('vlCharCount');

    let currentVlConfig = {
        characterName: 'OMEN',
        characterRole: 'CONTROLLER // SHADOW',
        autoNext: false,
        list: []
    };

    let previewAudio = null;
    let previewPlayingId = null;

    function showVlAlert(msg, type = 'error') {
        if (!vlFormAlert) return;
        vlFormAlert.textContent = msg;
        vlFormAlert.style.display = 'block';
        if (type === 'error') {
            vlFormAlert.style.background = 'rgba(239, 68, 68, 0.2)';
            vlFormAlert.style.border = '1px solid #ef4444';
            vlFormAlert.style.color = '#fca5a5';
        } else {
            vlFormAlert.style.background = 'rgba(16, 185, 129, 0.2)';
            vlFormAlert.style.border = '1px solid #10b981';
            vlFormAlert.style.color = '#6ee7b7';
        }
        setTimeout(() => {
            if (vlFormAlert) vlFormAlert.style.display = 'none';
        }, 3500);
    }

    async function initVoicelineDashboard() {
        if (!window.ProfileStorage || typeof window.ProfileStorage.getStoredVoicelinesConfig !== 'function') return;
        currentVlConfig = window.ProfileStorage.getStoredVoicelinesConfig();

        if (vlCharNameInput) vlCharNameInput.value = currentVlConfig.characterName || 'OMEN';
        if (vlCharRoleInput) vlCharRoleInput.value = currentVlConfig.characterRole || 'CONTROLLER // SHADOW';

        await renderVoicelineList();
    }

    if (saveCharInfoBtn) {
        saveCharInfoBtn.addEventListener('click', () => {
            currentVlConfig.characterName = (vlCharNameInput ? vlCharNameInput.value.trim() : '') || 'OMEN';
            currentVlConfig.characterRole = (vlCharRoleInput ? vlCharRoleInput.value.trim() : '') || 'CONTROLLER // SHADOW';
            window.ProfileStorage.saveStoredVoicelinesConfig(currentVlConfig);
            alert('Đã lưu thông tin nhân vật và vai trò thành công!');
        });
    }

    const clearAllVoicelinesBtn = document.getElementById('clearAllVoicelinesBtn');
    if (clearAllVoicelinesBtn) {
        clearAllVoicelinesBtn.addEventListener('click', async () => {
            if (!currentVlConfig.list || currentVlConfig.list.length === 0) {
                alert('Danh sách voiceline hiện đang trống!');
                return;
            }
            if (confirm(`Bạn có chắc chắn muốn xóa toàn bộ ${currentVlConfig.list.length} voiceline không?`)) {
                if (previewAudio) {
                    previewAudio.pause();
                    previewAudio = null;
                    previewPlayingId = null;
                }
                for (const item of currentVlConfig.list) {
                    await window.ProfileStorage.deleteVoicelineAudio(item.id);
                }
                currentVlConfig.list = [];
                window.ProfileStorage.saveStoredVoicelinesConfig(currentVlConfig);
                await renderVoicelineList();
            }
        });
    }

    if (newVlSubtitle && vlCharCount) {
        newVlSubtitle.addEventListener('input', () => {
            vlCharCount.textContent = `${newVlSubtitle.value.length}/200`;
        });
    }

    function formatVlDuration(sec) {
        if (!sec || isNaN(sec) || sec <= 0) return '--:--';
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    async function renderVoicelineList() {
        if (!dashboardVoicelineList) return;
        dashboardVoicelineList.innerHTML = '';

        const list = currentVlConfig.list || [];
        if (voicelineCountBadge) {
            voicelineCountBadge.textContent = `${list.length} Voiceline${list.length > 1 ? 's' : ''}`;
        }

        if (list.length === 0) {
            dashboardVoicelineList.innerHTML = `
                <div class="playlist-empty-notice" id="vlEmptyNotice">
                    Chưa có voiceline nào được thêm. Hãy thêm ít nhất một voiceline bên dưới để khung HUD hiển thị ở trang chính!
                </div>
            `;
            return;
        }

        let draggedIndex = null;

        list.forEach((item, idx) => {
            const row = document.createElement('div');
            row.className = 'vl-dash-item';
            row.draggable = true;
            row.dataset.index = idx;

            const durStr = item.duration ? formatVlDuration(item.duration) : '--:--';

            row.innerHTML = `
                <span class="vl-drag-handle" title="Kéo thả để đổi thứ tự">⠿</span>
                <div class="vl-dash-info">
                    <div class="vl-dash-title-row">
                        <span class="vl-dash-item-title">${idx + 1}. ${escapeHtml(item.title)}</span>
                        <span class="vl-dash-item-file">(${durStr} • ${escapeHtml(item.audioFileName || 'audio')})</span>
                    </div>
                    <div class="vl-dash-item-sub">"${escapeHtml(item.subtitle || '')}"</div>
                </div>
                <div class="vl-dash-actions">
                    <button type="button" class="vl-dash-btn preview-btn" data-id="${item.id}" title="Nghe thử">
                        ▶ Nghe thử
                    </button>
                    <button type="button" class="vl-dash-btn delete" data-id="${item.id}" title="Xóa voiceline này">
                        🗑 Xóa
                    </button>
                </div>
            `;

            // Nút nghe thử
            const previewBtn = row.querySelector('.preview-btn');
            previewBtn.addEventListener('click', async () => {
                await togglePreviewAudio(item.id, previewBtn);
            });

            // Nút xóa
            const deleteBtn = row.querySelector('.delete');
            deleteBtn.addEventListener('click', async () => {
                if (confirm(`Bạn có chắc chắn muốn xóa voiceline "${item.title}" không?`)) {
                    if (previewAudio) {
                        previewAudio.pause();
                        previewAudio = null;
                        previewPlayingId = null;
                    }
                    await window.ProfileStorage.deleteVoicelineAudio(item.id);
                    currentVlConfig.list.splice(idx, 1);
                    window.ProfileStorage.saveStoredVoicelinesConfig(currentVlConfig);
                    await renderVoicelineList();
                }
            });

            // Drag and drop reordering
            row.addEventListener('dragstart', (e) => {
                draggedIndex = idx;
                row.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
            });

            row.addEventListener('dragover', (e) => {
                e.preventDefault();
                row.classList.add('drag-over');
            });

            row.addEventListener('dragleave', () => {
                row.classList.remove('drag-over');
            });

            row.addEventListener('drop', (e) => {
                e.preventDefault();
                row.classList.remove('drag-over');
                if (draggedIndex !== null && draggedIndex !== idx) {
                    const movedItem = currentVlConfig.list.splice(draggedIndex, 1)[0];
                    currentVlConfig.list.splice(idx, 0, movedItem);
                    window.ProfileStorage.saveStoredVoicelinesConfig(currentVlConfig);
                    renderVoicelineList();
                }
            });

            row.addEventListener('dragend', () => {
                row.classList.remove('dragging');
                draggedIndex = null;
            });

            dashboardVoicelineList.appendChild(row);
        });
    }

    async function togglePreviewAudio(id, btnEl) {
        if (previewPlayingId === id && previewAudio && !previewAudio.paused) {
            previewAudio.pause();
            previewAudio = null;
            previewPlayingId = null;
            btnEl.textContent = '▶ Nghe thử';
            return;
        }

        if (previewAudio) {
            previewAudio.pause();
            previewAudio = null;
            previewPlayingId = null;
            document.querySelectorAll('.preview-btn').forEach(b => b.textContent = '▶ Nghe thử');
        }

        const audioRecord = await window.ProfileStorage.getVoicelineAudio(id);
        if (!audioRecord || !audioRecord.blob) {
            // Nếu là voiceline mẫu (default seed), dùng âm thanh tổng hợp WAV
            if (typeof window.createSyntheticWavBlobUrl === 'function') {
                const sampleItem = currentVlConfig.list.find(i => i.id === id);
                const sampleBlobUrl = window.createSyntheticWavBlobUrl(sampleItem?.duration || 3.5, 100);
                previewAudio = new Audio(sampleBlobUrl);
                previewPlayingId = id;
                btnEl.textContent = '⏸ Tạm dừng';
                previewAudio.addEventListener('ended', () => {
                    previewAudio = null;
                    previewPlayingId = null;
                    btnEl.textContent = '▶ Nghe thử';
                });
                previewAudio.play().catch(() => {});
                return;
            }
            showVlAlert('Không tìm thấy dữ liệu âm thanh của voiceline này!');
            return;
        }

        const url = URL.createObjectURL(audioRecord.blob);
        previewAudio = new Audio(url);
        previewPlayingId = id;
        btnEl.textContent = '⏸ Tạm dừng';

        previewAudio.onended = () => {
            btnEl.textContent = '▶ Nghe thử';
            previewPlayingId = null;
            URL.revokeObjectURL(url);
        };

        previewAudio.onerror = () => {
            showVlAlert('Không thể phát file âm thanh này!');
            btnEl.textContent = '▶ Nghe thử';
            previewPlayingId = null;
            URL.revokeObjectURL(url);
        };

        previewAudio.play().catch(err => {
            console.warn('Lỗi phát preview:', err);
            btnEl.textContent = '▶ Nghe thử';
            previewPlayingId = null;
        });
    }

    // Thêm Voiceline mới
    if (addVoicelineBtn) {
        addVoicelineBtn.addEventListener('click', async () => {
            const title = newVlTitle ? newVlTitle.value.trim() : '';
            const subtitle = newVlSubtitle ? newVlSubtitle.value.trim() : '';
            const file = newVlAudioFile && newVlAudioFile.files ? newVlAudioFile.files[0] : null;

            // Kiểm tra thiếu trường bắt buộc
            if (!title) {
                showVlAlert('Vui lòng nhập Tên Voiceline!');
                newVlTitle?.focus();
                return;
            }

            if (!subtitle) {
                showVlAlert('Vui lòng nhập Lời thoại (Phụ đề)!');
                newVlSubtitle?.focus();
                return;
            }

            if (!file) {
                showVlAlert('Vui lòng chọn File âm thanh (.mp3, .ogg, .wav)!');
                newVlAudioFile?.focus();
                return;
            }

            // Kiểm tra dung lượng tối đa 5MB
            const MAX_SIZE = 5 * 1024 * 1024; // 5MB
            if (file.size > MAX_SIZE) {
                showVlAlert(`File âm thanh vượt quá 5MB (${(file.size / (1024 * 1024)).toFixed(2)}MB). Vui lòng chọn file nhỏ hơn!`);
                return;
            }

            // Kiểm tra định dạng audio hợp lệ
            const validExtensions = ['.mp3', '.ogg', '.wav', '.m4a', '.flac'];
            const lowerName = file.name.toLowerCase();
            const hasValidExt = validExtensions.some(ext => lowerName.endsWith(ext)) || file.type.startsWith('audio/');
            if (!hasValidExt) {
                showVlAlert('File không đúng định dạng âm thanh (.mp3, .ogg, .wav)!');
                return;
            }

            // Đọc thời lượng audio an toàn
            let duration = 0;
            try {
                const tempUrl = URL.createObjectURL(file);
                const tempAudio = new Audio();
                duration = await new Promise((resolve) => {
                    const timer = setTimeout(() => {
                        try { URL.revokeObjectURL(tempUrl); } catch (e) {}
                        resolve(0);
                    }, 2000);
                    tempAudio.onloadedmetadata = () => {
                        clearTimeout(timer);
                        const d = tempAudio.duration || 0;
                        try { URL.revokeObjectURL(tempUrl); } catch (e) {}
                        resolve(d);
                    };
                    tempAudio.onerror = () => {
                        clearTimeout(timer);
                        try { URL.revokeObjectURL(tempUrl); } catch (e) {}
                        resolve(0);
                    };
                    tempAudio.src = tempUrl;
                    tempAudio.load();
                });
            } catch (e) {
                duration = 0;
            }

            const id = `vl_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

            // Lưu file audio vào IndexedDB
            try {
                await window.ProfileStorage.saveVoicelineAudio(id, file, file.name);

                if (!currentVlConfig || !Array.isArray(currentVlConfig.list)) {
                    currentVlConfig = window.ProfileStorage.getStoredVoicelinesConfig() || {
                        characterName: 'OMEN',
                        characterRole: 'CONTROLLER // SHADOW',
                        autoNext: false,
                        list: []
                    };
                }

                // Thêm vào danh sách và lưu metadata
                currentVlConfig.list.push({
                    id: id,
                    title: title,
                    subtitle: subtitle,
                    duration: duration,
                    audioFileName: file.name
                });

                window.ProfileStorage.saveStoredVoicelinesConfig(currentVlConfig);

                // Reset form
                if (newVlTitle) newVlTitle.value = '';
                if (newVlSubtitle) newVlSubtitle.value = '';
                if (newVlAudioFile) newVlAudioFile.value = '';
                if (vlCharCount) vlCharCount.textContent = '0/200';

                showVlAlert(`Đã thêm voiceline "${title}" thành công!`, 'success');
                await renderVoicelineList();
            } catch (err) {
                console.error('Lỗi lưu voiceline:', err);
                showVlAlert(`Đã xảy ra lỗi khi lưu file vào trình duyệt: ${err.message || 'Lỗi IndexedDB'}`);
            }
        });
    }

    initVoicelineDashboard();

    // -------------------------------------------------------------------------
    // 3. QUẢN LÝ DISCORD USER ID & LANYARD
    // -------------------------------------------------------------------------
    const discordIdInput = document.getElementById('discordIdInput');
    const saveDiscordIdBtn = document.getElementById('saveDiscordIdBtn');
    const testDiscordBtn = document.getElementById('testDiscordBtn');
    const discordTestPreview = document.getElementById('discordTestPreview');
    const testAvatar = document.getElementById('testAvatar');
    const testStatusDot = document.getElementById('testStatusDot');
    const testUsername = document.getElementById('testUsername');
    const testStatusText = document.getElementById('testStatusText');
    const testExtraInfo = document.getElementById('testExtraInfo');

    // Nạp Discord ID đã lưu
    discordIdInput.value = window.ProfileStorage.getStoredDiscordId();

    saveDiscordIdBtn.addEventListener('click', () => {
        const id = discordIdInput.value.trim();
        window.ProfileStorage.saveStoredDiscordId(id);
        alert('Đã lưu Discord User ID thành công!');
        testDiscordConnection(id);
    });

    testDiscordBtn.addEventListener('click', () => {
        const id = discordIdInput.value.trim();
        if (!id) {
            alert('Vui lòng nhập Discord User ID để kiểm tra!');
            return;
        }
        testDiscordConnection(id);
    });

    async function testDiscordConnection(id) {
        if (!id) {
            discordTestPreview.style.display = 'none';
            return;
        }

        testUsername.textContent = 'Đang kiểm tra...';
        testStatusText.textContent = 'Đang kết nối Lanyard API...';
        testExtraInfo.textContent = '';
        discordTestPreview.style.display = 'flex';

        try {
            const res = await fetch(`https://api.lanyard.rest/v1/users/${id}`);
            const data = await res.json();

            if (!res.ok || !data.success) {
                testStatusDot.className = 'status-dot offline';
                testUsername.textContent = 'Không tìm thấy người dùng';
                testStatusText.textContent = 'Lanyard chưa theo dõi ID này.';
                testExtraInfo.innerHTML = `⚠️ Vui lòng tham gia server Discord của Lanyard: <a href="https://discord.gg/lanyard" target="_blank" style="color:var(--primary-light); text-decoration:underline;">discord.gg/lanyard</a> để Lanyard có quyền đọc trạng thái của bạn!`;
                return;
            }

            const userData = data.data;
            const status = userData.discord_status;
            const isOnline = status !== 'offline';
            const user = userData.discord_user;

            testStatusDot.className = `status-dot ${status}`;
            testUsername.textContent = `${user.global_name || user.username} (@${user.username})`;
            testStatusText.textContent = isOnline ? `Đang online (${status.toUpperCase()})` : 'Ngoại tuyến';

            if (user.avatar) {
                const format = user.avatar.startsWith('a_') ? 'gif' : 'png';
                testAvatar.src = `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${format}?size=128`;
            }

            if (userData.activities && userData.activities.length > 0) {
                const act = userData.activities[0];
                testExtraInfo.textContent = `Hoạt động: ${act.name} ${act.details ? `- ${act.details}` : ''}`;
            } else {
                testExtraInfo.textContent = 'Đã kết nối thành công với Lanyard!';
            }

        } catch (err) {
            testStatusDot.className = 'status-dot offline';
            testUsername.textContent = 'Lỗi kết nối';
            testStatusText.textContent = 'Không thể kết nối đến Lanyard API.';
            console.error(err);
        }
    }

    if (discordIdInput.value.trim()) {
        testDiscordConnection(discordIdInput.value.trim());
    }

    // =========================================================================
    // QUẢN LÝ BẬT / TẮT TIA SÉT (EFFECTS)
    // =========================================================================
    const toggleLightningCheckbox = document.getElementById('toggleLightningCheckbox');
    if (toggleLightningCheckbox) {
        const savedLightning = localStorage.getItem('cursor_smoke_fx_lightning');
        toggleLightningCheckbox.checked = savedLightning === null ? true : savedLightning === 'true';

        toggleLightningCheckbox.addEventListener('change', () => {
            const isEnabled = toggleLightningCheckbox.checked;
            localStorage.setItem('cursor_smoke_fx_lightning', isEnabled ? 'true' : 'false');
            if (window.CursorSmokeFx && window.CursorSmokeFx.CONFIG) {
                window.CursorSmokeFx.CONFIG.lightning = isEnabled;
            }
        });
    }

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
});
