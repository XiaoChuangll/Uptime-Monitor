/**
 * 格式化图片 URL，确保使用 HTTPS 协议并处理协议头缺失的情况
 * @param url 图片 URL
 * @returns 格式化后的 HTTPS URL
 */
export const formatImageUrl = (url: string | null | undefined): string => {
    if (!url) return '';
    // 处理协议头缺失的情况 (//example.com/image.jpg)
    if (url.startsWith('//')) {
        return `https:${url}`;
    }
    // 将 http 转换为 https
    return url.replace(/^http:/, 'https:');
};
