const PHONE_PATTERN = /^\d{10}$/;

// 兒童座椅上限＝出席人數－1（至少要有一位大人），出席人數 1 人或以下不顯示此欄位
function normalizeChildSeats(value, numbers) {
    const attendeeCount = Number.parseInt(numbers, 10);
    if (!Number.isFinite(attendeeCount) || attendeeCount <= 1) return 0;

    const childSeats = Number.parseInt(value, 10);
    const maxChildSeats = Math.max(0, attendeeCount - 1);
    return Number.isFinite(childSeats) && childSeats >= 0 ? Math.min(childSeats, maxChildSeats) : 0;
}

// 葷食／素食總數必須等於出席人數；葷食優先取用使用者填的值，素食補齊剩餘
function normalizeMealCounts(meatCount, vegetarianCount, numbers) {
    const attendeeCount = Number.parseInt(numbers, 10);
    const safeAttendeeCount = Number.isFinite(attendeeCount) && attendeeCount > 0 ? attendeeCount : 0;
    const meat = Number.parseInt(meatCount, 10);
    const vegetarian = Number.parseInt(vegetarianCount, 10);
    const safeMeat = Number.isFinite(meat) && meat >= 0 ? Math.min(meat, safeAttendeeCount) : 0;
    const safeVegetarian = Number.isFinite(vegetarian) && vegetarian >= 0 ? Math.max(0, safeAttendeeCount - safeMeat) : 0;
    return { meat: safeMeat, vegetarian: safeVegetarian };
}

// 將前台/後台送進來的一筆賓客報名資料，正規化並驗證成安全可寫入資料庫的形狀
// 呼叫端可透過 `requireEmailOrAddress: false` 略過喜帖 Email/地址必填（後台代填資料常見人工登記、允許先留白）
function normalizeRegistrationPayload(body, { requireEmailOrAddress = true } = {}) {
    const {
        name, email, attendance, numbers, childSeats, meatCount, vegetarianCount,
        phone, hotelNeeds, hotelNeedsDetail, inviteAddress, blessing, invitationDelivery
    } = body;

    const parsedNumbers = Number.parseInt(numbers, 10);
    const safeNumbers = attendance === 'Y' ? (Number.isFinite(parsedNumbers) && parsedNumbers >= 1 ? parsedNumbers : 0) : 0;
    const safeChildSeats = attendance === 'Y' ? normalizeChildSeats(childSeats, safeNumbers) : 0;
    const { meat, vegetarian } = attendance === 'Y'
        ? normalizeMealCounts(meatCount, vegetarianCount, safeNumbers)
        : { meat: 0, vegetarian: 0 };

    const safePhone = phone?.trim() || '';
    const safeHotelNeedsInput = hotelNeeds?.trim() || '不需要';
    const safeHotelNeedsDetail = hotelNeedsDetail?.trim() || '';
    const persistedHotelNeeds = safeHotelNeedsInput === '需要協助訂房' && safeHotelNeedsDetail
        ? `需要協助訂房｜${safeHotelNeedsDetail}`
        : safeHotelNeedsInput;

    const safeInvitationDelivery = attendance === 'Y' && ['email', 'paper'].includes(invitationDelivery)
        ? invitationDelivery
        : (invitationDelivery === undefined ? undefined : 'none');

    // 前台送出時嚴格依 invitationDelivery 決定 email/address 是否保留；
    // 後台新增/編輯沒有 invitationDelivery 欄位，直接採用送來的值
    const safeEmail = safeInvitationDelivery === undefined
        ? (email?.trim() || '')
        : (safeInvitationDelivery === 'email' ? (email?.trim() || '') : '');
    const safeInviteAddress = safeInvitationDelivery === undefined
        ? (inviteAddress?.trim() || '')
        : (safeInvitationDelivery === 'paper' ? (inviteAddress?.trim() || '') : '');
    const safeBlessing = blessing?.trim() || '';

    const isValid = Boolean(name?.trim())
        && PHONE_PATTERN.test(safePhone)
        && !(attendance === 'Y' && (!Number.isFinite(parsedNumbers) || parsedNumbers < 1))
        && !(requireEmailOrAddress && safeInvitationDelivery === 'email' && !safeEmail)
        && !(requireEmailOrAddress && safeInvitationDelivery === 'paper' && !safeInviteAddress);

    return {
        isValid,
        name: (name || '').trim().substring(0, 50),
        email: safeEmail.substring(0, 100),
        attendance,
        numbers: safeNumbers,
        childSeats: safeChildSeats,
        meatCount: meat,
        vegetarianCount: vegetarian,
        phone: safePhone.substring(0, 50),
        hotelNeeds: persistedHotelNeeds.substring(0, 300),
        inviteAddress: safeInviteAddress.substring(0, 300),
        blessing: safeBlessing.substring(0, 300)
    };
}

module.exports = {
    PHONE_PATTERN,
    normalizeChildSeats,
    normalizeMealCounts,
    normalizeRegistrationPayload
};
