/**
 * ==============================================================================
 * CURSOR-FX.JS - Hiệu Ứng Khói Theo Con Trỏ Chuột (Canvas 2D Thuần)
 * ==============================================================================
 * 
 * Tính năng chính:
 * 1. Vùng khói dày tại con trỏ (kiểu 1)
 * 2. Vài sợi khói bốc lên ngẫu nhiên, uốn lượn mềm như khói hương (kiểu 0)
 * 3. Nhấn giữ: Khói xoáy hội tụ vào con trỏ, hút các hạt xung quanh (kiểu 3)
 * 4. Thả chuột: Vụ nổ bung tỏa khói, giữ càng lâu nổ càng lớn (kiểu 2)
 * 5. Bật / tắt độc lập, tự động tối ưu hiệu năng 60fps & mobile
 * ==============================================================================
 */

(function () {
    'use strict';

    // ==========================================================================
    // 1. CẤU HÌNH DỄ DÀNG TÙY BIẾN (CONFIG)
    // ==========================================================================
    const CONFIG = {
        // Trạng thái bật/tắt ban đầu
        enabled: true,

        // Preset màu khói: 'mysticBlue' (mặc định: xanh đen huyền bí), 'darkPurple' (tím đen), 'white' (trắng xám)
        colorPreset: 'mysticBlue',
        colors: {
            mysticBlue: 'rgb(64, 155, 255)', // Xanh đen huyền bí tỏa sáng (Phantom / Omen Shadow Cyan-Blue)
            darkPurple: 'rgb(160, 95, 240)',  // Tím đen huyền ảo (Dark Violet Shadow)
            white: 'rgb(240, 240, 255)',      // Trắng xám khói hương
            purple: 'rgb(160, 95, 240)'       // Alias cho tím đen
        },

        // Giới hạn hạt và thiết bị
        maxParticles: 2400,      // Tối đa hạt cùng lúc (Object pool)
        dprMax: 2,               // Giới hạn devicePixelRatio
        showPowerGauge: true,    // Hiển thị thanh nhỏ "Sức nổ" khi nhấn giữ
        maxHoldDuration: 3.0,    // Thời gian tích lực tối đa (giây)

        // Vùng khói tại con trỏ (Kiểu 1) - Mềm mại, mờ nhẹ vừa mắt
        type1: {
            spawnPerFrame: 2,
            radiusX: 14,
            radiusY: 9,
            offsetY: 3,
            r0Min: 8,
            r0Max: 12,
            r1Min: 18,
            r1Max: 26,
            maxAlpha: 0.08,
            lifeMin: 85,
            lifeMax: 135,
            fadeIn: 0.25,
            fadeOutExp: 1.3,
            vyMin: -0.09,
            vyMax: -0.04,
            vxNoise: 0.04,
            frictionX: 0.95,
            frictionY: 0.97
        },

        // Vài sợi khói bốc lên (Kiểu 0) - Mờ thanh thoát, uốn lượn tự nhiên
        type0: {
            strandCount: 5,
            LB: [0.45, 1.0, 0.65, 1.4, 0.85],   // Hệ số độ dài cơ bản từng sợi
            SPD: [0.8, 1.05, 0.85, 1.1, 0.95],  // Hệ số tốc độ từng sợi
            maxAlpha: 0.085,
            r0Min: 3.5,
            r0Max: 5.0,
            r1Min: 10.0,
            r1Max: 16.0,
            fadeIn: 0.12,
            fadeOutExp: 1.7,
            lifeBase: 330,
            lifeNoise: 90,
            vyBase: -0.20,
            vyNoise: 0.12,
            vyAcc: -0.0015,
            vyFriction: 0.996,
            vyLimitScale: -0.3,
            bendAmp: 7.0,
            bendFreqT: 0.016,
            bendFreqY: 0.014,
            bendPull: 0.003,
            frictionX: 0.93
        },

        // Nhấn giữ xoáy vào con trỏ (Kiểu 3) - Cuộn xoáy mờ ảo
        type3: {
            branchesDesktop: 6,
            branchesMobile: 4,
            rad0Min: 110,
            rad0Max: 150,
            rad0ChargeScale: 50,
            r0Min: 3.5,
            r0Max: 5.0,
            r1Min: 9.0,
            r1Max: 14.0,
            lifeMin: 150,
            lifeMax: 180,
            alphaBase: 0.085,
            alphaChargeScale: 0.045,
            fadeIn: 0.08,
            fadeOutExp: 1.2,
            radDampBase: 0.982,
            radDampCharge: 0.004,
            coreInterval: 3,         // Mỗi 3 khung hình sinh cụm khói mờ ở lõi
            suctionRadius: 300,      // Bán kính hút các hạt khác
            suctionStrength: 0.05
        },

        // Thả chuột gây vụ nổ (Kiểu 2)
        type2: {
            impulseRadius: 340,
            impulseBase: 2.0,
            impulseScale: 5.0,
            blastCountBase: 40,
            blastCountScale: 110,
            speedBase: 0.6,
            speedNoiseBase: 1.8,
            speedNoiseScale: 3.4,
            vyBlastOffset: -0.15,
            r0Min: 12,
            r0Max: 28,
            r1Min: 50,
            r1Max: 100,
            r1Scale: 120,
            lifeMin: 240,
            lifeMax: 360,
            lifeScale: 90,
            maxAlpha: 0.10,
            fadeIn: 0.12,
            fadeOutExp: 1.7,
            friction: 0.968,
            vyRiseAcc: -0.008
        },

        // ======================================================================
        // 4.5. CẤU HÌNH TIA SÉT (CONFIG.lightning)
        // ======================================================================
        lightning: true, // Bật/tắt hiệu ứng tia sét độc lập
        lightningAuraColors: {
            default: { r: 140, g: 160, b: 255 }, // Mặc định xanh điện rgb(140,160,255)
            purple: { r: 175, g: 125, b: 255 }   // Preset tím rgb(175,125,255)
        }
    };

    // Kiểm tra cấu hình lưu trữ người dùng
    try {
        const saved = localStorage.getItem('cursor_smoke_fx_enabled');
        if (saved !== null) {
            CONFIG.enabled = saved === 'true';
        }
        const savedPreset = localStorage.getItem('cursor_smoke_fx_preset');
        if (savedPreset && (CONFIG.colors[savedPreset] || savedPreset.startsWith('rgb'))) {
            CONFIG.colorPreset = savedPreset;
        }
        const savedLightning = localStorage.getItem('cursor_smoke_fx_lightning');
        if (savedLightning !== null) {
            CONFIG.lightning = savedLightning === 'true';
        }
    } catch (_) {}

    // ==========================================================================
    // 2. TẠO SPRITE CANVAS ẨN (RADIAL GRADIENT TÔ MÀU BẰNG SOURCE-IN)
    // ==========================================================================
    let spriteCanvas = null;
    let currentColorString = '';

    function getActiveColor() {
        if (CONFIG.colors[CONFIG.colorPreset]) {
            return CONFIG.colors[CONFIG.colorPreset];
        }
        return CONFIG.colorPreset || CONFIG.colors.white;
    }

    function createOrUpdateSprite() {
        const targetColor = getActiveColor();
        if (spriteCanvas && currentColorString === targetColor) return;

        if (!spriteCanvas) {
            spriteCanvas = document.createElement('canvas');
            spriteCanvas.width = 128;
            spriteCanvas.height = 128;
        }

        const sCtx = spriteCanvas.getContext('2d');
        sCtx.clearRect(0, 0, 128, 128);

        // Tạo radial gradient mềm: tâm alpha 0.88, tại 40% alpha 0.40, tại 75% alpha 0.12, rìa 100% trong suốt
        const grad = sCtx.createRadialGradient(64, 64, 0, 64, 64, 64);
        grad.addColorStop(0.0, 'rgba(255, 255, 255, 0.88)');
        grad.addColorStop(0.40, 'rgba(255, 255, 255, 0.40)');
        grad.addColorStop(0.75, 'rgba(255, 255, 255, 0.12)');
        grad.addColorStop(1.0, 'rgba(255, 255, 255, 0.00)');

        sCtx.fillStyle = grad;
        sCtx.beginPath();
        sCtx.arc(64, 64, 64, 0, Math.PI * 2);
        sCtx.fill();

        // Tô màu bằng source-in (không phải tạo gradient lại mỗi hạt)
        sCtx.globalCompositeOperation = 'source-in';
        sCtx.fillStyle = targetColor;
        sCtx.fillRect(0, 0, 128, 128);
        sCtx.globalCompositeOperation = 'source-over';

        currentColorString = targetColor;
    }

    // ==========================================================================
    // 3. ĐỐI TƯỢNG HẠT & BỘ TÁI SỬ DỤNG (OBJECT POOL)
    // ==========================================================================
    class Particle {
        constructor() {
            this.reset();
        }

        reset() {
            this.active = false;
            this.type = 0; // 0: sợi bốc lên, 1: vùng khói dày, 2: hạt nổ, 3: sợi xoáy khi giữ
            this.x = 0;
            this.y = 0;
            this.vx = 0;
            this.vy = 0;
            this.r0 = 0;
            this.r1 = 0;
            this.age = 0;
            this.lifetime = 100;
            this.maxAlpha = 0.06;
            this.fadeIn = 0.2;
            this.fadeOutExp = 1.3;

            // Dành riêng cho sợi bốc lên (kiểu 0)
            this.ax = 0;
            this.strandIndex = 0;

            // Dành riêng cho sợi xoáy (kiểu 3)
            this.angle = 0;
            this.rad = 0;
            this.rad0 = 0;
        }
    }

    const pool = new Array(CONFIG.maxParticles);
    for (let i = 0; i < CONFIG.maxParticles; i++) {
        pool[i] = new Particle();
    }
    let poolAllocIndex = 0;

    function obtainParticle() {
        // Tìm hạt rảnh trong pool
        let p = pool[poolAllocIndex];
        poolAllocIndex = (poolAllocIndex + 1) % CONFIG.maxParticles;

        // Nếu hạt đang hoạt động (pool đầy), hạt cũ nhất sẽ được tái sử dụng tự động
        p.reset();
        p.active = true;
        return p;
    }

    // ==========================================================================
    // 4. KHỞI TẠO CANVAS CHÍNH & QUẢN LÝ TRẠNG THÁI
    // ==========================================================================
    let canvas = null;
    let ctx = null;
    let animationId = null;
    let frameT = 0;
    let isMobile = false;
    let reducedMotion = false;
    let isThrottled = false;
    let lowFpsCounter = 0;
    let lastFpsTime = performance.now();
    let frameCount = 0;

    // Chuột và tương tác
    const mouse = {
        x: -9999,
        y: -9999,
        inside: false,
        isHolding: false,
        holdStartTime: 0,
        hp: 0,
        isMoving: false
    };

    // Pha dao động ngẫu nhiên riêng cho từng sợi bốc lên
    const strandLenPhase = [Math.random() * 10, Math.random() * 10, Math.random() * 10, Math.random() * 10, Math.random() * 10];
    const strandBendPhase = [Math.random() * 10, Math.random() * 10, Math.random() * 10, Math.random() * 10, Math.random() * 10];

    function detectDevice() {
        isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || ('ontouchstart' in window);
        reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    function createMainCanvas() {
        if (canvas) return;

        canvas = document.createElement('canvas');
        canvas.id = 'cursor-smoke-fx-canvas';
        canvas.style.position = 'fixed';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.width = '100vw';
        canvas.style.height = '100vh';
        canvas.style.pointerEvents = 'none'; // Không chặn thao tác click link/nút
        canvas.style.zIndex = '99999';        // Nằm trên giao diện nhưng trong suốt
        canvas.style.opacity = '1';
        canvas.style.transition = 'opacity 0.4s ease';

        document.body.appendChild(canvas);
        ctx = canvas.getContext('2d', { alpha: true });

        resizeCanvas();
        createOrUpdateSprite();
    }

    function resizeCanvas() {
        if (!canvas || !ctx) return;
        const dpr = Math.min(window.devicePixelRatio || 1, CONFIG.dprMax);
        const w = window.innerWidth;
        const h = window.innerHeight;

        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
    }

    // ==========================================================================
    // 4.5. TIA SÉT (THUẬT TOÁN DỊCH CHUYỂN TRUNG ĐIỂM & 3 LỚP NÉT CHỒNG NHAU)
    // ==========================================================================
    const activeBolts = [];
    let centerFlash = null;

    function getAuraColor() {
        if (CONFIG.colorPreset === 'purple' || CONFIG.colorPreset === 'darkPurple') {
            return CONFIG.lightningAuraColors.purple;
        }
        return CONFIG.lightningAuraColors.default;
    }

    // Tạo tia bằng thuật toán dịch chuyển trung điểm:
    // từ điểm đầu đến điểm cuối chia thành n = max(3, độ_dài / 14) đoạn;
    // mỗi điểm giữa lệch vuông góc với hướng tia một lượng:
    // (ngẫu nhiên - 0.5) × biên_độ × sin(π × f) × 2, với f là vị trí tương đối từ 0 đến 1.
    function buildLightningBranch(x1, y1, x2, y2, amplitude, depth) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const len = Math.hypot(dx, dy);
        const n = Math.max(3, Math.round(len / 14));
        const nx = -dy / (len || 1);
        const ny = dx / (len || 1);

        const points = [];
        const branches = [];

        for (let i = 0; i <= n; i++) {
            const f = i / n;
            let offset = 0;
            if (i > 0 && i < n) {
                offset = (Math.random() - 0.5) * amplitude * Math.sin(Math.PI * f) * 2;
            }
            const px = x1 + dx * f + nx * offset;
            const py = y1 + dy * f + ny * offset;
            points.push({ x: px, y: py });

            // Nhánh rẽ: ở mỗi điểm giữa có xác suất 16% sinh một nhánh (nếu còn độ sâu):
            // góc lệch ±(0.4 đến 0.9 rad) so với hướng chính, độ dài 20-50% độ dài tia chính,
            // biên độ giảm còn 60%, độ sâu giảm 1.
            // Trên điện thoại bỏ nhánh cấp 2 (depth >= 2). Khi FPS < 40: tự tắt nhánh rẽ.
            if (i > 0 && i < n && depth > 0 && !isThrottled && Math.random() < 0.16) {
                if (!(isMobile && depth >= 2)) {
                    const baseAngle = Math.atan2(dy, dx);
                    const sign = Math.random() > 0.5 ? 1 : -1;
                    const angleDev = sign * (0.4 + Math.random() * 0.5); // ±(0.4 đến 0.9 rad)
                    const branchAngle = baseAngle + angleDev;
                    const branchLen = len * (0.20 + Math.random() * 0.30); // 20-50% độ dài tia chính
                    const bx2 = px + Math.cos(branchAngle) * branchLen;
                    const by2 = py + Math.sin(branchAngle) * branchLen;

                    const subBranch = buildLightningBranch(px, py, bx2, by2, amplitude * 0.6, depth - 1);
                    branches.push(subBranch);
                }
            }
        }

        return { points: points, branches: branches };
    }

    function spawnLightningBolt(x1, y1, x2, y2, amplitude, depth, lifetime, w) {
        if (!CONFIG.lightning || reducedMotion) return;

        const tree = buildLightningBranch(x1, y1, x2, y2, amplitude, depth);
        if (activeBolts.length >= 60) {
            activeBolts.shift(); // Tối đa 60 tia cùng lúc, loại tia cũ nhất
        }
        activeBolts.push({
            tree: tree,
            lifetime: lifetime,
            age: 0,
            w: w
        });
    }

    // Vẽ 3 lớp nét chồng nhau, lineJoin/lineCap 'round', rung lách tách ±0.8px
    function drawBranch(branch, alpha, w, aura) {
        if (!branch || !branch.points || branch.points.length < 2) return;
        const pts = branch.points;
        const n = pts.length;

        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < n - 1; i++) {
            // Mỗi khung hình dịch ngẫu nhiên từng điểm giữa tối đa ±0.8px (hiệu ứng rung lách tách)
            const jx = pts[i].x + (Math.random() * 1.6 - 0.8);
            const jy = pts[i].y + (Math.random() * 1.6 - 0.8);
            ctx.lineTo(jx, jy);
        }
        ctx.lineTo(pts[n - 1].x, pts[n - 1].y);

        // 3 lớp nét chồng nhau (nếu FPS tụt dưới 40 thì giảm số lớp nét còn 2: nét giữa + lõi)
        if (!isThrottled) {
            // Quầng ngoài: rgba(màu_quầng, 0.22 × alpha), độ dày 7 × w
            ctx.strokeStyle = `rgba(${aura.r}, ${aura.g}, ${aura.b}, ${0.22 * alpha})`;
            ctx.lineWidth = 7 * w;
            ctx.stroke();
        }

        // Nét giữa: rgba(màu_quầng, 0.55 × alpha), độ dày 3 × w
        ctx.strokeStyle = `rgba(${aura.r}, ${aura.g}, ${aura.b}, ${0.55 * alpha})`;
        ctx.lineWidth = 3 * w;
        ctx.stroke();

        // Lõi: rgba(255,255,255, 0.95 × alpha), độ dày 1.1 × w
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.95 * alpha})`;
        ctx.lineWidth = 1.1 * w;
        ctx.stroke();

        // Nhánh rẽ: vẽ cùng cách với alpha × 0.8 và độ dày × 0.75 cho mỗi cấp
        if (!isThrottled && branch.branches && branch.branches.length > 0) {
            for (let b = 0; b < branch.branches.length; b++) {
                drawBranch(branch.branches[b], alpha * 0.8, w * 0.75, aura);
            }
        }
    }

    // ==========================================================================
    // 4.6. TƯƠNG TÁC TIA SÉT VỚI ICON & LINK (GIẬT & RUNG CHẤN NỔ)
    // ==========================================================================
    const INTERACTIVE_SELECTORS = [
        '.social-link-card',
        '.social-link-icon',
        '.icon-only-dock a',
        '.discord-badge',
        '.discord-card',
        '.dash-btn',
        '.vl-card',
        '.vl-primary-row',
        '.vl-hex-btn',
        '.music-player-panel',
        '.music-player',
        '.dash-card',
        '.link-manage-item',
        '.dash-nav-btn'
    ].join(', ');

    function injectInteractiveStyles() {
        if (typeof document === 'undefined') return;
        if (document.getElementById('cursor-lightning-fx-style')) return;

        const style = document.createElement('style');
        style.id = 'cursor-lightning-fx-style';
        style.textContent = `
            @keyframes fx-lightning-jolt-twitch {
                0% {
                    transform: translate(0, 0) scale(1) rotate(0deg);
                    filter: brightness(1);
                }
                20% {
                    transform: translate(var(--jolt-x, -3px), var(--jolt-y, 2px)) scale(1.04) rotate(-1.5deg);
                    filter: brightness(1.4) drop-shadow(0 0 14px rgba(100, 180, 255, 0.9));
                }
                40% {
                    transform: translate(calc(var(--jolt-x, -3px) * -0.7), calc(var(--jolt-y, 2px) * -0.7)) scale(0.97) rotate(1.2deg);
                    filter: brightness(1.25) drop-shadow(0 0 16px rgba(140, 200, 255, 0.95));
                }
                60% {
                    transform: translate(calc(var(--jolt-x, -3px) * 0.4), calc(var(--jolt-y, 2px) * 0.4)) scale(1.02) rotate(-0.6deg);
                    filter: brightness(1.15) drop-shadow(0 0 8px rgba(180, 120, 255, 0.7));
                }
                80% {
                    transform: translate(calc(var(--jolt-x, -3px) * -0.2), calc(var(--jolt-y, 2px) * -0.2)) scale(0.99) rotate(0.2deg);
                    filter: brightness(1.05);
                }
                100% {
                    transform: translate(0, 0) scale(1) rotate(0deg);
                    filter: brightness(1);
                }
            }

            .fx-lightning-jolt {
                animation: fx-lightning-jolt-twitch 0.24s cubic-bezier(0.2, 0.9, 0.3, 1) !important;
                box-shadow: 0 0 20px rgba(100, 180, 255, 0.75), inset 0 0 10px rgba(140, 210, 255, 0.5) !important;
                border-color: rgba(140, 210, 255, 0.9) !important;
                z-index: 5 !important;
            }

            @keyframes fx-blast-shockwave-shake {
                0% {
                    transform: translate(var(--blast-dx, 0px), var(--blast-dy, 0px)) scale(1.06);
                    filter: brightness(1.4) drop-shadow(0 0 22px rgba(100, 180, 255, 0.95));
                    box-shadow: 0 0 28px rgba(100, 180, 255, 0.8), inset 0 0 15px rgba(140, 210, 255, 0.5) !important;
                }
                16% {
                    transform: translate(calc(var(--blast-dx, 0px) * -0.75), calc(var(--blast-dy, 0px) * -0.75)) scale(0.95);
                    filter: brightness(1.3) drop-shadow(0 0 16px rgba(175, 125, 255, 0.85));
                }
                32% {
                    transform: translate(calc(var(--blast-dx, 0px) * 0.5), calc(var(--blast-dy, 0px) * 0.5)) scale(1.03);
                    filter: brightness(1.2) drop-shadow(0 0 12px rgba(100, 180, 255, 0.7));
                }
                50% {
                    transform: translate(calc(var(--blast-dx, 0px) * -0.3), calc(var(--blast-dy, 0px) * -0.3)) scale(0.98);
                    filter: brightness(1.1);
                }
                70% {
                    transform: translate(calc(var(--blast-dx, 0px) * 0.15), calc(var(--blast-dy, 0px) * 0.15)) scale(1.01);
                }
                88% {
                    transform: translate(calc(var(--blast-dx, 0px) * -0.05), calc(var(--blast-dy, 0px) * -0.05));
                }
                100% {
                    transform: translate(0, 0) scale(1);
                    filter: brightness(1);
                }
            }

            .fx-lightning-blast-shake {
                animation: fx-blast-shockwave-shake var(--blast-duration, 0.5s) cubic-bezier(0.2, 0.9, 0.3, 1) !important;
                border-color: rgba(140, 210, 255, 0.9) !important;
                z-index: 5 !important;
            }
        `;
        document.head.appendChild(style);
    }

    function getNearbyInteractiveElements(x, y, maxDistance = 250) {
        if (typeof document === 'undefined') return [];
        const elements = document.querySelectorAll(INTERACTIVE_SELECTORS);
        const nearby = [];

        for (let i = 0; i < elements.length; i++) {
            const el = elements[i];
            if (!el || el.offsetParent === null) continue;
            const rect = el.getBoundingClientRect();
            if (rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) {
                continue;
            }
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            const dist = Math.hypot(cx - x, cy - y);
            if (dist <= maxDistance) {
                nearby.push({ el, cx, cy, dist, rect });
            }
        }

        nearby.sort((a, b) => a.dist - b.dist);
        return nearby;
    }

    function joltElement(el, sourceX, sourceY) {
        if (!el || el._isJolting) return;
        el._isJolting = true;

        let jx = (Math.random() * 6 - 3);
        let jy = (Math.random() * 6 - 3);
        if (typeof sourceX === 'number' && typeof sourceY === 'number') {
            const rect = el.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            const dx = cx - sourceX;
            const dy = cy - sourceY;
            const d = Math.hypot(dx, dy) || 1;
            jx = (dx / d) * (3.5 + Math.random() * 2);
            jy = (dy / d) * (3.5 + Math.random() * 2);
        }

        el.style.setProperty('--jolt-x', `${jx.toFixed(1)}px`);
        el.style.setProperty('--jolt-y', `${jy.toFixed(1)}px`);

        el.classList.remove('fx-lightning-jolt');
        void el.offsetWidth;
        el.classList.add('fx-lightning-jolt');

        setTimeout(() => {
            el.classList.remove('fx-lightning-jolt');
            el.style.removeProperty('--jolt-x');
            el.style.removeProperty('--jolt-y');
            el._isJolting = false;
        }, 260);
    }

    function shakeInteractiveElements(originX, originY, power) {
        if (typeof document === 'undefined') return;
        const elements = document.querySelectorAll(INTERACTIVE_SELECTORS);
        const blastRadius = 380 + 720 * power;
        const duration = (0.38 + 0.35 * power).toFixed(2);

        for (let i = 0; i < elements.length; i++) {
            const el = elements[i];
            if (!el || el.offsetParent === null) continue;
            const rect = el.getBoundingClientRect();
            if (rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) {
                continue;
            }
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            const dx = cx - originX;
            const dy = cy - originY;
            const dist = Math.hypot(dx, dy);

            if (dist < blastRadius) {
                const force = Math.max(0, 1 - dist / blastRadius);
                const pushMag = (8 + 28 * power) * force;
                const dSafe = dist || 1;
                const pushX = (dx / dSafe) * pushMag;
                const pushY = (dy / dSafe) * pushMag;

                el.style.setProperty('--blast-dx', `${pushX.toFixed(1)}px`);
                el.style.setProperty('--blast-dy', `${pushY.toFixed(1)}px`);
                el.style.setProperty('--blast-duration', `${duration}s`);

                el.classList.remove('fx-lightning-blast-shake');
                void el.offsetWidth;
                el.classList.add('fx-lightning-blast-shake');

                setTimeout(() => {
                    el.classList.remove('fx-lightning-blast-shake');
                    el.style.removeProperty('--blast-dx');
                    el.style.removeProperty('--blast-dy');
                    el.style.removeProperty('--blast-duration');
                }, parseFloat(duration) * 1000 + 60);
            }
        }
    }

    // ==========================================================================
    // 5. CÁC HÀM SINH HẠT KHÓI
    // ==========================================================================

    // VÙNG KHÓI HƠI DÀY TẠI CON TRỎ (Kiểu 1)
    function spawnCoreSmoke() {
        const c1 = CONFIG.type1;
        const count = isMobile || isThrottled ? 1 : c1.spawnPerFrame;

        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const r = Math.sqrt(Math.random());
            const px = mouse.x + Math.cos(angle) * c1.radiusX * r;
            const py = mouse.y + c1.offsetY + Math.sin(angle) * c1.radiusY * r;

            const p = obtainParticle();
            p.type = 1;
            p.x = px;
            p.y = py;
            p.r0 = c1.r0Min + Math.random() * (c1.r0Max - c1.r0Min);
            p.r1 = c1.r1Min + Math.random() * (c1.r1Max - c1.r1Min);
            p.maxAlpha = c1.maxAlpha;
            p.lifetime = c1.lifeMin + Math.random() * (c1.lifeMax - c1.lifeMin);
            p.fadeIn = c1.fadeIn;
            p.fadeOutExp = c1.fadeOutExp;
            p.vx = (Math.random() * 2 - 1) * c1.vxNoise;
            p.vy = c1.vyMin + Math.random() * (c1.vyMax - c1.vyMin);
        }
    }

    // CÁC SỢI KHÓI BỐC LÊN (Kiểu 0)
    function spawnStrandSmoke() {
        const c0 = CONFIG.type0;

        for (let i = 0; i < c0.strandCount; i++) {
            // Mỗi sợi sinh 1 hạt cứ 2 khung hình (các sợi xen kẽ nhau)
            if ((frameT % 2) !== (i % 2)) continue;
            if (isMobile && (i % 2 !== 0)) continue; // Giảm tải mobile

            const offsetX = (i - 2) * 7 + (Math.random() * 4 - 2);
            const offsetY = -2 + (Math.random() * 4 - 2);
            const spawnX = mouse.x + offsetX;
            const spawnY = mouse.y + offsetY;

            // Hệ số độ dài và tốc độ hiện tại của sợi
            const L = c0.LB[i] * (0.85 + 0.3 * Math.sin(frameT * 0.005 + strandLenPhase[i]));
            const spd = c0.SPD[i];

            const p = obtainParticle();
            p.type = 0;
            p.x = spawnX;
            p.y = spawnY;
            p.ax = spawnX;
            p.strandIndex = i;
            p.maxAlpha = c0.maxAlpha;
            p.r0 = c0.r0Min + Math.random() * (c0.r0Max - c0.r0Min);
            p.r1 = c0.r1Min + Math.random() * (c0.r1Max - c0.r1Min);
            p.fadeIn = c0.fadeIn;
            p.fadeOutExp = c0.fadeOutExp;
            p.lifetime = (c0.lifeBase + Math.random() * c0.lifeNoise) * L;
            p.vx = 0;
            p.vy = (c0.vyBase - Math.random() * c0.vyNoise) * spd;
        }
    }

    // NHẤN GIỮ: SỢI XOÁY VÀO CON TRỎ (Kiểu 3)
    function spawnSwirlSmoke() {
        const c3 = CONFIG.type3;
        const branchCount = isMobile ? c3.branchesMobile : c3.branchesDesktop;
        const hp = mouse.hp;

        for (let j = 0; j < branchCount; j++) {
            const angle = (j / branchCount) * Math.PI * 2 + frameT * 0.05 + Math.random() * 0.15;
            const rad0 = (c3.rad0Min + Math.random() * (c3.rad0Max - c3.rad0Min)) + c3.rad0ChargeScale * hp;

            const p = obtainParticle();
            p.type = 3;
            p.angle = angle;
            p.rad = rad0;
            p.rad0 = rad0;
            p.r0 = c3.r0Min + Math.random() * (c3.r0Max - c3.r0Min);
            p.r1 = c3.r1Min + Math.random() * (c3.r1Max - c3.r1Min);
            p.lifetime = c3.lifeMin + Math.random() * (c3.lifeMax - c3.lifeMin);
            p.maxAlpha = c3.alphaBase + c3.alphaChargeScale * hp;
            p.fadeIn = c3.fadeIn;
            p.fadeOutExp = c3.fadeOutExp;

            p.x = mouse.x + Math.cos(angle) * rad0;
            p.y = mouse.y + Math.sin(angle) * rad0 * 0.8;
        }

        // Cứ 3 khung hình sinh cụm khói mờ ảo ngay tại tâm
        if (frameT % c3.coreInterval === 0) {
            const p = obtainParticle();
            p.type = 1;
            p.x = mouse.x + (Math.random() * 10 - 5);
            p.y = mouse.y + (Math.random() * 10 - 5);
            p.r0 = 10;
            p.r1 = 20 + 35 * hp;
            p.lifetime = 45 + Math.random() * 20;
            p.maxAlpha = 0.08 + 0.08 * hp;
            p.fadeIn = 0.25;
            p.fadeOutExp = 1.3;
            p.vx = (Math.random() * 2 - 1) * 0.05;
            p.vy = -0.05;
        }

        // TIA SÉT KHI NHẤN GIỮ:
        // mỗi khung hình có xác suất (10% + 55% × hp) chọn ngẫu nhiên một hạt xoáy
        // (kiểu 3, ngoài bán kính 14px) và sinh tia từ hạt đó đến con trỏ (lệch ±2px),
        // biên độ 7 + 5 × hp, độ sâu 0, tuổi thọ 5-9 khung hình, w = 0.8 + 0.5 × hp;
        // khi hp > 0.5, 50% khung hình có thêm một tia thứ hai.
        // Khi hp > 0.35 còn có xác suất 5% × hp mỗi khung hình sinh tia ngắn từ con trỏ ra ngoài (30 + ngẫu nhiên × 60 × hp px)
        if (CONFIG.lightning && !reducedMotion) {
            if (Math.random() < (0.10 + 0.55 * hp)) {
                const swirlCandidates = [];
                for (let i = 0; i < CONFIG.maxParticles; i++) {
                    const p = pool[i];
                    if (p.active && p.type === 3) {
                        const d = Math.hypot(p.x - mouse.x, p.y - mouse.y);
                        if (d > 14) swirlCandidates.push(p);
                    }
                }

                if (swirlCandidates.length > 0) {
                    const sp = swirlCandidates[Math.floor(Math.random() * swirlCandidates.length)];
                    const tx = mouse.x + (Math.random() * 4 - 2);
                    const ty = mouse.y + (Math.random() * 4 - 2);
                    const life = 5 + Math.floor(Math.random() * 5); // 5-9 khung hình
                    spawnLightningBolt(sp.x, sp.y, tx, ty, 7 + 5 * hp, 0, life, 0.8 + 0.5 * hp);

                    // Khi hp > 0.5, 50% khung hình có thêm một tia thứ hai
                    if (hp > 0.5 && Math.random() < 0.50 && swirlCandidates.length > 1) {
                        const sp2 = swirlCandidates[Math.floor(Math.random() * swirlCandidates.length)];
                        const tx2 = mouse.x + (Math.random() * 4 - 2);
                        const ty2 = mouse.y + (Math.random() * 4 - 2);
                        const life2 = 5 + Math.floor(Math.random() * 5);
                        spawnLightningBolt(sp2.x, sp2.y, tx2, ty2, 7 + 5 * hp, 0, life2, 0.8 + 0.5 * hp);
                    }
                }
            }

            // Khi hp > 0.35 còn có xác suất 5% × hp sinh tia ngắn từ con trỏ ra ngoài
            if (hp > 0.35 && Math.random() < (0.05 * hp)) {
                const outAngle = Math.random() * Math.PI * 2;
                const outLen = 30 + Math.random() * (60 * hp);
                const ox = mouse.x + Math.cos(outAngle) * outLen;
                const oy = mouse.y + Math.sin(outAngle) * outLen;
                const lifeOut = 5 + Math.floor(Math.random() * 4); // 5-8 khung hình
                spawnLightningBolt(mouse.x, mouse.y, ox, oy, 7 + 5 * hp, 0, lifeOut, 0.8 + 0.3 * hp);
            }

            // Khi tích lực (hp > 0.25): thỉnh thoảng tia điện tích tụ giật nhẹ sang icon/link gần đó
            if (hp > 0.25 && Math.random() < (0.06 * hp)) {
                const nearby = getNearbyInteractiveElements(mouse.x, mouse.y, 220);
                if (nearby.length > 0) {
                    const tgt = nearby[0];
                    const life = 5 + Math.floor(Math.random() * 5);
                    spawnLightningBolt(mouse.x, mouse.y, tgt.cx, tgt.cy, 7 + 4 * hp, 0, life, 0.8 + 0.4 * hp);
                    joltElement(tgt.el, mouse.x, mouse.y);
                }
            }
        }
    }

    // THẢ CHUỘT: VỤ NỔ KHÓI & BÃO SÉT (Kiểu 2)
    function triggerExplosion(power) {
        const c2 = CONFIG.type2;
        const blastCount = Math.round(c2.blastCountBase + c2.blastCountScale * power);

        // 1. Chuyển mọi hạt xoáy kiểu 3 thành hạt nổ kiểu 2
        for (let i = 0; i < CONFIG.maxParticles; i++) {
            const p = pool[i];
            if (!p.active) continue;
            if (p.type === 3) {
                p.type = 2;
                p.vx = 0;
                p.vy = 0;
            }
        }

        // 2. Tác động xung lượng đẩy hạt khói trong bán kính 340px ra ngoài
        for (let i = 0; i < CONFIG.maxParticles; i++) {
            const p = pool[i];
            if (!p.active) continue;

            const dx = p.x - mouse.x;
            const dy = p.y - mouse.y;
            const d = Math.hypot(dx, dy);

            if (d < c2.impulseRadius) {
                const dSafe = Math.max(d, 1.0);
                const impulse = (1 - d / c2.impulseRadius) * (c2.impulseBase + c2.impulseScale * power);
                p.vx += (dx / dSafe) * impulse;
                p.vy += (dy / dSafe) * impulse;
            }
        }

        // 3. Sinh các hạt nổ bung tỏa ra mọi hướng
        for (let i = 0; i < blastCount; i++) {
            const offsetAngle = Math.random() * Math.PI * 2;
            const offsetDist = Math.random() * 6;
            const px = mouse.x + Math.cos(offsetAngle) * offsetDist;
            const py = mouse.y + Math.sin(offsetAngle) * offsetDist;

            const dirAngle = Math.random() * Math.PI * 2;
            const speed = c2.speedBase + Math.random() * (c2.speedNoiseBase + c2.speedNoiseScale * power);

            const p = obtainParticle();
            p.type = 2;
            p.x = px;
            p.y = py;
            p.vx = Math.cos(dirAngle) * speed;
            p.vy = Math.sin(dirAngle) * speed + c2.vyBlastOffset;
            p.r0 = c2.r0Min + Math.random() * (c2.r0Max - c2.r0Min);
            p.r1 = (c2.r1Min + Math.random() * (c2.r1Max - c2.r1Min)) + c2.r1Scale * power;
            p.lifetime = (c2.lifeMin + Math.random() * (c2.lifeMax - c2.lifeMin)) + c2.lifeScale * power;
            p.maxAlpha = c2.maxAlpha;
            p.fadeIn = c2.fadeIn;
            p.fadeOutExp = c2.fadeOutExp;
        }

        // RUNG CHẤN: Làm rung chấn các icon và phần tử liên kết trên màn hình
        shakeInteractiveElements(mouse.x, mouse.y, power);

        // 4. TIA SÉT KHI THẢ CHUỘT:
        // sinh nb = 5 + round(7 × power) tia lớn từ con trỏ, chia đều quanh vòng tròn
        // (góc đầu ngẫu nhiên, mỗi tia lệch ±0.25 rad), độ dài 110-190 + 280 × power px,
        // biên độ 20 + 25 × power, độ sâu 2, tuổi thọ 16-26 khung hình, w = 1 + 0.7 × power.
        // Kèm một quầng sáng nhỏ ở tâm (sprite khói, bán kính 90 + 120 × power px, alpha 0.6, tắt sau 10 khung hình).
        // Trên điện thoại giảm số tia lớn còn một nửa và bỏ nhánh cấp 2.
        if (CONFIG.lightning && !reducedMotion) {
            let nb = 5 + Math.round(7 * power);
            if (isMobile) nb = Math.max(3, Math.round(nb / 2));
            const baseAngle = Math.random() * Math.PI * 2;
            const depth = isMobile ? 1 : 2;

            // Tìm các icon gần nhất để ưu tiên phóng tia điện cực mạnh vào đó
            const nearbyTargets = getNearbyInteractiveElements(mouse.x, mouse.y, 450);

            for (let k = 0; k < nb; k++) {
                let ex, ey;
                let amp = 20 + 25 * power;
                let life = 16 + Math.floor(Math.random() * 11); // 16-26 khung hình
                let w = 1.0 + 0.7 * power;

                // Nếu có icon gần, ưu tiên một số tia đầu bắn thẳng vào icon
                if (k < nearbyTargets.length && k < 3) {
                    const tgt = nearbyTargets[k];
                    ex = tgt.cx + (Math.random() * 12 - 6);
                    ey = tgt.cy + (Math.random() * 12 - 6);
                    joltElement(tgt.el, mouse.x, mouse.y);
                } else {
                    const angle = baseAngle + (k / nb) * Math.PI * 2 + (Math.random() * 0.5 - 0.25);
                    const len = (110 + Math.random() * 80) + 280 * power;
                    ex = mouse.x + Math.cos(angle) * len;
                    ey = mouse.y + Math.sin(angle) * len;
                }

                spawnLightningBolt(mouse.x, mouse.y, ex, ey, amp, depth, life, w);
            }

            // Quầng sáng nhỏ ở tâm
            centerFlash = {
                x: mouse.x,
                y: mouse.y,
                radius: 90 + 120 * power,
                maxAlpha: 0.6,
                age: 0,
                lifetime: 10
            };
        }
    }

    // HỦY NHẤN GIỮ (KHI RỜI CỬA SỔ) - KHÔNG NỔ
    function cancelHold() {
        if (!mouse.isHolding) return;
        mouse.isHolding = false;
        mouse.hp = 0;

        // Chuyển mọi hạt xoáy thành hạt kiểu 1 đứng yên rồi tan dần
        for (let i = 0; i < CONFIG.maxParticles; i++) {
            const p = pool[i];
            if (!p.active) continue;
            if (p.type === 3) {
                p.type = 1;
                p.vx = 0;
                p.vy = -0.05;
            }
        }
    }

    // ==========================================================================
    // 6. CẬP NHẬT VẬT LÝ VÀ VẼ KHUNG HÌNH (ANIMATION LOOP)
    // ==========================================================================
    function updateAndRender() {
        if (!CONFIG.enabled || reducedMotion) {
            if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
            return;
        }

        frameT++;

        // Đo FPS tự động điều tiết hiệu năng
        frameCount++;
        const now = performance.now();
        if (now - lastFpsTime >= 1000) {
            const currentFps = (frameCount * 1000) / (now - lastFpsTime);
            if (currentFps < 40) {
                lowFpsCounter++;
                if (lowFpsCounter > 2) isThrottled = true;
            } else if (currentFps > 52) {
                lowFpsCounter = 0;
                isThrottled = false;
            }
            frameCount = 0;
            lastFpsTime = now;
        }

        // Tính lực tích lũy (hp) khi nhấn giữ
        if (mouse.isHolding) {
            const duration = (now - mouse.holdStartTime) / 1000;
            mouse.hp = Math.min(1.0, duration / CONFIG.maxHoldDuration);
        } else {
            mouse.hp = 0;
        }

        const isMoving = mouse.isMoving;
        mouse.isMoving = false;

        // Sinh hạt mới theo trạng thái
        if (mouse.inside) {
            if (mouse.isHolding) {
                spawnSwirlSmoke();
            } else {
                spawnCoreSmoke();
                spawnStrandSmoke();

                // Rê chuột hoặc để yên: mỗi khung hình có xác suất 2% (3% khi đang di chuyển)
                // sinh một tia điện ngắn từ vùng khói ở con trỏ ra hướng ngẫu nhiên, độ dài 26-70px, biên độ 7, độ sâu 1, tuổi thọ 7-13 khung hình, w = 0.8
                const pChance = isMoving ? 0.03 : 0.02;
                if (CONFIG.lightning && !reducedMotion) {
                    const nearbyTargets = getNearbyInteractiveElements(mouse.x, mouse.y, 180);
                    // Nếu ở gần icon/link: phóng tia điện trực tiếp vào icon để tạo cảm giác giật lách tách
                    const strikeIconChance = isMoving ? 0.06 : 0.035;
                    if (nearbyTargets.length > 0 && Math.random() < strikeIconChance) {
                        const tgt = nearbyTargets[0];
                        const tx = tgt.cx + (Math.random() * 14 - 7);
                        const ty = tgt.cy + (Math.random() * 14 - 7);
                        const life = 7 + Math.floor(Math.random() * 7); // 7-13 khung hình
                        spawnLightningBolt(mouse.x, mouse.y, tx, ty, 8, 1, life, 0.85);
                        joltElement(tgt.el, mouse.x, mouse.y);
                    } else if (Math.random() < pChance) {
                        const a = Math.random() * Math.PI * 2;
                        const len = 26 + Math.random() * 44; // 26-70px
                        const sx = mouse.x + (Math.random() * 12 - 6);
                        const sy = mouse.y + (Math.random() * 12 - 6);
                        const ex = sx + Math.cos(a) * len;
                        const ey = sy + Math.sin(a) * len;
                        const life = 7 + Math.floor(Math.random() * 7); // 7-13 khung hình
                        spawnLightningBolt(sx, sy, ex, ey, 7, 1, life, 0.8);

                        // Nếu tia điện phóng chạm tới gần icon, giật icon đó
                        if (nearbyTargets.length > 0 && nearbyTargets[0].dist < len + 25) {
                            joltElement(nearbyTargets[0].el, sx, sy);
                        }
                    }
                }
            }
        }

        // Xóa khung hình trước
        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
        ctx.globalCompositeOperation = 'lighter';

        const c0 = CONFIG.type0;
        const c1 = CONFIG.type1;
        const c2 = CONFIG.type2;
        const c3 = CONFIG.type3;
        const isHolding = mouse.isHolding;
        const hp = mouse.hp;

        // Cập nhật từng hạt
        for (let i = 0; i < CONFIG.maxParticles; i++) {
            const p = pool[i];
            if (!p.active) continue;

            p.age++;
            if (p.age >= p.lifetime) {
                p.active = false;
                continue;
            }

            const t = p.age / p.lifetime;

            // KIỂU 3: Sợi xoáy quanh con trỏ hiện tại
            if (p.type === 3) {
                const prog = Math.max(0, 1 - p.rad / p.rad0);
                p.angle += 0.05 + 0.16 * prog + 0.02 * hp;
                p.rad *= (c3.radDampBase - c3.radDampCharge * hp);

                p.x = mouse.x + Math.cos(p.angle) * p.rad;
                p.y = mouse.y + Math.sin(p.angle) * p.rad * 0.8;
            }
            // KIỂU 0: Sợi bốc lên
            else if (p.type === 0) {
                p.vy += c0.vyAcc * (1 - t);
                p.vy *= c0.vyFriction;
                const spd = c0.SPD[p.strandIndex] || 1;
                const maxSpeed = c0.vyLimitScale * spd;
                if (p.vy < maxSpeed) p.vy = maxSpeed;

                // Uốn lượn riêng từng sợi khi KHÔNG nhấn giữ
                if (!isHolding) {
                    const u = Math.min(1, t / 0.4);
                    const bendPhase = strandBendPhase[p.strandIndex] || 0;
                    const targetAxis = p.ax + Math.sin(frameT * c0.bendFreqT + bendPhase + p.y * c0.bendFreqY) * c0.bendAmp * u;
                    p.vx += (targetAxis - p.x) * c0.bendPull;
                    p.vx *= c0.frictionX;
                }

                p.x += p.vx;
                p.y += p.vy;
            }
            // KIỂU 1: Vùng khói dày
            else if (p.type === 1) {
                p.vx *= c1.frictionX;
                p.vy *= c1.frictionY;
                p.x += p.vx;
                p.y += p.vy;
            }
            // KIỂU 2: Hạt nổ bung tỏa
            else if (p.type === 2) {
                p.vx *= c2.friction;
                p.vy *= c2.friction;
                p.vy += c2.vyRiseAcc; // Hơi bốc lên khi tan
                p.x += p.vx;
                p.y += p.vy;
            }

            // HÚT VÀO CON TRỎ KHI NHẤN GIỮ (với các hạt kiểu 0, 1, 2)
            if (isHolding && p.type !== 3) {
                const dx = mouse.x - p.x;
                const dy = mouse.y - p.y;
                const d = Math.hypot(dx, dy);

                if (d < c3.suctionRadius) {
                    const dSafe = Math.max(d, 1.0);
                    const pl = c3.suctionStrength * (1 - d / c3.suctionRadius) * (1 + 1.5 * hp);
                    p.vx += (dx / dSafe) * pl - (dy / dSafe) * pl * 1.1;
                    p.vy += (dy / dSafe) * pl + (dx / dSafe) * pl * 1.1;
                    p.vx *= 0.96;
                    p.vy *= 0.96;
                }
            }

            // Tính bán kính và độ trong suốt chung
            const r = p.r0 + (p.r1 - p.r0) * Math.pow(t, 0.6);
            const opacity = Math.min(1.0, t / p.fadeIn) * Math.pow(1 - t, p.fadeOutExp) * p.maxAlpha;

            if (opacity > 0.001 && r > 0.5) {
                ctx.globalAlpha = opacity;
                ctx.drawImage(spriteCanvas, p.x - r, p.y - r, r * 2, r * 2);
            }
        }

        // 4.5. KẾT XUẤT TIA SÉT (3 lớp nét chồng nhau & rung lách tách)
        ctx.globalAlpha = 1.0;
        if (CONFIG.lightning && !reducedMotion && activeBolts.length > 0) {
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = 1.0;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            const aura = getAuraColor();

            for (let i = activeBolts.length - 1; i >= 0; i--) {
                const bolt = activeBolts[i];
                bolt.age++;
                if (bolt.age >= bolt.lifetime) {
                    activeBolts.splice(i, 1);
                    continue;
                }

                // alpha = (1 - tuổi / tuổi_thọ) × hệ_số_nhấp_nháy,
                // trong đó hệ số nhấp nháy bằng 1 ở 2 khung hình đầu rồi ngẫu nhiên 0.5-1 sau đó
                const flicker = (bolt.age < 2) ? 1.0 : (0.5 + Math.random() * 0.5);
                const alpha = Math.max(0, (1 - bolt.age / bolt.lifetime) * flicker);
                if (alpha <= 0.005) continue;

                drawBranch(bolt.tree, alpha, bolt.w, aura);
            }
        }

        // Quầng sáng nhỏ ở tâm sau khi thả chuột nổ
        if (centerFlash) {
            centerFlash.age++;
            if (centerFlash.age >= centerFlash.lifetime) {
                centerFlash = null;
            } else {
                const flashAlpha = Math.max(0, (1 - centerFlash.age / centerFlash.lifetime) * centerFlash.maxAlpha);
                const rad = centerFlash.radius;
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = flashAlpha;
                ctx.drawImage(spriteCanvas, centerFlash.x - rad, centerFlash.y - rad, rad * 2, rad * 2);
            }
        }

        // Vẽ thanh báo "Sức nổ" tinh tế khi nhấn giữ
        if (isHolding && CONFIG.showPowerGauge && mouse.hp > 0.03) {
            drawPowerGauge(mouse.x, mouse.y, mouse.hp);
        }

        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1.0;

        animationId = requestAnimationFrame(updateAndRender);
    }

    // Hiển thị thanh vòng cung "Sức nổ" mờ nhẹ, tinh tế quanh con trỏ để tôn hiệu ứng khói & sét
    function drawPowerGauge(x, y, hp) {
        ctx.save();
        // Dùng lighter để hòa trộn mềm mại với khói và tia sét, không che lấp hiệu ứng
        ctx.globalCompositeOperation = 'lighter';

        // Vòng tròn tích năng lượng quanh chuột
        const radius = 24;
        const startAngle = -Math.PI / 2;
        const endAngle = startAngle + hp * Math.PI * 2;

        // Vòng nền mờ rất nhẹ (gần như vô hình để khói nổi bật)
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
        ctx.lineWidth = 1.3;
        ctx.stroke();

        // Vòng sáng tích lũy thanh mảnh, dịu mắt, độ mờ vừa phải
        ctx.beginPath();
        ctx.arc(x, y, radius, startAngle, endAngle);
        if (CONFIG.colorPreset === 'darkPurple' || CONFIG.colorPreset === 'purple') {
            ctx.strokeStyle = 'rgba(175, 115, 255, 0.22)';
        } else if (CONFIG.colorPreset === 'mysticBlue') {
            ctx.strokeStyle = 'rgba(64, 160, 255, 0.22)';
        } else {
            ctx.strokeStyle = 'rgba(220, 225, 245, 0.20)';
        }
        ctx.lineWidth = 1.4;
        ctx.lineCap = 'round';
        ctx.stroke();

        // Nhãn chữ nhỏ "Sức nổ" mờ nhẹ tinh tế phía dưới
        ctx.font = '500 8.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
        ctx.textAlign = 'center';
        ctx.fillText(`${Math.round(hp * 100)}%`, x, y + 36);

        ctx.restore();
    }

    // ==========================================================================
    // 7. LẮNG NGHE SỰ KIỆN CHUỘT / CẢM ỨNG
    // ==========================================================================
    function setupEventListeners() {
        const onMove = (clientX, clientY) => {
            mouse.x = clientX;
            mouse.y = clientY;
            mouse.inside = true;
            mouse.isMoving = true;
        };

        const onDown = (clientX, clientY) => {
            mouse.x = clientX;
            mouse.y = clientY;
            mouse.inside = true;
            mouse.isHolding = true;
            mouse.holdStartTime = performance.now();
        };

        const onUp = () => {
            if (mouse.isHolding) {
                const duration = (performance.now() - mouse.holdStartTime) / 1000;
                const power = Math.min(1.0, duration / CONFIG.maxHoldDuration);
                mouse.isHolding = false;
                mouse.hp = 0;
                triggerExplosion(power);
            }
        };

        // Chuột
        window.addEventListener('mousemove', (e) => onMove(e.clientX, e.clientY), { passive: true });
        window.addEventListener('mousedown', (e) => {
            if (e.button === 0) onDown(e.clientX, e.clientY);
        }, { passive: true });
        window.addEventListener('mouseup', (e) => {
            if (e.button === 0) onUp();
        }, { passive: true });

        // Nếu chuột rời cửa sổ khi đang giữ -> HỦY, KHÔNG NỔ
        window.addEventListener('mouseleave', () => {
            cancelHold();
            mouse.inside = false;
        }, { passive: true });

        window.addEventListener('blur', () => {
            cancelHold();
            mouse.inside = false;
        });

        // Cảm ứng điện thoại
        window.addEventListener('touchstart', (e) => {
            if (e.touches && e.touches[0]) {
                onDown(e.touches[0].clientX, e.touches[0].clientY);
            }
        }, { passive: true });

        window.addEventListener('touchmove', (e) => {
            if (e.touches && e.touches[0]) {
                onMove(e.touches[0].clientX, e.touches[0].clientY);
            }
        }, { passive: true });

        window.addEventListener('touchend', () => onUp(), { passive: true });
        window.addEventListener('touchcancel', () => cancelHold(), { passive: true });

        // Cửa sổ thay đổi kích thước
        window.addEventListener('resize', resizeCanvas, { passive: true });

        // Tạm dừng khi chuyển tab để tiết kiệm pin
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                cancelHold();
                if (animationId) {
                    cancelAnimationFrame(animationId);
                    animationId = null;
                }
            } else {
                lastFpsTime = performance.now();
                frameCount = 0;
                if (!animationId && CONFIG.enabled && !reducedMotion) {
                    animationId = requestAnimationFrame(updateAndRender);
                }
            }
        });

        // Theo dõi prefers-reduced-motion
        if (window.matchMedia) {
            window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => {
                reducedMotion = e.matches;
                if (reducedMotion) {
                    cancelHold();
                    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
                }
            });
        }
    }

    // ==========================================================================
    // 8. KHỞI TẠO VÀ CUNG CẤP API ĐIỀU KHIỂN ĐỘC LẬP
    // ==========================================================================
    function init() {
        detectDevice();
        injectInteractiveStyles();
        createMainCanvas();
        setupEventListeners();

        if (CONFIG.enabled && !reducedMotion) {
            animationId = requestAnimationFrame(updateAndRender);
        }
    }

    // Public API gắn vào window để trang web có thể bật/tắt độc lập
    window.CursorSmokeFx = {
        CONFIG: CONFIG,

        enable() {
            CONFIG.enabled = true;
            try { localStorage.setItem('cursor_smoke_fx_enabled', 'true'); } catch (_) {}
            if (canvas) canvas.style.display = 'block';
            if (!animationId && !reducedMotion) {
                lastFpsTime = performance.now();
                animationId = requestAnimationFrame(updateAndRender);
            }
        },

        disable() {
            CONFIG.enabled = false;
            try { localStorage.setItem('cursor_smoke_fx_enabled', 'false'); } catch (_) {}
            cancelHold();
            if (animationId) {
                cancelAnimationFrame(animationId);
                animationId = null;
            }
            if (ctx && canvas) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                canvas.style.display = 'none';
            }
        },

        toggle() {
            if (CONFIG.enabled) {
                this.disable();
            } else {
                this.enable();
            }
            return CONFIG.enabled;
        },

        isEnabled() {
            return CONFIG.enabled;
        },

        setColorPreset(presetNameOrRgb) {
            CONFIG.colorPreset = presetNameOrRgb;
            try { localStorage.setItem('cursor_smoke_fx_preset', presetNameOrRgb); } catch (_) {}
            createOrUpdateSprite();
        },

        getColorPreset() {
            return CONFIG.colorPreset;
        },

        toggleLightning() {
            CONFIG.lightning = !CONFIG.lightning;
            try { localStorage.setItem('cursor_smoke_fx_lightning', CONFIG.lightning ? 'true' : 'false'); } catch (_) {}
            return CONFIG.lightning;
        },

        enableLightning() {
            CONFIG.lightning = true;
            try { localStorage.setItem('cursor_smoke_fx_lightning', 'true'); } catch (_) {}
        },

        disableLightning() {
            CONFIG.lightning = false;
            try { localStorage.setItem('cursor_smoke_fx_lightning', 'false'); } catch (_) {}
        },

        isLightningEnabled() {
            return CONFIG.lightning;
        }
    };

    // Khởi chạy khi DOM sẵn sàng
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
