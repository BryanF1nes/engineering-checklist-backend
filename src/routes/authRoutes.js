import { Router } from 'express';
import {
    register,
    login,
    refresh,
    logout,
} from '../controllers/authController.js';
import requireAuth from '../middleware/requireAuth.js';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/logout', logout);
router.post('/refresh', refresh);

router.get('/me', requireAuth, (req, res) => {
    return res.status(200).json({
        user: req.user,
    });
});

export default router;
