import { randomBytes, createHash } from "node:crypto";
import prisma from "../config/prisma.js";

const validRoles = [
    'CONTRIBUTOR',
    'VIEWER',
];

const INVITATION_EXPIRATION_DAYS = 7;

export async function createInvitation(req, res, next) {
    try {
        const { role } = req.body;

        if (!validRoles.includes(role)) {
            return res.status(400).json({
                message: 'Invalid invitation role.',
            });
        }

        // Generate a secure invitation token.
        const token = randomBytes(32).toString('base64url');

        // Hash the token before storing it.
        const tokenHash = createHash('sha256')
            .update(token)
            .digest('hex');

        // Calculate expiration date.
        const expiresAt = new Date(
            Date.now() + INVITATION_EXPIRATION_DAYS * 24 * 60 * 60 * 1000
        );

        const invitation = await prisma.projectInvite.create({
            data: {
                projectId: req.project.id,
                createdById: req.user.id,
                tokenHash,
                expiresAt,
                role,
            },
            select: {
                id: true,
                projectId: true,
                role: true,
                expiresAt: true,
                createdAt: true,
            },
        });

        return res.status(201).json({
            message: 'Invitation created successfully.',
            invitation: {
                ...invitation,
                token,
            },
        });
    } catch (error) {
        next(error);
    }
}

export async function getInvitations(req, res, next) {
    try {
        const invitations = await prisma.projectInvite.findMany({
            where: {
                projectId: req.project.id,
            },
            select: {
                id: true,
                role: true,
                expiresAt: true,
                revokedAt: true,
                createdAt: true,
                createdBy: {
                    select: {
                        id: true,
                        username: true,
                    },
                },
            },
            orderBy: {
                createdAt: 'desc',
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

export async function revokeInvitation(req, res, next) {
    try {
        const inviteId = Number(req.params.inviteId);

        if (!Number.isSafeInteger(inviteId) || inviteId <= 0) {
            return res.status(400).json({
                message: 'Invalid invitation ID.',
            });
        }

        const invitation = await prisma.projectInvite.findFirst({
            where: {
                id: inviteId,
                projectId: req.project.id,
            },
        });

        if (!invitation) {
            return res.status(404).json({
                message: 'Invitation not found.',
            });
        }

        if (invitation.revokedAt) {
            return res.status(409).json({
                message: 'Invitation has already been revoked.',
            });
        }

        await prisma.projectInvite.update({
            where: {
                id: inviteId,
            },
            data: {
                revokedAt: new Date(),
            },
        });

        return res.status(200).json({
            message: 'Invitation revoked successfully.',
        });
    } catch (error) {
        next(error);
    }
}

export async function acceptInvitation(req, res, next) {
    try {
        const { token } = req.params;

        if (typeof token !== 'string' || !token.trim()) {
            return res.status(400).json({
                message: 'Invitation token is required.',
            });
        }

        // Hash the supplied token to look up the invitation.
        const tokenHash = createHash('sha256')
            .update(token)
            .digest('hex');

        const result = await prisma.$transaction(async (tx) => {
            // Find the invitation.
            const invitation = await tx.projectInvite.findUnique({
                where: {
                    tokenHash,
                },
                include: {
                    project: {
                        select: {
                            id: true,
                            name: true,
                            ownerId: true,
                        },
                    },
                },
            });

            if (!invitation) {
                return {
                    error: 'Invitation not found.',
                    status: 404,
                };
            }

            // Check whether the invitation has been revoked.
            if (invitation.revokedAt) {
                return {
                    error: 'This invitation has been revoked.',
                    status: 410,
                };
            }

            // Check whether the invitation has expired.
            if (invitation.expiresAt <= new Date()) {
                return {
                    error: 'This invitation has expired.',
                    status: 410,
                };
            }

            // Prevent the project owner from accepting their own invitation.
            if (invitation.project.ownerId === req.user.id) {
                return {
                    error: 'Project owners cannot accept their own invitations.',
                    status: 409,
                };
            }

            // Check whether the user is already a project member.
            const existingMembership = await tx.projectMember.findUnique({
                where: {
                    projectId_userId: {
                        projectId: invitation.projectId,
                        userId: req.user.id,
                    },
                },
            });

            if (existingMembership) {
                return {
                    error: 'You are already a member of this project.',
                    status: 409,
                };
            }

            // Create project membership using the invitation's assigned role.
            const membership = await tx.projectMember.create({
                data: {
                    projectId: invitation.projectId,
                    userId: req.user.id,
                    role: invitation.role,
                },
                select: {
                    id: true,
                    projectId: true,
                    userId: true,
                    role: true,
                    joinedAt: true,
                },
            });

            return {
                membership,
                project: invitation.project,
            };
        });

        if (result.error) {
            return res.status(result.status).json({
                message: result.error,
            });
        }

        return res.status(201).json({
            message: 'You have successfully joined the project.',
            membership: result.membership,
            project: {
                id: result.project.id,
                name: result.project.name,
            },
        });
    } catch (error) {
        // Handle concurrent requests attempting to create the same membership.
        if (error.code === 'P2002') {
            return res.status(409).json({
                message: 'You are already a member of this project.',
            });
        }

        next(error);
    }
}
