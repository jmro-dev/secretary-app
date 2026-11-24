import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { MedicalProcedure } from '@/types/procedures';
import { Colors } from '@/shared/theme/colors';

interface ProcedureItemCardProps {
    procedure: MedicalProcedure;
    onPress: () => void;
    onViewPatient: (patientId: number | string) => void;
    onComplete?: (id: number | string) => void;
}

export const ProcedureItemCard: React.FC<ProcedureItemCardProps> = ({
    procedure,
    onPress,
    onViewPatient,
    onComplete,
}) => {
    const isPending = procedure.status === 'pending';
    const isCompleted = procedure.status === 'completed';

    // Type configuration
    const typeConfig = {
        prescription: {
            icon: '💊',
            label: 'Receta',
            color: Colors.primary,
            bg: 'rgba(0, 168, 132, 0.12)',
        },
        license: {
            icon: '🩺',
            label: 'Licencia',
            color: '#F59E0B',
            bg: 'rgba(245, 158, 11, 0.12)',
        },
        certificate: {
            icon: '📄',
            label: 'Certificado',
            color: '#3B82F6',
            bg: 'rgba(59, 130, 246, 0.12)',
        },
    }[procedure.type] || {
        icon: '📋',
        label: 'Trámite',
        color: Colors.textSecondary,
        bg: 'rgba(150, 150, 150, 0.12)',
    };

    // Format date
    let dateStr = '';
    if (procedure.created_at) {
        const d = new Date(procedure.created_at);
        if (!isNaN(d.getTime())) {
            dateStr = d.toLocaleDateString('es-AR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
            });
        }
    }

    return (
        <TouchableOpacity
            style={styles.card}
            onPress={onPress}
            activeOpacity={0.7}
        >
            <View style={styles.header}>
                <View style={[styles.typeBadge, { backgroundColor: typeConfig.bg }]}>
                    <Text style={styles.typeIcon}>{typeConfig.icon}</Text>
                    <Text style={[styles.typeText, { color: typeConfig.color }]}>
                        {typeConfig.label}
                    </Text>
                </View>

                <View style={styles.statusAndDate}>
                    {dateStr ? <Text style={styles.dateText}>{dateStr}</Text> : null}
                    <View
                        style={[
                            styles.statusBadge,
                            isPending ? styles.statusBadgePending : isCompleted ? styles.statusBadgeCompleted : styles.statusBadgeOther,
                        ]}
                    >
                        <Text
                            style={[
                                styles.statusText,
                                isPending ? styles.statusTextPending : isCompleted ? styles.statusTextCompleted : styles.statusTextOther,
                            ]}
                        >
                            {isPending ? 'Pendiente' : isCompleted ? 'Completado' : procedure.status}
                        </Text>
                    </View>
                </View>
            </View>

            <TouchableOpacity
                onPress={() => onViewPatient(procedure.patient_id)}
                activeOpacity={0.7}
                style={styles.patientNameWrap}
            >
                <Text style={styles.patientName}>
                    {procedure.patient_name || `Paciente #${procedure.patient_id}`}
                </Text>
                <Text style={styles.patientProfileLink}>Ver ficha ›</Text>
            </TouchableOpacity>

            {procedure.request_note ? (
                <Text style={styles.noteText} numberOfLines={2}>
                    {procedure.request_note}
                </Text>
            ) : null}

            {isPending && onComplete ? (
                <View style={styles.footerActions}>
                    <TouchableOpacity
                        style={styles.completeBtn}
                        onPress={() => onComplete(procedure.id)}
                        activeOpacity={0.8}
                    >
                        <Text style={styles.completeBtnIcon}>✓</Text>
                        <Text style={styles.completeBtnText}>Marcar Listo</Text>
                    </TouchableOpacity>
                </View>
            ) : null}
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    card: {
        backgroundColor: Colors.cardBackground,
        borderRadius: 14,
        padding: 14,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    typeBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 8,
        gap: 6,
    },
    typeIcon: {
        fontSize: 15,
    },
    typeText: {
        fontSize: 13,
        fontWeight: '700',
    },
    statusAndDate: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    dateText: {
        fontSize: 13,
        color: Colors.textSecondary,
    },
    statusBadge: {
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 8,
    },
    statusBadgePending: {
        backgroundColor: Colors.warningLight,
    },
    statusBadgeCompleted: {
        backgroundColor: Colors.successLight,
    },
    statusBadgeOther: {
        backgroundColor: Colors.borderLight,
    },
    statusText: {
        fontSize: 13,
        fontWeight: 'bold',
    },
    statusTextPending: {
        color: '#b45309', // Dark amber for readability
    },
    statusTextCompleted: {
        color: '#15803d', // Dark green for readability
    },
    statusTextOther: {
        color: Colors.textSecondary,
    },
    patientNameWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 6,
        paddingVertical: 4,
    },
    patientName: {
        fontSize: 18,
        fontWeight: 'bold',
        color: Colors.textMain,
        flex: 1,
    },
    patientProfileLink: {
        fontSize: 14,
        color: Colors.primaryDark,
        fontWeight: 'bold',
        marginLeft: 8,
    },
    noteText: {
        fontSize: 15,
        color: Colors.textMain,
        lineHeight: 22,
        marginTop: 4,
    },
    footerActions: {
        marginTop: 12,
        paddingTop: 10,
        borderTopWidth: 1,
        borderTopColor: Colors.border,
        flexDirection: 'row',
        justifyContent: 'flex-end',
    },
    completeBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.primary,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 10,
        gap: 6,
        minHeight: 44,
    },
    completeBtnIcon: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    completeBtnText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: 'bold',
    },
});
