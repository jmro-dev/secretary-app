const knowledgeController = require('../system/knowledgeController');
const clinicKnowledgeRepository = require('../../repositories/system/clinicKnowledgeRepository');
const aiConfigService = require('../../services/communication/aiConfigService');
const { syncKnowledgeDocument } = require('../../services/communication/aiMicroserviceClient');

jest.mock('../../repositories/system/clinicKnowledgeRepository', () => ({
    findByTenant: jest.fn(),
    findByDocumentId: jest.fn(),
    upsert: jest.fn(),
    deactivate: jest.fn(),
}));

jest.mock('../../services/communication/aiConfigService', () => ({
    invalidateCache: jest.fn(),
}));

jest.mock('../../services/communication/aiMicroserviceClient', () => ({
    syncKnowledgeDocument: jest.fn().mockResolvedValue({ status: 'indexed', documentId: 'doc-1', chunksIndexed: 1 }),
}));

describe('knowledgeController', () => {
    let req, res;

    beforeEach(() => {
        jest.clearAllMocks();
        req = { query: {}, params: {}, body: {} };
        res = {
            json: jest.fn().mockReturnThis(),
            status: jest.fn().mockReturnThis(),
        };
    });

    describe('getDocuments', () => {
        it('returns documents for default tenant', async () => {
            const mockDocs = [{ document_id: 'doc-1', title: 'Doc 1' }];
            clinicKnowledgeRepository.findByTenant.mockResolvedValue(mockDocs);

            await knowledgeController.getDocuments(req, res);

            expect(clinicKnowledgeRepository.findByTenant).toHaveBeenCalledWith('cima-salud');
            expect(res.json).toHaveBeenCalledWith({ success: true, data: mockDocs });
        });
    });

    describe('upsertDocument', () => {
        it('rejects missing required fields', async () => {
            req.body = { document_id: 'doc-1', title: 'Doc 1' }; // missing content

            await knowledgeController.upsertDocument(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                error: 'document_id, title, and content are required'
            });
        });

        it('saves valid document and invalidates ai cache', async () => {
            req.body = {
                document_id: 'doc-1',
                title: 'Doc 1',
                content: 'Test content',
                category: 'aranceles'
            };
            clinicKnowledgeRepository.upsert.mockResolvedValue({ affectedRows: 1 });

            await knowledgeController.upsertDocument(req, res);

            expect(clinicKnowledgeRepository.upsert).toHaveBeenCalledWith('cima-salud', {
                document_id: 'doc-1',
                title: 'Doc 1',
                content: 'Test content',
                category: 'aranceles'
            });
            expect(aiConfigService.invalidateCache).toHaveBeenCalled();
            expect(syncKnowledgeDocument).toHaveBeenCalledWith({
                tenantId: 'cima-salud',
                documentId: 'doc-1',
                title: 'Doc 1',
                content: 'Test content'
            });
            expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Document saved successfully' });
        });
    });

    describe('deleteDocument', () => {
        it('deactivates document and invalidates cache', async () => {
            req.params.documentId = 'doc-1';
            clinicKnowledgeRepository.deactivate.mockResolvedValue({ affectedRows: 1 });

            await knowledgeController.deleteDocument(req, res);

            expect(clinicKnowledgeRepository.deactivate).toHaveBeenCalledWith('cima-salud', 'doc-1');
            expect(aiConfigService.invalidateCache).toHaveBeenCalled();
            expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Document deactivated successfully' });
        });
    });
});
