/**
 * ==============================================================================
 * STORAGE.JS - Quản lý lưu trữ dữ liệu Profile
 * ==============================================================================
 * - Dữ liệu liên kết, tên bài hát, Discord ID và cấu hình Background lưu trong LocalStorage.
 * - File audio và video nền được lưu trong IndexedDB (ProfileMusicDB) để hỗ trợ file lớn.
 * - Hỗ trợ phát tín hiệu cập nhật để trang chính tự cập nhật ngay khi thay đổi ở Dashboard.
 */

const STORAGE_KEYS = {
    LINKS: 'profile_social_links',
    SONG_NAME: 'profile_song_name',
    DISCORD_ID: 'profile_discord_id',
    BG_CONFIG: 'profile_background_config',
    VOICELINES: 'profile_voicelines'
};

const DB_NAME = 'ProfileMusicDB';
const DB_VERSION = 3; // Nâng version 3 để đảm bảo mediaStore luôn được khởi tạo
const STORE_AUDIO = 'audioStore';
const STORE_MEDIA = 'mediaStore';
const AUDIO_KEY = 'active_song';
const PLAYLIST_KEY = 'audio_playlist';
const AUDIO_SOURCE_KEY = 'profile_audio_source';
const VIDEO_KEY = 'active_bg_video';
const IMAGE_KEY = 'active_bg_image';

/**
 * Mở kết nối IndexedDB
 * @returns {Promise<IDBDatabase>}
 */
function openAudioDB() {
    return new Promise((resolve, reject) => {
        if (!window.indexedDB) {
            reject(new Error('Trình duyệt không hỗ trợ IndexedDB'));
            return;
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_AUDIO)) {
                db.createObjectStore(STORE_AUDIO);
            }
            if (!db.objectStoreNames.contains(STORE_MEDIA)) {
                db.createObjectStore(STORE_MEDIA);
            }
        };

        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error);
    });
}

/**
 * Lưu file audio vào IndexedDB
 * @param {Blob|File} blob - File hoặc Blob âm thanh
 * @param {string} fileName - Tên tệp gốc
 * @returns {Promise<boolean>}
 */
async function saveAudioFile(blob, fileName) {
    try {
        const db = await openAudioDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_AUDIO, 'readwrite');
            const store = tx.objectStore(STORE_AUDIO);
            
            const data = {
                blob: blob,
                fileName: fileName,
                type: blob.type || 'audio/mpeg',
                size: blob.size,
                updatedAt: Date.now()
            };

            const req = store.put(data, AUDIO_KEY);
            req.onsuccess = () => {
                notifyDataChanged('audio');
                resolve(true);
            };
            req.onerror = () => reject(req.error);
        });
    } catch (err) {
        console.error('Lỗi khi lưu audio vào IndexedDB:', err);
        throw err;
    }
}

/**
 * Lấy file audio từ IndexedDB
 * @returns {Promise<{blob: Blob, fileName: string, type: string}|null>}
 */
async function getAudioFile() {
    try {
        const db = await openAudioDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_AUDIO, 'readonly');
            const store = tx.objectStore(STORE_AUDIO);
            const req = store.get(AUDIO_KEY);

            req.onsuccess = () => {
                resolve(req.result || null);
            };
            req.onerror = () => reject(req.error);
        });
    } catch (err) {
        console.warn('Lỗi khi đọc audio từ IndexedDB:', err);
        return null;
    }
}

/**
 * Xóa file audio khỏi IndexedDB
 * @returns {Promise<boolean>}
 */
async function deleteAudioFile() {
    try {
        const db = await openAudioDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_AUDIO, 'readwrite');
            const store = tx.objectStore(STORE_AUDIO);
            const req = store.delete(AUDIO_KEY);

            req.onsuccess = () => {
                notifyDataChanged('audio');
                resolve(true);
            };
            req.onerror = () => reject(req.error);
        });
    } catch (err) {
        console.error('Lỗi khi xóa audio:', err);
        throw err;
    }
}

const DEFAULT_TRACKS = [
    {
        id: 'vung-vay',
        fileName: 'vung_vay.m4a',
        title: 'Dangrangto - vùng vẫy (feat. ZEX)',
        url: 'assets/audio/music/vung_vay.m4a',
        type: 'audio/mp4',
        size: 8510414
    }
];

/**
 * Lấy danh sách toàn bộ các bài hát trong Playlist từ IndexedDB
 * @returns {Promise<Array<{id: string, fileName: string, title: string, blob: Blob, type: string, size: number}>>}
 */
async function getPlaylistTracks() {
    try {
        const db = await openAudioDB();
        return new Promise((resolve) => {
            const tx = db.transaction(STORE_AUDIO, 'readonly');
            const store = tx.objectStore(STORE_AUDIO);
            const req = store.get(PLAYLIST_KEY);
            req.onsuccess = async () => {
                let tracks = req.result;
                if (Array.isArray(tracks) && tracks.length > 0) {
                    resolve(tracks);
                    return;
                }
                // Tương thích ngược: Nếu đã có bài hát lẻ từ trước (active_song)
                const singleSong = await getAudioFile();
                if (singleSong && singleSong.blob) {
                    const customTitle = getStoredSongName() || singleSong.fileName.replace(/\.[^/.]+$/, '');
                    resolve([{
                        id: 'legacy_track_1',
                        fileName: singleSong.fileName,
                        title: customTitle,
                        blob: singleSong.blob,
                        type: singleSong.type,
                        size: singleSong.size
                    }]);
                    return;
                }
                // Mặc định luôn có bài nhạc nền Dangrangto chuẩn bị sẵn để web chạy 24/7
                resolve(JSON.parse(JSON.stringify(DEFAULT_TRACKS)));
            };
            req.onerror = () => resolve(JSON.parse(JSON.stringify(DEFAULT_TRACKS)));
        });
    } catch (err) {
        console.warn('Lỗi đọc playlist:', err);
        return JSON.parse(JSON.stringify(DEFAULT_TRACKS));
    }
}

/**
 * Lưu danh sách Playlist vào IndexedDB
 * @param {Array} tracks 
 * @returns {Promise<boolean>}
 */
async function savePlaylistTracks(tracks) {
    try {
        const db = await openAudioDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_AUDIO, 'readwrite');
            const store = tx.objectStore(STORE_AUDIO);
            
            // Lưu mảng danh sách bài hát
            const req = store.put(tracks, PLAYLIST_KEY);
            
            // Đồng thời đồng bộ bài đầu tiên vào active_song để tương thích
            if (tracks.length > 0) {
                store.put({
                    blob: tracks[0].blob,
                    fileName: tracks[0].fileName,
                    type: tracks[0].type || 'audio/mpeg',
                    size: tracks[0].size || 0,
                    updatedAt: Date.now()
                }, AUDIO_KEY);
                saveStoredSongName(tracks[0].title);
            } else {
                store.delete(AUDIO_KEY);
            }

            req.onsuccess = () => {
                notifyDataChanged('audio');
                resolve(true);
            };
            req.onerror = () => reject(req.error);
        });
    } catch (err) {
        console.error('Lỗi lưu playlist:', err);
        throw err;
    }
}

/**
 * Lấy cấu hình nguồn phát nhạc (File cục bộ hoặc Spotify)
 */
function getAudioSourceConfig() {
    try {
        const raw = localStorage.getItem(AUDIO_SOURCE_KEY);
        if (raw) return JSON.parse(raw);
    } catch (e) {}
    return {
        type: 'local',
        spotifyUrl: ''
    };
}

/**
 * Lưu cấu hình nguồn phát nhạc
 */
function saveAudioSourceConfig(config) {
    localStorage.setItem(AUDIO_SOURCE_KEY, JSON.stringify(config));
    notifyDataChanged('audio_source');
}

