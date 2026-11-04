import { Router } from 'express';
import { register } from '../controllers/authController.js';
import passport from "../config/passport.js";
import requireAuth from '../middleware/requireAuth.js';

const router = Router();

router.post('/register', register);
router.post('/login', passport.authenticate('local'),
    (req, res) => {
        return res.status(200).json({
            message: 'Login successful.',
            user: req.user,
        });
    }
);
router.post('/logout', requireAuth, (req, res, next) => {
    req.logout((error) => {
        if (error) {
            return next(error);
        }

        req.session.destroy((error) => {
            if (error) {
                return next(error);
            }

            res.clearCookie('connect.sid');

            return res.status(200).json({
                message: 'Logout successful.',
            });
        });
    });
});

router.get('/me', requireAuth, (req, res) => {
    return res.status(200).json({
        user: req.user,
    });
});

export default router;
