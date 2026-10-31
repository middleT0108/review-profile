# Omen Dark Energy Profile - Website Profile Cá Nhân

Website giới thiệu mạng xã hội cá nhân với phong cách Omen (Dark Violet Theme) được xây dựng hoàn toàn bằng **HTML, CSS và JavaScript thuần**.

---

## 📁 Cấu Trúc Dự Án

```
review-profile/
├── assets/
│   ├── icon.png                 # Biểu tượng Omen nền trong suốt dùng cho cover và đại diện
│   └── icons/                   # Bộ icon SVG các mạng xã hội có sẵn
│       ├── facebook.svg, discord.svg, youtube.svg, tiktok.svg, github.svg...
├── css/
│   └── style.css                # Toàn bộ mã định kiểu giao diện Dark Violet & Responsive
├── js/
│   ├── common.js                # Quản lý hiệu ứng chuyển trang (Fade In / Fade Out)
│   ├── storage.js               # Quản lý LocalStorage & IndexedDB (lưu trữ nhạc dung lượng lớn)
│   ├── icons-data.js            # Thư viện dữ liệu icon mạng xã hội
│   ├── lanyard.js               # Kết nối WebSocket & REST API Lanyard lấy trạng thái Discord realtime
│   ├── canvas-effect.js         # Hiệu ứng Canvas bóng tối năng lượng Omen tương tác cao cấp
│   ├── music-player.js          # Trình phát nhạc nền với tua tiến độ, định dạng mm:ss
│   └── dashboard.js             # Logic quản trị thêm, sửa, xóa liên kết, nhạc và Discord
├── cover.html                   # TRANG BÌA: Nền mờ tím 60px, icon Omen nổi nhẹ
├── index.html                   # TRANG CHÍNH: Nền video YouTube 16:9, Canvas ma thuật, 2 cột liên kết
├── dashboard.html               # TRANG QUẢN TRỊ: Thêm sửa xóa link, tải nhạc IndexedDB, liên kết Discord
└── README.md                    # Hướng dẫn chi tiết
```

---

## ⚡ Các Tính Năng Nổi Bật

### 1. Trang Bìa (`cover.html`)
- Hiệu ứng nền tím đa tầng (`#6b3fe0`, `#3a1d8f`, `#12082e`) làm mờ mạnh bằng CSS `filter: blur(60px)` trên nền `#2a1561`.
- Biểu tượng `assets/icon.png` sắc nét với hiệu ứng floating animation nhấp nhô nhẹ và hào quang tím.
- Nhấp chuột hoặc chạm vào bất kỳ đâu để chuyển sang trang chính với hiệu ứng Fade mượt mà.

### 2. Trang Chính (`index.html`)
- **Video nền YouTube**:
  - Nhúng video Omen Fanart (`LUd14Xdfk68`) phủ kín toàn màn hình 16:9 (chuẩn cover `object-fit`).
  - Tắt tiếng, lặp vô hạn, ẩn điều khiển, `pointer-events: none`.
  - Cơ chế tự động Fallback nền `#2a1561` nếu mất mạng hoặc lỗi tải video.
  - Dòng ghi công nguồn video nhỏ ở góc dưới.
- **Canvas bóng tối năng lượng Omen**:
  - Tự động nhận diện thiết bị (80 hạt trên PC, 40 hạt trên Mobile).
  - Mạng tia sét kết nối giữa các hạt `< 85px` và tia sét nối về con trỏ chuột `< 150px` với điểm giữa rung ngẫu nhiên ±5px.
  - Vệt sáng theo chuột gồm 2 lớp (lớp ngoài tím 9px, lớp trong trắng mảnh 2px).
  - Con trỏ ma thuật phát sáng quầng tím, tự phình to khi nhấp giữ chuột.
  - Đẩy hạt khi chuột vào gần `< 90px`.
  - Hố đen hút hạt khi giữ chuột `< 260px` và bung tỏa khi thả ra.
  - Hiệu ứng click: 2 vòng sóng xung kích, 44 tia lửa bắn ra mọi hướng và nháy sáng tím toàn màn hình.
  - Parallax 2 cột liên kết dịch chuyển nhẹ tối đa 8px theo vị trí chuột.
  - Dừng vẽ khi ẩn tab (`document.hidden`) và tôn trọng `prefers-reduced-motion`.
- **Liên kết 2 cột**:
  - Nằm đối xứng hai bên nhân vật Omen ở giữa màn hình.
  - Chỉ hiển thị liên kết người dùng đã thêm từ Dashboard (nếu chưa thêm link thì để trống hoàn toàn).
- **Thanh nhạc nền**:
  - Tự động ẩn nếu chưa thêm nhạc.
  - Đọc dữ liệu trực tiếp từ **IndexedDB**.
  - Không tự phát theo quy chuẩn trình duyệt, chỉ phát khi người dùng bấm Play.
- **Huy hiệu Discord**:
  - Chấm xanh "Đang online" (hoặc trạng thái chơi game/nghe nhạc), chấm xám khi offline.

### 3. Trang Dashboard (`dashboard.html`)
- **Quản lý liên kết**: Thêm mới, chỉnh sửa, xóa liên kết mạng xã hội. Hỗ trợ chọn icon trong kho SVG hoặc tải ảnh icon bất kỳ lên.
- **Quản lý nhạc nền**: Lưu trực tiếp file âm thanh (.mp3, .ogg, .wav, .m4a) vào `IndexedDB` giúp chứa file dung lượng lớn mà không làm chậm trang. Xem trước và nghe thử trực tiếp.
- **Liên kết Discord**: Nhập ID Discord và kiểm tra kết nối ngay lập tức với Lanyard API.

---

## 🛠️ Hướng Dẫn Tùy Biến

1. **Cách thay Icon**:
   - Đặt ảnh logo/icon mới của bạn vào đường dẫn `assets/icon.png` (khuyến nghị ảnh PNG nền trong suốt).
2. **Cách thay Video nền YouTube**:
   - Mở tệp `index.html`, tìm thẻ `<iframe>` và thay đổi ID video `LUd14Xdfk68` bằng ID video YouTube bạn muốn dùng.
3. **Cách thêm / thay nhạc nền**:
   - Mở trang `dashboard.html` trên trình duyệt, cuộn xuống mục **Nhạc Nền Profile**, chọn file nhạc từ máy tính của bạn và nhập tên bài hát, sau đó bấm Lưu.
4. **Cách kích hoạt hiển thị trạng thái Discord**:
   - Lấy User ID Discord của bạn (bật Developer Mode trong Discord -> Chuột phải vào tên bạn -> Copy User ID).
   - Tham gia server Discord của Lanyard tại [discord.gg/lanyard](https://discord.gg/lanyard).
   - Nhập User ID vào ô Discord trên trang `dashboard.html` và bấm "Lưu ID".