// -------------------------------------------------------------
// LƯU TRỮ FILE VIDEO VÀ ẢNH NỀN VÀO INDEXEDDB
// -------------------------------------------------------------

async function saveBackgroundVideoFile(blob, fileName) {
    try {
        const db = await openAudioDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_MEDIA, 'readwrite');
            const store = tx.objectStore(STORE_MEDIA);
            const data = { blob, fileName, type: blob.type || 'video/mp4', updatedAt: Date.now() };
            const req = store.put(data, VIDEO_KEY);
            req.onsuccess = () => {
                notifyDataChanged('background');
                resolve(true);
            };
            req.onerror = () => reject(req.error);
        });
    } catch (err) {
        console.error('Lỗi lưu video nền vào IndexedDB:', err);
        throw err;
    }
}

async function getBackgroundVideoFile() {
    try {
        const db = await openAudioDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_MEDIA, 'readonly');
            const store = tx.objectStore(STORE_MEDIA);
            const req = store.get(VIDEO_KEY);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
    } catch (err) {
        return null;
    }
}

async function deleteBackgroundVideoFile() {
    try {
        const db = await openAudioDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_MEDIA, 'readwrite');
            const store = tx.objectStore(STORE_MEDIA);
            const req = store.delete(VIDEO_KEY);
            req.onsuccess = () => {
                notifyDataChanged('background');
                resolve(true);
            };
            req.onerror = () => reject(req.error);
        });
    } catch (err) {}
}

async function saveBackgroundImageFile(blob, fileName) {
    try {
        const db = await openAudioDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_MEDIA, 'readwrite');
            const store = tx.objectStore(STORE_MEDIA);
            const data = { blob, fileName, type: blob.type || 'image/jpeg', updatedAt: Date.now() };
            const req = store.put(data, IMAGE_KEY);
            req.onsuccess = () => {
                notifyDataChanged('background');
                resolve(true);
            };
            req.onerror = () => reject(req.error);
        });
    } catch (err) {
        throw err;
    }
}

async function getBackgroundImageFile() {
    try {
        const db = await openAudioDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_MEDIA, 'readonly');
            const store = tx.objectStore(STORE_MEDIA);
            const req = store.get(IMAGE_KEY);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
    } catch (err) {
        return null;
    }
}

async function deleteBackgroundImageFile() {
    try {
        const db = await openAudioDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_MEDIA, 'readwrite');
            const store = tx.objectStore(STORE_MEDIA);
            const req = store.delete(IMAGE_KEY);
            req.onsuccess = () => {
                notifyDataChanged('background');
                resolve(true);
            };
            req.onerror = () => reject(req.error);
        });
    } catch (err) {}
}

// -------------------------------------------------------------
// LOCAL STORAGE HELPERS & DEFAULT PROFILE DATA (CHO WEB 24/7)
// -------------------------------------------------------------

const DEFAULT_DISCORD_ID = '911068985901088778';

const DEFAULT_LINKS = [
    {
        id: 'link_1793453703049',
        title: '',
        url: 'https://www.facebook.com/middle.T.0108/',
        icon: 'facebook',
        customIcon: null
    },
    {
        id: 'link_1793453713320',
        title: '',
        url: 'https://discord.com/users/911068985901088778',
        icon: 'discord',
        customIcon: null
    },
    {
        id: 'link_1793453733407',
        title: '',
        url: 'https://www.instagram.com/middlet205/',
        icon: 'instagram',
        customIcon: null
    },
    {
        id: 'link_1793453794608',
        title: '',
        url: 'https://tracker.gg/valorant/profile/riot/Yoz0ra%232005',
        icon: 'custom',
        customIcon: 'assets/icons/tracker_custom.png'
    },
    {
        id: 'link_1793453769583',
        title: '',
        url: 'https://open.spotify.com/playlist/02JsJAjKRqYgokyHU352N3?si=47b7b594b3fc4b5b',
        icon: 'custom',
        customIcon: 'assets/icons/spotify_custom.gif'
    }
];

function getStoredLinks() {
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.LINKS);
        if (raw !== null && raw !== undefined) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
    } catch (e) {
        console.error('Lỗi đọc links từ localStorage:', e);
    }
    // Mặc định luôn nạp danh sách liên kết của bạn để bất kỳ ai vào web online đều thấy đủ 5 link
    return JSON.parse(JSON.stringify(DEFAULT_LINKS));
}

function saveStoredLinks(links) {
    localStorage.setItem(STORAGE_KEYS.LINKS, JSON.stringify(links));
    notifyDataChanged('links');
}

function getStoredSongName() {
    return localStorage.getItem(STORAGE_KEYS.SONG_NAME) || '';
}

function saveStoredSongName(name) {
    localStorage.setItem(STORAGE_KEYS.SONG_NAME, name);
    notifyDataChanged('song_name');
}

function getStoredDiscordId() {
    return localStorage.getItem(STORAGE_KEYS.DISCORD_ID) || DEFAULT_DISCORD_ID;
}

function saveStoredDiscordId(id) {
    localStorage.setItem(STORAGE_KEYS.DISCORD_ID, id.trim());
    notifyDataChanged('discord_id');
}

/**
 * Cấu hình Background
 * @returns {{type: 'youtube'|'mp4_file'|'image'|'gradient', youtubeId: string, videoUrl: string, imageUrl: string}}
 */
function getStoredBackgroundConfig() {
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.BG_CONFIG);
        if (!raw) {
            return {
                type: 'mp4_file', // Mặc định dùng video MP4 nội bộ mượt mà không bao giờ lỗi
                youtubeId: 'LUd14Xdfk68',
                videoUrl: 'assets/background.mp4',
                imageUrl: ''
            };
        }
        const parsed = JSON.parse(raw);
        if (!parsed.type) parsed.type = 'mp4_file';
        return parsed;
    } catch (e) {
        return {
            type: 'mp4_file',
            youtubeId: 'LUd14Xdfk68',
            videoUrl: 'assets/background.mp4',
            imageUrl: ''
        };
    }
}

function saveStoredBackgroundConfig(config) {
    localStorage.setItem(STORAGE_KEYS.BG_CONFIG, JSON.stringify(config));
    notifyDataChanged('background');
}

const DEFAULT_SONG_OFFSETS = {
    'danh-roi': 0.50,
    'vung-vay': 0.50,
    'baby-anh-doi-co-lau': 0.55,
    'bolero-buon': 0.45,
    'dam-say-trong-tinh-yeu': 0.50,
    'de-danh-cho-em': 0.50,
    'mon-qua': 0.45,
    'mot-ly': 0.55,
    'quenvaonhau': 0.50,
    'tot-cho-anh': 0.45,
    'wrong-times': 0.40,
    'xuong-rong': 0.45,
    'mot-bai-hat-khong-vui-may': 0.50
};

