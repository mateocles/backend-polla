const express = require('express');
const GroupController = require('../controllers/groupController');
const { authenticateToken } = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(authenticateToken); // Protect all group routes

router.post('/', GroupController.createGroup);
router.get('/', GroupController.listGroups);
router.patch('/:groupId', GroupController.updateGroup);
router.post('/invite', GroupController.inviteUser);
router.post('/join', GroupController.joinGroup);

module.exports = router;
