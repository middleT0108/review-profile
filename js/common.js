/**
 * ==============================================================================
 * COMMON.JS - Tiện ích dùng chung & Hiệu ứng chuyển trang Fade mượt mà
 * ==============================================================================
 */

document.addEventListener('DOMContentLoaded', () => {
    // Tạo phần tử overlay fade nếu chưa có
    let fadeOverlay = document.querySelector('.page-fade-overlay');
    if (!fadeOverlay) {
        fadeOverlay = document.createElement('div');
        fadeOverlay.className = 'page-fade-overlay';
        document.body.prepend(fadeOverlay);
    }

    // Kích hoạt Fade In khi vào trang
    requestAnimationFrame(() => {
        fadeOverlay.classList.add('fade-out');
    });

    // Bắt sự kiện click các link chuyển trang để tạo Fade Out
    document.querySelectorAll('a[data-navigate]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetUrl = link.getAttribute('href');
            window.navigateTo(targetUrl);
        });
    });
});

/**
 * Chuyển sang URL mới với hiệu ứng fade out
 * @param {string} url 
 */
window.navigateTo = function(url) {
    const fadeOverlay = document.querySelector('.page-fade-overlay') || document.body;
    fadeOverlay.classList.remove('fade-out');
    fadeOverlay.classList.add('fade-in');

    setTimeout(() => {
        window.location.href = url;
    }, 380);
};