const ALBUM_LYRICS_DB = {
    'danh-roi': `[00:00.00] Dangrangto - đánh rơi (feat. MICKEY)
[00:06.00] Prod. by DONAL
[00:12.50] ♪ ♫ ♪
[00:18.50] Bao nhiêu ngày đêm chung mền gối
[00:22.00] Anh không biết nên tiếp hay là thôi
[00:25.50] Giết anh ngay trong đêm tối
[00:29.00] Ở trong bức hình đó em mỉm cười
[00:33.00] Lời hứa theo làn khói cuốn trôi đi rồi
[00:37.00] Giọt nước mắt rơi trên đôi môi
[00:40.50] Từng ký ức ta từng đắm say một thời
[00:44.00] Giờ như mảnh vỡ đánh rơi...
[00:48.00] Giờ như mảnh vỡ đánh rơi giữa trời
[00:52.50] ♪ ♫ ♪
[01:00.00] Em bước đi để lại bóng đêm
[01:04.00] Lạnh lùng từng giọt sương rơi ướt thềm
[01:08.00] Cố chấp níu giữ làm trái tim đau thêm
[01:12.00] Ký ức vụn vỡ ghim sâu từng đêm
[01:16.00] Don't tell me why, baby don't lie
[01:20.00] Ai đúng ai sai giờ cũng phôi phai
[01:24.00] Cơn mưa qua mang theo bóng ai
[01:28.00] Đánh rơi câu thề mãi mãi...
[01:33.00] ♪ ♫ ♪
[01:45.00] Trái tim băng bó lại nhói lên
[01:49.00] Không thể xóa nhòa một cái tên
[01:53.00] Từng lời thì thầm bên tai êm đềm
[01:57.00] Giờ chìm vào trong màn đêm
[02:02.00] Dangrangto x MICKEY
[02:08.00] ♪ ♫ ♪
[02:25.00] Đánh rơi nụ cười, đánh rơi tình tôi
[02:30.00] Chỉ còn bóng tối vây kín cuộc đời
[02:36.00] Omen - Shadows never fade
[02:42.00] ♪ ♫ ♪
[03:10.00] Lặng nhìn em bước xa dần
[03:16.00] Đánh rơi một tình yêu...
[03:25.00] ♪ ♫ ♪`,

    'vung-vay': `[00:00.00] Dangrangto - vùng vẫy (feat. ZEXZEX)
[00:05.00] Prod. by DONAL - Album Trái Tim Băng Bó
[00:10.00] ♪ ♫ ♪
[00:14.00] Yah, baby, em luôn bên anh khi anh drop it
[00:17.50] Đôi tay còn đang vùng vẫy
[00:20.00] Hôn lên đôi môi anh ngay khi em có thể
[00:23.50] Suy tư just throw away
[00:26.50] Trao cho em con tim in the darkness, but you lost it yeah
[00:30.50] Lên con xe anh lao đi như là rocket
[00:34.00] Khi em không ở đây...
[00:37.00] ♪ ♫ ♪
[00:41.00] Anh đã sai khi tin vào tình yêu bao nhiêu
[00:44.50] Anh đi theo em không thiếu
[00:47.50] Anh chỉ như cơn mưa rơi dập dìu trên chiếc xe
[00:51.00] Nàng cùng người mà em yêu
[00:54.00] Vì anh đâu muốn những nỗi đau ngày ngập tràn
[00:57.50] Cũng chẳng thể tua ngược thời gian
[01:00.50] Đếm giấc mơ cũ đã tắt trong gạt tàn
[01:03.50] Em muốn câu chuyện tình mình lật sang trang thì em cứ đi đi
[01:07.50] Mưa ướt hoen mi, họ đón em trên Audi
[01:11.00] Đủ biết anh chẳng ra gì
[01:14.00] Đôi mắt đôi môi anh phải quên thôi
[01:17.00] Nhìn bước chân em xa rời một giấc mơ mãi xa vời oh
[01:21.00] Để làn mưa khuất theo mây trời
[01:24.00] Anh đưa người về nơi lặng nhìn em yên ấm bên đời, anh chỉ cần thế thôi
[01:28.00] Anh đã cố để có thể quên đi em nhưng sao buồn chẳng vơi
[01:31.50] Cứ đi về nơi em cần tới, riêng anh lặng lẽ rơi...
[01:35.00] Baby, em luôn bên anh khi anh drop it
[01:38.00] Đôi tay còn đang vùng vẫy
[01:41.00] Hôn lên đôi môi anh ngay khi em có thể
[01:44.50] Suy tư just throw away
[01:48.00] Trao cho em con tim in the darkness, but you lost it yeah
[01:51.50] Lên con xe anh lao đi như là rocket
[01:55.00] Khi em không ở đây...
[01:58.00] ♪ ZEXZEX Verse ♪
[02:02.00] Ở trong cối xay bằng sắt này, chất đầy, rất đầy
[02:05.50] Cuốn cho anh một điếu ay, điếu dài thế này
[02:09.00] Nó có thể là big size, long size, king size
[02:12.50] Anh muốn được ở bên em all day, all night
[02:16.00] Cuốn xong rồi lại đốt pop pop híp mắt khi kim đồng hồ vẫn tíc tắc tíc tắc
[02:19.50] Nhưng nếu em buồn thì "bae, don't worry i'm here"
[02:23.00] Hai ta cùng oh trong đêm trăng khuya
[02:26.50] Và tình phải là tình yêu hai ta không nên mập mờ
[02:30.00] Và tình chẳng phải trò chơi hai ta không nên giả vờ
[02:33.50] Mình roll một điếu rất to rồi tu Jagermeister
[02:37.00] Tình ta như cơn sóng kia lênh đênh đang trôi vào bờ
[02:40.50] Lục tìm cả thế giới cũng chẳng có ai được bằng em
[02:44.00] Giờ mình đang say đắm quấn quýt với nhau như vậy
[02:47.50] Nên là phải cho em thét lên hết đêm
[02:51.00] Anh tin em sẽ không bao giờ quên yah...
[02:55.00] Đêm nay ta lại up down up and down, up down up and down
[02:59.00] Và đêm nay ta lại up down up and down, up down up and down...
[03:20.00] Vùng vẫy trong bóng đêm...
[03:40.00] ♪ ♫ ♪`,

    'baby-anh-doi-co-lau': `[00:00.00] Dangrangto - baby anh đợi có lâu?
[00:06.00] Feat. DONAL & Smiley Panda
[00:10.00] Ah-ah, yeah
[00:13.50] Ah, "Baby, anh đợi có lâu?"
[00:16.50] Anh chỉ lắc đầu
[00:19.00] Đang đứng dưới lầu
[00:21.50] Mọi thứ bắt đầu
[00:24.00] Body high cùng sắc màu
[00:27.00] Ta lạc mất nhau
[00:29.50] Anh phải đương đầu
[00:32.00] Mi mắt vương sầu
[00:34.50] Đã bao nhiêu lần hứa là phải ngoảnh mặt bỏ đi
[00:38.00] Đâu ai biết có chi trong mắt của kẻ cuồng si
[00:41.50] Anh như đang lạc lối, lại bẻ một nửa để thoát ra
[00:45.50] Trong cơn mơ ngỡ ra là ta đã xa lạ
[00:50.00] Vậy thì quay đi, hãy giải thoát cho nhau
[00:53.00] Thứ để lại là vết thương lâu
[00:55.50] Buông đôi câu anh đã chán nghe rồi
[00:58.50] Thôi anh không cần thêm nữa đâu
[01:01.00] Và baby, em cứ nghĩ anh ngu à? Em coi anh như trò đùa
[01:04.50] Từng là cô gái anh rất yêu giờ lại đâm vào tim anh xoáy sâu
[01:08.50] Đừng khiến trái tim khi yêu anh không thể ngăn cơn ghen
[01:12.00] Mặc kệ đi nếu cơn mưa kia hôm nay lại chợt ghé đến
[01:16.00] Và phải xóa số em, khi say anh sẽ lại gọi cho em
[01:19.50] Anh phải khiến ta over, người mà anh đã luôn luôn tôn thờ
[01:24.00] "Baby, anh đợi có lâu?"
[01:26.50] Anh chỉ lắc đầu
[01:29.00] Mi mắt vương sầu
[01:31.50] Anh phải đương đầu
[01:34.00] Body high cùng sắc màu
[01:37.00] Ta lạc mất nhau
[01:39.50] Anh phải đương đầu (Oh)
[01:42.50] Đã bao nhiêu lần hứa là phải ngoảnh mặt bỏ đi
[01:46.00] Nào ai biết có chi trong mắt của kẻ cuồng si
[01:49.50] Anh như đang lạc lối, lại bẻ một nửa để thoát ra
[01:53.50] Trong cơn mơ lại ngỡ ra là ta đã xa lạ
[01:57.50] "Baby, anh đợi có lâu?"
[02:00.50] Anh đợi rất lâu
[02:03.00] Chỉ còn anh nơi đây ướt hết rồi cùng cơn mưa ngâu
[02:06.50] Em vẫn sẽ chẳng có mặt
[02:09.50] Anh cũng đâu muốn hát mãi về mưa đâu
[02:13.00] Kể từ lần cuối đó hai ta cùng nhau huyên hàn
[02:16.50] Em mang nắng ấm đi, anh ở nơi đây chờ tuyết tan
[02:20.50] Vẫn là chiếc khăn trước khi đi em tới nơi anh vội quàng
[02:24.50] Nhìn vào đôi mắt ấy anh biết hai ta đã muộn màng
[02:28.00] Em ơi, em ơi
[02:31.00] Em ơi, anh đợi rất lâu, rất lâu
[02:35.50] Anh đợi rất lâu, rất lâu
[02:39.00] Ta đã mất nhau... Ta đã mất nhau
[02:44.00] Anh sẽ ổn thôi...
[02:50.00] ♪ ♫ ♪`,

    'bolero-buon': `[00:00.00] Dangrangto - bolero buồn
[00:05.00] Feat. BIG WIND - Prod. DONAL
[00:10.00] ♪ ♫ ♪
[00:15.50] Sẽ rất đau khi người đi khỏi đây
[00:19.50] Nhìn từng áng mây, không còn chung vòng tay
[00:23.50] Sẽ rất đau khi người đi khỏi đây
[00:27.50] Từng coi người là đoá hoa hồng xinh lộng lẫy
[00:31.50] Lạc mất nhau nhưng người nào đâu kiếm
[00:35.00] Sẽ rất đau khi em buông lời cay nghiến
[00:39.00] Từng thước phim vẫn cuộn mình và lưu luyến
[00:43.00] Cảm xúc bị chi phối bởi đồng tiền
[00:47.00] Yeah không mong cảm xúc mình bị chi phối
[00:50.50] Bởi đồng tiền nhưng sao anh cứ bối rối
[00:54.00] Phơi chồng phiền ở đây bên anh mỗi đêm
[00:57.50] Đã trở thành thú vui của một gã điên
[01:01.00] Chỉ vì một câu nói, lòng đau nhói
[01:04.50] Bỏ theo dõi, để lại trang cá nhân lẻ loi
[01:08.50] Mang cả những chiếc ôm bỗng khiến nơi đây lạnh quá
[01:12.50] Đắp mộ cuộc tình đó với một nhành hoa
[01:16.50] Tự hỏi liệu có khi nào em lại nhớ tới
[01:20.00] Người với ai đi bên niềm vui mới
[01:23.50] Để lại đắng cay tàn thuốc bay phòng tối đen
[01:27.50] Chiều tà nhá nhem lại ngẩn một thói quen
[01:31.50] Cũng là chỉ vì mãi, mãi mà chẳng ngưng nhớ
[01:35.50] Dẫu người từng buông câu "đừng chờ"
[01:39.00] Những thước phim cứ tua ngược lại
[01:42.50] Ký ức xoáy sâu như cơn đau quằn quại
[01:46.50] Chẳng biết bao lâu mới nhạt phai
[01:50.00] Đôi khi chỉ vì tình mà lại mù quáng yêu một người
[01:54.00] Đôi khi chỉ vì tình mà phải thù ghét với một người
[01:58.00] Thích cách em bên ai trao họ ánh mắt với nụ cười
[02:02.00] Chẳng giống mỗi khi bên anh, anh chỉ là chốn em vui chơi
[02:06.00] Cố chấp nhận rằng mình đã chìm vào dĩ vãng
[02:10.00] Giết chết một cuộc tình mà vội vàng phi tang
[02:13.50] Lấy chiếc dao, em đâm anh ngay vào chỗ chí mạng
[02:17.50] Giấu nó kỹ càng xong nàng dứt áo đi ngang
[02:21.00] Sẽ rất đau khi người đi khỏi đây
[02:25.00] Nhìn từng áng mây, không còn chung vòng tay
[02:29.00] Sẽ rất đau khi người đi khỏi đây...
[02:40.00] ♪ BIG WIND Verse ♪
[03:00.00] Lòng hoang mang ngập tràn bao đắng cay
[03:15.00] Người quay lưng bỏ mặc anh nơi này
[03:30.00] Sẽ rất đau khi người đi khỏi đây...
[03:50.00] ♪ ♫ ♪`,

    'dam-say-trong-tinh-yeu': `[00:00.00] Dangrangto - đắm say trong tình yêu
[00:06.00] Feat. T.R.I & DONAL - Album Trái Tim Băng Bó
[00:11.00] ♪ ♫ ♪
[00:15.50] Baby anh đã cô đơn rất lâu, khiến tim buồn rầu
[00:19.50] Dưới góc phố họ đã tìm thấy nhau, lung linh đèn màu
[00:23.50] Anh cứ ngỡ là chẳng ai thấu để mặc bao lo âu này anh luôn giấu
[00:28.00] Xung quanh hàng tỉ thứ đâu đâu khiến anh đau đầu
[00:31.50] Chẳng thể giữ anh thôi làu bàu
[00:35.00] Chỉ cần được sát bên vai, không ngừng nói bên tai trên từng con phố quen
[00:41.00] Và nụ cười ấy lung linh, anh đã trót rung rinh, nghĩ về em mỗi đêm
[00:46.50] Sâu bên trong anh lâu nay bao nhiêu tư tình
[00:50.00] Thường ngày đôi môi anh hơi kiệm lời
[00:53.50] Vậy mà khi bên em anh chẳng thể thấy được cách để giữ mình
[00:58.00] Kể người nghe bao nhiêu là câu chuyện đời
[01:02.00] Từng lạ như thế, giờ tới thân quen
[01:05.50] Chẳng phải là Superman nhưng nếu người cần anh sẽ bay tới nơi em
[01:10.50] Đừng cứ lo xa mãi thôi vì chặng đường nào rồi cũng sẽ tới
[01:15.00] Khi em nép sát mình về phía anh mới thấy được sự yên bình
[01:20.00] Cảm ơn em đã chăm sóc anh suốt bao nhiêu mùa xuân qua
[01:24.50] Ươm trái tim nở rộ ngàn đóa hoa
[01:28.50] Người mang tia nắng tới khiến anh cảm nhận được tình yêu
[01:33.00] Cảm ơn những bão tố cho ta học cách để thấu hiểu
[01:37.50] Dù anh nhiều lắm nỗi lo nhưng em vẫn chọn nơi anh
[01:42.00] Muốn sẻ chia mỏi mệt cùng với anh
[01:46.00] Ngàn ngôi sao lấp lánh trên cao như đang thầm cầu chúc đôi mình
[01:51.00] Sẽ luôn giăng nỗi nhớ cho nhau y như ngày đầu tiên
[01:56.00] Đắm say trong tình yêu
[02:00.00] Ye, không biết phải làm sao để mà thoát ra giờ nhờ
[02:04.50] Yêu đương vào một tí đầu lại ngẩn ngơ
[02:08.50] Hết yêu rồi phải nói em đừng có giả vờ
[02:12.50] Để con tim này tổn thương viết cả tấn thơ
[02:17.00] Baby em lạnh giá như cơn mưa ơ thờ
[02:21.00] Anh không chạy vào trong cứ để nó ngấm cơ
[02:25.00] Rồi lại rét run it's over
[02:28.50] Phải em hôn nhẹ vào môi thì mới ấm cơ
[02:33.00] Hấp nhờ, bao lâu rồi mà vẫn chờ
[02:36.50] Đi tìm một món quà bất ngờ trong giấc mơ này
[02:41.00] Chàng rapper răng miệng có bao nhiêu chuyện đang muốn tỏ bày
[02:46.00] Cũng chẳng cần phải copy ai
[02:49.50] Baby em chỉ cần bật bài này ở Spotify
[02:54.00] Đủ để thấy youngboy đã trao cho mình em
[02:58.00] Quyền cầm tay anh vượt qua những tháng ngày
[03:03.00] Được ôm anh như này...
[03:10.00] Đắm say trong tình yêu...
[03:30.00] ♪ ♫ ♪`,

    'de-danh-cho-em': `[00:00.00] Dangrangto - để dành cho em
[00:05.50] Feat. DONAL - Album Trái Tim Băng Bó
[00:10.00] ♪ ♫ ♪
[00:15.00] Mùa đông ghé tới
[00:17.50] Lá vàng rơi đầy rồi lại bay vèo vội lướt qua anh
[00:21.00] Như những cuộc tình chóng vánh
[00:23.50] Cặp tình nhân nói cười lượn đi đâu loanh quanh
[00:26.50] Lại càng làm anh thấy ngứa mắt ghê sao mình hoài không biết cách
[00:30.50] À thì là vì ngoài kia còn bao người, họ lãng mạn
[00:34.00] Là zai đẹp, hoặc siêu giàu, chẳng khó gì để tìm được một người hơn anh
[00:38.50] Ngày xưa anh cũng đã ngu ngơ trao đi con tim chân thành
[00:42.50] Mà họ lại cứ đánh rơi để hi vọng nơi anh tan tành
[00:46.50] Và điều khó nhất, một mình thì hơi côi
[00:49.50] Hà Nội gió bấc, do you wanna dựa đầu vào nơi tôi?
[00:53.00] Điều gì phiền muộn nói nhau nghe đi nào xem là hôm nay sao rồi
[00:57.00] Mình cất lên câu "xin chào", anh đã sợ ngày phải xa rời
[01:01.00] Ngồi sau xe anh, và đừng né tránh
[01:04.00] Tình yêu ở đấy đó nên anh mong là em sẽ thấy nó
[01:08.00] Vì anh lại ngốc nghếch trao đi cho em con tim chân thành
[01:12.00] Nó chỉ muốn được yêu thương...
[01:15.50] À hóa ra em đây rồi
[01:18.50] Người chở che con tim chỉ sợ đánh mất
[01:22.50] Bước ra từ trong những giấc mơ rồi lại hằn vào trí nhớ, đến bao giờ?
[01:29.50] Một phần chỉ sợ đau nữa thôi
[01:32.50] Phần kia lại muốn cô này phải là của tôi
[01:36.00] Chơi bời chán chưa anh muốn đi đường dài?
[01:39.50] Đứng đây ngóng em đón anh về tương lai
[01:43.50] Đều là để dành cho em, để dành cho em
[01:47.00] Chẳng cần ai, keep you mine
[01:50.00] Vì anh vẫn sẽ trao niềm tin vào em dù mong manh
[01:54.00] Nhẹ tay chút nhé chân thành vẫn còn đọng lại trong anh
[01:58.50] Biến nhau thành những thói quen
[02:02.00] Gửi trái tim ở đó, nơi em...
[02:07.00] Baby, em đâu rồi? Nhanh lên anh đang đợi
[02:11.00] Anh solo với đời, biết bao nhiêu năm giời
[02:15.00] Hôm nay anh đang ngầu, trông ăn chơi quá trời
[02:19.00] Trên con xe wave tàu, chỉ là mình chờ gặp cô bé nói câu xin chào
[02:24.00] Khóa trái tim anh lại, xinh gái với đa tài, nhõng nhẽo bên anh hoài
[02:29.00] Còn anh có huy chương vàng bộ môn nhắn tin siêu xàm
[02:33.50] Ngồi viết tiếp lên trang dài để duyên số ta an bài
[02:38.00] Vì bên em, anh lạc trong tình yêu mà không phải chơi vơi
[02:42.50] Ông trời giấu em đi đâu, sao mà giờ này mới tới
[02:47.00] Phải cớ sao em phải chần chừ mãi, để dựa đầu vào vai của một chàng đẹp trai
[02:52.00] Mặc kệ sự sợ hãi, everything will be alright, baby...
[02:58.00] À hóa ra em đây rồi!
[03:02.00] Người chở che con tim chỉ sợ đánh mất...
[03:20.00] Đều là để dành cho em...
[03:45.00] ♪ ♫ ♪`,

    'mon-qua': `[00:00.00] Dangrangto - món quà
[00:05.00] Feat. DONAL & Smiley Panda
[00:10.00] ♪ ♫ ♪
[00:14.50] Anh ghét em đắm say vui bên người ấy
[00:18.50] Trong phút giây em coi anh là kẻ xấu xa
[00:22.50] Nước mắt kia rớt rơi không để người thấy
[00:26.50] Vậy thì anh chúc em luôn yên vui bên người ấy
[00:30.50] Điếu thuốc kia đốt lên vào hai giờ sáng
[00:34.50] Chỉ vì anh không tin rằng chúng ta đã muộn màng
[00:38.50] Không dám tin tất cả chỉ còn nhiêu đây
[00:42.50] Phải chăng anh lại nhớ về...
[00:46.50] Vác vai, nói những lời thừa thãi, thôi kệ đúng sai
[00:51.00] Dù là đúng hay sai nhưng cố nói yêu đâu thể ngăn được
[00:55.50] Tốt thôi anh đi luôn anh đâu buồn ngang đường
[00:59.50] Có lẽ vị trí tại anh thua, vì anh chẳng thể trao cho em nụ cười
[01:04.50] Rồi trách móc anh nói là anh tồi
[01:08.50] Nếu tìm được người tốt hơn anh cũng yên lòng
[01:13.50] Baby em là món quà đẹp nhất trên đời này
[01:18.00] Nên anh dành người điều tốt nhất
[01:21.50] Thật ghét khi đó chẳng phải là mình
[01:25.50] Sẽ trao nụ cười trên môi người nên anh phải biến mất
[01:30.50] Liệu có ai thương em khóc thật nhiều khi yêu thật nhiều
[01:35.00] Trong căn phòng toàn là tiếng nấc
[01:39.00] Đành lướt đi thôi dù chân trong đêm chẳng bận lòng...
[01:44.50] Món quà vô giá trao người sau
[01:49.00] Dù tim anh mang nghìn vết đau
[01:53.50] Chúc em bình yên nơi phương trời mới
[01:58.50] Món quà anh giữ trọn một đời...
[02:15.00] Baby em là món quà đẹp nhất trên đời này...
[02:40.00] ♪ ♫ ♪`,

    'mot-ly': `[00:00.00] Dangrangto - một ly
[00:05.50] Feat. Hoàng Tôn - Prod. DONAL
[00:11.00] ♪ ♫ ♪
[00:15.00] Nhẹ nhàng lướt đi qua nhau, xóa đi cơn đau
[00:19.00] Môi chạm môi, vai kề vai, ta phải là của nhau
[00:23.50] Hãy cho anh say một chút trong đôi mắt người
[00:27.50] Rồi giây phút cứ nhanh trôi để ta chìm sâu trong bóng đêm
[00:32.00] With me you'll be alright, no need for disguise
[00:36.00] Em sexy with your body, không có chỗ chê
[00:40.50] Và em khiến anh hypnotized cuz you're my kryptonite
[00:45.00] Vì em, chính em, người ơi...
[00:49.50] Anh không ngăn được lý trí khi trông thấy em, mời một ly nhớ
[00:54.00] Đôi môi kia có mấy tí mà cướp mất anh lạ gì đâu mà
[00:58.50] Bao gã trai kia cứ hứa trao em trái tim sao mà lâu quá
[01:03.00] Bởi vì em xinh như thế thì ai chẳng muốn làm kẻ xấu xa
[01:08.00] Shawty anh chỉ nhìn vào đôi mắt ấy only
[01:12.00] Vì thực sự cũng chẳng có ý đồ gì
[01:16.00] Anh đang đi ngang qua đây với cả mấy homie
[01:20.00] Và tình cờ em cũng đã lấy luôn đi
[01:24.00] Sự chú ý với lý trí anh đã tự rơi vào tròng
[01:28.50] Martini này cay và nồng
[01:32.50] Không đâm xuyên thì đi đường vòng
[01:36.50] Anh chỉ muốn được ôm vào lòng...
[01:41.00] Rót cho anh thêm một ly, để quên đi những nghĩ suy
[01:46.00] Nâng chén say cùng màn đêm lạnh giá
[01:50.50] Ký ức xưa giờ trôi đi thật xa
[01:55.00] Uống cạn ly này tiễn bước em đi
[01:59.50] Còn vương chi giọt sầu trên khóe mi
[02:04.00] Một ly cho tình đã lỡ
[02:08.50] Một ly cho giấc mơ tan tành
[02:13.00] Uống để tim này bớt giá lạnh
[02:17.50] Giữa đêm đông chỉ còn mỗi anh...
[02:25.00] Mời một ly nhớ...
[02:40.00] ♪ Hoàng Tôn Chorus ♪
[03:20.00] Giữa đêm đông chỉ còn mỗi anh...
[03:50.00] ♪ ♫ ♪`,

    'quenvaonhau': `[00:00.00] Dangrangto - quenvaonhau (quen và nhau)
[00:05.50] Feat. DONAL & Smiley Panda
[00:11.00] ♪ ♫ ♪
[00:15.00] Mỗi khi em muốn anh lại tới
[00:18.50] Mỗi khi em muốn anh lại tới
[00:22.00] Em nói anh hư ghê anh thật tồi, sao mỗi đêm vẫn ghé sát gần tôi
[00:27.00] Lại nhấp nhô lên nhau thế này thôi, vậy muốn hay không muốn anh thay đổi
[00:32.50] Mưa lạnh giá muốn sang đây, cho em tàn phá
[00:36.50] Anh vừa mới hát một bài ca, quay lại đã thấy em take off your bra
[00:41.50] Sẽ chẳng thêm ai được chen giữa chúng ta, em chơi từ từ thôi
[00:46.00] Baby em đâu cần phải nghĩ suy nhiều vì ánh mắt bờ môi...
[00:51.00] Nó đang quện vào nhau
[00:54.50] Nó đang quện vào nhau
[00:58.00] Nó đang quện vào nhau...
[01:02.00] Nó đang quện vào nhau
[01:05.50] Nó đang quện vào nhau
[01:09.00] Nó đang quện vào nhau...
[01:14.00] Quen vào nhau trong từng hơi thở
[01:18.00] Quen vào nhau không chút đắn đo
[01:22.00] Đêm nay ta đốt cháy màn đêm
[01:26.50] Quen và nhau mãi không quên...
[01:40.00] Quen vào nhau không chút đắn đo...
[02:20.00] Nó đang quện vào nhau...
[03:10.00] ♪ ♫ ♪`,

    'tot-cho-anh': `[00:00.00] Dangrangto - tốt cho anh
[00:05.50] Feat. DONAL - Album Trái Tim Băng Bó
[00:11.00] ♪ ♫ ♪
[00:15.50] Khép đôi mắt, anh mong mọi chuyện sẽ trôi qua nhanh
[00:19.50] Đến những giấc mơ, em còn chẳng chịu tha cho anh
[00:24.00] Siết chặt em mà quên mất hai chúng ta đã over
[00:28.00] Không rời tay dù tâm trí anh nó đang bắt đầu nhớ...
[00:33.00] Anh sẽ chẳng thể tin vào ai như thế nữa
[00:37.00] Tin làm gì để tim hàng ngàn vết cứa, ôi giời ơi
[00:42.00] Như thế, anh nghĩ tốt cho anh mà thôi
[00:46.50] Em cũng không bận lòng mà ở bên ai
[00:50.50] Ánh mắt xưa em ngoan hiền đang ở đâu?
[00:54.50] Nói quên em, nhưng sao giận dai nhớ lâu...
[00:59.00] Tốt cho anh, tốt cho em, ta dừng lại ở đây thôi.
[01:05.00] Buông tay nhau để cả hai tìm niềm vui mới
[01:10.00] Chẳng cần phải trông chờ hay nghĩ ngợi
[01:15.00] Tốt cho anh, ta dừng lại ở đây thôi...
[01:30.00] Khép đôi mắt, anh mong mọi chuyện sẽ trôi qua nhanh...
[02:10.00] Tốt cho anh, tốt cho em...
[02:50.00] ♪ ♫ ♪`,

    'wrong-times': `[00:00.00] Dangrangto - wrong times (interlude)
[00:05.00] Feat. Puppy & DONAL - Album Trái Tim Băng Bó
[00:10.00] ♪ ♫ ♪
[00:13.00] Em quay đi ta mất nhau, yêu thương kia đành cất sâu
[00:17.50] Yeah con tim anh đã rất đau, đi nơi đâu để có phép nhiệm màu
[00:22.00] Anh không muốn phải níu đâu, hai ta chưa từng hiểu nhau
[00:26.50] Cứ chạy đi tìm nơi mà em thấy em thuộc về
[00:31.00] Vậy em phải đi về đâu phía trước toàn vực sâu
[00:35.50] Bao nhiêu là cạm bẫy vẫn đang chờ em khiến em chìm sâu
[00:40.00] Và có những lúc gục ngã vụt mất niềm tin yeah I'm a loner
[00:45.00] Giam mình trong màn đêm cô đơn bủa vây chẳng thấy ai đâu nhờ...
[00:50.50] Wrong times, ta gặp nhau sai thời điểm
[00:55.00] Để tình yêu trở thành niềm nguy hiểm
[00:59.50] Trôi dạt giữa muôn ngàn tiếc nuối
[01:04.00] Wrong times, đành buông tay nhau thôi...
[01:12.00] Đành buông tay nhau thôi...
[01:25.00] ♪ ♫ ♪`,

    'xuong-rong': `[00:00.00] Dangrangto - xương rồng
[00:05.50] Intro Album Trái Tim Băng Bó
[00:10.50] ♪ ♫ ♪
[00:15.00] Chắc em không lộng lẫy, kiêu sa tựa hoa hồng
[00:19.50] Chắc em không gần gũi, trên thân toàn gai nhọn
[00:24.00] Chắc hương thơm chẳng vấn vương bao người xiêu lòng
[00:28.50] Điều gì khiến cho ai từng đến bên em rồi cũng sẽ chọn đi?
[00:33.50] Thế gian kia tàn nhẫn coi em là xương rồng
[00:38.00] Vậy thì có hay không một người sẽ tới đây?
[00:42.00] Nắm lấy tay em khi vừa thức dậy
[00:45.50] Ôm lấy em thật chặt vào lúc này, baby
[00:49.50] Một người chịu đi tưới mát chiếc cây khô cằn
[00:53.50] Dù là cỏ lạ và hoa thơm kéo tới đây vô vàn
[00:58.00] Mặc kệ trời nắng cháy rát ở nơi sa mạc
[01:02.00] Và mặc kệ là nhiều gai đâm nhưng vẫn luôn chọn cố gắng
[01:06.50] Vì mình cần được yêu cũng giống như xương rồng
[01:10.50] Cần phải đón lấy chút sương mai để nở lên hoa hồng
[01:15.00] Chờ một người đặc biệt để sà vào lòng thật lâu
[01:19.50] Làm dịu bao cơn đau em thường cất giấu
[01:24.00] Em đừng khóc, ai sẽ lau đi hết nước mắt em long lanh?
[01:29.00] Mạnh mẽ lắm cũng sẽ có khi mong manh
[01:33.50] Nắng cháy da nhưng trong lòng trăm đợt sóng đánh
[01:38.00] Bởi vì vết thương lòng đâm sâu, em trở thành chiếc xương rồng
[01:43.00] Quay đi, em bỏ lại mình của ngày xưa
[01:47.00] Không cho ai làm tổn thương em nữa
[01:52.00] Huh-uh, huh-uh, huh, yeah-eh-eh
[01:56.50] Đừng lo lắng nhé, dựa vai anh...
[02:01.00] Cứ tin anh, baby, đã có anh đây rồi
[02:05.50] Chẳng sao đâu, cơn đau sẽ qua thật nhanh thôi
[02:10.00] Nép lên vai và cho anh thêm một cơ hội
[02:14.50] Và tháng năm sau này để anh cầm tay dẫn lối
[02:19.00] Em đừng khóc, anh sẽ lau đi hết nước mắt em long lanh
[02:24.00] Theo anh đi tìm lại mình của ngày xưa
[02:29.00] Không cho ai làm tổn thương em nữa...
[02:40.00] Cứ tin anh baby...
[03:20.00] Xương rồng nở hoa giữa sa mạc cằn khô...
[03:50.00] ♪ ♫ ♪`,

    'mot-bai-hat-khong-vui-may': `[00:00.00] T.R.I x Dangrangto x DONAL - một bài hát không vui mấy
[00:06.00] Extended Version
[00:11.00] ♪ ♫ ♪
[00:16.00] Đã qua bao lâu mà sao cứ ngỡ như đã xa nhau chỉ vài hôm
[00:21.00] Thời gian đã lấy đi em, lấy đi một nụ cười
[00:25.50] Dường như em đã là một ai khác, chẳng còn là của anh
[00:31.00] Đã thôi bên nhau mà trong ánh mắt em sao chẳng khác như lần đầu
[00:37.00] Từng là của nhau sao chẳng nói nên câu
[00:41.50] Thấy em vẫn cười cớ sao mà anh đau lòng muốn thốt lên...
[00:48.00] Thật ra anh đâu vui mấy
[00:51.50] Khi ấy, anh đâu biết trong ta ai là người sai
[00:56.50] Nên mãi buồn em vô cớ
[01:00.00] Đến bây giờ, thì mới biết nhưng chẳng thể hối tiếc
[01:05.00] Em à, anh ngốc thế mà!
[01:09.00] Dù rằng cho em đã cố giữ, anh cứ
[01:13.50] Chẳng muốn lắng nghe tâm tư mà em kể
[01:17.50] Anh để mặc cho em khóc
[01:21.00] Anh vô tình, đừng trách nhé
[01:24.50] Ai rồi cũng sẽ lớn hơn mà
[01:28.50] Chỉ là em chẳng thấy đâu...
[01:34.00] ♪ Dangrangto Rap Verse ♪
[01:45.00] Giọt sầu rơi rớt trên bờ mi này
[01:50.00] Anh đã cố nhưng đâu thể níu lấy
[01:55.00] Cuộc tình xưa giờ đây như khói bay
[02:00.00] Thật ra anh đâu vui mấy...
[02:15.00] Em à, anh ngốc thế mà!
[02:30.00] Chỉ là em chẳng thấy đâu...
[03:10.00] ♪ ♫ ♪`
};

