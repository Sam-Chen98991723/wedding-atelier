document.addEventListener('DOMContentLoaded', () => {
    const PHONE_PATTERN = /^\d{10}$/;
    let currentRole = 'staff';
    let registrations = [];

    // ---------------------------------------------------------------
    // 導覽切換
    // ---------------------------------------------------------------
    const navButtons = document.querySelectorAll('.console-nav button');
    const sections = document.querySelectorAll('.console-section');
    const pageTitle = document.getElementById('pageTitle');
    const pageSubtitle = document.getElementById('pageSubtitle');
    const SECTION_META = {
        guests: { title: '賓客名單', subtitle: '所有回覆會即時顯示在下方，資料庫欄位皆已加密儲存。' },
        accounts: { title: '系統帳號', subtitle: '管理登入後台的帳號與權限，僅超級管理員可見此頁。' },
        settings: { title: '個人設定', subtitle: '更新您目前登入帳號的密碼。' }
    };

    navButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
            const target = btn.dataset.section;
            navButtons.forEach((b) => b.classList.toggle('is-active', b === btn));
            sections.forEach((sec) => sec.classList.toggle('is-active', sec.id === `section-${target}`));
            const meta = SECTION_META[target];
            if (meta) {
                pageTitle.textContent = meta.title;
                pageSubtitle.textContent = meta.subtitle;
            }
            if (target === 'accounts') loadAccounts();
        });
    });

    // ---------------------------------------------------------------
    // 共用：出席人數 → 兒童座椅／葷素食下拉選項
    // ---------------------------------------------------------------
    function buildOptions(select, maxCount, suffix, currentValue) {
        if (!select) return;
        const safeMax = Math.max(0, maxCount);
        const safeValue = Math.min(Math.max(parseInt(currentValue, 10) || 0, 0), safeMax);
        select.innerHTML = '';
        for (let i = 0; i <= safeMax; i += 1) {
            const opt = document.createElement('option');
            opt.value = String(i);
            opt.textContent = `${i} ${suffix}`;
            if (i === safeValue) opt.selected = true;
            select.appendChild(opt);
        }
    }

    // ---------------------------------------------------------------
    // 統計列
    // ---------------------------------------------------------------
    async function loadStats() {
        try {
            const res = await fetch('/api/admin/page-views');
            if (res.ok) {
                const { count } = await res.json();
                document.getElementById('statViews').textContent = count;
            }
        } catch (err) { /* 忽略單一統計失敗 */ }
    }

    function refreshLocalStats() {
        const attending = registrations.filter((r) => r.attendance === 'Y');
        document.getElementById('statTotal').textContent = registrations.length;
        document.getElementById('statAttending').textContent = attending.length;
        document.getElementById('statGuests').textContent = attending.reduce((sum, r) => sum + (r.numbers || 0), 0);
    }

    // ---------------------------------------------------------------
    // 賓客名單表格（用 DOM API 建構，天生免疫 stored XSS，不需要另外跳脫）
    // ---------------------------------------------------------------
    const guestTableBody = document.getElementById('guestTableBody');

    function cell(text) {
        const td = document.createElement('td');
        td.textContent = text;
        return td;
    }

    function renderGuestTable() {
        guestTableBody.innerHTML = '';
        registrations.forEach((row) => {
            const tr = document.createElement('tr');

            tr.appendChild(cell(`#${row.id}`));
            tr.appendChild(cell(row.name));

            const phoneTd = cell(row.phone || '—');
            phoneTd.classList.add('truncate');
            tr.appendChild(phoneTd);

            const attendTd = document.createElement('td');
            const pill = document.createElement('span');
            pill.className = row.attendance === 'Y' ? 'pill pill-yes' : 'pill pill-no';
            pill.textContent = row.attendance === 'Y' ? '出席' : '不出席';
            attendTd.appendChild(pill);
            tr.appendChild(attendTd);

            tr.appendChild(cell(`${row.numbers ?? 0} 位`));
            tr.appendChild(cell(`${row.childSeats ?? 0} 個`));
            tr.appendChild(cell(`${row.meatCount ?? 0} 位`));
            tr.appendChild(cell(`${row.vegetarianCount ?? 0} 位`));

            const emailTd = cell(row.email || '—');
            emailTd.classList.add('truncate');
            tr.appendChild(emailTd);

            const addressTd = cell(row.inviteAddress || '—');
            addressTd.classList.add('truncate');
            tr.appendChild(addressTd);

            const blessingTd = cell(row.blessing || '—');
            blessingTd.classList.add('truncate');
            tr.appendChild(blessingTd);

            const hotelTd = cell(row.hotelNeeds || '—');
            hotelTd.classList.add('truncate');
            tr.appendChild(hotelTd);

            const actionsTd = document.createElement('td');
            actionsTd.classList.add('admin-only');
            actionsTd.hidden = currentRole !== 'admin';
            const actionsWrap = document.createElement('div');
            actionsWrap.className = 'row-actions';

            const editBtn = document.createElement('button');
            editBtn.type = 'button';
            editBtn.textContent = '編輯';
            editBtn.addEventListener('click', () => openDrawer(row.id));

            const delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.textContent = '刪除';
            delBtn.classList.add('danger');
            delBtn.addEventListener('click', () => deleteGuest(row.id));

            actionsWrap.append(editBtn, delBtn);
            actionsTd.appendChild(actionsWrap);
            tr.appendChild(actionsTd);

            guestTableBody.appendChild(tr);
        });
    }

    async function loadGuests() {
        const res = await fetch('/api/admin/registrations');
        if (!res.ok) { location.href = '/login.html'; return; }
        registrations = await res.json();
        renderGuestTable();
        refreshLocalStats();
    }

    async function deleteGuest(id) {
        if (!confirm('確定要刪除這筆報名資料嗎？此操作無法復原。')) return;
        const res = await fetch(`/api/admin/registration/${id}`, { method: 'DELETE' });
        if (res.ok) loadGuests(); else alert('刪除失敗，權限不足。');
    }

    // ---------------------------------------------------------------
    // 新增／編輯抽屜
    // ---------------------------------------------------------------
    const drawer = document.getElementById('guestDrawer');
    const drawerOverlay = document.getElementById('drawerOverlay');
    const drawerTitle = document.getElementById('drawerTitle');
    const drawerMsg = document.getElementById('drawerMsg');

    const dId = document.getElementById('drawerId');
    const dName = document.getElementById('drawerName');
    const dPhone = document.getElementById('drawerPhone');
    const dAttendance = document.getElementById('drawerAttendance');
    const dDetails = document.getElementById('drawerAttendanceDetails');
    const dNumbers = document.getElementById('drawerNumbers');
    const dChildSeatField = document.getElementById('drawerChildSeatField');
    const dChildSeats = document.getElementById('drawerChildSeats');
    const dMeat = document.getElementById('drawerMeatCount');
    const dVegetarian = document.getElementById('drawerVegetarianCount');
    const dEmail = document.getElementById('drawerEmail');
    const dInviteAddress = document.getElementById('drawerInviteAddress');
    const dHotelNeeds = document.getElementById('drawerHotelNeeds');
    const dHotelDetailField = document.getElementById('drawerHotelDetailField');
    const dHotelDetail = document.getElementById('drawerHotelDetail');
    const dBlessing = document.getElementById('drawerBlessing');

    dPhone.addEventListener('input', () => { dPhone.value = dPhone.value.replace(/\D/g, '').slice(0, 10); });

    function syncDrawerMealFields(changedField) {
        const isAttending = dAttendance.value === 'Y';
        dDetails.style.display = isAttending ? 'block' : 'none';
        if (!isAttending) {
            dNumbers.value = '0';
            dChildSeats.value = '0';
            dMeat.value = '0';
            dVegetarian.value = '0';
            return;
        }

        const count = Math.max(0, parseInt(dNumbers.value, 10) || 0);
        const showChildSeats = count > 1;
        dChildSeatField.style.display = showChildSeats ? 'block' : 'none';
        buildOptions(dChildSeats, Math.max(0, count - 1), '個', dChildSeats.value);
        if (!showChildSeats) dChildSeats.value = '0';

        const currentMeat = parseInt(dMeat.value, 10) || 0;
        const currentVegetarian = parseInt(dVegetarian.value, 10) || 0;
        let meat;
        let vegetarian;
        if (changedField === 'vegetarian') {
            vegetarian = Math.min(currentVegetarian, count);
            meat = Math.max(0, count - vegetarian);
        } else {
            meat = Math.min(currentMeat, count);
            vegetarian = Math.max(0, count - meat);
        }
        buildOptions(dMeat, count, '位', meat);
        buildOptions(dVegetarian, count, '位', vegetarian);
    }

    function syncDrawerHotelDetail() {
        const show = dHotelNeeds.value === '需要協助訂房';
        dHotelDetailField.style.display = show ? 'block' : 'none';
        if (!show) dHotelDetail.value = '';
    }

    dAttendance.addEventListener('change', () => syncDrawerMealFields());
    dNumbers.addEventListener('input', () => syncDrawerMealFields());
    dMeat.addEventListener('change', () => syncDrawerMealFields('meat'));
    dVegetarian.addEventListener('change', () => syncDrawerMealFields('vegetarian'));
    dHotelNeeds.addEventListener('change', syncDrawerHotelDetail);

    function openDrawer(id) {
        drawerMsg.textContent = '';
        if (id) {
            const item = registrations.find((r) => r.id === id);
            if (!item) return;
            drawerTitle.textContent = '編輯賓客資料';
            dId.value = item.id;
            dName.value = item.name;
            dPhone.value = item.phone || '';
            dAttendance.value = item.attendance;
            dNumbers.value = item.numbers ?? 0;
            dEmail.value = item.email || '';
            dInviteAddress.value = item.inviteAddress || '';
            dBlessing.value = item.blessing || '';
            const hotelValue = (item.hotelNeeds || '').includes('需要協助訂房') ? '需要協助訂房' : '不需要';
            dHotelNeeds.value = hotelValue;
            dHotelDetail.value = (item.hotelNeeds || '').includes('｜') ? item.hotelNeeds.split('｜').slice(1).join('｜') : '';

            const count = item.numbers ?? 0;
            buildOptions(dChildSeats, Math.max(0, count - 1), '個', item.childSeats ?? 0);
            buildOptions(dMeat, count, '位', item.meatCount ?? 0);
            buildOptions(dVegetarian, count, '位', item.vegetarianCount ?? 0);
            dDetails.style.display = item.attendance === 'Y' ? 'block' : 'none';
            dChildSeatField.style.display = count > 1 ? 'block' : 'none';
        } else {
            drawerTitle.textContent = '新增賓客資料';
            dId.value = '';
            dName.value = '';
            dPhone.value = '';
            dAttendance.value = 'Y';
            dNumbers.value = '1';
            dEmail.value = '';
            dInviteAddress.value = '';
            dBlessing.value = '';
            dHotelNeeds.value = '不需要';
            dHotelDetail.value = '';
            syncDrawerMealFields();
        }
        syncDrawerHotelDetail();
        drawer.classList.add('is-open');
        drawerOverlay.classList.add('is-open');
        drawer.setAttribute('aria-hidden', 'false');
    }

    function closeDrawer() {
        drawer.classList.remove('is-open');
        drawerOverlay.classList.remove('is-open');
        drawer.setAttribute('aria-hidden', 'true');
    }

    document.getElementById('btnAddGuest').addEventListener('click', () => openDrawer(null));
    document.getElementById('drawerClose').addEventListener('click', closeDrawer);
    document.getElementById('drawerCancel').addEventListener('click', closeDrawer);
    drawerOverlay.addEventListener('click', closeDrawer);

    document.getElementById('drawerSave').addEventListener('click', async () => {
        const id = dId.value;
        const attendance = dAttendance.value;
        const numbers = attendance === 'Y' ? parseInt(dNumbers.value, 10) : 0;
        const payload = {
            name: dName.value.trim(),
            phone: dPhone.value.trim(),
            attendance,
            numbers,
            childSeats: attendance === 'Y' ? parseInt(dChildSeats.value, 10) || 0 : 0,
            meatCount: attendance === 'Y' ? parseInt(dMeat.value, 10) || 0 : 0,
            vegetarianCount: attendance === 'Y' ? parseInt(dVegetarian.value, 10) || 0 : 0,
            email: dEmail.value.trim(),
            inviteAddress: dInviteAddress.value.trim(),
            hotelNeeds: dHotelNeeds.value,
            hotelNeedsDetail: dHotelDetail.value.trim(),
            blessing: dBlessing.value.trim()
        };

        if (!payload.name || !PHONE_PATTERN.test(payload.phone) || (attendance === 'Y' && (!numbers || numbers < 1))) {
            drawerMsg.textContent = '請填寫完整的報名資料（姓名、電話須為10碼數字），且人數至少為 1。';
            drawerMsg.className = 'panel-msg err';
            return;
        }
        if (attendance === 'Y' && payload.meatCount + payload.vegetarianCount !== numbers) {
            drawerMsg.textContent = '葷食與素食總數必須等於參加人數。';
            drawerMsg.className = 'panel-msg err';
            return;
        }

        const isEdit = Boolean(id);
        const res = await fetch(isEdit ? `/api/admin/registration/${id}` : '/api/admin/registration', {
            method: isEdit ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await res.json();

        if (res.ok) {
            drawerMsg.textContent = isEdit ? '修改成功！' : '新增成功！';
            drawerMsg.className = 'panel-msg ok';
            await loadGuests();
            setTimeout(closeDrawer, 500);
        } else {
            drawerMsg.textContent = result.message || '儲存失敗，請稍後再試。';
            drawerMsg.className = 'panel-msg err';
        }
    });

    // ---------------------------------------------------------------
    // 系統帳號
    // ---------------------------------------------------------------
    const accountList = document.getElementById('accountList');

    async function loadAccounts() {
        const res = await fetch('/api/admin/users');
        if (!res.ok) return;
        const users = await res.json();
        accountList.innerHTML = '';

        users.forEach((user) => {
            const row = document.createElement('div');
            row.className = 'account-row';

            const info = document.createElement('div');
            const name = document.createElement('div');
            name.className = 'account-name';
            name.textContent = user.username;
            const role = document.createElement('div');
            role.className = 'account-role';
            role.textContent = user.role;
            info.append(name, role);

            const controls = document.createElement('div');
            controls.className = 'account-controls';

            const roleSelect = document.createElement('select');
            ['staff', 'admin'].forEach((roleOption) => {
                const opt = document.createElement('option');
                opt.value = roleOption;
                opt.textContent = roleOption === 'admin' ? '超級管理員' : '一般人員';
                if (roleOption === user.role) opt.selected = true;
                roleSelect.appendChild(opt);
            });
            roleSelect.addEventListener('change', async () => {
                const newRole = roleSelect.value;
                if (!confirm(`確定要把 ${user.username} 的權限改為「${newRole === 'admin' ? '超級管理員' : '一般人員'}」嗎？`)) {
                    roleSelect.value = user.role;
                    return;
                }
                const res2 = await fetch('/api/admin/update-role', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: user.id, newRole })
                });
                const result = await res2.json();
                alert(result.message);
                loadAccounts();
            });

            const resetBtn = document.createElement('button');
            resetBtn.type = 'button';
            resetBtn.className = 'btn btn-quiet';
            resetBtn.textContent = '重設密碼';
            resetBtn.addEventListener('click', async () => {
                const newPassword = prompt(`請輸入 ${user.username} 的新密碼（至少 6 位）：`);
                if (newPassword === null) return;
                if (newPassword.length < 6) { alert('新密碼長度至少需 6 位數'); return; }
                const res2 = await fetch('/api/admin/reset-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: user.id, newPassword })
                });
                const result = await res2.json();
                alert(result.message);
            });

            controls.append(roleSelect, resetBtn);
            row.append(info, controls);
            accountList.appendChild(row);
        });
    }

    document.getElementById('btnCreateUser').addEventListener('click', async () => {
        const msg = document.getElementById('createUserMsg');
        const newUsername = document.getElementById('newUsername').value.trim();
        const newPassword = document.getElementById('newUserPassword').value;
        const newRole = document.getElementById('newUserRole').value;

        const res = await fetch('/api/admin/create-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newUsername, newPassword, newRole })
        });
        const result = await res.json();
        msg.textContent = result.message;
        msg.className = res.ok ? 'panel-msg ok' : 'panel-msg err';

        if (res.ok) {
            document.getElementById('newUsername').value = '';
            document.getElementById('newUserPassword').value = '';
            loadAccounts();
        }
    });

    // ---------------------------------------------------------------
    // 個人密碼設定
    // ---------------------------------------------------------------
    document.getElementById('btnChangePassword').addEventListener('click', async () => {
        const msg = document.getElementById('changePasswordMsg');
        const oldPassword = document.getElementById('oldPassword').value;
        const newPassword = document.getElementById('newPassword').value;
        if (newPassword.length < 6) {
            msg.textContent = '新密碼長度至少需 6 位';
            msg.className = 'panel-msg err';
            return;
        }
        const res = await fetch('/api/user/change-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ oldPassword, newPassword })
        });
        const result = await res.json();
        msg.textContent = result.message;
        msg.className = res.ok ? 'panel-msg ok' : 'panel-msg err';
        if (res.ok) {
            document.getElementById('oldPassword').value = '';
            document.getElementById('newPassword').value = '';
        }
    });

    // ---------------------------------------------------------------
    // 背景音樂
    // ---------------------------------------------------------------
    const bgAudio = document.getElementById('bgAudio');
    const soundToggle = document.getElementById('soundToggle');
    const soundLabel = document.getElementById('soundLabel');
    window.AudioConsent?.attach({
        audio: bgAudio,
        toggle: soundToggle,
        onStateChange: (isPlaying) => { if (soundLabel) soundLabel.textContent = isPlaying ? 'Sound On' : 'Sound Off'; }
    });

    // ---------------------------------------------------------------
    // 初始化：先確認登入狀態，再判斷是否為 admin
    // ---------------------------------------------------------------
    async function init() {
        const res = await fetch('/api/admin/registrations');
        if (!res.ok) { location.href = '/login.html'; return; }

        const userRes = await fetch('/api/admin/users');
        if (userRes.ok) {
            currentRole = 'admin';
            document.getElementById('navAccounts').hidden = false;
            document.getElementById('btnAddGuest').hidden = false;
            document.querySelectorAll('.admin-only').forEach((el) => { el.hidden = false; });
        }
        document.getElementById('sessionUser').textContent = currentRole === 'admin' ? 'Role · Admin' : 'Role · Staff';

        await loadGuests();
        loadStats();
    }

    init();
});
