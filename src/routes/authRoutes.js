import { Router } from 'express';
import requireAuth from '../middleware/requireAuth.js';

import {
    register,
    login,
    refresh,
    logout,
    getCurrentUser,
    updateAvatarColor,
} from '../controllers/authController.js';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/logout', logout);
router.post('/refresh', refresh);

router.patch('/me/avatar-color', requireAuth, updateAvatarColor);
router.get('/me', requireAuth, getCurrentUser);

export default router;
