/**
 * 共用的「靜音自動播放 → 等待有效使用者手勢後解除靜音」邏輯。
 *
 * 背景：瀏覽器的 autoplay 政策只承認特定事件是「有效使用者手勢」，
 * wheel／scroll／pointerdown 不算數——用它們來解除靜音會被瀏覽器悄悄擋下，
 * 若監聽器又是 { once: true }，一旦被無效事件消耗掉就不會再重試，導致
 * 桌機使用者永遠沒聲音。這裡只用 click／touchstart／keydown 三種事件，
 * 且解除靜音失敗時會恢復靜音並重新監聽，等下一次真正有效的互動再試。
 *
 * 這支模組供 index.html／login.html／admin.html 共用，避免三處各自維護
 * 一份幾乎一樣、又容易各自漂移出 bug 的實作。
 */
(function (window, document) {
    const VALID_GESTURE_EVENTS = ['click', 'touchstart', 'keydown'];

    function attachAudioConsent({ audio, toggle, playingClass = 'is-playing', volume = 0.7, onStateChange }) {
        if (!audio) return null;

        let hasConsented = false;
        let removeListeners = () => {};

        const notify = () => {
            if (typeof onStateChange === 'function') onStateChange(!audio.paused);
            if (toggle) toggle.classList.toggle(playingClass, !audio.paused);
        };

        const addListeners = () => {
            const handler = () => attemptConsent();
            VALID_GESTURE_EVENTS.forEach((eventName) => {
                window.addEventListener(eventName, handler, { once: true, passive: true });
            });
            removeListeners = () => {
                VALID_GESTURE_EVENTS.forEach((eventName) => {
                    window.removeEventListener(eventName, handler, { passive: true });
                });
            };
        };

        const attemptConsent = () => {
            if (hasConsented) return;
            hasConsented = true;
            removeListeners();

            audio.muted = false;
            audio.volume = volume;
            audio.play().then(notify).catch(() => {
                // 這次互動仍不被視為有效手勢，恢復靜音，等下一次再試
                hasConsented = false;
                audio.muted = true;
                addListeners();
            });
        };

        audio.play().then(addListeners).catch(addListeners);

        if (toggle) {
            toggle.addEventListener('click', () => {
                if (audio.paused) {
                    audio.muted = false;
                    audio.volume = volume;
                    audio.play().catch(() => {});
                } else {
                    audio.pause();
                }
            });
            toggle.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    toggle.click();
                }
            });
        }

        audio.addEventListener('play', notify);
        audio.addEventListener('pause', notify);
        audio.addEventListener('ended', notify);

        return { attemptConsent };
    }

    window.AudioConsent = { attach: attachAudioConsent };
})(window, document);