const DEFAULT_LYRICS = ALBUM_LYRICS_DB['danh-roi'];

/**
 * Chuẩn hóa tiêu đề bài hát để tìm key lời bài hát phù hợp
 */
function getLyricsKeyForTitle(title) {
    if (!title) return 'danh-roi';
    const s = title.toLowerCase()
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
    if (s.includes('vung vay') || s.includes('vong vay') || s.includes('vung-vay')) return 'vung-vay';
    if (s.includes('baby') || s.includes('doi co lau') || s.includes('anh doi')) return 'baby-anh-doi-co-lau';
    if (s.includes('bolero')) return 'bolero-buon';
    if (s.includes('dam say')) return 'dam-say-trong-tinh-yeu';
    if (s.includes('de danh')) return 'de-danh-cho-em';
    if (s.includes('mon qua')) return 'mon-qua';
    if (s.includes('mot ly')) return 'mot-ly';
    if (s.includes('quen') && s.includes('nhau')) return 'quenvaonhau';
    if (s.includes('tot cho anh')) return 'tot-cho-anh';
    if (s.includes('wrong time')) return 'wrong-times';
    if (s.includes('xuong rong')) return 'xuong-rong';
    if (s.includes('khong vui')) return 'mot-bai-hat-khong-vui-may';
    if (s.includes('danh roi')) return 'danh-roi';
    return s.replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'custom-track';
}

