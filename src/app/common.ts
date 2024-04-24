export const getSessionStorage = (key: string) => {
    try {
        return sessionStorage.getItem(key) || undefined;
    } catch (error) {
        return undefined
    }
};

export const setSessionStorage = (key: string, value: string) => {
    try {
        sessionStorage.setItem(key, value);
    } catch (error) { }
};

export const round2 = (num: number) => {
    return Math.round((num + Number.EPSILON) * 100) / 100
};