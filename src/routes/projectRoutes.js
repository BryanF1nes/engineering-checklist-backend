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

export default router;
