
export const isExpired = (expireTime?: number) => {
    return expireTime && expireTime > 0 && expireTime - Date.now() < 30 * 24 * 60 * 60 * 1000
}