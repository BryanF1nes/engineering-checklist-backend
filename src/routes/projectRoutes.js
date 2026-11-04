import { Router } from 'express';
import requireAuth from '../middleware/requireAuth.js';
import {
    getProjects,
    getProject,
    createProject
} from '../controllers/projectController.js';

const router = Router();

// GET
router.get('/', requireAuth, getProjects);
router.get('/:id', requireAuth, getProject);

// POST
router.post('/', requireAuth, createProject);

export default router;
