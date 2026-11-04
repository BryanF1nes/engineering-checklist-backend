import { Router } from 'express';
import requireAuth from '../middleware/requireAuth.js';
import requireProjectAccess from '../middleware/requireProjectAccess.js';
import requireProjectRole from '../middleware/requireProjectRole.js';
import {
    getProjectItems,
    getProjectItem,
    createProjectItem
} from "../controllers/projectItemController.js";

const router = Router({ mergeParams: true });

router.use(requireAuth, requireProjectAccess);

// GET
router.get('/', getProjectItems);
router.get('/:id', getProjectItem);

// POST
router.post('/', requireProjectRole('CONTRIBUTOR'), createProjectItem);

export default router;
