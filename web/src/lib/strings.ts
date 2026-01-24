export const hasText = (text?: string) => {
    return text !== undefined && text !== null && text.trim().length > 0;
}