/**
 * Lấy lời bài hát theo tiêu đề bài hát cụ thể
 */
function getLyricsForTrack(title) {
    if (!title) return ALBUM_LYRICS_DB['danh-roi'];
    const key = getLyricsKeyForTitle(title);
    const custom = localStorage.getItem('profile_lyrics_' + key);
    if (custom && custom.trim().length > 0) return custom;
    if (key === 'danh-roi') {
        const oldCustom = localStorage.getItem(STORAGE_KEYS.LYRICS);
        if (oldCustom && oldCustom.trim().length > 0) return oldCustom;
        return ALBUM_LYRICS_DB['danh-roi'];
    }
    return ALBUM_LYRICS_DB[key] || '';
}

/**
 * Lưu lời bài hát cho bài hát cụ thể
 */
function saveLyricsForTrack(title, text) {
    const key = getLyricsKeyForTitle(title);
    localStorage.setItem('profile_lyrics_' + key, text || '');
    if (key === 'danh-roi') {
        localStorage.setItem(STORAGE_KEYS.LYRICS, text || '');
    }
    notifyDataChanged('lyrics');
}

function getStoredLyrics() {
    return getLyricsForTrack('danh-roi');
}

function saveStoredLyrics(text) {
    saveLyricsForTrack('danh-roi', text);
}

