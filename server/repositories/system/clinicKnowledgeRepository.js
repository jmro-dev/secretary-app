/**
 * ClinicKnowledgeRepository
 * Read access to the tenant-scoped institutional knowledge base
 * (clinic_knowledge_documents). Only active documents are returned.
 */
class ClinicKnowledgeRepository {
    constructor(pool) {
        this.pool = pool;
    }

    async findByTenant(tenantId, conn = this.pool) {
        return await conn.query(
            `SELECT document_id, title, content, category
             FROM clinic_knowledge_documents
             WHERE tenant_id = ? AND is_active = 1
             ORDER BY category ASC, document_id ASC`,
            [tenantId]
        );
    }

    async findByCategory(tenantId, category, conn = this.pool) {
        return await conn.query(
            `SELECT document_id, title, content, category
             FROM clinic_knowledge_documents
             WHERE tenant_id = ? AND category = ? AND is_active = 1
             ORDER BY document_id ASC`,
            [tenantId, category]
        );
    }

    async findByDocumentId(tenantId, documentId, conn = this.pool) {
        const rows = await conn.query(
            `SELECT document_id, title, content, category
             FROM clinic_knowledge_documents
             WHERE tenant_id = ? AND document_id = ? AND is_active = 1
             LIMIT 1`,
            [tenantId, documentId]
        );
        return rows[0] || null;
    }
}

const defaultPool = process.env.NODE_ENV === 'test' ? null : require('../../db').pool;
const instance = new ClinicKnowledgeRepository(defaultPool);
const factory = (customPool) => new ClinicKnowledgeRepository(customPool);
Object.setPrototypeOf(factory, instance);
module.exports = factory;
