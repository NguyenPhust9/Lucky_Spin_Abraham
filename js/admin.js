/* ============================================================
   ABRAHAM BIKE - TRANG QUẢN TRỊ
   File: js/admin.js

   Cần js/supabase-config.js nạp trước (lấy url + publishable key).

   Đăng nhập bằng Supabase Auth. Access token lưu trong
   sessionStorage — đóng tab là mất, an toàn hơn localStorage
   cho trang quản trị.

   Quyền thật nằm ở RLS trong database: user phải có mặt trong
   bảng abraham_admins mới đọc được dữ liệu. Ẩn giao diện chỉ là
   lớp trang trí.
============================================================ */
(function () {

    var SESSION_KEY = 'abraham_admin_session';

    var cfg = window.ABRAHAM_SUPABASE || {};
    var BASE = String(cfg.url || '').replace(/\/+$/, '');
    var KEY  = cfg.anonKey || '';

    var session = null;
    var cache = { prizes: [], winners: [], leads: [], stats: null };

    /* ========================================================
       Tiện ích DOM
    ========================================================= */
    function $(id) { return document.getElementById(id); }

    function esc(v) {
        return String(v == null ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function num(v) {
        return (v == null || v === '') ? '—' : Number(v).toLocaleString('vi-VN');
    }

    function dt(iso) {
        if (!iso) return '—';
        var d = new Date(iso);
        return d.toLocaleString('vi-VN', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    }

    function showAlert(el, message, ok) {
        el.textContent = message;
        el.className = 'alert show ' + (ok ? 'alert-ok' : 'alert-err');
        if (ok) {
            window.setTimeout(function () { el.className = 'alert'; }, 3500);
        }
    }

    function rowMessage(tbody, cols, text, cls) {
        tbody.innerHTML = '<tr><td colspan="' + cols + '" class="' +
                          (cls || 'empty') + '">' + esc(text) + '</td></tr>';
    }

    /* ========================================================
       Phiên đăng nhập
    ========================================================= */
    function saveSession(s) {
        session = s;
        try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch (e) {}
    }

    function loadSession() {
        try {
            var raw = sessionStorage.getItem(SESSION_KEY);
            session = raw ? JSON.parse(raw) : null;
        } catch (e) { session = null; }
        return session;
    }

    function clearSession() {
        session = null;
        try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
    }

    function login(email, password) {
        return fetch(BASE + '/auth/v1/token?grant_type=password', {
            method: 'POST',
            headers: { 'apikey': KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email, password: password })
        }).then(function (res) {
            return res.json().then(function (data) {
                if (!res.ok) {
                    var m = data.error_description || data.msg || data.message || 'Đăng nhập thất bại';
                    throw new Error(m);
                }
                return data;
            });
        });
    }

    function refreshToken() {
        if (!session || !session.refresh_token) return Promise.reject(new Error('no_session'));
        return fetch(BASE + '/auth/v1/token?grant_type=refresh_token', {
            method: 'POST',
            headers: { 'apikey': KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: session.refresh_token })
        }).then(function (res) {
            if (!res.ok) throw new Error('refresh_failed');
            return res.json();
        }).then(function (data) {
            saveSession(data);
            return data;
        });
    }

    function logout() {
        var token = session && session.access_token;
        if (token) {
            fetch(BASE + '/auth/v1/logout', {
                method: 'POST',
                headers: { 'apikey': KEY, 'Authorization': 'Bearer ' + token }
            }).catch(function () {});
        }
        clearSession();
        $('app').style.display = 'none';
        $('login-screen').style.display = 'flex';
        $('lg-pass').value = '';
    }

    /* ========================================================
       Gọi API có xác thực
    ========================================================= */
    function api(path, options, isRetry) {
        options = options || {};

        var headers = Object.assign({
            'apikey': KEY,
            'Authorization': 'Bearer ' + (session ? session.access_token : ''),
            'Content-Type': 'application/json'
        }, options.headers || {});

        return fetch(BASE + path, {
            method: options.method || 'GET',
            headers: headers,
            body: options.body ? JSON.stringify(options.body) : undefined
        }).then(function (res) {

            // Token hết hạn -> làm mới rồi thử lại đúng một lần
            if (res.status === 401 && !isRetry) {
                return refreshToken()
                    .then(function () { return api(path, options, true); })
                    .catch(function () {
                        logout();
                        throw new Error('Phiên đăng nhập đã hết hạn. Đăng nhập lại nhé.');
                    });
            }

            return res.text().then(function (raw) {
                var data = null;
                try { data = raw ? JSON.parse(raw) : null; } catch (e) { data = null; }
                if (!res.ok) {
                    throw new Error((data && (data.message || data.hint)) ||
                                    ('Lỗi ' + res.status));
                }
                return data;
            });
        });
    }

    /* ========================================================
       Tải dữ liệu
    ========================================================= */
    function loadStats() {
        return api('/rest/v1/rpc/abraham_admin_summary', { method: 'POST', body: {} })
            .then(function (data) {
                cache.stats = data;
                renderStats(data);
            });
    }

    // Tab Tổng quan: chỉ giải đang bật
    function loadStock() {
        return api('/rest/v1/abraham_prize_stats?select=*&is_active=eq.true&order=sort_order')
            .then(renderStock);
    }

    // Tab Giải thưởng: lấy hết, giải đang bật xếp lên đầu
    function loadPrizes() {
        return api('/rest/v1/abraham_prizes?select=*&order=is_active.desc,sort_order')
            .then(function (rows) {
                cache.prizes = rows || [];
                renderPrizes();
            });
    }

    function loadWinners() {
        return api('/rest/v1/abraham_winners?select=*&order=spun_at.desc&limit=500')
            .then(function (rows) {
                cache.winners = rows || [];
                renderWinners();
            });
    }

    function loadLeads() {
        return api('/rest/v1/abraham_leads?select=*&order=created_at.desc&limit=500')
            .then(function (rows) {
                cache.leads = rows || [];
                renderLeads();
            });
    }

    function loadAll() {
        rowMessage($('stock-body'), 7, 'Đang tải...', 'loading');
        rowMessage($('prizes-body'), 9, 'Đang tải...', 'loading');
        rowMessage($('winners-body'), 7, 'Đang tải...', 'loading');
        rowMessage($('leads-body'), 6, 'Đang tải...', 'loading');

        return Promise.all([
            loadStats().catch(handleLoadError('stats')),
            loadStock().catch(handleLoadError('stock')),
            loadPrizes().catch(handleLoadError('prizes')),
            loadWinners().catch(handleLoadError('winners')),
            loadLeads().catch(handleLoadError('leads'))
        ]);
    }

    function handleLoadError(what) {
        return function (err) {
            console.error('[Admin] Lỗi tải ' + what + ':', err.message);
            var map = {
                stock:   ['stock-body', 7],
                prizes:  ['prizes-body', 9],
                winners: ['winners-body', 7],
                leads:   ['leads-body', 6]
            };
            if (map[what]) {
                rowMessage($(map[what][0]), map[what][1], 'Không tải được: ' + err.message);
            }
        };
    }

    /* ========================================================
       Hiển thị
    ========================================================= */
    function renderStats(s) {
        if (!s) {
            $('stats').innerHTML =
                '<div class="stat"><div class="k">Không có quyền</div>' +
                '<div class="v">—</div></div>';
            return;
        }

        var items = [
            { k: 'Khách đăng ký', v: s.leads,       c: '' },
            { k: 'Lượt đã quay',  v: s.spins,       c: '' },
            { k: 'Quay hôm nay',  v: s.today_spins, c: '' },
            { k: 'Chưa giao quà', v: s.pending,     c: 'coral' },
            { k: 'Đã giao quà',   v: s.delivered,   c: 'mint' },
            { k: 'Mã chưa dùng',  v: s.unused,      c: '' }
        ];

        $('stats').innerHTML = items.map(function (i) {
            return '<div class="stat ' + i.c + '">' +
                       '<div class="k">' + esc(i.k) + '</div>' +
                       '<div class="v mono">' + num(i.v) + '</div>' +
                   '</div>';
        }).join('');
    }

    function renderStock(rows) {
        var body = $('stock-body');
        if (!rows || !rows.length) {
            rowMessage(body, 7, 'Chưa có giải thưởng nào đang bật.');
            return;
        }

        var weightSum = rows.reduce(function (a, r) {
            return a + (r.fixed_rate == null ? (r.weight || 0) : 0);
        }, 0);
        var fixedSum = rows.reduce(function (a, r) {
            return a + (r.fixed_rate == null ? 0 : Number(r.fixed_rate));
        }, 0);

        body.innerHTML = rows.map(function (r) {
            var rate = r.fixed_rate != null
                ? Number(r.fixed_rate)
                : (weightSum ? (100 - fixedSum) * (r.weight || 0) / weightSum : 0);

            var used = r.used_qty || 0;
            var total = r.total_qty;
            var remain = total == null ? null
                       : (r.remaining != null ? r.remaining : total - used);
            var pct = total ? Math.min(100, Math.round(used * 100 / total)) : 0;

            return '<tr>' +
                '<td><span class="pill pill-tier">' + esc(r.tier || r.id) + '</span></td>' +
                '<td><span class="swatch" style="background:' + esc(r.color || '#ccc') + '"></span>' +
                    esc(r.label) + '</td>' +
                '<td class="num mono">' + rate.toFixed(2) + '%</td>' +
                '<td class="num mono">' + num(used) + '</td>' +
                '<td class="num mono">' + (total == null ? 'Không giới hạn' : num(total)) + '</td>' +
                '<td class="num mono"><strong>' + (remain == null ? '∞' : num(remain)) + '</strong></td>' +
                '<td><div class="bar"><span style="width:' + pct + '%"></span></div></td>' +
            '</tr>';
        }).join('');
    }

    function renderPrizes() {
        var body = $('prizes-body');
        var showAll = $('show-inactive') && $('show-inactive').checked;

        var list = showAll
            ? cache.prizes
            : cache.prizes.filter(function (p) { return p.is_active; });

        if (!list.length) {
            rowMessage(body, 9, 'Chưa có giải thưởng nào đang bật.');
            updateRateSum();
            return;
        }

        body.innerHTML = list.map(function (p) {
            return '<tr data-id="' + esc(p.id) + '"' + (p.is_active ? '' : ' class="is-off"') + '>' +
                '<td class="mono" style="font-size:12px;color:#64748B">' + esc(p.id) + '</td>' +
                '<td><input class="cell-inp wide" data-f="tier" value="' + esc(p.tier || '') + '"></td>' +
                '<td><span class="swatch" style="background:' + esc(p.color || '#ccc') + '"></span>' +
                    '<input class="cell-inp wide" data-f="label" value="' + esc(p.label || '') + '"></td>' +
                '<td class="num"><input class="cell-inp" type="number" step="0.1" min="0" data-f="fixed_rate" value="' +
                    (p.fixed_rate == null ? '' : esc(p.fixed_rate)) + '" placeholder="—"></td>' +
                '<td class="num"><input class="cell-inp" type="number" min="0" data-f="weight" value="' +
                    esc(p.weight == null ? 0 : p.weight) + '"></td>' +
                '<td class="num"><input class="cell-inp" type="number" min="0" data-f="total_qty" value="' +
                    (p.total_qty == null ? '' : esc(p.total_qty)) + '" placeholder="∞"></td>' +
                '<td class="num mono">' + num(p.used_qty || 0) + '</td>' +
                '<td class="num"><input class="cell-inp" type="number" min="0" data-f="weekly_qty" value="' +
                    (p.weekly_qty == null ? '' : esc(p.weekly_qty)) + '" placeholder="∞"></td>' +
                '<td><input type="checkbox" data-f="is_active"' + (p.is_active ? ' checked' : '') + '></td>' +
            '</tr>';
        }).join('');

        updateRateSum();
    }

    function collectPrizeRows() {
        var out = [];
        var rows = $('prizes-body').querySelectorAll('tr[data-id]');

        Array.prototype.forEach.call(rows, function (tr) {
            function val(f) {
                var el = tr.querySelector('[data-f="' + f + '"]');
                if (!el) return null;
                if (el.type === 'checkbox') return el.checked;
                return el.value.trim();
            }
            function numOrNull(f) {
                var v = val(f);
                return v === '' || v == null ? null : Number(v);
            }

            out.push({
                id: tr.getAttribute('data-id'),
                tier: val('tier') || null,
                label: val('label'),
                fixed_rate: numOrNull('fixed_rate'),
                weight: numOrNull('weight') || 0,
                total_qty: numOrNull('total_qty'),
                weekly_qty: numOrNull('weekly_qty'),
                is_active: val('is_active')
            });
        });

        return out;
    }

    function updateRateSum() {
        var rows = collectPrizeRows().filter(function (r) { return r.is_active; });

        if (!rows.length) {
            $('rate-sum').textContent = '';
            return;
        }

        var fixed = rows.filter(function (r) { return r.fixed_rate != null; })
                        .reduce(function (a, r) { return a + r.fixed_rate; }, 0);
        var weightSum = rows.filter(function (r) { return r.fixed_rate == null; })
                            .reduce(function (a, r) { return a + (r.weight || 0); }, 0);

        var parts = rows.map(function (r) {
            var pct = r.fixed_rate != null
                ? r.fixed_rate
                : (weightSum ? (100 - fixed) * (r.weight || 0) / weightSum : 0);
            return (r.tier || r.id) + ' ' + pct.toFixed(1) + '%';
        });

        var warn = fixed > 100
            ? '  ⚠ Tổng tỷ lệ cố định vượt 100%, phần trọng số sẽ không còn chỗ.'
            : '';

        $('rate-sum').textContent = 'Tỷ lệ thực tế: ' + parts.join('  ·  ') + warn;
    }

    function savePrizes() {
        var rows = collectPrizeRows();
        var msg = $('prize-msg');
        var btn = $('btn-save-prizes');

        if (!rows.length) {
            showAlert(msg, 'Không có dòng nào để lưu.', false);
            return;
        }

        var fixed = rows.filter(function (r) { return r.is_active && r.fixed_rate != null; })
                        .reduce(function (a, r) { return a + r.fixed_rate; }, 0);

        if (fixed > 100) {
            showAlert(msg, 'Tổng tỷ lệ cố định là ' + fixed.toFixed(1) +
                           '%, vượt quá 100%. Giảm bớt trước khi lưu.', false);
            return;
        }

        btn.disabled = true;

        var jobs = rows.map(function (r) {
            return api('/rest/v1/abraham_prizes?id=eq.' + encodeURIComponent(r.id), {
                method: 'PATCH',
                headers: { 'Prefer': 'return=minimal' },
                body: {
                    tier: r.tier,
                    label: r.label,
                    fixed_rate: r.fixed_rate,
                    weight: r.weight,
                    total_qty: r.total_qty,
                    weekly_qty: r.weekly_qty,
                    is_active: r.is_active
                }
            });
        });

        Promise.all(jobs).then(function () {
            btn.disabled = false;
            showAlert(msg, 'Đã lưu ' + rows.length + ' giải thưởng.', true);
            loadPrizes();
            loadStock();
        }).catch(function (err) {
            btn.disabled = false;
            showAlert(msg, 'Lưu thất bại: ' + err.message, false);
        });
    }

    function renderWinners() {
        var body = $('winners-body');
        var q = ($('win-search').value || '').toLowerCase().trim();
        var filter = $('win-filter').value;

        var rows = cache.winners.filter(function (r) {
            if (filter === 'pending' && r.delivered) return false;
            if (filter === 'done' && !r.delivered) return false;
            if (!q) return true;
            return [r.fullname, r.phone, r.prize_label, r.tier, r.address]
                .join(' ').toLowerCase().indexOf(q) !== -1;
        });

        if (!rows.length) {
            rowMessage(body, 7, 'Chưa có khách nào trúng thưởng.');
            return;
        }

        body.innerHTML = rows.map(function (r) {
            return '<tr>' +
                '<td class="mono" style="white-space:nowrap">' + esc(dt(r.spun_at)) + '</td>' +
                '<td>' + esc(r.fullname || '—') + '</td>' +
                '<td class="mono">' + esc(r.phone) + '</td>' +
                '<td><span class="pill pill-tier">' + esc(r.tier || '—') + '</span></td>' +
                '<td>' + esc(r.prize_label) + '</td>' +
                '<td style="max-width:260px;font-size:12px;color:#475569">' +
                    esc(r.address || '—') + '</td>' +
                '<td><input type="checkbox" data-spin="' + r.id + '"' +
                    (r.delivered ? ' checked' : '') + '></td>' +
            '</tr>';
        }).join('');
    }

    function toggleDelivered(spinId, checked, checkbox) {
        checkbox.disabled = true;
        api('/rest/v1/abraham_spins?id=eq.' + spinId, {
            method: 'PATCH',
            headers: { 'Prefer': 'return=minimal' },
            body: {
                delivered: checked,
                delivered_at: checked ? new Date().toISOString() : null
            }
        }).then(function () {
            checkbox.disabled = false;
            var row = cache.winners.filter(function (w) {
                return String(w.id) === String(spinId);
            })[0];
            if (row) row.delivered = checked;
            loadStats();
        }).catch(function (err) {
            checkbox.disabled = false;
            checkbox.checked = !checked;
            alert('Không cập nhật được: ' + err.message);
        });
    }

    function renderLeads() {
        var body = $('leads-body');
        var q = ($('lead-search').value || '').toLowerCase().trim();

        var rows = cache.leads.filter(function (r) {
            if (!q) return true;
            return [r.fullname, r.phone, r.store, r.product, r.address]
                .join(' ').toLowerCase().indexOf(q) !== -1;
        });

        if (!rows.length) {
            rowMessage(body, 6, 'Chưa có khách nào đăng ký.');
            return;
        }

        body.innerHTML = rows.map(function (r) {
            return '<tr>' +
                '<td class="mono" style="white-space:nowrap">' + esc(dt(r.created_at)) + '</td>' +
                '<td>' + esc(r.fullname) + '</td>' +
                '<td class="mono">' + esc(r.phone) + '</td>' +
                '<td>' + esc(r.store || '—') + '</td>' +
                '<td>' + esc(r.product || '—') + '</td>' +
                '<td style="max-width:280px;font-size:12px;color:#475569">' +
                    esc(r.address || '—') + '</td>' +
            '</tr>';
        }).join('');
    }

    /* ========================================================
       Xuất CSV
    ========================================================= */
    function toCsv(rows, columns) {
        function cell(v) {
            var s = v == null ? '' : String(v);
            return '"' + s.replace(/"/g, '""') + '"';
        }
        var head = columns.map(function (c) { return cell(c.label); }).join(',');
        var body = rows.map(function (r) {
            return columns.map(function (c) { return cell(r[c.key]); }).join(',');
        }).join('\r\n');
        // BOM để Excel đọc đúng tiếng Việt
        return '\ufeff' + head + '\r\n' + body;
    }

    function download(filename, content) {
        var blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function stamp() {
        var d = new Date();
        return d.getFullYear() + '-' +
               String(d.getMonth() + 1).padStart(2, '0') + '-' +
               String(d.getDate()).padStart(2, '0');
    }

    /* ========================================================
       Khởi động
    ========================================================= */
    function enterApp() {
        $('login-screen').style.display = 'none';
        $('app').style.display = 'block';

        var email = session && session.user && session.user.email;
        $('who').textContent = email || '';

        loadAll();
    }

    function bindEvents() {

        // Đăng nhập
        $('login-form').addEventListener('submit', function (e) {
            e.preventDefault();

            var email = $('lg-email').value.trim();
            var pass = $('lg-pass').value;
            var btn = $('lg-btn');
            var err = $('lg-error');

            if (!email || !pass) {
                showAlert(err, 'Nhập đủ email và mật khẩu nhé.', false);
                return;
            }

            if (!BASE || !KEY || KEY.indexOf('DÁN_') === 0) {
                showAlert(err, 'Chưa cấu hình js/supabase-config.js.', false);
                return;
            }

            btn.disabled = true;
            btn.textContent = 'Đang đăng nhập...';
            err.className = 'alert';

            login(email, pass).then(function (data) {
                saveSession(data);
                // Xác minh quyền admin thật sự
                return api('/rest/v1/rpc/abraham_admin_summary', { method: 'POST', body: {} });
            }).then(function (summary) {
                btn.disabled = false;
                btn.textContent = 'Đăng nhập';

                if (summary === null) {
                    clearSession();
                    showAlert(err, 'Tài khoản này chưa được cấp quyền quản trị.', false);
                    return;
                }
                enterApp();
            }).catch(function (e2) {
                btn.disabled = false;
                btn.textContent = 'Đăng nhập';
                clearSession();
                var m = e2.message || 'Đăng nhập thất bại';
                if (/invalid login/i.test(m)) m = 'Sai email hoặc mật khẩu.';
                showAlert(err, m, false);
            });
        });

        $('btn-logout').addEventListener('click', logout);
        $('btn-refresh').addEventListener('click', loadAll);

        // Tabs
        Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) {
            t.addEventListener('click', function () {
                document.querySelectorAll('.tab').forEach(function (x) {
                    x.classList.remove('active');
                });
                document.querySelectorAll('.panel').forEach(function (x) {
                    x.classList.remove('active');
                });
                t.classList.add('active');
                $('panel-' + t.getAttribute('data-tab')).classList.add('active');
            });
        });

        // Giải thưởng
        $('btn-save-prizes').addEventListener('click', savePrizes);

        $('btn-reload-prizes').addEventListener('click', function () {
            loadPrizes();
            $('prize-msg').className = 'alert';
        });

        $('show-inactive').addEventListener('change', renderPrizes);

        // Tính lại tỷ lệ khi người dùng gõ
        $('prizes-body').addEventListener('input', updateRateSum);
        $('prizes-body').addEventListener('change', updateRateSum);

        // Khách trúng
        $('win-search').addEventListener('input', renderWinners);
        $('win-filter').addEventListener('change', renderWinners);

        $('winners-body').addEventListener('change', function (e) {
            var cb = e.target;
            if (cb && cb.matches('input[data-spin]')) {
                toggleDelivered(cb.getAttribute('data-spin'), cb.checked, cb);
            }
        });

        $('btn-export-winners').addEventListener('click', function () {
            download('abraham-khach-trung-' + stamp() + '.csv', toCsv(cache.winners, [
                { key: 'spun_at',     label: 'Thời gian' },
                { key: 'fullname',    label: 'Họ tên' },
                { key: 'phone',       label: 'Điện thoại' },
                { key: 'tier',        label: 'Tầng giải' },
                { key: 'prize_label', label: 'Phần quà' },
                { key: 'address',     label: 'Địa chỉ nhận' },
                { key: 'store',       label: 'Cửa hàng mua' },
                { key: 'product',     label: 'Sản phẩm đã mua' },
                { key: 'delivered',   label: 'Đã giao' },
                { key: 'delivered_at',label: 'Ngày giao' }
            ]));
        });

        // Leads
        $('lead-search').addEventListener('input', renderLeads);

        $('btn-export-leads').addEventListener('click', function () {
            download('abraham-khach-dang-ky-' + stamp() + '.csv', toCsv(cache.leads, [
                { key: 'created_at', label: 'Thời gian' },
                { key: 'fullname',   label: 'Họ tên' },
                { key: 'phone',      label: 'Điện thoại' },
                { key: 'store',      label: 'Cửa hàng' },
                { key: 'product',    label: 'Sản phẩm' },
                { key: 'address',    label: 'Địa chỉ' },
                { key: 'status',     label: 'Trạng thái' }
            ]));
        });
    }

    /* ---------- chạy ---------- */
    bindEvents();

    if (loadSession() && session.access_token) {
        api('/rest/v1/rpc/abraham_admin_summary', { method: 'POST', body: {} })
            .then(function (summary) {
                if (summary === null) { clearSession(); return; }
                enterApp();
            })
            .catch(function () { clearSession(); });
    }

})();