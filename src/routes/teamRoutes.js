import { Router } from "express";

import requireAuth from "../middleware/requireAuth.js";
import requireTeamMember from "../middleware/requireTeamMember.js";

import {
    createTeam,
    getTeams,
    getTeam,
    getTeamMembers,
} from "../controllers/teamController.js";

const router = Router();

// All team routes require authentication.
router.use(requireAuth);

// Team creation and listing
router.post("/", createTeam);
router.get("/", getTeams);

// Team-specific routes require membership.
router.get("/:teamId", requireTeamMember, getTeam);
router.get("/:teamId/members", requireTeamMember, getTeamMembers);

export default router;

