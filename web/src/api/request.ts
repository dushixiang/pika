const BASE_URL = '/api';
const DEFAULT_TIMEOUT = 30000;

export interface RequestConfig extends RequestInit {
    timeout?: number;
}

export interface HttpResponse<T = unknown> {
    data: T;
    status: number;
    statusText: string;
    headers: Record<string, string>;
    url: string;
}

class HttpError extends Error {
    response?: {
        status: number;
        statusText: string;
        data?: unknown;
    };

    constructor(message: string, response?: HttpError['response']) {
        super(message);
        this.name = 'HttpError';
        this.response = response;
    }
}

const parseResponseData = async (response: Response) => {
    const contentType = response.headers.get('content-type') || '';
    if (response.status === 204) {
        return undefined;
    }
    if (contentType.includes('application/json')) {
        try {
            return await response.json();
        } catch (error) {
            console.warn('解析 JSON 响应失败', error);
            return undefined;
        }
    }
    return response.text();
};

const headersToRecord = (headers: Headers) => {
    const record: Record<string, string> = {};
    headers.forEach((value, key) => {
        record[key] = value;
    });
    return record;
};

const sendRequest = async <T>(url: string, config: RequestConfig = {}): Promise<HttpResponse<T>> => {
    const {timeout = DEFAULT_TIMEOUT, headers, body, ...restConfig} = config;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeout);

    try {
        const token = localStorage.getItem('token');
        const finalHeaders = new Headers(headers || {});
        if (token) {
            finalHeaders.set('Authorization', `Bearer ${token}`);
        }

        const hasBody = body !== undefined && body !== null;
        const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
        if (hasBody && !isFormData && !finalHeaders.has('Content-Type')) {
            finalHeaders.set('Content-Type', 'application/json');
        }

        const response = await fetch(`${BASE_URL}${url}`, {
            ...restConfig,
            body,
            headers: finalHeaders,
            signal: controller.signal,
        });

        const data = await parseResponseData(response);

        if (response.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('userInfo');
            throw new HttpError('未认证或认证已过期', {
                status: response.status,
                statusText: response.statusText,
                data,
            });
        }

        if (!response.ok) {
            const message =
                typeof data === 'object' && data !== null && 'message' in data
                    ? (data as { message?: string }).message
                    : undefined;
            throw new HttpError(message || '请求失败，请稍后重试', {
                status: response.status,
                statusText: response.statusText,
                data,
            });
        }

        return {
            data: data as T,
            status: response.status,
            statusText: response.statusText,
            headers: headersToRecord(response.headers),
            url: response.url,
        };
    } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
            throw new Error('请求超时');
        }
        throw error;
    } finally {
        clearTimeout(timer);
    }
};

const normalizeBody = (data?: any) => {
    if (data === undefined || data === null) {
        return undefined;
    }
    const isForm =
        (typeof FormData !== 'undefined' && data instanceof FormData) ||
        (typeof Blob !== 'undefined' && data instanceof Blob) ||
        (typeof URLSearchParams !== 'undefined' && data instanceof URLSearchParams);

    if (isForm) {
        return data;
    }
    if (typeof data === 'string') {
        return data;
    }
    return JSON.stringify(data);
};

export interface ApiResponse<T = any> {
    code?: number;
    message?: string;
    data?: T;
}

export const get = <T = any>(url: string, config?: RequestConfig) => {
    return sendRequest<T>(url, {
        ...(config || {}),
        method: 'GET',
    });
};

export const post = <T = any>(url: string, data?: any, config?: RequestConfig) => {
    return sendRequest<T>(url, {
        ...(config || {}),
        method: 'POST',
        body: normalizeBody(data),
    });
};

export const put = <T = any>(url: string, data?: any, config?: RequestConfig) => {
    return sendRequest<T>(url, {
        ...(config || {}),
        method: 'PUT',
        body: normalizeBody(data),
    });
};

export const del = <T = any>(url: string, config?: RequestConfig) => {
    return sendRequest<T>(url, {
        ...(config || {}),
        method: 'DELETE',
    });
};

const request = {
    get,
    post,
    put,
    delete: del,
};

export default request;
