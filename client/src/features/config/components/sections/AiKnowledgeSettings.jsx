import React, { useState, useEffect, useCallback } from 'react';
import { api } from '@/api/axios';
import { Icon } from '@/components/atoms/Icon';
import { Button } from '@/components/atoms/Button';
import { ConfigField } from '@/features/config/components/ui/ConfigField';
import { Loading } from '@/components/atoms/Loading';
import toast from 'react-hot-toast';
import styles from './AiKnowledgeSettings.module.css';
import shared from '@/styles/shared.module.css';

const DEFAULT_DOCS = [
    { document_id: 'normativa-aranceles-y-pagos', title: 'Aranceles, Obras Sociales y Pagos', category: 'aranceles' },
    { document_id: 'normativa-atencion-y-modalidades', title: 'Modalidades de Atención y Urgencias', category: 'atencion' },
    { document_id: 'normativa-recetas-y-tramites', title: 'Recetas, Certificados y Licencias', category: 'recetas' }
];

export const AiKnowledgeSettings = ({ settings = {}, updateSetting }) => {
    const [documents, setDocuments] = useState([]);
    const [selectedDocId, setSelectedDocId] = useState('');
    const [docDraft, setDocDraft] = useState({ title: '', content: '', category: 'general' });
    const [loadingDocs, setLoadingDocs] = useState(true);
    const [savingDoc, setSavingDoc] = useState(false);

    // AI Settings locales
    const [role, setRole] = useState(settings.ai_system_role || '');
    const [rules, setRules] = useState(settings.ai_operational_rules || '');
    const [emergencyTerms, setEmergencyTerms] = useState(settings.ai_emergency_terms || '');
    const [restrictedTerms, setRestrictedTerms] = useState(settings.ai_restricted_terms || '');

    useEffect(() => {
        setRole(settings.ai_system_role || '');
        setRules(settings.ai_operational_rules || '');
        setEmergencyTerms(settings.ai_emergency_terms || '');
        setRestrictedTerms(settings.ai_restricted_terms || '');
    }, [settings]);

    const fetchDocuments = useCallback(async () => {
        try {
            setLoadingDocs(true);
            const res = await api.get('/knowledge');
            if (res.data?.success) {
                const docs = res.data.data;
                setDocuments(docs);
                if (docs.length > 0 && !selectedDocId) {
                    setSelectedDocId(docs[0].document_id);
                    setDocDraft({
                        title: docs[0].title,
                        content: docs[0].content,
                        category: docs[0].category || 'general'
                    });
                }
            }
        } catch (err) {
            console.error('Error fetching knowledge documents:', err);
            toast.error('Error al cargar base de conocimiento');
        } finally {
            setLoadingDocs(false);
        }
    }, [selectedDocId]);

    useEffect(() => {
        fetchDocuments();
    }, [fetchDocuments]);

    const handleSelectDoc = (docId) => {
        setSelectedDocId(docId);
        const doc = documents.find(d => d.document_id === docId);
        if (doc) {
            setDocDraft({
                title: doc.title,
                content: doc.content,
                category: doc.category || 'general'
            });
        }
    };

    const handleSaveDoc = async () => {
        if (!selectedDocId || !docDraft.title || !docDraft.content) {
            toast.error('Título y contenido son obligatorios');
            return;
        }

        try {
            setSavingDoc(true);
            const res = await api.post('/knowledge', {
                document_id: selectedDocId,
                title: docDraft.title,
                content: docDraft.content,
                category: docDraft.category
            });

            if (res.data?.success) {
                toast.success('Documento normativo actualizado en RAG');
                fetchDocuments();
            }
        } catch (err) {
            console.error('Error saving knowledge doc:', err);
            toast.error('Error al guardar documento');
        } finally {
            setSavingDoc(false);
        }
    };

    const handleSaveAiSettings = () => {
        updateSetting('ai_system_role', role);
        updateSetting('ai_operational_rules', rules);
        updateSetting('ai_emergency_terms', emergencyTerms);
        updateSetting('ai_restricted_terms', restrictedTerms);
        toast.success('Reglas operativas de IA actualizadas');
    };

    return (
        <div className={`${styles.AiKnowledgeSettings__root} ${shared.TabPanel} ${shared.AnimateFadeIn}`}>
            {/* Sección 1: Rol y Reglas Operativas */}
            <div className={shared.ConfigSection}>
                <div className={shared.ConfigSection__header}>
                    <Icon name="smart_toy" size="1.2rem" className={shared.ConfigSection__icon} />
                    <h4 className={shared.ConfigSection__title}>Comportamiento y Rol del Asistente Virtual</h4>
                </div>

                <div className={shared.ConfigSection__body}>
                    <ConfigField
                        id="ai-role"
                        label="Rol del Asistente"
                        type="text"
                        placeholder="Ej: Eres el asistente virtual oficial de atención..."
                        value={role}
                        onChange={setRole}
                        description="Define la personalidad, función principal y límites del asistente."
                    />

                    <div className={styles.AiKnowledgeSettings__field}>
                        <label className={styles.AiKnowledgeSettings__label} htmlFor="ai-rules">
                            Reglas Operativas Obligatorias (Guardrails)
                        </label>
                        <textarea
                            id="ai-rules"
                            className={styles.AiKnowledgeSettings__textarea}
                            rows={4}
                            value={rules}
                            onChange={(e) => setRules(e.target.value)}
                            placeholder="Reglas de negocio (ej: no confirmar turnos definitivos, derivar emergencias...)"
                        />
                        <span className={styles.AiKnowledgeSettings__help}>
                            Invariantes que el modelo de IA respetará en cada respuesta.
                        </span>
                    </div>

                    <div className={styles.AiKnowledgeSettings__row}>
                        <ConfigField
                            id="ai-emergency-terms"
                            label="Términos de Emergencia (separados por coma)"
                            type="text"
                            placeholder="suicidio, matarme, emergencia, guardia..."
                            value={emergencyTerms}
                            onChange={setEmergencyTerms}
                            description="Palabras clave que derivan inmediatamente a líneas de crisis."
                        />

                        <ConfigField
                            id="ai-restricted-terms"
                            label="Términos Restringidos (separados por coma)"
                            type="text"
                            placeholder="receta urgente, clonazepam, derivación..."
                            value={restrictedTerms}
                            onChange={setRestrictedTerms}
                            description="Términos que impiden emisión automática y derivan a secretaría."
                        />
                    </div>

                    <div className={styles.AiKnowledgeSettings__actions}>
                        <Button variant="primary" onClick={handleSaveAiSettings}>
                            Guardar Comportamiento
                        </Button>
                    </div>
                </div>
            </div>

            {/* Sección 2: Base de Conocimiento RAG (Documentos Normativos) */}
            <div className={shared.ConfigSection}>
                <div className={shared.ConfigSection__header}>
                    <Icon name="library_books" size="1.2rem" className={shared.ConfigSection__icon} />
                    <h4 className={shared.ConfigSection__title}>Base de Conocimiento RAG (Normativas de la Clínica)</h4>
                </div>

                <div className={shared.ConfigSection__body}>
                    <p className={styles.AiKnowledgeSettings__desc}>
                        Estos documentos se inyectan en tiempo real al motor de IA para resolver consultas sobre convenios, honorarios, modalidades de atención y plazos de recetas sin alucinaciones.
                    </p>

                    {loadingDocs ? (
                        <Loading variant="centered" />
                    ) : (
                        <div className={styles.AiKnowledgeSettings__docContainer}>
                            {/* Selector de Documentos */}
                            <div className={styles.AiKnowledgeSettings__docList}>
                                {documents.map((doc) => (
                                    <button
                                        key={doc.document_id}
                                        type="button"
                                        className={`${styles.AiKnowledgeSettings__docTab} ${selectedDocId === doc.document_id ? styles['docTab--active'] : ''}`}
                                        onClick={() => handleSelectDoc(doc.document_id)}
                                    >
                                        <Icon name="description" size="1rem" />
                                        <span>{doc.title || doc.document_id}</span>
                                    </button>
                                ))}
                            </div>

                            {/* Editor del Documento */}
                            <div className={styles.AiKnowledgeSettings__docEditor}>
                                <ConfigField
                                    id="doc-title"
                                    label="Título del Documento"
                                    type="text"
                                    value={docDraft.title}
                                    onChange={(v) => setDocDraft(prev => ({ ...prev, title: v }))}
                                />

                                <div className={styles.AiKnowledgeSettings__field}>
                                    <label className={styles.AiKnowledgeSettings__label} htmlFor="doc-content">
                                        Contenido Normativo (Markdown o Texto Plano)
                                    </label>
                                    <textarea
                                        id="doc-content"
                                        className={styles.AiKnowledgeSettings__textareaLarge}
                                        rows={12}
                                        value={docDraft.content}
                                        onChange={(e) => setDocDraft(prev => ({ ...prev, content: e.target.value }))}
                                        placeholder="Detalla convenios, aranceles, plazos de hasta 72 hs..."
                                    />
                                </div>

                                <div className={styles.AiKnowledgeSettings__actions}>
                                    <Button
                                        variant="primary"
                                        onClick={handleSaveDoc}
                                        disabled={savingDoc}
                                    >
                                        {savingDoc ? 'Guardando...' : 'Guardar y Actualizar RAG'}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
