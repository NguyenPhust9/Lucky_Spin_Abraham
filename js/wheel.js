/* ============================================================
   ABRAHAM BIKE - VÒNG QUAY MAY MẮN
   File: js/wheel.js

   - Danh sách ô đọc từ Supabase (abraham_wheel_segments)
   - Giải thưởng do SERVER quyết định (abraham_spin).
     Không còn Math.random() ở client.
   - Trúng thưởng: popup chúc mừng + pháo giấy, mức độ mạnh
     tuỳ theo tầng giải.
   - Bấm lại sau khi đã quay: popup "Bạn đã tham gia rồi".
   - Màu chữ tự tính theo độ sáng nền, cỡ chữ tự co theo nhãn
   - Chữ counter-rotate nên luôn đứng đúng chiều

   Thứ tự nạp bắt buộc:
     supabase-config.js  ->  spin-gate.js  ->  wheel.js
============================================================ */
(function () {

    /* Dùng khi chưa cấu hình Supabase hoặc gọi API thất bại */
    var FALLBACK_SEGMENTS = [
        { id: 'dacbiet',     tier: 'Đặc biệt',     label: 'Máy tính bảng',     color: '#FBBF24', short_l1: 'ĐẶC BIỆT',     short_l2: 'MÁY TÍNH BẢNG', icon: '♛' },
        { id: 'giai1',       tier: 'Giải Nhất',    label: 'Xe đạp 24/26 inch', color: '#F43F5E', short_l1: 'GIẢI NHẤT',    short_l2: 'XE ĐẠP',        icon: '★' },
        { id: 'giai2',       tier: 'Giải Nhì',     label: 'Nón bảo hiểm',      color: '#2563EB', short_l1: 'GIẢI NHÌ',     short_l2: 'NÓN BẢO HIỂM',  icon: '◆' },
        { id: 'giai3',       tier: 'Giải Ba',      label: 'Bơm A2 + khoá dây', color: '#60A5FA', short_l1: 'GIẢI BA',      short_l2: 'BƠM + KHOÁ',    icon: '✦' },
        { id: 'giai4',       tier: 'Giải Tư',      label: 'Đèn hậu + chuông',  color: '#34D399', short_l1: 'GIẢI TƯ',      short_l2: 'ĐÈN + CHUÔNG',  icon: '➜' },
        { id: 'khuyenkhich', tier: 'Khuyến khích', label: 'Bình nước + đèn',   color: '#FB7185', short_l1: 'KHUYẾN KHÍCH', short_l2: 'BÌNH NƯỚC',     icon: '●' }
    ];

    /* Giải càng lớn, pháo giấy càng nhiều */
    var CELEBRATION = {
        dacbiet:     { power: 2.2, icon: 'fa-crown',  title: 'Không thể tin nổi!' },
        giai1:       { power: 1.9, icon: 'fa-trophy', title: 'Chúc mừng đại thắng!' },
        giai2:       { power: 1.3, icon: 'fa-gift',   title: 'Chúc mừng bạn!' },
        giai3:       { power: 1.1, icon: 'fa-gift',   title: 'Chúc mừng bạn!' },
        giai4:       { power: 1.0, icon: 'fa-gift',   title: 'Chúc mừng bạn!' },
        khuyenkhich: { power: 1.0, icon: 'fa-gift',   title: 'Chúc mừng bạn!' }
    };

    var SIZE = 400;
    var C = 200;          // tâm
    var R = 176;          // bán kính ô quạt
    var R_LABEL = 112;    // bán kính đặt nhãn
    var SVG_NS = 'http://www.w3.org/2000/svg';
    var SPIN_MS = 5000;   // khớp transition của .wheel-rotor trong CSS

    /* --------------------------------------------------------
       Tiện ích
    --------------------------------------------------------- */
    function polar(radius, deg) {
        var rad = deg * Math.PI / 180;
        return [C + radius * Math.cos(rad), C + radius * Math.sin(rad)];
    }

    function createSvgElement(name, attrs, text) {
        var node = document.createElementNS(SVG_NS, name);
        Object.keys(attrs || {}).forEach(function (key) {
            node.setAttribute(key, attrs[key]);
        });
        if (text !== undefined) node.textContent = text;
        return node;
    }

    /* Nền sáng -> chữ xanh đậm, nền tối -> chữ trắng */
    function pickTextColor(hex) {
        var h = String(hex || '').replace('#', '');
        if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
        if (h.length !== 6) return '#FFFFFF';

        function channel(pair) {
            var c = parseInt(pair, 16) / 255;
            return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        }

        var lum = 0.2126 * channel(h.substr(0, 2)) +
                  0.7152 * channel(h.substr(2, 2)) +
                  0.0722 * channel(h.substr(4, 2));

        return lum > 0.5 ? '#1D4ED8' : '#FFFFFF';
    }

    /* Cỡ chữ tự co để nhãn dài không tràn khỏi ô quạt */
    function fitFont(text, stepDeg, maxSize) {
        var chord = 2 * R_LABEL * Math.sin(stepDeg * Math.PI / 360) * 0.88;
        var len = String(text || '').length || 1;
        return Math.max(8, Math.min(maxSize || 15, Math.floor(chord / (len * 0.62))));
    }

    /* --------------------------------------------------------
       Lấy danh sách ô từ Supabase
    --------------------------------------------------------- */
    function loadSegments() {

        if (!window.AbrahamAPI || !window.AbrahamAPI.isConfigured()) {
            console.warn('[AbrahamWheel] Chưa cấu hình Supabase — dùng danh sách dự phòng.');
            return Promise.resolve(FALLBACK_SEGMENTS);
        }

        return window.AbrahamAPI.rpc('abraham_wheel_segments', {})
            .then(function (rows) {
                return (rows && rows.length) ? rows : FALLBACK_SEGMENTS;
            })
            .catch(function (err) {
                console.warn('[AbrahamWheel] Không tải được danh sách quà:', err.message);
                return FALLBACK_SEGMENTS;
            });
    }

    /* --------------------------------------------------------
       Dựng bánh xe
    --------------------------------------------------------- */
    function buildWheel(host, segments) {

        var wheelId = host.getAttribute('data-wheel-id') || 'wheel';
        var STEP = 360 / segments.length;

        host.innerHTML = '';

        var frame = document.createElement('div');
        frame.className = 'relative w-full aspect-square select-none wheel-shell';

        var svg = createSvgElement('svg', {
            viewBox: '0 0 ' + SIZE + ' ' + SIZE,
            class: 'w-full h-full',
            role: 'img',
            'aria-label': 'Vòng quay may mắn Abraham Bike'
        });

        /* Vành ngoài */
        svg.appendChild(createSvgElement('circle', { cx: C, cy: C, r: 198, fill: '#93C5FD' }));
        svg.appendChild(createSvgElement('circle', { cx: C, cy: C, r: 192, fill: '#FB7185' }));
        svg.appendChild(createSvgElement('circle', { cx: C, cy: C, r: 183, fill: '#FFFFFF' }));

        var rotor = createSvgElement('g', { class: 'wheel-rotor' });
        var labelCounters = [];

        segments.forEach(function (segment, index) {

            var middleAngle = -90 + index * STEP;
            var start = polar(R, middleAngle - STEP / 2);
            var end = polar(R, middleAngle + STEP / 2);
            var largeArc = STEP > 180 ? 1 : 0;
            var textColor = pickTextColor(segment.color);

            rotor.appendChild(createSvgElement('path', {
                d: 'M ' + C + ' ' + C +
                   ' L ' + start[0].toFixed(2) + ' ' + start[1].toFixed(2) +
                   ' A ' + R + ' ' + R + ' 0 ' + largeArc + ' 1 ' +
                   end[0].toFixed(2) + ' ' + end[1].toFixed(2) + ' Z',
                fill: segment.color || '#2563EB',
                stroke: '#FFFFFF',
                'stroke-width': 3,
                'stroke-linejoin': 'round'
            }));

            var position = polar(R_LABEL, middleAngle);

            var labelPosition = createSvgElement('g', {
                transform: 'translate(' + position[0].toFixed(2) + ' ' +
                           position[1].toFixed(2) + ')'
            });

            var counter = createSvgElement('g', { class: 'wheel-label-counter' });

            var base = {
                'text-anchor': 'middle',
                'font-family': 'Montserrat, Arial, sans-serif',
                'font-weight': 900,
                fill: textColor
            };

            counter.appendChild(createSvgElement('text',
                Object.assign({}, base, { x: 0, y: -28, 'font-size': 18, opacity: 0.9 }),
                segment.icon || '★'));

            counter.appendChild(createSvgElement('text',
                Object.assign({}, base, {
                    x: 0, y: -4,
                    'font-size': fitFont(segment.short_l1, STEP, 15),
                    'letter-spacing': '0.2'
                }),
                segment.short_l1 || ''));

            counter.appendChild(createSvgElement('text',
                Object.assign({}, base, {
                    x: 0, y: 15,
                    'font-size': fitFont(segment.short_l2, STEP, 15),
                    'letter-spacing': '0.2'
                }),
                segment.short_l2 || ''));

            labelPosition.appendChild(counter);
            rotor.appendChild(labelPosition);
            labelCounters.push(counter);
        });

        svg.appendChild(rotor);

        /* Tâm */
        svg.appendChild(createSvgElement('circle', {
            cx: C, cy: C, r: 54, fill: '#2563EB', stroke: '#FFFFFF', 'stroke-width': 6
        }));
        svg.appendChild(createSvgElement('circle', {
            cx: C, cy: C, r: 47, fill: '#F43F5E', stroke: '#FDE68A', 'stroke-width': 3
        }));

        frame.appendChild(svg);

        /* Kim chỉ */
        var pointer = document.createElement('div');
        pointer.className = 'absolute left-1/2 -translate-x-1/2 -top-1 z-30 pointer-events-none';
        pointer.innerHTML =
            '<svg viewBox="0 0 50 70" class="w-9 sm:w-11 drop-shadow-xl" aria-hidden="true">' +
                '<path d="M25 69 L7 27 A19 19 0 1 1 43 27 Z" fill="#F43F5E" ' +
                      'stroke="#FFFFFF" stroke-width="4"/>' +
                '<circle cx="25" cy="23" r="7" fill="#2563EB"/>' +
            '</svg>';
        frame.appendChild(pointer);

        /* Nút quay */
        var button = document.createElement('button');
        button.type = 'button';
        button.className =
            'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 ' +
            'w-[21%] aspect-square rounded-full ' +
            'bg-gradient-to-br from-[#FEF3C7] via-[#93C5FD] to-[#FB7185] ' +
            'border-[5px] border-white text-[#2563EB] font-black uppercase leading-tight ' +
            'text-[10px] sm:text-xs shadow-2xl hover:scale-105 active:scale-95 ' +
            'transition-transform focus:outline-none focus:ring-4 focus:ring-sky-300/40 ' +
            'disabled:cursor-wait';
        button.innerHTML =
            '<span class="block text-[9px] opacity-60">BẤM</span>' +
            '<span class="block text-xs sm:text-sm">QUAY</span>';
        button.setAttribute('aria-label', 'Quay vòng quay may mắn');
        frame.appendChild(button);

        host.appendChild(frame);


        /* =====================================================
           LOGIC QUAY
        ====================================================== */

        var currentRotation = 0;
        var spinning = false;

        var result = document.querySelector('[data-wheel-result="' + wheelId + '"]');

        function setResult(html) {
            if (result) result.innerHTML = html;
        }

        function showLoading(text) {
            setResult(
                '<span class="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 rounded-full">' +
                    '<i class="fa-solid fa-circle-notch fa-spin text-[#2563EB]"></i>' +
                    (text || 'Đang quay...') +
                '</span>'
            );
        }

        function showPrize(tier, label) {
            setResult(
                '<span class="inline-flex items-center gap-2 bg-white border border-sky-200 ' +
                             'shadow-md rounded-full px-5 py-3">' +
                    '<span class="w-7 h-7 rounded-full bg-[#F43F5E] text-white ' +
                                 'flex items-center justify-center">' +
                        '<i class="fa-solid fa-gift text-xs"></i>' +
                    '</span>' +
                    '<span>Chúc mừng! ' + (tier ? tier + ' — ' : '') +
                        '<strong class="text-[#2563EB]">' + label + '</strong>' +
                    '</span>' +
                '</span>'
            );
        }

        function showError(message) {
            setResult(
                '<span class="inline-flex items-center gap-2 bg-rose-50 border border-rose-200 ' +
                             'text-rose-700 rounded-full px-5 py-3">' +
                    '<i class="fa-solid fa-circle-exclamation"></i>' +
                    '<span>' + message + '</span>' +
                '</span>'
            );
        }

        /* Dòng nhắc nhỏ dưới bánh xe */
        function inlineAlreadyPlayed() {
            setResult(
                '<span class="inline-flex items-center gap-2 bg-amber-50 border ' +
                             'border-amber-200 text-amber-800 rounded-full px-5 py-3">' +
                    '<i class="fa-solid fa-circle-check"></i>' +
                    '<span class="font-bold">Bạn đã tham gia chương trình rồi</span>' +
                '</span>'
            );
        }

        /* Popup giữa màn hình */
        function showAlreadyPlayed() {
            var gate = window.AbrahamSpinGate;
            var done = (gate.getCompleted && gate.getCompleted()) || {};

            if (gate.showNotice) {
                gate.showNotice({
                    icon: 'fa-circle-check',
                    title: 'Bạn đã tham gia rồi',
                    text: 'Mỗi số điện thoại chỉ được 1 lượt quay duy nhất. ' +
                          'Abraham Bike sẽ liên hệ để giao phần quà cho bạn.',
                    prize: done.prize
                        ? ((done.tier ? done.tier + ' — ' : '') + done.prize)
                        : null,
                    button: 'Đã hiểu'
                });
            }

            inlineAlreadyPlayed();
        }

        function indexOfPrize(prizeId) {
            for (var i = 0; i < segments.length; i++) {
                if (segments[i].id === prizeId) return i;
            }
            return -1;
        }

        /* Quay tới đúng ô đã biết trước */
        function animateTo(winningIndex, prizeId, tier, prizeLabel) {

            var extraTurns = 6;
            var normalizedCurrent = currentRotation % 360;
            var targetNormalized = -winningIndex * STEP;
            var delta = extraTurns * 360 + targetNormalized - normalizedCurrent;

            if (delta < extraTurns * 360) delta += 360;

            currentRotation += delta;

            rotor.style.transform = 'rotate(' + currentRotation + 'deg)';

            labelCounters.forEach(function (label) {
                label.style.transform = 'rotate(' + (-currentRotation) + 'deg)';
            });

            window.setTimeout(function () {
                spinning = false;
                button.disabled = false;
                showPrize(tier, prizeLabel);

                var gate = window.AbrahamSpinGate;

                // Ghi nhớ: lần bấm sau chỉ hiện popup thông báo
                gate.markCompleted({ tier: tier, prize: prizeLabel });

                var style = CELEBRATION[prizeId] || CELEBRATION.giai4;

                // Pháo giấy nổ ngay khi bánh xe dừng
                if (gate.celebrate) gate.celebrate(style.power);

                // Popup chúc mừng nối tiếp
                window.setTimeout(function () {
                    if (!gate.showNotice) return;
                    gate.showNotice({
                        icon: style.icon,
                        title: style.title,
                        text: 'Abraham Bike sẽ liên hệ theo số điện thoại bạn để lại ' +
                              'để giao phần quà trong 5–7 ngày làm việc.',
                        prize: (tier ? tier + ' — ' : '') + prizeLabel,
                        button: 'Tuyệt vời',
                        celebrate: true,
                        power: style.power
                    });
                }, 550);

            }, SPIN_MS + 100);
        }

        /* Hỏi server lấy giải, rồi mới quay */
        function startSpin() {

            var gate = window.AbrahamSpinGate;
            var code = gate.getTicketCode ? gate.getTicketCode() : null;

            spinning = true;
            button.disabled = true;

            // Chế độ demo: chưa cấu hình Supabase
            if (!code) {
                showLoading('Đang quay...');
                var i = Math.floor(Math.random() * segments.length);
                gate.consumeSpin();
                animateTo(i, segments[i].id, segments[i].tier,
                          segments[i].label + ' (demo)');
                return;
            }

            showLoading('Đang xác nhận lượt quay...');

            window.AbrahamAPI.rpc('abraham_spin', { p_code: code })
                .then(function (rows) {

                    var row = rows && rows[0];
                    if (!row) throw new Error('Không nhận được kết quả. Thử lại giúp mình nhé.');

                    gate.consumeSpin();

                    var idx = indexOfPrize(row.prize_id);
                    if (idx < 0) idx = 0;   // giải đã bị ẩn khỏi bánh xe

                    showLoading('Đang quay...');
                    animateTo(idx, row.prize_id, row.prize_tier, row.prize_label);
                })
                .catch(function (err) {

                    spinning = false;
                    button.disabled = false;

                    if (err.code === 'ticket_used' ||
                        err.code === 'ticket_expired' ||
                        err.code === 'ticket_not_found') {
                        gate.consumeSpin();
                        gate.markCompleted({});
                        showAlreadyPlayed();
                        return;
                    }

                    if (err.code === 'out_of_stock') {
                        if (gate.showNotice) {
                            gate.showNotice({
                                icon: 'fa-box-open',
                                title: 'Đã hết quà tặng',
                                text: 'Chương trình đã trao hết phần quà. ' +
                                      'Cảm ơn bạn đã quan tâm đến Abraham Bike.',
                                button: 'Đã hiểu'
                            });
                        }
                        showError('Chương trình đã hết quà tặng.');
                        return;
                    }

                    showError(err.message || 'Không kết nối được. Thử lại nhé.');
                });
        }

        /* --------------------------------------------------
           Bấm nút
        --------------------------------------------------- */
        button.addEventListener('click', function () {

            if (spinning) return;

            var gate = window.AbrahamSpinGate;

            if (!gate) {
                showError('Thiếu js/spin-gate.js. Kiểm tra thứ tự nạp script.');
                return;
            }

            // Đã tham gia rồi -> popup thông báo, không mở form
            if (gate.hasCompleted()) {
                showAlreadyPlayed();
                return;
            }

            if (gate.hasSpinAvailable()) {
                startSpin();
                return;
            }

            gate.openForm(function () {
                startSpin();
            });
        });

        /* Vào lại trang sau khi đã quay: chỉ hiện dòng nhắc,
           không bật popup ngay khi khách vừa mở trang */
        if (window.AbrahamSpinGate && window.AbrahamSpinGate.hasCompleted()) {
            inlineAlreadyPlayed();
        }
    }

    /* =========================================================
       KHỞI TẠO
    ========================================================== */
    function init() {

        var hosts = document.querySelectorAll('[data-wheel]');
        if (!hosts.length) return;

        loadSegments().then(function (segments) {
            hosts.forEach(function (host) {
                buildWheel(host, segments);
            });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();