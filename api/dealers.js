/* ============================================================
   ABRAHAM BIKE - SPIN GATE
   File: js/spin-gate.js

   Nhiệm vụ:
   - Popup thu thập thông tin khách (Tên, SĐT, Địa chỉ, Cửa hàng,
     Sản phẩm đã mua).
   - Xác minh số điện thoại bằng Zalo Mini App (không SMS OTP).
   - Gửi lead đã xác minh qua API server-side và nhận ticket_code.
   - Ghi nhớ "đã tham gia".
   - Popup thông báo giữa màn hình + hiệu ứng pháo giấy.

   Hiệu ứng pháo giấy vẽ bằng canvas ngay trong file này, không
   cần thư viện ngoài. Tự tắt khi người dùng bật
   "prefers-reduced-motion".

   Mỗi số điện thoại chỉ được 1 lượt quay. Chặn thật nằm ở
   database; localStorage ở đây chỉ để trải nghiệm mượt hơn.

   Thứ tự nạp bắt buộc:
     supabase-config.js  ->  spin-gate.js  ->  wheel.js

   Xác minh SĐT được thực hiện server-side qua Zalo Mini App.
   ZALO_APP_SECRET và SUPABASE_SERVICE_ROLE_KEY chỉ nằm trên Vercel.

   GHI CHÚ: modal dùng CSS riêng nhúng trong file, KHÔNG dùng
   Tailwind. Tailwind chỉ sinh class nó quét thấy trong *.html;
   class nằm trong chuỗi JS sẽ không có trong output.css.

   GHI CHÚ (mới): ô "Cửa hàng đã mua" giờ có gợi ý (datalist)
   lấy từ /api/dealers (đọc bảng abraham_dealers qua service role
   key trên Vercel). Khách vẫn gõ tự do được nếu không tìm thấy
   cửa hàng của mình, và luôn có lựa chọn "Không nhớ / Khác".
============================================================ */
(function () {

    var STORAGE_KEY  = 'abraham_spin_leads';
    var STORAGE_DONE = 'abraham_spin_done';
    var STYLE_ID     = 'spin-gate-style';

    /* ========================================================
       CỜ BẬT/TẮT XÁC MINH ZALO
       false = Zalo chưa duyệt app: ẩn nút "Xác minh bằng Zalo",
               cho phép nhận lượt quay không cần xác minh.
               Chống trùng vẫn được đảm bảo ở database
               (1 SĐT = 1 lượt quay, qua RPC abraham_submit_lead).
       true  = bật lại xác minh Zalo. Khi bật, PHẢI đồng thời
               đặt biến môi trường ZALO_VERIFY_ENABLED=true
               trên Vercel (api/submit-verified-lead.js đọc cờ này).
    ======================================================== */
    var ZALO_VERIFY_ENABLED = false;

    var state = {
        ticketCode: null,  // mã do server cấp, chưa dùng
        lead: null         // thông tin khách vừa nhập
    };

    var modalEl = null;
    var noticeEl = null;
    var pendingCallback = null;
    var savedScrollY = 0;
    var isLocked = false;
    var submitting = false;
    var ZALO_VERIFY_STORAGE = 'abraham_zalo_verification';
    var verificationState = {
        id: null,
        verified: false,
        phone: null,
        formData: null,
        status: null
    };

    // Nhãn luôn có sẵn trong gợi ý, dành cho khách không nhớ đã mua ở đâu
    var STORE_FALLBACK_OPTION = 'Không nhớ / Khác';
    var storeOptionsLoaded = false;
    var storeOptionsLoading = false;

    function getUrlVerificationId() {
        try {
            return new URL(window.location.href).searchParams.get('zalo_verification');
        } catch (e) {
            return null;
        }
    }

    function getStoredVerificationId() {
        try { return localStorage.getItem(ZALO_VERIFY_STORAGE); }
        catch (e) { return null; }
    }

    function storeVerificationId(id) {
        try {
            if (id) localStorage.setItem(ZALO_VERIFY_STORAGE, id);
            else localStorage.removeItem(ZALO_VERIFY_STORAGE);
        } catch (e) { /* bỏ qua */ }
    }

    function clearVerificationState() {
        verificationState.id = null;
        verificationState.verified = false;
        verificationState.phone = null;
        verificationState.formData = null;
        verificationState.status = null;
        storeVerificationId(null);
    }

    async function fetchJson(url, options) {
        var response = await fetch(url, options || {});
        var raw = await response.text();
        var data = null;

        try { data = raw ? JSON.parse(raw) : {}; }
        catch (e) { data = {}; }

        if (!response.ok || data.ok === false) {
            var err = new Error(data.message || ('Lỗi kết nối (' + response.status + ')'));
            err.code = data.code || ('http_' + response.status);
            err.status = response.status;
            throw err;
        }

        return data;
    }

    /* --------------------------------------------------------
       CSS riêng
    --------------------------------------------------------- */
    var CSS = [
        /* ---------- lớp phủ dùng chung ---------- */
        '#spin-gate-overlay,#spin-gate-notice{',
        '  position:fixed;top:0;right:0;bottom:0;left:0;',
        '  display:none;align-items:center;justify-content:center;',
        '  padding:16px;',
        '  background:rgba(15,23,42,.62);',
        '  -webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);',
        '  font-family:Montserrat,system-ui,Arial,sans-serif;',
        '}',
        '#spin-gate-overlay{z-index:9999;}',
        '#spin-gate-notice{z-index:10000;}',
        '#spin-gate-overlay.sg-open,#spin-gate-notice.sg-open{display:flex;}',

        /* ---------- canvas pháo giấy ---------- */
        '#spin-gate-confetti{',
        '  position:fixed;top:0;left:0;',
        '  z-index:10001;pointer-events:none;',
        '}',

        /* ---------- form ---------- */
        '.sg-card{',
        '  position:relative;width:100%;max-width:26rem;',
        '  max-height:88vh;overflow-y:auto;',
        '  background:#fff;border:4px solid #DBEAFE;border-radius:24px;',
        '  box-shadow:0 30px 60px -12px rgba(6,28,68,.38);',
        '  padding:24px;',
        '  -webkit-overflow-scrolling:touch;',
        '}',

        '.sg-close{',
        '  position:absolute;top:14px;right:14px;',
        '  width:36px;height:36px;border:0;border-radius:999px;',
        '  background:#F1F5F9;color:#64748B;cursor:pointer;',
        '  display:flex;align-items:center;justify-content:center;',
        '  font-size:16px;line-height:1;',
        '}',
        '.sg-close:hover{background:#E2E8F0;color:#0F172A;}',

        '.sg-head{text-align:center;margin-bottom:18px;}',
        '.sg-eyebrow{',
        '  display:inline-flex;align-items:center;gap:6px;',
        '  background:linear-gradient(90deg,#2563EB,#F43F5E);',
        '  color:#fff;font-size:10px;font-weight:900;',
        '  text-transform:uppercase;letter-spacing:.14em;',
        '  padding:6px 12px;border-radius:999px;',
        '}',
        '.sg-title{',
        '  margin:8px 0 4px;font-size:22px;line-height:1.15;',
        '  font-weight:900;color:#2563EB;letter-spacing:-.02em;',
        '}',
        '.sg-sub{margin:0;font-size:12px;color:#64748B;}',

        '.sg-field{margin-bottom:12px;}',
        '.sg-label{',
        '  display:block;margin-bottom:5px;',
        '  font-size:11px;font-weight:800;color:#334155;',
        '  text-transform:uppercase;letter-spacing:.04em;',
        '}',
        '.sg-input{',
        '  width:100%;box-sizing:border-box;',
        '  padding:12px 14px;font-size:14px;font-family:inherit;color:#0F172A;',
        '  background:#F1F5F9;border:1px solid #E2E8F0;border-radius:12px;',
        '  outline:none;transition:border-color .15s,box-shadow .15s;',
        '}',
        '.sg-input:focus{border-color:#2563EB;box-shadow:0 0 0 3px rgba(37,99,235,.22);}',
        'select.sg-input{font-weight:600;appearance:none;',
        '  background-image:url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 12 8\'><path d=\'M1 1l5 5 5-5\' fill=\'none\' stroke=\'%2364748B\' stroke-width=\'2\' stroke-linecap=\'round\'/></svg>");',
        '  background-repeat:no-repeat;background-position:right 14px center;background-size:12px;',
        '  padding-right:38px;}',

        '.sg-error{',
        '  display:none;margin:6px 0 0;',
        '  font-size:12px;font-weight:600;color:#DC2626;',
        '}',
        '.sg-error.sg-show{display:block;}',
        '.sg-error--general{text-align:center;margin-top:10px;}',
        '.sg-hint{margin:7px 0 0;font-size:11px;line-height:1.5;color:#64748B;text-align:center;}',
        '.sg-verify-status{display:none;margin:8px 0 0;padding:10px 12px;border-radius:10px;font-size:12px;font-weight:800;text-align:center;line-height:1.45;}',
        '.sg-verify-status.sg-pending.sg-show{display:block;background:#EFF6FF;color:#1D4ED8;border:1px solid #BFDBFE;}',
        '.sg-verify-status.sg-success.sg-show{display:block;background:#ECFDF5;color:#15803D;border:1px solid #BBF7D0;}',

        '.sg-submit{',
        '  width:100%;margin-top:8px;border:0;cursor:pointer;',
        '  padding:14px 16px;border-radius:12px;',
        '  background:linear-gradient(90deg,#2563EB,#3B82F6,#F43F5E);',
        '  color:#fff;font-family:inherit;font-size:13px;font-weight:900;',
        '  text-transform:uppercase;letter-spacing:.08em;',
        '  display:flex;align-items:center;justify-content:center;gap:8px;',
        '  box-shadow:0 12px 26px rgba(37,99,235,.28);',
        '  transition:filter .2s,transform .2s;',
        '}',
        '.sg-submit:hover{filter:brightness(1.08);transform:translateY(-1px);}',
        '.sg-submit:disabled{opacity:.65;cursor:wait;transform:none;}',

        /* ---------- popup thông báo ---------- */
        '.sg-notice-card{',
        '  position:relative;width:100%;max-width:23rem;',
        '  background:#fff;border:4px solid #FDE68A;border-radius:24px;',
        '  box-shadow:0 30px 60px -12px rgba(6,28,68,.38);',
        '  padding:30px 24px 24px;text-align:center;',
        '  animation:sg-pop .42s cubic-bezier(.18,.9,.28,1.2) both;',
        '}',
        '@keyframes sg-pop{',
        '  from{opacity:0;transform:scale(.82) translateY(14px);}',
        '  to{opacity:1;transform:scale(1) translateY(0);}',
        '}',
        '.sg-notice-icon{',
        '  width:64px;height:64px;margin:0 auto 14px;border-radius:999px;',
        '  background:linear-gradient(135deg,#FBBF24,#F43F5E);color:#fff;',
        '  display:flex;align-items:center;justify-content:center;font-size:26px;',
        '}',
        '.sg-notice-icon.sg-bounce{animation:sg-bounce .8s ease-in-out .2s 2;}',
        '@keyframes sg-bounce{',
        '  0%,100%{transform:translateY(0) rotate(0);}',
        '  30%{transform:translateY(-10px) rotate(-8deg);}',
        '  60%{transform:translateY(-4px) rotate(6deg);}',
        '}',
        '.sg-notice-title{margin:0 0 8px;font-size:20px;font-weight:900;color:#2563EB;}',
        '.sg-notice-text{margin:0;font-size:13px;line-height:1.6;color:#475569;}',
        '.sg-notice-prize{',
        '  margin-top:14px;padding:12px 14px;border-radius:14px;',
        '  background:#EFF6FF;border:1px solid #DBEAFE;',
        '  font-size:13px;font-weight:800;color:#1D4ED8;line-height:1.5;',
        '}',
        '.sg-notice-btn{',
        '  margin-top:18px;width:100%;border:0;cursor:pointer;',
        '  padding:13px 16px;border-radius:12px;color:#fff;',
        '  background:linear-gradient(90deg,#2563EB,#F43F5E);',
        '  font-family:inherit;font-size:13px;font-weight:900;',
        '  text-transform:uppercase;letter-spacing:.08em;',
        '  transition:filter .2s;',
        '}',
        '.sg-notice-btn:hover{filter:brightness(1.08);}',

        'body.sg-locked{overflow:hidden;}',

        '@media (prefers-reduced-motion: reduce){',
        '  .sg-notice-card,.sg-notice-icon.sg-bounce{animation:none;}',
        '}',

        '@media (max-width:400px){',
        '  .sg-card{padding:20px 16px;border-radius:20px;}',
        '  .sg-title{font-size:19px;}',
        '  .sg-notice-card{padding:26px 18px 20px;border-radius:20px;}',
        '}'
    ].join('');

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        var style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = CSS;
        document.head.appendChild(style);
    }

    /* ========================================================
       PHÁO GIẤY (confetti) - vẽ bằng canvas, không thư viện
    ========================================================= */
    var CONFETTI_COLORS = [
        '#2563EB', '#60A5FA', '#93C5FD',
        '#F43F5E', '#FB7185',
        '#FBBF24', '#FDE68A',
        '#34D399', '#A78BFA'
    ];

    var cfCanvas = null;
    var cfCtx = null;
    var cfParticles = [];
    var cfRunning = false;

    function reducedMotion() {
        return window.matchMedia &&
               window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    function cfEnsureCanvas() {
        if (cfCanvas) return;

        injectStyles();

        cfCanvas = document.createElement('canvas');
        cfCanvas.id = 'spin-gate-confetti';
        document.body.appendChild(cfCanvas);
        cfCtx = cfCanvas.getContext('2d');

        cfResize();
        window.addEventListener('resize', cfResize);
    }

    function cfResize() {
        if (!cfCanvas) return;
        var dpr = window.devicePixelRatio || 1;
        var w = window.innerWidth;
        var h = window.innerHeight;
        cfCanvas.width = Math.floor(w * dpr);
        cfCanvas.height = Math.floor(h * dpr);
        cfCanvas.style.width = w + 'px';
        cfCanvas.style.height = h + 'px';
        cfCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    /* Bắn một chùm từ toạ độ (x, y) theo góc angle (độ) */
    function cfBurst(x, y, count, angle, spread, speed) {
        for (var i = 0; i < count; i++) {
            var a = (angle + (Math.random() - 0.5) * spread) * Math.PI / 180;
            var v = speed * (0.55 + Math.random() * 0.75);
            cfParticles.push({
                x: x,
                y: y,
                vx: Math.cos(a) * v,
                vy: Math.sin(a) * v,
                w: 6 + Math.random() * 6,
                h: 9 + Math.random() * 8,
                rot: Math.random() * Math.PI * 2,
                vr: (Math.random() - 0.5) * 0.34,
                color: CONFETTI_COLORS[(Math.random() * CONFETTI_COLORS.length) | 0],
                life: 150 + Math.random() * 90,
                age: 0,
                wobble: Math.random() * Math.PI * 2
            });
        }
    }

    function cfTick() {
        if (!cfCtx) { cfRunning = false; return; }

        var h = window.innerHeight;
        cfCtx.clearRect(0, 0, window.innerWidth, h);

        for (var i = cfParticles.length - 1; i >= 0; i--) {
            var p = cfParticles[i];

            p.age++;
            p.vy += 0.22;          // trọng lực
            p.vx *= 0.992;         // cản không khí
            p.vy *= 0.992;
            p.wobble += 0.1;
            p.x += p.vx + Math.sin(p.wobble) * 0.6;
            p.y += p.vy;
            p.rot += p.vr;

            if (p.age > p.life || p.y > h + 40) {
                cfParticles.splice(i, 1);
                continue;
            }

            var fade = p.age > p.life - 45
                ? Math.max(0, (p.life - p.age) / 45)
                : 1;

            cfCtx.save();
            cfCtx.globalAlpha = fade;
            cfCtx.translate(p.x, p.y);
            cfCtx.rotate(p.rot);
            cfCtx.fillStyle = p.color;
            // co ngang theo góc xoay để giống mảnh giấy lật
            cfCtx.fillRect(-p.w / 2, -p.h / 2, p.w * Math.abs(Math.cos(p.rot * 0.6)) + 1.5, p.h);
            cfCtx.restore();
        }

        if (cfParticles.length) {
            window.requestAnimationFrame(cfTick);
        } else {
            cfRunning = false;
            cfCtx.clearRect(0, 0, window.innerWidth, h);
        }
    }

    /*
       celebrate(power)
         power 1 = vừa phải, 1.6 = giải lớn
    */
    function celebrate(power) {
        if (reducedMotion()) return;

        power = power || 1;
        cfEnsureCanvas();

        var w = window.innerWidth;
        var h = window.innerHeight;
        var n = Math.round(46 * power);

        // hai chùm từ góc dưới bắn chéo lên
        cfBurst(w * 0.06, h * 0.98, n, -62, 42, 15 * power);
        cfBurst(w * 0.94, h * 0.98, n, -118, 42, 15 * power);

        // một chùm nổ từ giữa
        window.setTimeout(function () {
            cfBurst(w * 0.5, h * 0.38, Math.round(38 * power), -90, 150, 11 * power);
        }, 170);

        // mưa giấy rơi từ trên
        window.setTimeout(function () {
            for (var i = 0; i < Math.round(30 * power); i++) {
                cfBurst(Math.random() * w, -20, 1, 90, 24, 3);
            }
        }, 380);

        if (!cfRunning) {
            cfRunning = true;
            window.requestAnimationFrame(cfTick);
        }
    }

    /* --------------------------------------------------------
       Khoá / mở khoá cuộn trang, giữ nguyên vị trí đang đọc
    --------------------------------------------------------- */
    function lockScroll() {
        if (isLocked) return;
        savedScrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
        document.body.classList.add('sg-locked');
        document.body.style.position = 'fixed';
        document.body.style.top = (-savedScrollY) + 'px';
        document.body.style.left = '0';
        document.body.style.right = '0';
        document.body.style.width = '100%';
        isLocked = true;
    }

    function unlockScroll() {
        if (!isLocked) return;
        document.body.classList.remove('sg-locked');
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.left = '';
        document.body.style.right = '';
        document.body.style.width = '';
        document.body.style.overflow = '';
        isLocked = false;
        window.scrollTo(0, savedScrollY);
    }

    /* --------------------------------------------------------
       Trạng thái "đã tham gia"
    --------------------------------------------------------- */
    function markCompleted(info) {
        try {
            localStorage.setItem(STORAGE_DONE, JSON.stringify({
                phone: (info && info.phone) || (state.lead && state.lead.phone) || null,
                name:  (info && info.name)  || (state.lead && state.lead.name)  || null,
                tier:  (info && info.tier)  || null,
                prize: (info && info.prize) || null,
                time: new Date().toISOString()
            }));
        } catch (e) {
            console.warn('[AbrahamSpinGate] Không ghi được trạng thái đã tham gia:', e);
        }
    }

    function getCompleted() {
        try {
            var raw = localStorage.getItem(STORAGE_DONE);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    }

    function hasCompleted() {
        return getCompleted() !== null;
    }

    // Dùng khi cần test lại: gõ AbrahamSpinGate.reset() trong Console
    function reset() {
        try {
            localStorage.removeItem(STORAGE_DONE);
        } catch (e) { /* bỏ qua */ }
        state.ticketCode = null;
        state.lead = null;
        clearVerificationState();
        if (modalEl) syncVerificationUI();
        console.log('[AbrahamSpinGate] Đã xoá trạng thái tham gia và xác minh trên trình duyệt này.');
    }

    /* --------------------------------------------------------
       Bản sao lead dự phòng trong máy khách
    --------------------------------------------------------- */
    function saveLeadLocal(data, ticketCode, synced) {
        try {
            var list = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
            list.push(Object.assign({}, data, {
                ticket_code: ticketCode || null,
                synced: !!synced,
                time: new Date().toISOString()
            }));
            localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
        } catch (e) {
            console.warn('[AbrahamSpinGate] Không lưu được bản sao cục bộ:', e);
        }
    }

    /* --------------------------------------------------------
       Danh sách cửa hàng (gợi ý cho ô "Cửa hàng đã mua")

       Lấy từ /api/dealers (bảng abraham_dealers, đọc qua service
       role key trên Vercel). Ô input vẫn cho gõ tự do (list=
       datalist, không phải <select>), nên nếu API lỗi/mất mạng,
       khách vẫn điền form bình thường - chỉ là không có gợi ý.

       Luôn có mục "Không nhớ / Khác" ở cuối, kể cả khi API lỗi.
    --------------------------------------------------------- */
    function populateStoreDatalist(names) {
        if (!modalEl) return;
        var datalist = modalEl.querySelector('#sg-store-list');
        if (!datalist) return;

        datalist.innerHTML = '';

        names.forEach(function (name) {
            if (!name || name === STORE_FALLBACK_OPTION) return;
            var opt = document.createElement('option');
            opt.value = name;
            datalist.appendChild(opt);
        });

        var fallback = document.createElement('option');
        fallback.value = STORE_FALLBACK_OPTION;
        datalist.appendChild(fallback);
    }

    async function loadStoreOptions() {
        if (storeOptionsLoaded || storeOptionsLoading) return;
        storeOptionsLoading = true;

        try {
            var data = await fetchJson('/api/dealers', {
                method: 'GET',
                credentials: 'same-origin',
                cache: 'no-store'
            });

            var names = (data && data.dealers) || [];
            populateStoreDatalist(names);
            storeOptionsLoaded = true;

        } catch (err) {
            console.warn('[AbrahamSpinGate] Không tải được danh sách cửa hàng:', err);
            // Vẫn đảm bảo có "Không nhớ / Khác" dù API lỗi
            populateStoreDatalist([]);

        } finally {
            storeOptionsLoading = false;
        }
    }

    /* --------------------------------------------------------
       Modal form
    --------------------------------------------------------- */
    function buildModal() {
        if (modalEl) return modalEl;

        injectStyles();

        var overlay = document.createElement('div');
        overlay.id = 'spin-gate-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-labelledby', 'sg-title');

        overlay.innerHTML =
            '<div class="sg-card">' +

                '<button type="button" data-gate-close aria-label="Đóng" class="sg-close">' +
                    '<i class="fa-solid fa-xmark"></i>' +
                '</button>' +

                '<div class="sg-head">' +
                    '<span class="sg-eyebrow">' +
                        '<i class="fa-solid fa-gift"></i> Nhận lượt quay may mắn' +
                    '</span>' +
                    '<h3 class="sg-title" id="sg-title">Điền thông tin để quay thưởng</h3>' +
                    '<p class="sg-sub">Mỗi số điện thoại được 1 lượt quay duy nhất.</p>' +
                '</div>' +

                '<form id="spin-gate-form" novalidate>' +

                    '<div class="sg-field">' +
                        '<label class="sg-label" for="sg-name">Họ và tên</label>' +
                        '<input class="sg-input" id="sg-name" name="name" type="text" ' +
                            'required autocomplete="name" placeholder="Nguyễn Văn A">' +
                    '</div>' +

                    '<div class="sg-field">' +
                        '<label class="sg-label" for="sg-phone">Số điện thoại</label>' +
                        '<input class="sg-input" id="sg-phone" name="phone" type="tel" required ' +
                            'autocomplete="tel" inputmode="numeric" pattern="0[0-9]{9}" ' +
                            'placeholder="0901234567">' +
                        '<p class="sg-error" data-gate-error="phone">' +
                            'Số điện thoại cần 10 chữ số và bắt đầu bằng 0.' +
                        '</p>' +
                    '</div>' +

                    /* Khối xác minh Zalo: chỉ render khi bật cờ.
                       Zalo chưa duyệt app -> ZALO_VERIFY_ENABLED = false
                       -> khối này biến mất khỏi form. */
                    (!ZALO_VERIFY_ENABLED ? '' :
                    '<div class="sg-field">' +
                        '<button type="button" id="sg-zalo-verify" class="sg-submit" ' +
                            'style="margin-top:0;background:#0068FF;">' +
                            '<i class="fa-solid fa-shield-halved"></i> ' +
                            '<span>Xác minh bằng Zalo</span>' +
                        '</button>' +
                        '<p class="sg-hint">Zalo sẽ hỏi quyền chia sẻ số điện thoại. Không cần SMS OTP.</p>' +
                        '<p class="sg-error" data-gate-error="zalo"></p>' +
                        '<p id="sg-zalo-pending" class="sg-verify-status sg-pending">' +
                            '<i class="fa-solid fa-spinner fa-spin"></i> Đang chờ xác minh trên Zalo...' +
                        '</p>' +
                        '<p id="sg-zalo-success" class="sg-verify-status sg-success">' +
                            '<i class="fa-solid fa-circle-check"></i> Số điện thoại đã được Zalo xác minh' +
                        '</p>' +
                    '</div>') +

                    '<div class="sg-field">' +
                        '<label class="sg-label" for="sg-address">Địa chỉ nhận thưởng</label>' +
                        '<input class="sg-input" id="sg-address" name="address" type="text" required ' +
                            'placeholder="Số nhà, đường, phường/xã, quận/huyện, tỉnh/thành">' +
                    '</div>' +

                    '<div class="sg-field">' +
                        '<label class="sg-label" for="sg-store">Cửa hàng đã mua</label>' +
                        '<input class="sg-input" id="sg-store" name="store" type="text" required ' +
                            'list="sg-store-list" autocomplete="off" ' +
                            'placeholder="VD: Đại lý Abraham Bike Quận 7, Siêu thị Aeon...">' +
                        '<datalist id="sg-store-list"></datalist>' +
                        '<p class="sg-hint">Không nhớ chính xác? Chọn "Không nhớ / Khác" trong gợi ý.</p>' +
                    '</div>' +

                    '<div class="sg-field">' +
                        '<label class="sg-label" for="sg-product">Sản phẩm đã mua</label>' +
                        '<input class="sg-input" id="sg-product" name="product" type="text" required ' +
                            'placeholder="VD: Abraham GT100 Pro">' +
                    '</div>' +

                    '<p class="sg-error sg-error--general" data-gate-error="general"></p>' +

                    '<button type="submit" class="sg-submit" data-gate-submit>' +
                        '<i class="fa-solid fa-dice"></i> ' +
                        '<span data-gate-submit-text>Xác nhận &amp; nhận lượt quay</span>' +
                    '</button>' +

                '</form>' +
            '</div>';

        document.body.appendChild(overlay);
        modalEl = overlay;

        overlay.addEventListener('click', function (e) {
            if (e.target === overlay && !submitting) closeForm();
        });

        overlay.querySelector('[data-gate-close]').addEventListener('click', function () {
            if (!submitting) closeForm();
        });

        // Nút Zalo chỉ tồn tại khi ZALO_VERIFY_ENABLED = true
        var zaloBtn = overlay.querySelector('#sg-zalo-verify');
        if (zaloBtn) {
            zaloBtn.addEventListener('click', function () {
                startZaloVerification();
            });
        }

        overlay.querySelector('#sg-phone').addEventListener('input', function () {
            var currentPhone = this.value.trim();

            if (verificationState.phone && currentPhone !== verificationState.phone) {
                clearVerificationState();
                syncVerificationUI();
            }
        });

        overlay.querySelector('#spin-gate-form').addEventListener('submit', function (e) {
            e.preventDefault();
            handleSubmit(this);
        });

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && !submitting &&
                modalEl && modalEl.classList.contains('sg-open')) {
                closeForm();
            }
        });

        return overlay;
    }

    /* --------------------------------------------------------
       Popup thông báo giữa màn hình
    --------------------------------------------------------- */
    function buildNotice() {
        if (noticeEl) return noticeEl;

        injectStyles();

        var el = document.createElement('div');
        el.id = 'spin-gate-notice';
        el.setAttribute('role', 'dialog');
        el.setAttribute('aria-modal', 'true');

        el.innerHTML =
            '<div class="sg-notice-card">' +
                '<button type="button" data-notice-close aria-label="Đóng" class="sg-close">' +
                    '<i class="fa-solid fa-xmark"></i>' +
                '</button>' +
                '<div class="sg-notice-icon"><i class="fa-solid fa-circle-check"></i></div>' +
                '<h3 class="sg-notice-title" data-notice-title></h3>' +
                '<p class="sg-notice-text" data-notice-text></p>' +
                '<div class="sg-notice-prize" data-notice-prize style="display:none"></div>' +
                '<button type="button" class="sg-notice-btn" data-notice-ok>Đã hiểu</button>' +
            '</div>';

        document.body.appendChild(el);
        noticeEl = el;

        el.addEventListener('click', function (e) {
            if (e.target === el) closeNotice();
        });
        el.querySelector('[data-notice-close]').addEventListener('click', closeNotice);
        el.querySelector('[data-notice-ok]').addEventListener('click', closeNotice);

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && noticeEl &&
                noticeEl.classList.contains('sg-open')) {
                closeNotice();
            }
        });

        return el;
    }

    /*
       showNotice({
           icon:      'fa-gift',              // tên icon Font Awesome
           title:     'Chúc mừng bạn!',
           text:      'Câu mô tả...',
           prize:     'Giải Nhì — Nón bảo hiểm',  // bỏ qua nếu không có
           button:    'Đã hiểu',
           celebrate: true,                   // bắn pháo giấy
           power:     1.6                     // độ mạnh, mặc định 1
       })
    */
    function showNotice(opts) {
        opts = opts || {};
        buildNotice();

        noticeEl.querySelector('[data-notice-title]').textContent = opts.title || 'Thông báo';
        noticeEl.querySelector('[data-notice-text]').textContent  = opts.text || '';

        var prizeBox = noticeEl.querySelector('[data-notice-prize]');
        if (opts.prize) {
            prizeBox.textContent = opts.prize;
            prizeBox.style.display = '';
        } else {
            prizeBox.style.display = 'none';
        }

        var iconBox = noticeEl.querySelector('.sg-notice-icon');
        var icon = iconBox.querySelector('i');
        if (icon) icon.className = 'fa-solid ' + (opts.icon || 'fa-circle-check');

        iconBox.classList.toggle('sg-bounce', !!opts.celebrate);

        noticeEl.querySelector('[data-notice-ok]').textContent = opts.button || 'Đã hiểu';

        // chạy lại animation vào của thẻ
        var card = noticeEl.querySelector('.sg-notice-card');
        card.style.animation = 'none';
        void card.offsetWidth;
        card.style.animation = '';

        lockScroll();
        noticeEl.classList.add('sg-open');

        if (opts.celebrate) {
            window.setTimeout(function () {
                celebrate(opts.power || 1);
            }, 120);
        }
    }

    function closeNotice() {
        if (!noticeEl) return;
        noticeEl.classList.remove('sg-open');
        unlockScroll();
    }

    /* --------------------------------------------------------
       Tiện ích form
    --------------------------------------------------------- */
    function showFieldError(key, show, message) {
        var el = modalEl.querySelector('[data-gate-error="' + key + '"]');
        if (!el) return;
        if (message) el.textContent = message;
        el.classList.toggle('sg-show', !!show);
    }

    function setSubmitting(on) {
        submitting = on;
        var btn = modalEl.querySelector('[data-gate-submit]');
        var txt = modalEl.querySelector('[data-gate-submit-text]');
        if (btn) btn.disabled = on;
        if (txt) txt.textContent = on ? 'Đang gửi...' : 'Xác nhận & nhận lượt quay';
    }
    function getFormSnapshot() {
        if (!modalEl) return {};

        var form = modalEl.querySelector('#spin-gate-form');
        if (!form) return {};

        return {
            name: form.name ? form.name.value.trim() : '',
            phone: form.phone ? form.phone.value.trim() : '',
            address: form.address ? form.address.value.trim() : '',
            store: form.store ? form.store.value : '',
            product: form.product ? form.product.value.trim() : ''
        };
    }

    function applyFormSnapshot(data) {
        if (!modalEl || !data) return;
        var form = modalEl.querySelector('#spin-gate-form');
        if (!form) return;

        if (form.name && data.name) form.name.value = data.name;
        if (form.phone && data.phone) form.phone.value = data.phone;
        if (form.address && data.address) form.address.value = data.address;
        if (form.store && data.store) form.store.value = data.store;
        if (form.product && data.product) form.product.value = data.product;
    }

    function syncVerificationUI() {
        if (!modalEl) return;

        var button = modalEl.querySelector('#sg-zalo-verify');
        var buttonText = button && button.querySelector('span');
        var pending = modalEl.querySelector('#sg-zalo-pending');
        var success = modalEl.querySelector('#sg-zalo-success');
        var phoneInput = modalEl.querySelector('#sg-phone');

        if (pending) pending.classList.remove('sg-show');
        if (success) success.classList.remove('sg-show');
        showFieldError('zalo', false);

        if (verificationState.verified) {
            if (success) success.classList.add('sg-show');
            if (phoneInput) {
                if (verificationState.phone) phoneInput.value = verificationState.phone;
                phoneInput.readOnly = true;
            }
            if (button) button.disabled = true;
            if (buttonText) buttonText.textContent = 'Đã xác minh bằng Zalo';
            return;
        }

        if (phoneInput) phoneInput.readOnly = false;

        if (verificationState.status === 'pending') {
            if (pending) pending.classList.add('sg-show');
            if (buttonText) buttonText.textContent = 'Mở lại Zalo để xác minh';
        } else {
            if (buttonText) buttonText.textContent = 'Xác minh bằng Zalo';
        }

        if (button) button.disabled = false;
    }

    async function checkZaloVerification(id, opts) {
        opts = opts || {};
        if (!id) return null;

        try {
            var data = await fetchJson('/api/zalo-verify-status?id=' + encodeURIComponent(id), {
                method: 'GET',
                credentials: 'same-origin',
                cache: 'no-store'
            });

            verificationState.id = id;
            verificationState.status = data.status || 'pending';
            verificationState.verified = !!data.verified;
            verificationState.phone = data.phone || data.expectedPhone || verificationState.phone;
            verificationState.formData = data.formData || verificationState.formData;

            if (verificationState.status === 'expired' || verificationState.status === 'cancelled' || verificationState.status === 'used') {
                clearVerificationState();
            } else {
                storeVerificationId(id);
            }

            if (modalEl) {
                applyFormSnapshot(verificationState.formData);
                syncVerificationUI();
            }

            if (verificationState.verified && opts.notify && window.AbrahamSpinGate) {
                window.AbrahamSpinGate.showNotice({
                    icon: 'fa-shield-halved',
                    title: 'Xác minh Zalo thành công',
                    text: 'Số điện thoại đã được xác minh. Bấm “Quay ngay” để tiếp tục nhận lượt quay.',
                    button: 'Tiếp tục'
                });
            }

            return data;
        } catch (err) {
            console.warn('[AbrahamSpinGate] Kiểm tra xác minh Zalo:', err);
            if (modalEl && opts.showError) {
                showFieldError('zalo', true, err.message || 'Không kiểm tra được trạng thái Zalo.');
            }
            return null;
        }
    }

    async function startZaloVerification() {
        var phoneInput = modalEl.querySelector('#sg-phone');
        var phone = phoneInput ? phoneInput.value.trim() : '';

        if (!/^0[0-9]{9}$/.test(phone)) {
            showFieldError('phone', true, 'Số điện thoại cần 10 chữ số và bắt đầu bằng 0.');
            return;
        }

        showFieldError('phone', false);
        showFieldError('zalo', false);

        var btn = modalEl.querySelector('#sg-zalo-verify');
        var btnText = btn && btn.querySelector('span');
        if (btn) btn.disabled = true;
        if (btnText) btnText.textContent = 'Đang tạo phiên xác minh...';

        try {
            var formData = getFormSnapshot();
            var data = await fetchJson('/api/zalo-verify-start', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phone: phone,
                    formData: formData
                })
            });

            verificationState.id = data.verificationId;
            verificationState.verified = false;
            verificationState.phone = phone;
            verificationState.formData = formData;
            verificationState.status = 'pending';
            storeVerificationId(data.verificationId);
            syncVerificationUI();

            if (!data.zaloUrl) {
                throw new Error('Server chưa cấu hình ZALO_MINI_APP_ID.');
            }

            window.location.assign(data.zaloUrl);
        } catch (err) {
            console.error('[AbrahamSpinGate] Mở Zalo verify:', err);
            showFieldError('zalo', true, err.message || 'Không mở được Zalo để xác minh.');
            if (btn) btn.disabled = false;
            if (btnText) btnText.textContent = 'Xác minh bằng Zalo';
        }
    }

    /* --------------------------------------------------------
       Submit: gửi lead đã xác minh lên server, nhận ticket_code
    --------------------------------------------------------- */
    function handleSubmit(form) {

        if (submitting) return;

        var data = {
            name: form.name.value.trim(),
            phone: form.phone.value.trim(),
            address: form.address.value.trim(),
            store: form.store.value,
            product: form.product.value.trim()
        };

        var phoneValid = /^0[0-9]{9}$/.test(data.phone);
        showFieldError('phone', !phoneValid,
            'Số điện thoại cần 10 chữ số và bắt đầu bằng 0.');

        var allFilled = data.name && phoneValid && data.address &&
                        data.store && data.product;

        if (!allFilled) {
            showFieldError('general', true,
                'Còn mục chưa điền hoặc chưa đúng. Kiểm tra lại giúp mình nhé.');
            return;
        }

        // Chỉ bắt buộc xác minh Zalo khi cờ đang bật
        if (ZALO_VERIFY_ENABLED &&
            (!verificationState.verified || verificationState.phone !== data.phone ||
             !verificationState.id)) {
            showFieldError(
                'general',
                true,
                'Vui lòng xác minh số điện thoại bằng Zalo trước khi nhận lượt quay.'
            );
            return;
        }

        showFieldError('general', false);

        setSubmitting(true);

        fetchJson('/api/submit-verified-lead', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                verificationId: ZALO_VERIFY_ENABLED ? verificationState.id : null,
                name: data.name,
                phone: data.phone,
                address: data.address,
                store: data.store,
                product: data.product
            })
        }).then(function (result) {

            var code = result && result.ticket_code;
            if (!code) throw new Error('Không nhận được mã lượt quay. Thử lại giúp mình nhé.');

            setSubmitting(false);
            saveLeadLocal(data, code, true);
            grantAndClose(form, data, code);

        }).catch(function (err) {

            setSubmitting(false);

            // Số này đã tham gia rồi: đóng form, bật popup thông báo
            if (err.code === 'limit_reached') {
                markCompleted({ phone: data.phone, name: data.name });
                pendingCallback = null;
                modalEl.classList.remove('sg-open');
                showNotice({
                    icon: 'fa-circle-check',
                    title: 'Số điện thoại đã tham gia',
                    text: 'Mỗi số điện thoại chỉ được 1 lượt quay duy nhất. ' +
                          'Abraham Bike sẽ liên hệ để giao phần quà cho bạn.',
                    button: 'Đã hiểu'
                });
                return;
            }

            saveLeadLocal(data, null, false);

            var msg = err.message || 'Không gửi được thông tin. Kiểm tra kết nối mạng nhé.';
            if (err.code === 'invalid_phone') {
                msg = 'Số điện thoại chưa đúng định dạng.';
            }

            showFieldError('general', true, msg);
        });
    }

    function grantAndClose(form, data, code) {
        state.ticketCode = code;
        state.lead = data;

        closeForm();
        form.reset();
        clearVerificationState();
        syncVerificationUI();

        var cb = pendingCallback;
        pendingCallback = null;

        if (typeof cb === 'function') cb(data, code);
    }

    /* --------------------------------------------------------
       API công khai
    --------------------------------------------------------- */

    function openForm(onGranted) {
        buildModal();
        pendingCallback = onGranted;

        showFieldError('general', false);
        showFieldError('phone', false);
        syncVerificationUI();
        loadStoreOptions();

        if (ZALO_VERIFY_ENABLED) {
            var activeVerificationId = getUrlVerificationId() || getStoredVerificationId();
            if (activeVerificationId) {
                checkZaloVerification(activeVerificationId, { showError: false });
            }
        }

        lockScroll();
        modalEl.classList.add('sg-open');

        window.setTimeout(function () {
            var first = modalEl.querySelector('#sg-name');
            if (first) {
                try { first.focus({ preventScroll: true }); }
                catch (e) { first.focus(); }
            }
        }, 50);
    }

    function closeForm() {
        if (!modalEl) return;
        modalEl.classList.remove('sg-open');
        // Chỉ mở khoá cuộn nếu popup thông báo không đang mở
        if (!noticeEl || !noticeEl.classList.contains('sg-open')) {
            unlockScroll();
        }
    }

    // Chế độ demo: đã điền form nhưng không có Supabase
    function isDemoGranted() {
        return state.lead !== null && state.ticketCode === null;
    }

    function hasSpinAvailable() {
        return state.ticketCode !== null || isDemoGranted();
    }

    function getTicketCode() {
        return state.ticketCode;
    }

    function getLead() {
        return state.lead;
    }

    function consumeSpin() {
        state.ticketCode = null;
        state.lead = null;
    }

    // Dọn tàn dư khoá cuộn nếu lần trước bị kẹt
    document.body.style.overflow = '';

    window.AbrahamSpinGate = {
        openForm: openForm,
        closeForm: closeForm,
        showNotice: showNotice,
        closeNotice: closeNotice,
        celebrate: celebrate,
        hasSpinAvailable: hasSpinAvailable,
        getTicketCode: getTicketCode,
        getLead: getLead,
        consumeSpin: consumeSpin,
        consumeTicket: consumeSpin,   // tên cũ, giữ để tương thích
        markCompleted: markCompleted,
        hasCompleted: hasCompleted,
        getCompleted: getCompleted,
        isPhoneVerified: function () { return verificationState.verified; },
        getVerifiedPhone: function () { return verificationState.phone; },
        getZaloVerificationId: function () { return verificationState.id; },
        refreshZaloVerification: function () {
            var id = getUrlVerificationId() || getStoredVerificationId();
            return checkZaloVerification(id, { showError: true });
        },
        reset: reset
    };

    /* --------------------------------------------------------
       Khôi phục trạng thái khi quay lại từ Zalo Mini App.
       Không tin query string; luôn hỏi API server-side.
    --------------------------------------------------------- */
    (function bootstrapZaloVerification() {
        if (!ZALO_VERIFY_ENABLED) return;

        var fromUrl = getUrlVerificationId();
        var id = fromUrl || getStoredVerificationId();
        if (!id) return;

        storeVerificationId(id);

        window.setTimeout(function () {
            checkZaloVerification(id, { notify: !!fromUrl });
        }, 120);

        window.addEventListener('pageshow', function () {
            var active = getUrlVerificationId() || getStoredVerificationId();
            if (active && !verificationState.verified) {
                checkZaloVerification(active, { showError: false });
            }
        });

        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState !== 'visible') return;
            var active = getUrlVerificationId() || getStoredVerificationId();
            if (active && !verificationState.verified) {
                checkZaloVerification(active, { showError: false });
            }
        });
    })();

})();