/**
 * Lấy độ lệch thời gian (offset) theo ID bài hát (tính bằng giây, từ -10s đến +10s)
 */
function getSongOffset(trackId) {
    if (!trackId) return 0.50;
    const cleanId = String(trackId).trim();
    const raw = localStorage.getItem(`profile_lyrics_offset_${cleanId}`);
    if (raw !== null && !isNaN(parseFloat(raw))) {
        const val = parseFloat(raw);
        return Math.max(-10, Math.min(10, Math.round(val * 100) / 100));
    }
    return DEFAULT_SONG_OFFSETS[cleanId] !== undefined ? DEFAULT_SONG_OFFSETS[cleanId] : 0.50;
}

/**
 * Lưu độ lệch thời gian (offset) theo ID bài hát
 */
function saveSongOffset(trackId, offset) {
    if (!trackId) return 0;
    const cleanId = String(trackId).trim();
    const val = typeof offset === 'number' ? offset : parseFloat(offset) || 0;
    const clamped = Math.max(-10, Math.min(10, Math.round(val * 100) / 100));
    localStorage.setItem(`profile_lyrics_offset_${cleanId}`, clamped.toFixed(2));
    notifyDataChanged('lyrics_offset');
    return clamped;
}

/**
 * Lấy độ lệch thời gian (offset) tương thích ngược
 */
