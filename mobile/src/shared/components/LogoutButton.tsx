import React from 'react';
import { StyleSheet, View, TouchableOpacity, Text, Alert } from 'react-native';
import { useAuth } from '@/shared/context/AuthContext';
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
    const roleBadge = user?.role === 'doctor' ? '🩺 Dra/Dr' : '👩‍💼 Secretaría';

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
        gap: 8,
    },
    userInfoWrap: {
        alignItems: 'flex-end',
        justifyContent: 'center',
        marginRight: 2,
    },
    userNameText: {
        fontSize: 12,
        fontWeight: 'bold',
        color: Colors.textMain,
        maxWidth: 110,
    },
    userRoleBadge: {
        fontSize: 10,
        color: Colors.textSecondary,
    },
    logoutButton: {
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 8,
        backgroundColor: Colors.dangerLight,
        alignItems: 'center',
        justifyContent: 'center',
    },
    logoutText: {
        color: Colors.danger,
        fontWeight: 'bold',
        fontSize: 12,
    },
});
