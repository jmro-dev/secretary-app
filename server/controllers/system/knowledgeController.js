const clinicKnowledgeRepository = require('../../repositories/system/clinicKnowledgeRepository');
const aiConfigService = require('../../services/communication/aiConfigService');
const { syncKnowledgeDocument } = require('../../services/communication/aiMicroserviceClient');

const DEFAULT_TENANT_ID = process.env.EDI3_TENANT_ID || 'cima-salud';

exports.getDocuments = async (req, res) => {
    try {
        const tenantId = req.query.tenant_id || DEFAULT_TENANT_ID;
        const docs = await clinicKnowledgeRepository.findByTenant(tenantId);
        res.json({ success: true, data: docs });
    } catch (err) {
        console.error('[KnowledgeController Error]:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch knowledge documents' });
    }
};

exports.getDocument = async (req, res) => {
    try {
        const tenantId = req.query.tenant_id || DEFAULT_TENANT_ID;
        const { documentId } = req.params;
        const doc = await clinicKnowledgeRepository.findByDocumentId(tenantId, documentId);
        if (!doc) {
            return res.status(404).json({ success: false, error: 'Document not found' });
        }
        res.json({ success: true, data: doc });
    } catch (err) {
        console.error('[KnowledgeController Error]:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch document' });
    }
};

exports.upsertDocument = async (req, res) => {
    try {
        const tenantId = req.body.tenant_id || DEFAULT_TENANT_ID;
        const { document_id, title, content, category } = req.body;

        if (!document_id || !title || !content) {
            return res.status(400).json({ success: false, error: 'document_id, title, and content are required' });
        }

        await clinicKnowledgeRepository.upsert(tenantId, { document_id, title, content, category });
        aiConfigService.invalidateCache();

        // Sincronización asíncrona con el microservicio RAG (OpenAPI: POST /api/v1/knowledge/documents)
        // No bloquea la respuesta si el microservicio de IA está temporalmente offline
        syncKnowledgeDocument({ tenantId, documentId: document_id, title, content }).catch(syncErr => {
            console.warn('[KnowledgeController] Sync knowledge error:', syncErr.message);
        });

        res.json({ success: true, message: 'Document saved successfully' });
    } catch (err) {
        console.error('[KnowledgeController Error]:', err);
        res.status(500).json({ success: false, error: 'Failed to save document' });
    }
};

exports.deleteDocument = async (req, res) => {
    try {
        const tenantId = req.query.tenant_id || DEFAULT_TENANT_ID;
        const { documentId } = req.params;

        await clinicKnowledgeRepository.deactivate(tenantId, documentId);
        aiConfigService.invalidateCache();

        res.json({ success: true, message: 'Document deactivated successfully' });
    } catch (err) {
        console.error('[KnowledgeController Error]:', err);
        res.status(500).json({ success: false, error: 'Failed to deactivate document' });
    }
};
