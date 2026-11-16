const express = require('express');
const router = express.Router();
const { verifyToken } = require('../../middleware/authMiddleware');
const { authorize } = require('../../middleware/authorize');
const { ACCESS_LEVELS } = require('../../constants/roles');
const knowledgeController = require('../../controllers/system/knowledgeController');

router.get('/', verifyToken, knowledgeController.getDocuments);
router.get('/:documentId', verifyToken, knowledgeController.getDocument);
router.post('/', verifyToken, authorize(ACCESS_LEVELS.MANAGE_CORE_DATA), knowledgeController.upsertDocument);
router.delete('/:documentId', verifyToken, authorize(ACCESS_LEVELS.MANAGE_CORE_DATA), knowledgeController.deleteDocument);

module.exports = router;