function getStoredLyricsOffset(trackId) {
    if (trackId) {
        return getSongOffset(trackId);
    }
    const raw = localStorage.getItem(STORAGE_KEYS.LYRICS_OFFSET);
    if (raw !== null && !isNaN(parseFloat(raw))) {
        const val = parseFloat(raw);
        return Math.max(-10, Math.min(10, val));
    }
    return 0;
}

function saveStoredLyricsOffset(offset, trackId) {
    const val = typeof offset === 'number' ? offset : parseFloat(offset) || 0;
    const clamped = Math.max(-10, Math.min(10, Math.round(val * 100) / 100));
    if (trackId) {
        saveSongOffset(trackId, clamped);
    }
    localStorage.setItem(STORAGE_KEYS.LYRICS_OFFSET, clamped.toFixed(2));
    notifyDataChanged('lyrics_offset');
}

// ==========================================================================
// QUẢN LÝ DỮ LIỆU VOICELINES (IndexedDB cho Audio & localStorage cho Metadata)
// ==========================================================================
const VOICELINES_CONFIG_KEY = STORAGE_KEYS.VOICELINES;

const DEFAULT_VOICELINES_CONFIG = {
    characterName: 'OMEN',
    characterRole: 'CONTROLLER // SHADOW',
    autoNext: false,
    list: [
        {
            id: 'omen_vl_select',
            title: 'I am the beginning',
            subtitle: 'I am the beginning, I am the end.',
            fileName: 'omen_select.mp3',
            audioUrl: 'assets/audio/voicelines/omen_select.mp3',
            duration: 3.76,
            isDefault: true
        }
    ]
};

