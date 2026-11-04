import { Router } from 'express';
import requireAuth from '../middleware/requireAuth.js';
import requireProjectAccess from '../middleware/requireProjectAccess.js';
import requireProjectRole from '../middleware/requireProjectRole.js';

import {
    getProjectItems,
    getProjectItem,
    createProjectItem,
    updateProjectItem,
    deleteProjectItem
} from "../controllers/projectItemController.js";

const router = Router({ mergeParams: true });

router.use(requireAuth, requireProjectAccess);

// GET
router.get('/', getProjectItems);
router.get('/:id', getProjectItem);

// POST
router.post('/', requireProjectRole('CONTRIBUTOR'), createProjectItem);

// PATCH
router.patch('/:id', requireProjectRole('CONTRIBUTOR'), updateProjectItem);

// DELETE
router.delete('/:id', requireProjectRole('CONTRIBUTOR'), deleteProjectItem);

export default router;
