import { Router } from 'express';
import requireAuth from '../middleware/requireAuth.js';

import { acceptInvitation } from '../controllers/invitationController.js';

const router = Router();

router.post('/:token/accept', requireAuth, acceptInvitation);

export default router;