function getStoredVoicelinesConfig() {
    try {
        const raw = localStorage.getItem(VOICELINES_CONFIG_KEY);
        if (raw !== null && raw !== undefined) {
            const parsed = JSON.parse(raw);
            if (parsed && Array.isArray(parsed.list)) {
                // Lọc bỏ 2 voiceline đã xóa nếu còn lưu cache trong localStorage cũ của trình duyệt
                const filtered = parsed.list.filter(item => 
                    item.id !== 'omen_vl_nightmare' && 
                    item.id !== 'omen_vl_boo' && 
                    item.title !== 'Escape my nightmare' && 
                    item.title !== 'Boo!'
                );
                if (filtered.length > 0) {
                    parsed.list = filtered;
                    return parsed;
                }
            }
        }
    } catch (e) {
        console.error('Lỗi đọc cấu hình voicelines:', e);
    }
    // Trả về bản sao của cấu hình mẫu mặc định để hiển thị HUD ấn tượng ngay lần đầu
    return JSON.parse(JSON.stringify(DEFAULT_VOICELINES_CONFIG));
}

function saveStoredVoicelinesConfig(config) {
    try {
        localStorage.setItem(VOICELINES_CONFIG_KEY, JSON.stringify(config));
        notifyDataChanged('voicelines');
    } catch (e) {
        console.error('Lỗi lưu cấu hình voicelines:', e);
    }
}

async function saveVoicelineAudio(id, blob, fileName) {
    try {
        const db = await openAudioDB();
        const storeName = db.objectStoreNames.contains(STORE_MEDIA) ? STORE_MEDIA : (
            db.objectStoreNames.contains(STORE_AUDIO) ? STORE_AUDIO : null
        );
        if (!storeName) {
            throw new Error('Không tìm thấy objectStore nào trong IndexedDB');
        }
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const data = {
                blob: blob,
                fileName: fileName,
                type: blob.type || 'audio/mpeg',
                size: blob.size,
                updatedAt: Date.now()
            };
            const req = store.put(data, `voiceline_${id}`);
            req.onsuccess = () => {
                notifyDataChanged('voicelines_audio');
                resolve(true);
            };
            req.onerror = () => reject(req.error || new Error('Lỗi khi ghi file vào IndexedDB'));
            tx.onabort = () => reject(tx.error || new Error('Giao dịch IndexedDB bị hủy'));
        });
    } catch (err) {
        console.error('Lỗi lưu voiceline audio:', err);
        throw err;
    }
}

async function getVoicelineAudio(id) {
    try {
        const db = await openAudioDB();
        const key = `voiceline_${id}`;

        // 1. Thử tìm trong STORE_MEDIA nếu có
        if (db.objectStoreNames.contains(STORE_MEDIA)) {
            const res = await new Promise((resolve) => {
                try {
                    const tx = db.transaction(STORE_MEDIA, 'readonly');
                    const store = tx.objectStore(STORE_MEDIA);
                    const req = store.get(key);
                    req.onsuccess = () => resolve(req.result || null);
                    req.onerror = () => resolve(null);
                } catch (e) {
                    resolve(null);
                }
            });
            if (res) return res;
        }

        // 2. Dự phòng tìm trong STORE_AUDIO
        if (db.objectStoreNames.contains(STORE_AUDIO)) {
            return new Promise((resolve) => {
                try {
                    const tx = db.transaction(STORE_AUDIO, 'readonly');
                    const store = tx.objectStore(STORE_AUDIO);
                    const req = store.get(key);
                    req.onsuccess = () => resolve(req.result || null);
                    req.onerror = () => resolve(null);
                } catch (e) {
                    resolve(null);
                }
            });
        }
        return null;
    } catch (err) {
        console.error('Lỗi lấy voiceline audio:', err);
        return null;
    }
}

async function deleteVoicelineAudio(id) {
    try {
        const db = await openAudioDB();
        const key = `voiceline_${id}`;
        const promises = [];

        if (db.objectStoreNames.contains(STORE_MEDIA)) {
            promises.push(new Promise((resolve) => {
                try {
                    const tx = db.transaction(STORE_MEDIA, 'readwrite');
                    const store = tx.objectStore(STORE_MEDIA);
                    const req = store.delete(key);
                    req.onsuccess = () => resolve(true);
                    req.onerror = () => resolve(false);
                } catch (e) {
                    resolve(false);
                }
            }));
        }

        if (db.objectStoreNames.contains(STORE_AUDIO)) {
            promises.push(new Promise((resolve) => {
                try {
                    const tx = db.transaction(STORE_AUDIO, 'readwrite');
                    const store = tx.objectStore(STORE_AUDIO);
                    const req = store.delete(key);
                    req.onsuccess = () => resolve(true);
                    req.onerror = () => resolve(false);
                } catch (e) {
                    resolve(false);
                }
            }));
        }

        await Promise.all(promises);
        notifyDataChanged('voicelines_audio');
        return true;
    } catch (err) {
        console.error('Lỗi xóa voiceline audio:', err);
        return false;
    }
}

function notifyDataChanged(type) {
    window.dispatchEvent(new CustomEvent('profile-data-updated', { detail: { type } }));
    try {
        localStorage.setItem('profile_sync_ping', `${type}_${Date.now()}`);
    } catch (e) {}
}

// Export ra window global
window.ProfileStorage = {
    saveAudioFile,
    getAudioFile,
    deleteAudioFile,
    saveBackgroundVideoFile,
    getBackgroundVideoFile,
    deleteBackgroundVideoFile,
    saveBackgroundImageFile,
    getBackgroundImageFile,
    deleteBackgroundImageFile,
    getStoredLinks,
    saveStoredLinks,
    getStoredSongName,
    saveStoredSongName,
    getStoredDiscordId,
    saveStoredDiscordId,
    getStoredBackgroundConfig,
    saveStoredBackgroundConfig,
    getStoredVoicelinesConfig,
    saveStoredVoicelinesConfig,
    saveVoicelineAudio,
    getVoicelineAudio,
    deleteVoicelineAudio,
    getStoredLyrics,
    saveStoredLyrics,
    getLyricsForTrack,
    saveLyricsForTrack,
    getLyricsKeyForTitle,
    getSongOffset,
    saveSongOffset,
    DEFAULT_SONG_OFFSETS,
    ALBUM_LYRICS_DB,
    getStoredLyricsOffset,
    saveStoredLyricsOffset,
    DEFAULT_LYRICS,
    getPlaylistTracks,
    savePlaylistTracks,
    getAudioSourceConfig,
    saveAudioSourceConfig,
    notifyDataChanged
};
