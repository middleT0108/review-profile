/**
 * ==============================================================================
 * CANVAS-EFFECT.JS - Hiệu Ứng Nền Mực Bóng Tối WebGL Đồng Bộ Với Video Background
 * ==============================================================================
 * 
 * 1. ĐỒNG BỘ 100% VỚI VIDEO BACKGROUND:
 *    - Nhận diện trực tiếp thẻ video nền (`#localBgVideo`).
 *    - Đồng bộ thời gian shader (`u_time`) từng microsecond với `video.currentTime`.
 *    - Video dừng -> hiệu ứng dừng; video phát -> hiệu ứng cuộn; video tua/lặp -> shader tự động đồng bộ.
 *    - Ánh xạ tọa độ `videoUV` theo thuật toán CSS `object-fit: cover` chuẩn:
 *      Khói dưới chân Omen và 2 dải xúc tu bóng tối bên hông luôn khớp 100% vào vị trí
 *      chân và bóng của Omen trong video trên mọi độ phân giải màn hình (16:9, Ultrawide, Mobile).
 * 
 * 2. HÌNH DẠNG MỰC CEL-SHADING & VALORANT OMEN SHADOW:
 *    - Vũng khói dưới chân Omen trên mặt sàn (y ~ 0.75 - 0.98, x ~ 0.35 - 0.65).
 *    - Hai cột khói/xúc tu bóng tối vươn lên theo video: dải trái sau súng, dải phải sau tay cầm dao.
 *    - Chừa khoảng trống trong suốt 100% cho mặt, mũ trùm, áo choàng và ngực của Omen.
 *    - Hai bên cạnh màn hình: Các dải mực đen uốn lượn cuộn trào từ dưới lên.
 *    - Mép RÁCH cọ khô cel-shading (dry brush), phản chiếu ướt sàn dưới (#6f78a8).
 * 
 * 3. BẢNG MÀU CHUẨN OMEN VALORANT (ĐỒNG BỘ VIDEO):
 *    - Mực đen sâu thẳm: #04060c và #0a0f24, #101a3d.
 *    - Viền sáng mỏng (Rim light) xanh điện #3d5cff / #2ce6ff trùng màu mắt Omen và lưỡi dao.
 *    - Nền trong suốt để video MP4 4K hiển thị sắc nét phía sau.
 *    - Vân bán sắc (Halftone) trong vùng bóng tối và hạt nhiễu phim (film grain).
 * 
 * 4. TƯƠNG TÁC CHUỘT / CHẠM:
 *    - Rê chuột: Xoáy cuộn mực quanh con trỏ (~180px) và để lại vệt mực đen.
 *    - Giữ chuột: Hút các dải mực về con trỏ, làm mực đặc quánh và co lại.
 *    - Bấm chuột: Nổ mực bắn tóe thành các giọt nhỏ kèm vòng sóng xung kích xanh điện.
 *    - Bấm đúp: Dịch chuyển bóng tối (teleport glitch 0.3s).
 */

// ==============================================================================
// CẤU HÌNH DỄ CHỈNH Ở ĐẦU FILE
// ==============================================================================
const INK_CONFIG = {
    colorPreset: 'blue',     // 'blue' (Khớp chuẩn video Valorant Omen) hoặc 'purple' (Tím Omen)
    inkDensity: 1.15,        // Độ đậm đặc của mực (0.5 - 2.0)
    flowSpeed: 0.65,         // Tốc độ cuộn của mực từ dưới lên
    swirlRadius: 180,        // Bán kính khuấy chuột (pixel)
    centerClearance: 0.36,   // Khoảng trống ở giữa cho nhân vật (0.2 - 0.5)
    brushRoughness: 0.08,    // Mép rách cọ (đã giảm để viền khói uốn lượn mịn màng hơn)
    enableHalftone: false,   // Tắt chấm bi (false = khói mực đen mịn nguyên khối, không bị rỗ chấm bi)
    filmGrain: 0.015,        // Hạt nhiễu nhẹ
    mobileScale: 0.75        // Tỉ lệ scale giảm tải cho điện thoại (0.5 - 0.8)
};

class InkShadowWebGL {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;

        this.videoElement = null;
        this.videoTime = 0.0;
        this.videoAspect = 16.0 / 9.0;

        this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || ('ontouchstart' in window);
        this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        this.gl = null;
        this.program = null;
        this.positionBuffer = null;
        this.aPosition = -1;
        this.uniforms = null;
        this.useFallback2D = false;

        // Kích thước
        this.width = 0;
        this.height = 0;
        this.scaleFactor = this.isMobile ? INK_CONFIG.mobileScale : 1.0;
        this.dpr = Math.min(window.devicePixelRatio || 1, 2) * this.scaleFactor;

