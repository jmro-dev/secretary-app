import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { User } from '@/types/auth';

const PROD_API_URL = 'https://secretaria.cimasalud.duckdns.org/api';

export const getBaseHost = (): string => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location) {
        return window.location.origin;
    }
    // Conectar por defecto siempre al backend activo de la Raspberry Pi
    return PROD_API_URL;
};

// Clave para sobrescribir el entorno manualmente si se desea en pruebas
const ENV_STORAGE_KEY = 'app_environment_override';

export const getApiUrl = async (): Promise<string> => {
    try {
        const override = await AsyncStorage.getItem(ENV_STORAGE_KEY);
        if (override === 'dev') {
            const host = Constants.expoConfig?.hostUri?.split(':')[0] || '192.168.50.30';
            return `http://${host}:5000/api`;
        }
    } catch {
        // Ignorar error de lectura
    }
    return PROD_API_URL;
};

export const setEnvironmentOverride = async (env: 'dev' | 'prod' | 'auto'): Promise<void> => {
    if (env === 'auto') {
        await AsyncStorage.removeItem(ENV_STORAGE_KEY);
    } else {
        await AsyncStorage.setItem(ENV_STORAGE_KEY, env);
    }
};

export const getEnvironmentOverride = async (): Promise<'dev' | 'prod' | 'auto'> => {
    try {
        const val = await AsyncStorage.getItem(ENV_STORAGE_KEY);
        if (val === 'dev' || val === 'prod') return val;
    } catch {
        // fallback
    }
    return 'auto';
};

export const API_BASE_URL = getBaseHost().endsWith('/api') ? getBaseHost() : `${getBaseHost()}/api`;

export const getAuthToken = async (): Promise<string | null> => {
    try {
        return await AsyncStorage.getItem('user_token');
    } catch {
        return null;
    }
};

export const getStoredUser = async (): Promise<User | null> => {
    try {
        const raw = await AsyncStorage.getItem('user_info');
        return raw ? (JSON.parse(raw) as User) : null;
    } catch {
        return null;
    }
};

export async function apiFetch<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = await getAuthToken();
    const userInfo = await getStoredUser();
    const baseUrl = await getApiUrl();

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string> || {}),
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    if (userInfo?.doctor_id || userInfo?.profile_id) {
        headers['x-doctor-id'] = String(userInfo.doctor_id || userInfo.profile_id);
    }

    const response = await fetch(`${baseUrl}${endpoint}`, {
        ...options,
        headers,
    });

    if (response.status === 401 || response.status === 403) {
        await AsyncStorage.multiRemove(['user_token', 'user_info']);
        throw new Error('Sesión expirada o no autorizada');
    }

    const text = await response.text();
    let data: any;
    try {
        data = text ? JSON.parse(text) : {};
    } catch {
        data = { message: text };
    }

    if (!response.ok) {
        let msg = data.message || data.error || (typeof data === 'string' ? data : `Error (${response.status})`);
        if (msg === 'Invalid Credentials') {
            msg = 'Usuario o contraseña incorrectos';
        }
        throw new Error(msg);
    }

    return data as T;
}
