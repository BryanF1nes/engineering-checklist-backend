import { randomBytes, createHash } from "node:crypto";
import prisma from "../config/prisma.js";

const INVITATION_EXPIRATION_DAYS = 7;

const validInviteRoles = [
    "ADMIN",
    "PROJECT_MANAGER",
    "PROJECT_LEAD",
    "CONTRIBUTOR",
    "VIEWER",
];

function hashToken(token) {
    return createHash("sha256")
        .update(token)
        .digest("hex");
}

export async function createTeamInvitation(req, res, next) {
    try {
        const { role = "CONTRIBUTOR", email } = req.body;

        if (!validInviteRoles.includes(role)) {
            return res.status(400).json({
                message: "Invalid invitation role.",
            });
        }

        // Only Admins can invite other Admins or Project Managers.
        if (
            req.teamMembership.role === "PROJECT_MANAGER" &&
            ["ADMIN", "PROJECT_MANAGER"].includes(role)
        ) {
            return res.status(403).json({
                message: "Only Admins can invite Admins or Project Managers.",
            });
        }

        if (
            email !== undefined &&
            email !== null &&
            (typeof email !== "string" || !email.trim())
        ) {
            return res.status(400).json({
                message: "Invitation email must be a valid email string.",
            });
        }

        const normalizedEmail = email?.trim().toLowerCase() || null;

        const token = randomBytes(32).toString("base64url");
        const tokenHash = hashToken(token);

        const expiresAt = new Date(
            Date.now() +
            INVITATION_EXPIRATION_DAYS * 24 * 60 * 60 * 1000
        );

        const invitation = await prisma.teamInvite.create({
            data: {
                teamId: req.team.id,
                tokenHash,
                email: normalizedEmail,
                role,
                createdById: req.user.id,
                expiresAt,
            },
            select: {
                id: true,
                teamId: true,
                email: true,
                role: true,
                expiresAt: true,
                createdAt: true,
            },
        });

        // Set FRONTEND_URL to the actual deployed application URL.
        let inviteUrl;

        try {
            inviteUrl = new URL(process.env.FRONTEND_URL);
        } catch {
            return res.status(500).json({
                message: "The frontend URL is not configured correctly.",
            })
        }

        inviteUrl.searchParams.set("teamInvite", token);

        return res.status(201).json({
            message: "Team invitation created successfully.",
            invitation: {
                ...invitation,
                token,
                inviteUrl: inviteUrl.toString(),
            },
        });
    } catch (error) {
        next(error);
    }
}

export async function getTeamInvitations(req, res, next) {
    try {
        const invitations = await prisma.teamInvite.findMany({
            where: {
                teamId: req.team.id,
            },
            select: {
                id: true,
                email: true,
                role: true,
                expiresAt: true,
                revokedAt: true,
                acceptedAt: true,
                createdAt: true,
                createdBy: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                    },
                },
            },
            orderBy: {
                createdAt: "desc",
            },
        });

        return res.status(200).json({
            count: invitations.length,
            invitations,
        });
    } catch (error) {
        next(error);
    }
}

export async function revokeTeamInvitation(req, res, next) {
    try {
        const { inviteId } = req.params;

        const invitation = await prisma.teamInvite.findFirst({
            where: {
                id: inviteId,
                teamId: req.team.id,
            },
        });

        if (!invitation) {
            return res.status(404).json({
                message: "Invitation not found.",
            });
        }

        if (invitation.revokedAt) {
            return res.status(409).json({
                message: "Invitation has already been revoked.",
            });
        }

        if (invitation.acceptedAt) {
            return res.status(409).json({
                message: "This invitation has already been accepted.",
            });
        }

        await prisma.teamInvite.update({
            where: { id: invitation.id },
            data: { revokedAt: new Date() },
        });

        return res.status(200).json({
            message: "Invitation revoked successfully.",
        });
    } catch (error) {
        next(error);
    }
}

export async function validateTeamInvitation(req, res, next) {
    try {
        const { token } = req.params;

        if (!token) {
            return res.status(400).json({
                message: "Invitation token is required.",
            });
        }

        const invitation = await prisma.teamInvite.findUnique({
            where: {
                tokenHash: hashToken(token),
            },
            include: {
                team: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            },
        });

        if (!invitation) {
            return res.status(404).json({
                message: "Invitation not found.",
            });
        }

        if (invitation.revokedAt) {
            return res.status(410).json({
                message: "This invitation has been revoked.",
            });
        }

        if (invitation.acceptedAt) {
            return res.status(409).json({
                message: "This invitation has already been accepted.",
            });
        }

        if (invitation.expiresAt <= new Date()) {
            return res.status(410).json({
                message: "This invitation has expired.",
            });
        }

        return res.status(200).json({
            valid: true,
            invitation: {
                team: invitation.team,
                role: invitation.role,
                emailRestricted: Boolean(invitation.email),
                expiresAt: invitation.expiresAt,
            },
        });
    } catch (error) {
        next(error);
    }
}

export async function acceptTeamInvitation(req, res, next) {
    try {
        const { token } = req.params;
        const tokenHash = hashToken(token);
        const now = new Date();

        const result = await prisma.$transaction(async (tx) => {
            const invitation = await tx.teamInvite.findUnique({
                where: { tokenHash },
                include: {
                    team: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },
                },
            });

            if (!invitation) {
                return {
                    error: "Invitation not found.",
                    status: 404,
                };
            }

            if (invitation.revokedAt) {
                return {
                    error: "This invitation has been revoked.",
                    status: 410,
                };
            }

            if (invitation.acceptedAt) {
                return {
                    error: "This invitation has already been accepted.",
                    status: 409,
                };
            }

            if (invitation.expiresAt <= now) {
                return {
                    error: "This invitation has expired.",
                    status: 410,
                };
            }

            if (
                invitation.email &&
                invitation.email.toLowerCase() !== req.user.email.toLowerCase()
            ) {
                return {
                    error: "This invitation is restricted to a different email address.",
                    status: 403,
                };
            }

            const existingMembership = await tx.teamMember.findUnique({
                where: {
                    teamId_userId: {
                        teamId: invitation.teamId,
                        userId: req.user.id,
                    },
                },
            });

            if (existingMembership) {
                return {
                    error: "You are already a member of this team.",
                    status: 409,
                };
            }

            // Claim the invitation exactly once. If another request has
            // already accepted/revoked it, this transaction does not proceed.
            const claimed = await tx.teamInvite.updateMany({
                where: {
                    id: invitation.id,
                    acceptedAt: null,
                    revokedAt: null,
                    expiresAt: { gt: now },
                },
                data: {
                    acceptedAt: now,
                },
            });

            if (claimed.count !== 1) {
                return {
                    error: "This invitation is no longer available.",
                    status: 409,
                };
            }

            const membership = await tx.teamMember.create({
                data: {
                    teamId: invitation.teamId,
                    userId: req.user.id,
                    role: invitation.role,
                },
                select: {
                    id: true,
                    teamId: true,
                    userId: true,
                    role: true,
                    joinedAt: true,
                },
            });

            return {
                membership,
                team: invitation.team,
            };
        });

        if (result.error) {
            return res.status(result.status).json({
                message: result.error,
            });
        }

        return res.status(201).json({
            message: "You have successfully joined the team.",
            membership: result.membership,
            team: result.team,
        });
    } catch (error) {
        if (error.code === "P2002") {
            return res.status(409).json({
                message: "You are already a member of this team.",
            });
        }

        next(error);
    }
}

