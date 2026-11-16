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

    async upsert(tenantId, { document_id, title, content, category = 'general' }, conn = this.pool) {
        return await conn.query(
            `INSERT INTO clinic_knowledge_documents (tenant_id, document_id, title, content, category, is_active)
             VALUES (?, ?, ?, ?, ?, 1)
             ON DUPLICATE KEY UPDATE
                title = VALUES(title),
                content = VALUES(content),
                category = VALUES(category),
                is_active = 1,
                updated_at = CURRENT_TIMESTAMP`,
            [tenantId, document_id, title, content, category]
        );
    }

    async deactivate(tenantId, documentId, conn = this.pool) {
        return await conn.query(
            `UPDATE clinic_knowledge_documents
             SET is_active = 0, updated_at = CURRENT_TIMESTAMP
             WHERE tenant_id = ? AND document_id = ?`,
            [tenantId, documentId]
        );
    }
}

const defaultPool = process.env.NODE_ENV === 'test' ? null : require('../../db').pool;
const instance = new ClinicKnowledgeRepository(defaultPool);
const factory = (customPool) => new ClinicKnowledgeRepository(customPool);
Object.setPrototypeOf(factory, instance);
module.exports = factory;
