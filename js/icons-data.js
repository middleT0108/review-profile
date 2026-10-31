/**
 * Danh mục icon mạng xã hội có sẵn
 */
window.SOCIAL_ICON_PRESETS = [
    { id: 'facebook', label: 'Facebook', file: 'assets/icons/facebook.svg' },
    { id: 'discord', label: 'Discord', file: 'assets/icons/discord.svg' },
    { id: 'youtube', label: 'YouTube', file: 'assets/icons/youtube.svg' },
    { id: 'tiktok', label: 'TikTok', file: 'assets/icons/tiktok.svg' },
    { id: 'github', label: 'GitHub', file: 'assets/icons/github.svg' },
    { id: 'twitter', label: 'X (Twitter)', file: 'assets/icons/twitter.svg' },
    { id: 'instagram', label: 'Instagram', file: 'assets/icons/instagram.svg' },
    { id: 'spotify', label: 'Spotify', file: 'assets/icons/spotify.svg' },
    { id: 'steam', label: 'Steam', file: 'assets/icons/steam.svg' },
    { id: 'twitch', label: 'Twitch', file: 'assets/icons/twitch.svg' },
    { id: 'telegram', label: 'Telegram', file: 'assets/icons/telegram.svg' },
    { id: 'web', label: 'Website', file: 'assets/icons/web.svg' },
    { id: 'mail', label: 'Email', file: 'assets/icons/mail.svg' }
];

/**
 * Trả về đường dẫn ảnh icon hoặc data URL ảnh tuỳ chỉnh
 * @param {Object} linkItem 
 * @returns {string}
 */
window.getIconSrc = function(linkItem) {
    if (!linkItem) return 'assets/icons/web.svg';
    if (linkItem.customIcon) {
        return linkItem.customIcon;
    }
    const found = window.SOCIAL_ICON_PRESETS.find(p => p.id === linkItem.icon);
    return found ? found.file : 'assets/icons/web.svg';
};
