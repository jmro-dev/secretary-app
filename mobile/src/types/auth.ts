export type UserRole = 'doctor' | 'secretary' | 'admin' | string;

export interface User {
    id: number;
    username: string;
    doctor_id?: number | null;
    profile_id?: number | null;
    role?: UserRole;
    name?: string;
    email?: string;
}

export const getDefaultAppRoute = (role?: UserRole): '/(app)/procedures' | '/(app)/appointments' => {
    return role === 'doctor' ? '/(app)/procedures' : '/(app)/appointments';
};

export interface LoginCredentials {
    username: string;
    password: string;
}

export interface AuthResponse {
    token: string;
    user: User;
    message?: string;
}