        // Trạng thái tương tác chuột
        this.mouse = {
            x: -1000,
            y: -1000,
            prevX: -1000,
            prevY: -1000,
            vx: 0,
            vy: 0,
            speed: 0,
            isDown: 0.0,
            targetDown: 0.0,
            isHovering: false
        };

        // Vết mực loang & sóng khi click
        this.click = {
            x: -1000,
            y: -1000,
            time: 999.0
        };

        // Giọt mực bắn (Ink splatters)
        this.splatters = [];
        this.maxSplatters = this.isMobile ? 18 : 36;

        // Vệt mực đuôi chuột
        this.trailPoints = [];
        this.maxTrail = 16;

        // Hiệu ứng dịch chuyển / Glitch khi nhấp đúp
        this.glitch = 0.0;
        this.lastClickTime = 0;

        // Quản lý animation loop
        this.animationFrameId = null;
        this.startTime = performance.now();
        this.lastFrameTime = performance.now();

        this.init();
    }

    // ==========================================================================
    // LIÊN KẾT ĐỒNG BỘ VỚI VIDEO BACKGROUND
    // ==========================================================================
    bindVideo(video) {
        if (!video) return;
        this.videoElement = video;

        const updateAspect = () => {
            if (video.videoWidth && video.videoHeight) {
                this.videoAspect = video.videoWidth / video.videoHeight;
            }
        };

        if (video.readyState >= 1) {
            updateAspect();
        } else {
            video.addEventListener('loadedmetadata', updateAspect, { once: true });
        }

        const syncTime = () => {
            if (this.videoElement && !isNaN(this.videoElement.currentTime)) {
                this.videoTime = this.videoElement.currentTime;
            }
        };

        video.addEventListener('timeupdate', syncTime);
        video.addEventListener('seeking', syncTime);
        video.addEventListener('seeked', syncTime);
        video.addEventListener('play', () => {
            if (!this.reducedMotion) this.startLoop();
        });
    }

    init() {
        try {
            this.initWebGL();
        } catch (err) {
            console.warn('Lỗi khi khởi tạo WebGL, chuyển sang Canvas 2D dự phòng:', err);
            this.useFallback2D = true;
        }

        if (!this.gl || this.useFallback2D || !this.program) {
            this.switchToFallback2D();
            return;
        }

        this.resize();
        this.setupEvents();

        if (!this.isMobile) {
            document.body.classList.add('custom-cursor-active');
        }

        if (!this.reducedMotion) {
            this.startLoop();
        } else {
            this.renderStatic();
        }
    }

    // ==========================================================================
    // KHỞI TẠO WEBGL & FRAGMENT SHADER CEL-SHADING ĐỒNG BỘ VIDEO
    // ==========================================================================
    initWebGL() {
        const glOptions = {
            alpha: true,
            antialias: false,
            depth: false,
            stencil: false,
            premultipliedAlpha: false,
            preserveDrawingBuffer: false,
            powerPreference: 'high-performance'
        };

        this.gl = this.canvas.getContext('webgl', glOptions) || 
                  this.canvas.getContext('experimental-webgl', glOptions) ||
                  this.canvas.getContext('webgl2', glOptions);

        if (!this.gl) {
            this.useFallback2D = true;
            return;
        }

        const gl = this.gl;

        // Vertex shader đơn giản phủ toàn màn hình
        const vsSource = `
            attribute vec2 a_position;
            varying vec2 v_uv;
            void main() {
                v_uv = a_position * 0.5 + 0.5;
                v_uv.y = 1.0 - v_uv.y;
                gl_Position = vec4(a_position, 0.0, 1.0);
            }
        `;

        // Fragment Shader: fBm Warp + Đồng bộ Object-fit Video + Mask Chân Omen + Cel-shading
        const fsSource = `
            precision mediump float;
            varying vec2 v_uv;

            uniform vec2 u_resolution;
            uniform float u_time;
            uniform float u_video_aspect;
            uniform vec2 u_mouse;
            uniform vec2 u_mouse_vel;
            uniform float u_mouse_down;
            uniform vec2 u_click_pos;
            uniform float u_click_time;
            uniform float u_glitch;
            uniform float u_preset; // 0.0: Blue (khớp video), 1.0: Purple
            uniform float u_density;
            uniform float u_flow_speed;
            uniform float u_center_clear;
            uniform float u_roughness;
            uniform float u_grain_amt;
            uniform float u_enable_halftone;

            // Hàm noise ngẫu nhiên 2D
            float hash(vec2 p) {
                p = fract(p * vec2(123.34, 456.21));
                p += dot(p, p + 45.32);
                return fract(p.x * p.y);
            }

            float noise(vec2 p) {
                vec2 i = floor(p);
                vec2 f = fract(p);
                f = f * f * (3.0 - 2.0 * f);
                float a = hash(i);
                float b = hash(i + vec2(1.0, 0.0));
                float c = hash(i + vec2(0.0, 1.0));
                float d = hash(i + vec2(1.0, 1.0));
                return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
            }

            // fBm 4 octaves
            float fbm4(vec2 p) {
                float v = 0.0;
                float a = 0.5;
                mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
                for (int i = 0; i < 4; i++) {
                    v += a * noise(p);
                    p = rot * p * 2.05 + vec2(1.4, 2.3);
                    a *= 0.5;
                }
                return v;
            }

            void main() {
                vec2 uv = v_uv;
                vec2 fragCoord = uv * u_resolution;
                float screenAspect = u_resolution.x / u_resolution.y;
                float vAspect = u_video_aspect > 0.1 ? u_video_aspect : (16.0 / 9.0);

                // 1. ÁNH XẠ CHÍNH XÁC VIDEOUV THEO CSS "OBJECT-FIT: COVER"
                // Đảm bảo khói chân Omen luôn bám chặt vào vị trí Omen trong video trên mọi tỉ lệ màn hình
                vec2 videoUV = uv;
                if (screenAspect > vAspect) {
                    float scaleY = screenAspect / vAspect;
                    videoUV.y = (uv.y - 0.5) * scaleY + 0.5;
                } else {
                    float scaleX = vAspect / screenAspect;
                    videoUV.x = (uv.x - 0.5) * scaleX + 0.5;
                }

                // 2. HIỆU ỨNG NHIỄU HÌNH (GLITCH) KHI BẤM ĐÚP
                if (u_glitch > 0.01) {
                    float glitchLine = step(0.92, sin(uv.y * 75.0 + u_time * 28.0));
                    uv.x += glitchLine * (hash(vec2(u_time, uv.y)) - 0.5) * 0.06 * u_glitch;
                    videoUV.x += glitchLine * (hash(vec2(u_time, uv.y)) - 0.5) * 0.06 * u_glitch;
                }

                // 3. TƯƠNG TÁC CHUỘT: KHUẤY CUỘN XOÁY & HÚT MỰC
                vec2 mouseUV = u_mouse / u_resolution;
                vec2 mouseDelta = (uv - mouseUV);
                mouseDelta.x *= screenAspect;
                float distMouse = length(mouseDelta);

                float mouseInfluence = 1.0 - smoothstep(0.0, 0.22, distMouse);
                float swirl = mouseInfluence * length(u_mouse_vel) * 0.018;
                vec2 swirlOffset = vec2(-mouseDelta.y, mouseDelta.x) * swirl;
                vec2 pullOffset = mouseDelta * mouseInfluence * u_mouse_down * 0.25;

                vec2 warpedUV = uv - swirlOffset + pullOffset;
                vec2 warpedVideoUV = videoUV - swirlOffset + pullOffset;
                vec2 mouseNorm = (u_mouse / u_resolution) - 0.5;

                // 4. TẠO DẢI MỰC BẰNG DOMAIN-WARPED FBM (WARP 2 LẦN)
                float t = u_time * u_flow_speed;
                vec2 pNear = vec2(warpedUV.x * 2.3, warpedUV.y * 1.8 + t * 0.45) + mouseNorm * 0.025;
                vec2 pFar  = vec2(warpedUV.x * 1.8, warpedUV.y * 1.4 + t * 0.22) - mouseNorm * 0.015;

                // Warp 2 lần cho lớp gần
                vec2 q1 = vec2(fbm4(pNear), fbm4(pNear + vec2(5.2, 1.3)));
                vec2 r1 = vec2(fbm4(pNear + 3.0 * q1 + vec2(1.7, 9.2) + 0.14 * t), 
                               fbm4(pNear + 3.0 * q1 + vec2(8.3, 2.8) - 0.11 * t));
                float fNear = fbm4(pNear + 3.2 * r1);

                // Warp cho lớp xa
                vec2 q2 = vec2(fbm4(pFar + vec2(2.1, 4.3)), fbm4(pFar + vec2(1.5, 7.8)));
                float fFar = fbm4(pFar + 2.7 * q2);

                // 5. ĐỒNG BỘ HÌNH DÁNG KHÓI VỚI BÓNG TỐI CỦA OMEN TRONG VIDEO:
                // a) Vũng khói dưới chân Omen trên mặt sàn (y: 0.75 -> 1.0, x: 0.32 -> 0.68)
                float floorPuddle = (1.0 - smoothstep(0.0, 0.26, abs(warpedVideoUV.x - 0.5))) * smoothstep(0.72, 0.98, warpedVideoUV.y);

                // b) Dải khói bên trái vươn lên theo video (phía sau khẩu súng)
                float leftWave = sin(warpedVideoUV.y * 8.5 - t * 2.2) * 0.025;
                float leftPillarX = 0.36 + leftWave;
                float leftPillar = (1.0 - smoothstep(0.0, 0.09, abs(warpedVideoUV.x - leftPillarX))) * smoothstep(0.48, 0.88, warpedVideoUV.y);

                // c) Dải khói bên phải vươn cao theo video (phía sau tay cầm dao)
                float rightWave = cos(warpedVideoUV.y * 8.0 - t * 2.0) * 0.026;
                float rightPillarX = 0.61 + rightWave;
                float rightPillar = (1.0 - smoothstep(0.0, 0.10, abs(warpedVideoUV.x - rightPillarX))) * smoothstep(0.42, 0.88, warpedVideoUV.y);

                // d) Xúc tu khói sau lưng Omen
                float wingsX = abs(warpedVideoUV.x - 0.5);
                float wingsY = smoothstep(0.22, 0.52, warpedVideoUV.y) * (1.0 - smoothstep(0.52, 0.70, warpedVideoUV.y));
                float backWings = smoothstep(0.18, 0.32, wingsX) * (1.0 - smoothstep(0.32, 0.46, wingsX)) * wingsY;

                // Tổng hợp khói bám theo thân và chân Omen
                float omenSmokeSilhouette = clamp(floorPuddle * 1.25 + leftPillar * 0.95 + rightPillar * 0.95 + backWings * 0.70, 0.0, 1.0);

                // e) Vùng bảo vệ thân người Omen: Chừa khoảng trống 100% trong suốt cho mặt, mũ, áo choàng, ngực
                float bodyClearance = (1.0 - smoothstep(0.10, 0.22, abs(warpedVideoUV.x - 0.5))) * (1.0 - smoothstep(0.10, 0.72, warpedVideoUV.y));

                // f) Các dải mực hai bên viền màn hình (dùng uv toàn màn hình để ôm lấy giao diện và các liên kết)
                float distBorder = abs(uv.x - 0.5);
                float sideBands = smoothstep(u_center_clear * 0.55, u_center_clear + 0.16, distBorder);
                float sideRise = sideBands * (0.35 + 0.65 * smoothstep(0.08, 0.95, uv.y));

                // Tổng hợp mặt nạ khói mực hoàn chỉnh
                float totalInkMask = clamp(sideRise + omenSmokeSilhouette * (1.0 - bodyClearance * 0.96), 0.0, 1.0);
                totalInkMask += mouseInfluence * u_mouse_down * 0.45;

                // 6. CẮT NGƯỠNG CEL-SHADING & MÉP RÁCH CỌ KHÔ (DRY BRUSH)
                float dryBrushNoise = (noise(fragCoord * 0.32) - 0.5) * u_roughness;
                
                float baseThreshold = 0.82;
                float thresholdNear = baseThreshold - totalInkMask * 0.48 * u_density;
                float thresholdFar  = (baseThreshold - 0.04) - totalInkMask * 0.38 * u_density;

                float inkNear = smoothstep(thresholdNear + dryBrushNoise, thresholdNear + dryBrushNoise + 0.035, fNear);
                float inkFar  = smoothstep(thresholdFar + dryBrushNoise,  thresholdFar + dryBrushNoise + 0.045,  fFar);

                // Triệt tiêu ở vùng không có mặt nạ
                inkNear *= smoothstep(0.03, 0.22, totalInkMask);
                inkFar  *= smoothstep(0.03, 0.22, totalInkMask);

                // 7. VẾT LOANG & VÒNG SÓNG KHI BẤM CHUỘT
                if (u_click_time < 1.4) {
                    vec2 cDelta = (uv - u_click_pos);
                    cDelta.x *= screenAspect;
                    float cDist = length(cDelta);

                    float shockProgress = u_click_time / 1.4;
                    float waveRadius = u_click_time * 0.80;
                    float shockRing = (1.0 - smoothstep(0.0, 0.03, abs(cDist - waveRadius))) * (1.0 - shockProgress);
                    float splatterCore = (1.0 - smoothstep(0.0, 0.16 * (1.0 - shockProgress), cDist)) * (1.0 - shockProgress);
                    inkNear = max(inkNear, splatterCore);
                    fNear += shockRing * 0.35;
                }

                // 8. VIỀN SÁNG MỎNG (RIM LIGHT) Ở RANH GIỚI MỰC
                float rimNear = (1.0 - smoothstep(0.0, 0.045, abs((fNear + dryBrushNoise) - thresholdNear))) * inkNear;

                // 9. BẢNG MÀU ĐỒNG BỘ VIDEO
                vec3 colorInkMain, colorInkDeep, colorRim, colorWetReflect;

                if (u_preset < 0.5) {
                    // PRESET 1: XANH DƯƠNG ĐIỆN & NAVY (CHUẨN VALORANT OMEN WALLPAPER)
                    colorInkMain    = vec3(0.055, 0.090, 0.220); // #0e1738
                    colorInkDeep    = vec3(0.020, 0.035, 0.095); // #050918 Mực đen bóng tối sâu
                    colorRim        = vec3(0.240, 0.450, 1.000); // #3d73ff Rim light xanh điện
                    colorWetReflect = vec3(0.400, 0.480, 0.700); // #667bb3 Phản chiếu sàn ướt
                } else {
                    // PRESET 2: TÍM OMEN & DARK VOID
                    colorInkMain    = vec3(0.082, 0.039, 0.180); // #150a2e
                    colorInkDeep    = vec3(0.035, 0.015, 0.080); // #090414
                    colorRim        = vec3(0.616, 0.455, 1.000); // #9d74ff
                    colorWetReflect = vec3(0.545, 0.565, 0.769); // #8b90c4
                }

                // Phản chiếu ướt sàn dưới
                float wetGlow = smoothstep(0.55, 0.95, uv.y) * smoothstep(0.3, 0.85, fNear) * 0.42;
                vec3 inkColorWithReflection = mix(colorInkMain, colorWetReflect, wetGlow);

                vec3 finalColor = mix(colorInkDeep * 1.25, inkColorWithReflection, inkNear);
                finalColor += colorRim * rimNear * 0.90;

                // 10. VÂN BÁN SẮC (HALFTONE DOTS) CEL-SHADING (Tùy chọn bật/tắt)
                if (u_enable_halftone > 0.5) {
                    float dotGrid = sin(fragCoord.x * 0.45) * sin(fragCoord.y * 0.45);
                    float halftone = smoothstep(0.15, 0.75, dotGrid) * smoothstep(0.35, 0.9, inkNear);
                    finalColor = mix(finalColor, colorInkDeep * 0.65, halftone * 0.40);
                }

                // 11. HẠT NHIỄU PHIM
                float grain = (hash(fragCoord + fract(u_time * 12.3)) - 0.5) * u_grain_amt;
                finalColor += grain;

                // 12. HUD CẠNH TRÁI MÀN HÌNH
                if (uv.x < 0.055) {
                    float hudX = uv.x * u_resolution.x;
                    float hudY = uv.y * u_resolution.y;

                    float sq1 = step(abs(hudX - 22.0), 4.0) * step(abs(hudY - 180.0), 4.0) * step(0.4, sin(u_time * 3.5));
                    float dash1 = step(abs(hudX - 22.0), 8.0) * step(abs(hudY - 210.0), 1.5) * step(0.3, sin(u_time * 4.8 + 1.5));
                    float dash2 = step(abs(hudX - 22.0), 5.0) * step(abs(hudY - 222.0), 1.5) * step(0.3, sin(u_time * 4.8 + 1.5));
                    float dot1 = step(length(vec2(hudX - 22.0, hudY - 245.0)), 2.5) * step(0.2, sin(u_time * 2.8 + 2.7));
                    float dot2 = step(length(vec2(hudX - 22.0, hudY - 260.0)), 2.0) * step(0.2, sin(u_time * 2.8 + 2.7));

                    float hudAlpha = (sq1 + dash1 + dash2 + dot1 + dot2) * 0.85;
                    finalColor += colorRim * hudAlpha;
                }

                // 13. VẠCH SÁNG SCANLINE QUÉT QUA Ở GẦN ĐÁY
                float scanPeriod = mod(u_time * 0.16, 1.0);
                float scanY = 0.88 + scanPeriod * 0.10;
                float scanline = (1.0 - smoothstep(0.0, 0.006, abs(uv.y - scanY))) * (1.0 - smoothstep(0.2, 0.85, abs(uv.x - 0.5))) * 0.35;
                finalColor += colorRim * scanline;

                // 14. ĐỘ TRONG SUỐT (ALPHA)
                // Hoàn toàn trong suốt ở vùng giữa để lộ video MP4 Omen 4K đằng sau
                float totalAlpha = clamp(inkNear * 0.92 + inkFar * 0.40 + rimNear * 0.65 + scanline + (uv.x < 0.055 ? 0.30 : 0.0), 0.0, 0.94);

                gl_FragColor = vec4(finalColor, totalAlpha);
            }
        `;

        const vs = this.compileShader(gl.VERTEX_SHADER, vsSource);
        const fs = this.compileShader(gl.FRAGMENT_SHADER, fsSource);

        if (!vs || !fs) {
            this.useFallback2D = true;
            return;
        }

        this.program = gl.createProgram();
        gl.attachShader(this.program, vs);
        gl.attachShader(this.program, fs);
        gl.linkProgram(this.program);

        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
            console.error('Lỗi liên kết shader WebGL:', gl.getProgramInfoLog(this.program));
            this.useFallback2D = true;
            return;
        }

        gl.useProgram(this.program);

        // Tạo full-screen quad buffer
        this.positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        const positions = new Float32Array([
            -1.0, -1.0,
             1.0, -1.0,
            -1.0,  1.0,
            -1.0,  1.0,
             1.0, -1.0,
             1.0,  1.0
        ]);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

        this.aPosition = gl.getAttribLocation(this.program, 'a_position');
        gl.enableVertexAttribArray(this.aPosition);
        gl.vertexAttribPointer(this.aPosition, 2, gl.FLOAT, false, 0, 0);

        // Lấy vị trí các uniforms
        this.uniforms = {
            resolution: gl.getUniformLocation(this.program, 'u_resolution'),
            time: gl.getUniformLocation(this.program, 'u_time'),
            videoAspect: gl.getUniformLocation(this.program, 'u_video_aspect'),
            mouse: gl.getUniformLocation(this.program, 'u_mouse'),
            mouseVel: gl.getUniformLocation(this.program, 'u_mouse_vel'),
            mouseDown: gl.getUniformLocation(this.program, 'u_mouse_down'),
            clickPos: gl.getUniformLocation(this.program, 'u_click_pos'),
            clickTime: gl.getUniformLocation(this.program, 'u_click_time'),
            glitch: gl.getUniformLocation(this.program, 'u_glitch'),
            preset: gl.getUniformLocation(this.program, 'u_preset'),
            density: gl.getUniformLocation(this.program, 'u_density'),
            flowSpeed: gl.getUniformLocation(this.program, 'u_flow_speed'),
            centerClear: gl.getUniformLocation(this.program, 'u_center_clear'),
            roughness: gl.getUniformLocation(this.program, 'u_roughness'),
            grainAmt: gl.getUniformLocation(this.program, 'u_grain_amt'),
            enableHalftone: gl.getUniformLocation(this.program, 'u_enable_halftone')
        };
    }

    compileShader(type, source) {
        const gl = this.gl;
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error('Lỗi biên dịch shader:', gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    }

    resize() {
        const w = window.innerWidth;
        const h = window.innerHeight;
        this.width = w;
        this.height = h;

        this.canvas.width = Math.floor(w * this.dpr);
        this.canvas.height = Math.floor(h * this.dpr);
        this.canvas.style.width = `${w}px`;
        this.canvas.style.height = `${h}px`;

        if (this.gl) {
            this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        }
    }

    // ==========================================================================
    // BẮT SỰ KIỆN TƯƠNG TÁC CHUỘT / CHẠM
    // ==========================================================================
    setupEvents() {
        window.addEventListener('resize', () => {
            if (this.useFallback2D) this.resizeFallback2D();
            else this.resize();
        });

        document.addEventListener('visibilitychange', () => {
            if (document.hidden) this.stopLoop();
            else if (!this.reducedMotion) this.startLoop();
        });

        const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
        motionQuery.addEventListener('change', (e) => {
            this.reducedMotion = e.matches;
            if (this.reducedMotion) {
                this.stopLoop();
                this.renderStatic();
            } else {
                this.startLoop();
            }
        });

        // Chuột trên Desktop
        if (!this.isMobile) {
            window.addEventListener('mousemove', (e) => {
                if (this.mouse.prevX === -1000) {
                    this.mouse.prevX = e.clientX;
                    this.mouse.prevY = e.clientY;
                }
                this.mouse.vx = e.clientX - this.mouse.x;
                this.mouse.vy = e.clientY - this.mouse.y;
                this.mouse.speed = Math.hypot(this.mouse.vx, this.mouse.vy);
                this.mouse.x = e.clientX;
                this.mouse.y = e.clientY;
                this.mouse.isHovering = true;

                this.trailPoints.unshift({ x: e.clientX, y: e.clientY, age: 0 });
                if (this.trailPoints.length > this.maxTrail) {
                    this.trailPoints.pop();
                }

                this.updateParallax(e.clientX, e.clientY);
            });

            window.addEventListener('mousedown', (e) => {
                if (e.button === 0) {
                    const now = performance.now();
                    if (now - this.lastClickTime < 320) {
                        this.triggerTeleportGlitch();
                    } else {
                        this.triggerClickSplash(e.clientX, e.clientY);
                    }
                    this.lastClickTime = now;
                    this.mouse.targetDown = 1.0;
                }
            });

            window.addEventListener('mouseup', () => {
                this.mouse.targetDown = 0.0;
            });

            document.addEventListener('mouseleave', () => {
                this.mouse.isHovering = false;
                this.mouse.targetDown = 0.0;
            });
        }

        // Chạm trên Mobile
        window.addEventListener('touchstart', (e) => {
            if (e.touches.length > 0) {
                const t = e.touches[0];
                const now = performance.now();
                if (now - this.lastClickTime < 320) {
                    this.triggerTeleportGlitch();
                } else {
                    this.triggerClickSplash(t.clientX, t.clientY);
                }
                this.lastClickTime = now;
                this.mouse.x = t.clientX;
                this.mouse.y = t.clientY;
                this.mouse.targetDown = 1.0;
                this.mouse.isHovering = true;
            }
        }, { passive: true });

        window.addEventListener('touchmove', (e) => {
            if (e.touches.length > 0) {
                const t = e.touches[0];
                this.mouse.vx = t.clientX - this.mouse.x;
                this.mouse.vy = t.clientY - this.mouse.y;
                this.mouse.x = t.clientX;
                this.mouse.y = t.clientY;
                this.updateParallax(t.clientX, t.clientY);
            }
        }, { passive: true });

        window.addEventListener('touchend', () => {
            this.mouse.targetDown = 0.0;
            this.mouse.isHovering = false;
        });
    }

    updateParallax(clientX, clientY) {
        const nx = (clientX / this.width - 0.5) * 2;
        const ny = (clientY / this.height - 0.5) * 2;
        const px = (nx * 8).toFixed(2);
        const py = (ny * 8).toFixed(2);
        document.documentElement.style.setProperty('--parallax-x', `${px}px`);
        document.documentElement.style.setProperty('--parallax-y', `${py}px`);
    }

    triggerClickSplash(clientX, clientY) {
        this.click.x = clientX / this.width;
        this.click.y = clientY / this.height;
        this.click.time = 0.0;

        const count = this.isMobile ? 16 : 32;
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 2.5 + Math.random() * 6.0;
            this.splatters.push({
                x: clientX,
                y: clientY,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                size: 2.0 + Math.random() * 4.5,
                alpha: 0.95,
                decay: 0.02 + Math.random() * 0.025
            });
        }
    }

    triggerTeleportGlitch() {
        this.glitch = 1.0;
    }

    startLoop() {
        if (this.animationFrameId) return;
        const loop = (currentTime) => {
            const dt = (currentTime - this.lastFrameTime) * 0.001;
            this.lastFrameTime = currentTime;

            this.update(dt);
            this.render();

            this.animationFrameId = requestAnimationFrame(loop);
        };
        this.animationFrameId = requestAnimationFrame(loop);
    }

    stopLoop() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }

    update(dt) {
        const delta = Math.min(dt || 0.016, 0.05);

        // Đồng bộ thời gian với video
        if (this.videoElement && !this.videoElement.paused && !isNaN(this.videoElement.currentTime)) {
            this.videoTime = this.videoElement.currentTime;
        } else if (!this.videoElement) {
            this.videoTime = (performance.now() - this.startTime) * 0.001;
        }

        this.mouse.vx *= 0.88;
        this.mouse.vy *= 0.88;
        this.mouse.isDown += (this.mouse.targetDown - this.mouse.isDown) * 0.18;
        this.click.time += delta;

        if (this.glitch > 0.01) {
            this.glitch *= 0.86;
        } else {
            this.glitch = 0.0;
        }

        for (let i = this.splatters.length - 1; i >= 0; i--) {
            const sp = this.splatters[i];
            sp.x += sp.vx;
            sp.y += sp.vy;
            sp.vx *= 0.93;
            sp.vy *= 0.93;
            sp.alpha -= sp.decay;
            if (sp.alpha <= 0.01) {
                this.splatters.splice(i, 1);
            }
        }
    }

    render() {
        if (this.useFallback2D || !this.gl || !this.program || !this.uniforms) {
            this.renderFallback2D();
            return;
        }

        const gl = this.gl;
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);

        gl.clearColor(0.0, 0.0, 0.0, 0.0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        gl.useProgram(this.program);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.enableVertexAttribArray(this.aPosition);
        gl.vertexAttribPointer(this.aPosition, 2, gl.FLOAT, false, 0, 0);

        const elapsed = this.videoTime;
        const presetCode = INK_CONFIG.colorPreset === 'purple' ? 1.0 : 0.0;

        gl.uniform2f(this.uniforms.resolution, this.canvas.width, this.canvas.height);
        gl.uniform1f(this.uniforms.time, elapsed);
        gl.uniform1f(this.uniforms.videoAspect, this.videoAspect || (16.0 / 9.0));
        gl.uniform2f(this.uniforms.mouse, this.mouse.x * this.dpr, this.mouse.y * this.dpr);
        gl.uniform2f(this.uniforms.mouseVel, this.mouse.vx, this.mouse.vy);
        gl.uniform1f(this.uniforms.mouseDown, this.mouse.isDown);
        gl.uniform2f(this.uniforms.clickPos, this.click.x, this.click.y);
        gl.uniform1f(this.uniforms.clickTime, this.click.time);
        gl.uniform1f(this.uniforms.glitch, this.glitch);
        gl.uniform1f(this.uniforms.preset, presetCode);
        gl.uniform1f(this.uniforms.density, INK_CONFIG.inkDensity);
        gl.uniform1f(this.uniforms.flowSpeed, INK_CONFIG.flowSpeed);
        gl.uniform1f(this.uniforms.centerClear, INK_CONFIG.centerClearance);
        gl.uniform1f(this.uniforms.roughness, INK_CONFIG.brushRoughness);
        gl.uniform1f(this.uniforms.grainAmt, INK_CONFIG.filmGrain);
        gl.uniform1f(this.uniforms.enableHalftone, INK_CONFIG.enableHalftone ? 1.0 : 0.0);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    renderStatic() {
        if (this.gl && !this.useFallback2D) {
            this.render();
        } else {
            this.renderFallback2D();
        }
    }

    // ==========================================================================
    // PHƯƠNG ÁN DỰ PHÒNG CANVAS 2D KHI WEBGL KHÔNG KHẢ DỤNG
    // ==========================================================================
    switchToFallback2D() {
        this.useFallback2D = true;
        
        if (this.canvas && this.canvas.parentNode) {
            const freshCanvas = document.createElement('canvas');
            freshCanvas.id = this.canvas.id;
            freshCanvas.className = this.canvas.className;
            this.canvas.parentNode.replaceChild(freshCanvas, this.canvas);
            this.canvas = freshCanvas;
        }

        this.ctx2d = this.canvas.getContext('2d');
        this.resizeFallback2D();
        this.setupEvents();

        if (!this.isMobile) {
            document.body.classList.add('custom-cursor-active');
        }

        if (!this.reducedMotion) {
            this.startLoop();
        } else {
            this.renderFallback2D();
        }
    }

    resizeFallback2D() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.canvas.width = this.width;
        this.canvas.height = this.height;
    }

    renderFallback2D() {
        if (!this.ctx2d) return;
        const ctx = this.ctx2d;
        ctx.clearRect(0, 0, this.width, this.height);
        const t = this.videoTime * INK_CONFIG.flowSpeed;

        const isPurple = INK_CONFIG.colorPreset === 'purple';
        const colorMain = isPurple ? 'rgba(21, 10, 46, 0.85)' : 'rgba(14, 23, 56, 0.85)';
        const colorRim  = isPurple ? '#9d74ff' : '#3d73ff';

        // 1. Dải mực trái viền màn hình
        ctx.fillStyle = colorMain;
        ctx.beginPath();
        ctx.moveTo(0, this.height);
        ctx.bezierCurveTo(
            this.width * 0.18 + Math.sin(t * 2) * 25, this.height * 0.65,
            this.width * 0.28 + Math.cos(t * 1.5) * 30, this.height * 0.35,
            0, this.height * 0.12
        );
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = colorRim;
        ctx.lineWidth = 3.5;
        ctx.stroke();

        // 2. Dải mực phải viền màn hình
        ctx.fillStyle = colorMain;
        ctx.beginPath();
        ctx.moveTo(this.width, this.height);
        ctx.bezierCurveTo(
            this.width * 0.82 - Math.sin(t * 2.2) * 25, this.height * 0.65,
            this.width * 0.72 - Math.cos(t * 1.8) * 30, this.height * 0.35,
            this.width, this.height * 0.12
        );
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = colorRim;
        ctx.lineWidth = 3.5;
        ctx.stroke();

        // 3. Khói mực dưới chân Omen đồng bộ video
        ctx.fillStyle = isPurple ? 'rgba(10, 4, 23, 0.88)' : 'rgba(5, 9, 24, 0.90)';
        ctx.beginPath();
        ctx.moveTo(this.width * 0.36, this.height);
        ctx.bezierCurveTo(
            this.width * 0.42, this.height * 0.74 + Math.sin(t * 2.5) * 15,
            this.width * 0.58, this.height * 0.74 + Math.cos(t * 2.5) * 15,
            this.width * 0.64, this.height
        );
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = colorRim;
        ctx.lineWidth = 2.0;
        ctx.stroke();

        // 4. Giọt mực bắn
        for (let i = 0; i < this.splatters.length; i++) {
            const sp = this.splatters[i];
            ctx.fillStyle = isPurple ? `rgba(157, 116, 255, ${sp.alpha})` : `rgba(61, 115, 255, ${sp.alpha})`;
            ctx.beginPath();
            ctx.arc(sp.x, sp.y, sp.size, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

// Gán toàn cục
window.InkShadowWebGL = InkShadowWebGL;
window.DarkSmokeEffect = InkShadowWebGL;
window.DarkEnergyEffect = InkShadowWebGL;
