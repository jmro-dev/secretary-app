import React, { useState, useEffect, useCallback } from 'react';
import { api } from '@/api/axios';
import { Icon } from '@/components/atoms/Icon';
import { Button } from '@/components/atoms/Button';
import { TabButton } from '@/components/atoms/TabButton';
import { TabNav } from '@/components/molecules/TabNav';
import { ConfigField } from '@/features/config/components/ui/ConfigField';
import { TagInputField } from '@/features/config/components/ui/TagInputField';
import { Loading } from '@/components/atoms/Loading';
import toast from 'react-hot-toast';
import styles from './AiKnowledgeSettings.module.css';
import shared from '@/styles/shared.module.css';

export const AiKnowledgeSettings = ({ settings = {}, updateSetting }) => {
    const [subTab, setSubTab] = useState('behavior'); // 'behavior' | 'documents'
    const [documents, setDocuments] = useState([]);
    const [selectedDocId, setSelectedDocId] = useState('');
    const [isCreatingNew, setIsCreatingNew] = useState(false);
    const [newDocId, setNewDocId] = useState('');
    const [docDraft, setDocDraft] = useState({ title: '', content: '', category: 'general' });
    const [loadingDocs, setLoadingDocs] = useState(true);
    const [savingDoc, setSavingDoc] = useState(false);
    const [deletingDoc, setDeletingDoc] = useState(false);

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

    const fetchDocuments = useCallback(async (selectId = null) => {
        try {
            setLoadingDocs(true);
            const res = await api.get('/knowledge');
            if (res.data?.success) {
                const docs = res.data.data;
                setDocuments(docs);
                const targetId = selectId || (docs.length > 0 ? docs[0].document_id : '');
                if (targetId && !isCreatingNew) {
                    setSelectedDocId(targetId);
                    const selected = docs.find(d => d.document_id === targetId);
                    if (selected) {
                        setDocDraft({
                            title: selected.title,
                            content: selected.content,
                            category: selected.category || 'general'
                        });
                    }
                } else if (docs.length === 0 && !isCreatingNew) {
                    setSelectedDocId('');
                    setDocDraft({ title: '', content: '', category: 'general' });
                }
            }
        } catch (err) {
            console.error('Error fetching knowledge documents:', err);
            toast.error('Error al cargar base de conocimiento');
        } finally {
            setLoadingDocs(false);
        }
    }, [isCreatingNew]);

    useEffect(() => {
        fetchDocuments();
    }, [fetchDocuments]);

    const handleSelectDoc = (docId) => {
        setIsCreatingNew(false);
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

    const handleStartNewDoc = () => {
        setIsCreatingNew(true);
        setSelectedDocId('');
        setNewDocId('');
        setDocDraft({
            title: '',
            content: '',
            category: 'general'
        });
    };

    const handleCancelNewDoc = () => {
        setIsCreatingNew(false);
        if (documents.length > 0) {
            handleSelectDoc(documents[0].document_id);
        } else {
            setSelectedDocId('');
            setDocDraft({ title: '', content: '', category: 'general' });
        }
    };

    const handleSaveDoc = async () => {
        const finalDocId = isCreatingNew ? newDocId.trim() : selectedDocId;

        if (!finalDocId) {
            toast.error('El identificador del documento es requerido');
            return;
        }

        if (!docDraft.title.trim() || !docDraft.content.trim()) {
            toast.error('Título y contenido son obligatorios');
            return;
        }

        try {
            setSavingDoc(true);
            const res = await api.put(`/knowledge/${encodeURIComponent(finalDocId)}`, {
                title: docDraft.title,
                content: docDraft.content,
                category: docDraft.category
            });

            if (res.data?.success) {
                toast.success(isCreatingNew ? 'Nuevo documento creado en RAG' : 'Documento normativo actualizado');
                setIsCreatingNew(false);
                await fetchDocuments(finalDocId);
            }
        } catch (err) {
            console.error('Error saving knowledge doc:', err);
            toast.error('Error al guardar documento');
        } finally {
            setSavingDoc(false);
        }
    };

    const handleDeleteDoc = async () => {
        if (!selectedDocId || isCreatingNew) return;

        const confirmDelete = window.confirm(`¿Estás seguro de desactivar el documento "${docDraft.title || selectedDocId}" de la base de conocimiento?`);
        if (!confirmDelete) return;

        try {
            setDeletingDoc(true);
            const res = await api.delete(`/knowledge/${encodeURIComponent(selectedDocId)}`);
            if (res.data?.success) {
                toast.success('Documento desactivado del RAG');
                await fetchDocuments();
            }
        } catch (err) {
            console.error('Error deleting doc:', err);
            toast.error('Error al desactivar documento');
        } finally {
            setDeletingDoc(false);
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
            {/* Navegación interna por sub-pestañas para eliminar scrolls */}
            <div className={styles.AiKnowledgeSettings__subTabs}>
                <TabNav>
                    <TabButton
                        isActive={subTab === 'behavior'}
                        onClick={() => setSubTab('behavior')}
                        className={styles.AiKnowledgeSettings__subTabBtn}
                    >
                        <Icon name="psychology" size="1.1rem" />
                        <span>Comportamiento y Reglas</span>
                    </TabButton>
                    <TabButton
                        isActive={subTab === 'documents'}
                        onClick={() => setSubTab('documents')}
                        className={styles.AiKnowledgeSettings__subTabBtn}
                    >
                        <Icon name="library_books" size="1.1rem" />
                        <span>Base de Conocimiento RAG ({documents.length})</span>
                    </TabButton>
                </TabNav>
            </div>

            {/* Pestaña 1: Rol, Guardrails y Términos con Tags */}
            {subTab === 'behavior' && (
                <div className={`${shared.ConfigSection} ${shared.AnimateFadeIn}`}>
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
                                rows={3}
                                value={rules}
                                onChange={(e) => setRules(e.target.value)}
                                placeholder="Reglas de negocio (ej: no confirmar turnos definitivos, derivar emergencias...)"
                            />
                            <span className={styles.AiKnowledgeSettings__help}>
                                Invariantes que el modelo de IA respetará en cada respuesta.
                            </span>
                        </div>

                        <div className={styles.AiKnowledgeSettings__row}>
                            <TagInputField
                                id="ai-emergency-terms"
                                label="Términos de Emergencia"
                                placeholder="Escribe un término (ej: suicidio, crisis) y pulsa Enter"
                                value={emergencyTerms}
                                onChange={setEmergencyTerms}
                                variant="danger"
                                description="Palabras clave que derivan inmediatamente a líneas de crisis de salud mental."
                            />

                            <TagInputField
                                id="ai-restricted-terms"
                                label="Términos Restringidos"
                                placeholder="Escribe un término (ej: clonazepam, receta urgente) y pulsa Enter"
                                value={restrictedTerms}
                                onChange={setRestrictedTerms}
                                variant="warning"
                                description="Términos que impiden emisión automática y derivan al personal de secretaría."
                            />
                        </div>

                        <div className={styles.AiKnowledgeSettings__actions}>
                            <Button variant="primary" onClick={handleSaveAiSettings}>
                                <Icon name="save" size="1rem" />
                                <span>Guardar Comportamiento</span>
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Pestaña 2: Base de Conocimiento RAG (Documentos Normativos) */}
            {subTab === 'documents' && (
                <div className={`${shared.ConfigSection} ${shared.AnimateFadeIn}`}>
                    <div className={shared.ConfigSection__body}>
                        <div className={styles.AiKnowledgeSettings__headerAction}>
                            <Button
                                variant="secondary"
                                onClick={handleStartNewDoc}
                                disabled={isCreatingNew}
                            >
                                <Icon name="add" size="1rem" />
                                <span>Nuevo Documento</span>
                            </Button>
                        </div>

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
                                            className={`${styles.AiKnowledgeSettings__docTab} ${!isCreatingNew && selectedDocId === doc.document_id ? styles['AiKnowledgeSettings__docTab--active'] : ''}`}
                                            onClick={() => handleSelectDoc(doc.document_id)}
                                        >
                                            <Icon name="description" size="1rem" />
                                            <span>{doc.title || doc.document_id}</span>
                                        </button>
                                    ))}

                                    {documents.length === 0 && !isCreatingNew && (
                                        <div className={styles.AiKnowledgeSettings__empty}>
                                            No hay documentos registrados. Haz clic en 'Nuevo Documento' para crear uno.
                                        </div>
                                    )}
                                </div>

                                {/* Editor del Documento */}
                                <div className={styles.AiKnowledgeSettings__docEditor}>
                                    {isCreatingNew ? (
                                        <div className={styles.AiKnowledgeSettings__badgeCreating}>
                                            <Icon name="note_add" size="1.1rem" />
                                            <span>Creando Nuevo Documento Normativo</span>
                                        </div>
                                    ) : null}

                                    {isCreatingNew ? (
                                        <ConfigField
                                            id="doc-id"
                                            label="Identificador único (slug)"
                                            type="text"
                                            placeholder="ej: normativa-psicologia-aranceles"
                                            value={newDocId}
                                            onChange={setNewDocId}
                                            description="Identificador sin espacios ni tildes (usar guiones medios)."
                                        />
                                    ) : null}

                                    <div className={styles.AiKnowledgeSettings__row}>
                                        <ConfigField
                                            id="doc-title"
                                            label="Título del Documento"
                                            type="text"
                                            placeholder="ej: Aranceles y Obras Sociales de Psicología"
                                            value={docDraft.title}
                                            onChange={(val) => setDocDraft(prev => ({ ...prev, title: val }))}
                                        />
                                        <ConfigField
                                            id="doc-category"
                                            label="Categoría"
                                            type="text"
                                            placeholder="ej: aranceles, psiquiatria, turnos"
                                            value={docDraft.category}
                                            onChange={(val) => setDocDraft(prev => ({ ...prev, category: val }))}
                                        />
                                    </div>

                                    <div className={styles.AiKnowledgeSettings__field}>
                                        <label className={styles.AiKnowledgeSettings__label} htmlFor="doc-content">
                                            Contenido Normativo
                                        </label>
                                        <textarea
                                            id="doc-content"
                                            className={styles.AiKnowledgeSettings__textareaLarge}
                                            rows={8}
                                            value={docDraft.content}
                                            onChange={(e) => setDocDraft(prev => ({ ...prev, content: e.target.value }))}
                                            placeholder="Detalla convenios, excepciones, costos y directivas para la IA..."
                                        />
                                    </div>

                                    <div className={styles.AiKnowledgeSettings__editorActions}>
                                        {!isCreatingNew && selectedDocId ? (
                                            <Button
                                                variant="danger"
                                                onClick={handleDeleteDoc}
                                                disabled={deletingDoc}
                                            >
                                                <Icon name="delete" size="1rem" />
                                                <span>{deletingDoc ? 'Eliminando...' : 'Eliminar Documento'}</span>
                                            </Button>
                                        ) : null}

                                        <div className={styles.AiKnowledgeSettings__rightActions}>
                                            {isCreatingNew ? (
                                                <Button
                                                    variant="secondary"
                                                    onClick={handleCancelNewDoc}
                                                    disabled={savingDoc}
                                                >
                                                    Cancelar
                                                </Button>
                                            ) : null}

                                            <Button
                                                variant="primary"
                                                onClick={handleSaveDoc}
                                                disabled={savingDoc}
                                            >
                                                <Icon name="check" size="1rem" />
                                                <span>{savingDoc ? 'Guardando...' : (isCreatingNew ? 'Crear Documento RAG' : 'Guardar y Actualizar RAG')}</span>
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
