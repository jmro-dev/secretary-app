import React, { useState, useEffect } from 'react';
import {
    StyleSheet,
    Text,
    View,
    TextInput,
    TouchableOpacity,
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { useAuth } from '@/shared/context/AuthContext';
import { Colors } from '@/shared/theme/colors';
import { getEnvironmentOverride, setEnvironmentOverride, getApiUrl } from '@/shared/services/api';

export const LoginForm: React.FC = () => {
    const { login } = useAuth();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [envMode, setEnvMode] = useState<'dev' | 'prod' | 'auto'>('auto');
    const [activeEndpoint, setActiveEndpoint] = useState<string>('');

    useEffect(() => {
        getEnvironmentOverride().then(setEnvMode);
        getApiUrl().then(setActiveEndpoint);
    }, []);

    const toggleEnv = async () => {
        const next = envMode === 'dev' ? 'prod' : 'dev';
        await setEnvironmentOverride(next);
        setEnvMode(next);
        const url = await getApiUrl();
        setActiveEndpoint(url);
    };

    const handleLogin = async () => {
        setErrorMessage('');
        if (!username.trim() || !password.trim()) {
            setErrorMessage('Por favor ingresá usuario y contraseña');
            return;
        }

        setLoading(true);
        try {
            await login({ username: username.trim(), password });
        } catch (error: any) {
            setErrorMessage(error.message || 'Credenciales inválidas');
        } finally {
            setLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.container}
        >
            <View style={styles.card}>
                <Text style={styles.title}>Secretary App 🩺</Text>
                <Text style={styles.subtitle}>Acceso Profesional Médica</Text>

                {errorMessage ? (
                    <View style={styles.errorBanner}>
                        <Text style={styles.errorText}>⚠️ {errorMessage}</Text>
                    </View>
                ) : null}

                <View style={styles.inputContainer}>
                    <Text style={styles.label}>Usuario / Email</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="usuario"
                        value={username}
                        onChangeText={setUsername}
                        autoCapitalize="none"
                        placeholderTextColor={Colors.textMuted}
                    />
                </View>

                <View style={styles.inputContainer}>
                    <Text style={styles.label}>Contraseña</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="••••••••"
                        secureTextEntry
                        value={password}
                        onChangeText={setPassword}
                        placeholderTextColor={Colors.textMuted}
                    />
                </View>

                <TouchableOpacity
                    style={[styles.button, loading && styles.buttonDisabled]}
                    onPress={handleLogin}
                    disabled={loading}
                    activeOpacity={0.8}
                >
                    {loading ? (
                        <ActivityIndicator color="#ffffff" />
                    ) : (
                        <Text style={styles.buttonText}>Ingresar</Text>
                    )}
                </TouchableOpacity>

                {__DEV__ && (
                    <TouchableOpacity
                        style={styles.envSelector}
                        onPress={toggleEnv}
                        activeOpacity={0.7}
                    >
                        <Text style={styles.envBadge}>
                            Entorno: <Text style={styles.envBadgeHighlight}>{activeEndpoint.includes('duckdns') ? 'PRODUCCIÓN (RPi)' : 'DESARROLLO (Local)'}</Text>
                        </Text>
                        <Text style={styles.envUrl} numberOfLines={1}>{activeEndpoint}</Text>
                        <Text style={styles.envHint}>Toca para cambiar</Text>
                    </TouchableOpacity>
                )}
            </View>
        </KeyboardAvoidingView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
        justifyContent: 'center',
        padding: 20,
    },
    card: {
        backgroundColor: Colors.cardBackground,
        borderRadius: 16,
        padding: 24,
        elevation: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
    },
    title: {
        fontSize: 26,
        fontWeight: 'bold',
        color: Colors.textMain,
        textAlign: 'center',
        marginBottom: 6,
    },
    subtitle: {
        fontSize: 14,
        color: Colors.textSecondary,
        textAlign: 'center',
        marginBottom: 20,
    },
    errorBanner: {
        backgroundColor: Colors.dangerLight,
        borderRadius: 8,
        paddingVertical: 10,
        paddingHorizontal: 12,
        marginBottom: 16,
    },
    errorText: {
        color: Colors.danger,
        fontSize: 13,
        fontWeight: '600',
        textAlign: 'center',
    },
    inputContainer: {
        marginBottom: 16,
    },
    label: {
        fontSize: 13,
        fontWeight: '600',
        color: Colors.textSecondary,
        marginBottom: 6,
    },
    input: {
        borderWidth: 1,
        borderColor: Colors.border,
        borderRadius: 8,
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: 15,
        color: Colors.textMain,
        backgroundColor: Colors.background,
    },
    button: {
        backgroundColor: Colors.secondary,
        borderRadius: 10,
        paddingVertical: 14,
        alignItems: 'center',
        marginTop: 12,
    },
    buttonDisabled: {
        opacity: 0.6,
    },
    buttonText: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: '600',
    },
    envSelector: {
        marginTop: 20,
        padding: 10,
        backgroundColor: Colors.background,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: Colors.border,
        alignItems: 'center',
    },
    envBadge: {
        fontSize: 12,
        color: Colors.textSecondary,
        fontWeight: '500',
    },
    envBadgeHighlight: {
        fontWeight: 'bold',
        color: Colors.primary,
    },
    envUrl: {
        fontSize: 11,
        color: Colors.textMuted,
        marginTop: 2,
    },
    envHint: {
        fontSize: 10,
        color: Colors.textMuted,
        marginTop: 4,
        fontStyle: 'italic',
    },
});
