import { Router } from 'express';
import requireAuth from '../middleware/requireAuth.js';
import requireProjectOwner from '../middleware/requireProjectOwner.js';

import {
    getProjects,
    getProject,
    createProject,
    updateProject,
    deleteProject
} from '../controllers/projectController.js';

import {
    createInvitation,
    getInvitations,
    revokeInvitation
} from '../controllers/invitationController.js';

const router = Router();

router.use(requireAuth);

// GET
router.get('/', getProjects);
router.get('/:id', getProject);

// POST
router.post('/', createProject);

// PATCH
router.patch('/:id', requireProjectOwner, updateProject);

// DELETE
router.delete('/:id', requireProjectOwner, deleteProject);

// Project Invitations
router.get('/:id/invitations', requireProjectOwner, getInvitations);
router.post('/:id/invitations', requireProjectOwner, createInvitation);
router.delete('/:id/invitations/:inviteId', requireProjectOwner, revokeInvitation);

export default router;
