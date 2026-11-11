import { Router } from "express";
import {
    updateMemberRole,
    removeTeamMember,
} from "../controllers/teamController.js";

import {
    createTeamInvitation,
    getTeamInvitations,
    revokeTeamInvitation,
} from "../controllers/teamInvitationController.js";

import requireAuth from "../middleware/requireAuth.js";
import requireTeamMember from "../middleware/requireTeamMember.js";
import requireTeamRole from "../middleware/requireTeamRole.js";

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

router.patch(
    "/:teamId/members/:memberId",
    requireTeamMember,
    requireTeamRole("ADMIN", "PROJECT_MANAGER"),
    updateMemberRole
);

router.delete(
    "/:teamId/members/:memberId",
    requireTeamMember,
    requireTeamRole("ADMIN", "PROJECT_MANAGER"),
    removeTeamMember
);

router.get(
    "/:teamId/invitations",
    requireTeamMember,
    requireTeamRole("ADMIN", "PROJECT_MANAGER"),
    getTeamInvitations
);

router.post(
    "/:teamId/invitations",
    requireTeamMember,
    requireTeamRole("ADMIN", "PROJECT_MANAGER"),
    createTeamInvitation
);

router.delete(
    "/:teamId/invitations/:inviteId",
    requireTeamMember,
    requireTeamRole("ADMIN", "PROJECT_MANAGER"),
    revokeTeamInvitation
);

export default router;

