import React from 'react';
import { StyleSheet, TouchableOpacity, Text, Alert } from 'react-native';
import { useAuth } from '@/shared/context/AuthContext';
import { Colors } from '@/shared/theme/colors';

interface LogoutButtonProps {
    style?: object;
}

export const LogoutButton: React.FC<LogoutButtonProps> = ({ style }) => {
    const { logout } = useAuth();

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

    return (
        <TouchableOpacity
            style={[styles.logoutButton, style]}
            onPress={handleLogout}
            activeOpacity={0.7}
        >
            <Text style={styles.logoutText}>Salir</Text>
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    logoutButton: {
        paddingHorizontal: 12,
        paddingVertical: 6,
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
