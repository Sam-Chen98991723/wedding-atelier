document.addEventListener('DOMContentLoaded', () => {
    // --- 捲動進度線 + 導覽列樣式切換 ---
    const nav = document.getElementById('nav');
    const progressRail = document.getElementById('progressRail');

    const updateScrollChrome = () => {
        const scrollTop = window.scrollY;
        nav?.classList.toggle('is-scrolled', scrollTop > 40);
        if (progressRail) {
            const docHeight = document.documentElement.scrollHeight - window.innerHeight;
            const progress = docHeight > 0 ? Math.min(100, (scrollTop / docHeight) * 100) : 0;
            progressRail.style.setProperty('--scroll-progress', `${progress}%`);
        }
    };
    window.addEventListener('scroll', updateScrollChrome, { passive: true });
    updateScrollChrome();

    // --- 淡入 + 描線動畫 ---
    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) entry.target.classList.add('is-visible');
        });
    }, { threshold: 0.15 });
    document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));

    // --- 倒數計時 ---
    const WEDDING_DATE = new Date('2027-01-17T12:30:00+08:00');
    const daysEl = document.getElementById('cd-days');
    if (daysEl) {
        const hoursEl = document.getElementById('cd-hours');
        const minutesEl = document.getElementById('cd-minutes');
        const secondsEl = document.getElementById('cd-seconds');
        const pad = (n) => String(n).padStart(2, '0');

        const tick = () => {
            const diff = WEDDING_DATE.getTime() - Date.now();
            if (diff <= 0) {
                [daysEl, hoursEl, minutesEl, secondsEl].forEach((el) => { el.textContent = '00'; });
                clearInterval(timer);
                return;
            }
            const totalSeconds = Math.floor(diff / 1000);
            daysEl.textContent = pad(Math.floor(totalSeconds / 86400));
            hoursEl.textContent = pad(Math.floor((totalSeconds % 86400) / 3600));
            minutesEl.textContent = pad(Math.floor((totalSeconds % 3600) / 60));
            secondsEl.textContent = pad(totalSeconds % 60);
        };
        tick();
        const timer = setInterval(tick, 1000);
    }

    // --- 電話欄位即時過濾非數字 ---
    const phoneInput = document.querySelector('input[name="phone"]');
    phoneInput?.addEventListener('input', () => {
        phoneInput.value = phoneInput.value.replace(/\D/g, '').slice(0, 10);
    });

    // --- RSVP 表單邏輯 ---
    const attendanceSelect = document.getElementById('attendance');
    const attendanceDetails = document.getElementById('attendanceDetails');
    const numbersInput = document.getElementById('numbers');
    const countDisplay = document.getElementById('countDisplay');
    const countDecrease = document.getElementById('countDecrease');
    const countIncrease = document.getElementById('countIncrease');
    const childSeatField = document.getElementById('childSeatField');
    const childSeatSelect = document.getElementById('childSeats');
    const meatSelect = document.getElementById('meatCount');
    const vegetarianSelect = document.getElementById('vegetarianCount');
    const mealHint = document.getElementById('mealHint');
    const invitationDeliverySelect = document.getElementById('invitationDelivery');
    const invitationEmailField = document.getElementById('invitationEmailField');
    const invitationEmailInput = document.getElementById('invitationEmail');
    const invitationAddressField = document.getElementById('invitationAddressField');
    const invitationAddressInput = document.getElementById('invitationAddress');
    const rsvpForm = document.getElementById('rsvpForm');

    const MIN_COUNT = 1;
    const MAX_COUNT = 10;
    let lastCount = parseInt(numbersInput?.value, 10) || 1;
    // 是否已手動調整過葷素食：尚未調整前，變更人數要預設全部為葷食；
    // 調整過之後，變更人數要保留使用者的選擇，不能被新的預設值蓋掉
    let hasExplicitMealChoice = false;

    const buildOptions = (select, maxCount, suffix, currentValue) => {
        if (!select) return;
        const safeMax = Math.max(0, maxCount);
        const safeValue = Math.min(Math.max(parseInt(currentValue, 10) || 0, 0), safeMax);
        select.innerHTML = Array.from({ length: safeMax + 1 }, (_, i) => `<option value="${i}" ${i === safeValue ? 'selected' : ''}>${i} ${suffix}</option>`).join('');
        select.value = String(safeValue);
    };

    const updateStepperState = () => {
        const current = parseInt(numbersInput?.value, 10) || 0;
        if (countDecrease) countDecrease.disabled = attendanceSelect?.value !== 'Y' || current <= MIN_COUNT;
        if (countIncrease) countIncrease.disabled = attendanceSelect?.value !== 'Y' || current >= MAX_COUNT;
    };

    const updateInvitationDeliveryVisibility = () => {
        if (!invitationDeliverySelect) return;
        const showEmail = invitationDeliverySelect.value === 'email';
        const showAddress = invitationDeliverySelect.value === 'paper';

        if (invitationEmailField) invitationEmailField.style.display = showEmail ? 'block' : 'none';
        if (invitationEmailInput) {
            invitationEmailInput.required = showEmail;
            if (!showEmail) invitationEmailInput.value = '';
        }
        if (invitationAddressField) invitationAddressField.style.display = showAddress ? 'block' : 'none';
        if (invitationAddressInput) {
            invitationAddressInput.required = showAddress;
            if (!showAddress) invitationAddressInput.value = '';
        }
    };

    const syncFormState = (changedMealField) => {
        const isAttending = attendanceSelect?.value === 'Y';

        if (!isAttending) {
            hasExplicitMealChoice = false;
            if (attendanceDetails) attendanceDetails.style.display = 'none';
            if (numbersInput) numbersInput.value = '0';
            if (countDisplay) countDisplay.textContent = '0';
            if (childSeatSelect) childSeatSelect.value = '0';
            if (meatSelect) meatSelect.value = '0';
            if (vegetarianSelect) vegetarianSelect.value = '0';
            if (invitationDeliverySelect) invitationDeliverySelect.value = 'none';
            if (invitationEmailField) invitationEmailField.style.display = 'none';
            if (invitationAddressField) invitationAddressField.style.display = 'none';
            if (mealHint) mealHint.textContent = '';
            updateStepperState();
            return;
        }

        if (attendanceDetails) attendanceDetails.style.display = 'block';
        updateInvitationDeliveryVisibility();

        const currentCount = parseInt(numbersInput?.value, 10);
        const effectiveCount = Number.isFinite(currentCount) && currentCount > 0 ? currentCount : (lastCount || 1);
        lastCount = effectiveCount;
        numbersInput.value = String(effectiveCount);
        if (countDisplay) countDisplay.textContent = String(effectiveCount);
        updateStepperState();

        const shouldShowChildSeats = effectiveCount > 1;
        if (childSeatField) childSeatField.style.display = shouldShowChildSeats ? 'block' : 'none';
        if (!shouldShowChildSeats) {
            if (childSeatSelect) childSeatSelect.value = '0';
        } else {
            buildOptions(childSeatSelect, effectiveCount - 1, '個', childSeatSelect?.value);
        }

        if (changedMealField === 'meat' || changedMealField === 'vegetarian') {
            hasExplicitMealChoice = true;
        }

        const currentMeat = parseInt(meatSelect?.value, 10) || 0;
        const currentVegetarian = parseInt(vegetarianSelect?.value, 10) || 0;
        let adjustedMeat;
        let adjustedVegetarian;
        if (changedMealField === 'vegetarian') {
            adjustedVegetarian = Math.min(currentVegetarian, effectiveCount);
            adjustedMeat = Math.max(0, effectiveCount - adjustedVegetarian);
        } else if (hasExplicitMealChoice) {
            adjustedMeat = Math.min(currentMeat, effectiveCount);
            adjustedVegetarian = Math.max(0, effectiveCount - adjustedMeat);
        } else {
            adjustedMeat = effectiveCount;
            adjustedVegetarian = 0;
        }
        buildOptions(meatSelect, effectiveCount, '位', adjustedMeat);
        buildOptions(vegetarianSelect, effectiveCount, '位', adjustedVegetarian);

        if (mealHint) {
            const total = (parseInt(meatSelect?.value, 10) || 0) + (parseInt(vegetarianSelect?.value, 10) || 0);
            mealHint.textContent = total > effectiveCount ? `葷食與素食總數不能超過參加人數（${effectiveCount} 人）` : '';
        }
    };

    const adjustCount = (delta) => {
        if (attendanceSelect?.value !== 'Y') return;
        const current = parseInt(numbersInput?.value, 10) || MIN_COUNT;
        const next = Math.min(MAX_COUNT, Math.max(MIN_COUNT, current + delta));
        if (next === current) return;
        numbersInput.value = String(next);
        syncFormState();
    };

    countDecrease?.addEventListener('click', () => adjustCount(-1));
    countIncrease?.addEventListener('click', () => adjustCount(1));
    attendanceSelect?.addEventListener('change', () => syncFormState());
    meatSelect?.addEventListener('change', () => syncFormState('meat'));
    vegetarianSelect?.addEventListener('change', () => syncFormState('vegetarian'));
    invitationDeliverySelect?.addEventListener('change', updateInvitationDeliveryVisibility);

    syncFormState();
    updateInvitationDeliveryVisibility();

    rsvpForm?.addEventListener('submit', (event) => {
        if (attendanceSelect?.value !== 'Y') return;
        const count = parseInt(numbersInput?.value, 10) || 0;
        const total = (parseInt(meatSelect?.value, 10) || 0) + (parseInt(vegetarianSelect?.value, 10) || 0);
        if (count > 0 && total !== count) {
            if (mealHint) mealHint.textContent = `葷食與素食總數必須等於參加人數（${count} 人）`;
            event.preventDefault();
        }
    });

    // --- 背景音樂 ---
    const bgAudio = document.getElementById('bgAudio');
    const soundToggle = document.getElementById('soundToggle');
    const soundLabel = document.getElementById('soundLabel');
    window.AudioConsent?.attach({
        audio: bgAudio,
        toggle: soundToggle,
        onStateChange: (isPlaying) => {
            if (soundLabel) soundLabel.textContent = isPlaying ? 'Sound On' : 'Sound Off';
        }
    });
});
