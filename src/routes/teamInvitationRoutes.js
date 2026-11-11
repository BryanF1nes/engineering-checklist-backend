import { Router } from "express";

import requireAuth from "../middleware/requireAuth.js";

import {
    validateTeamInvitation,
    acceptTeamInvitation,
} from "../controllers/teamInvitationController.js";

const router = Router();

// Validation can be performed before logging in.
router.get("/:token", validateTeamInvitation);

// Accepting an invitation requires an authenticated account.
router.post("/:token/accept", requireAuth, acceptTeamInvitation);

export default router;

