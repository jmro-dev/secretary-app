class ClinicKnowledgeRepository {
    constructor(pool) {
        this.pool = pool;
    }

    async findAllActive(conn = this.pool) {
        const query = `
            SELECT id, document_id, title, content, category
            FROM clinic_knowledge_documents
            WHERE is_active = 1
            ORDER BY id ASC
        `;
        return await conn.query(query);
    }

    async findByCategory(category, conn = this.pool) {
        const query = `
            SELECT id, document_id, title, content, category
            FROM clinic_knowledge_documents
            WHERE is_active = 1 AND category = ?
            ORDER BY id ASC
        `;
        return await conn.query(query, [category]);
    }
}

const defaultPool = process.env.NODE_ENV === 'test' ? null : require('../../db').pool;
const instance = new ClinicKnowledgeRepository(defaultPool);
const factory = (customPool) => new ClinicKnowledgeRepository(customPool);
Object.setPrototypeOf(factory, instance);
module.exports = factory;
