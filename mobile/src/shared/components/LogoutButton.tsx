import React from 'react';
import { StyleSheet, View, TouchableOpacity, Text, Alert } from 'react-native';
import { useAuth } from '@/shared/context/AuthContext';
import { isDoctorRole } from '@/types/auth';
import { Colors } from '@/shared/theme/colors';

interface LogoutButtonProps {
    style?: object;
    showUserInfo?: boolean;
}

export const LogoutButton: React.FC<LogoutButtonProps> = ({ style, showUserInfo = true }) => {
    const { user, logout } = useAuth();

    const handleLogout = () => {
        Alert.alert(
            'Cerrar Sesión',
            '¿Estás seguro/a de que querés salir de la aplicación?',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Salir',
                    style: 'destructive',
                    onPress: async () => {
                        await logout();
                    },
                },
            ]
        );
    };

    const displayName = user?.name || user?.username || 'Usuario';
    const roleBadge = isDoctorRole(user?.role) ? '🩺 Dra/Dr' : '👩‍💼 Secretaría';

    return (
        <View style={styles.container}>
            {showUserInfo && (
                <View style={styles.userInfoWrap}>
                    <Text style={styles.userNameText} numberOfLines={1}>
                        {displayName}
                    </Text>
                    <Text style={styles.userRoleBadge}>{roleBadge}</Text>
                </View>
            )}
            <TouchableOpacity
                style={[styles.logoutButton, style]}
                onPress={handleLogout}
                activeOpacity={0.7}
            >
                <Text style={styles.logoutText}>Salir</Text>
            </TouchableOpacity>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    userInfoWrap: {
        alignItems: 'flex-end',
        justifyContent: 'center',
        marginRight: 2,
    },
    userNameText: {
        fontSize: 14,
        fontWeight: 'bold',
        color: Colors.textMain,
        maxWidth: 130,
    },
    userRoleBadge: {
        fontSize: 12,
        fontWeight: '600',
        color: Colors.textSecondary,
        marginTop: 1,
    },
    logoutButton: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 8,
        backgroundColor: Colors.dangerLight,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 36,
    },
    logoutText: {
        color: Colors.danger,
        fontWeight: 'bold',
        fontSize: 13,
    },
});
