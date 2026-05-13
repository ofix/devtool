export function buildUrl(baseUrl, params) {
    const queryParts = [];
    for (const [key, value] of Object.entries(params)) {
        // 不对 value 做任何编码，直接拼接
        queryParts.push(`${key}=${value}`);
    }
    return `${baseUrl}?${queryParts.join('&')}`;
}