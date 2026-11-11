import { randomBytes } from "node:crypto";
import prisma from "../config/prisma.js";

const validTeamRoles = [
    "ADMIN",
    "PROJECT_MANAGER",
    "PROJECT_LEAD",
    "CONTRIBUTOR",
    "VIEWER",
];

function createSlug(name) {
    const base = name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

    const suffix = randomBytes(3).toString("hex");

    return `${base || "team"}-${suffix}`;
}

export async function createTeam(req, res, next) {
    try {
        const { name } = req.body;

        if (typeof name !== "string" || !name.trim()) {
            return res.status(400).json({
                message: "Team name is required.",
            });
        }

        if (name.trim().length > 80) {
            return res.status(400).json({
                message: "Team name cannot exceed 80 characters.",
            });
        }

        const team = await prisma.$transaction(async (tx) => {
            const newTeam = await tx.team.create({
                data: {
                    name: name.trim(),
                    slug: createSlug(name),
                },
            });

            await tx.teamMember.create({
                data: {
                    teamId: newTeam.id,
                    userId: req.user.id,
                    role: "ADMIN",
                },
            });

            return newTeam;
        });

        return res.status(201).json({
            message: "Team created successfully.",
            team: {
                ...team,
                role: "ADMIN",
            },
        });
    } catch (error) {
        next(error);
    }
}

export async function getTeams(req, res, next) {
    try {
        const memberships = await prisma.teamMember.findMany({
            where: {
                userId: req.user.id,
            },
            include: {
                team: true,
            },
            orderBy: {
                joinedAt: "asc",
            },
        });

        const teams = memberships.map(({ team, role }) => ({
            ...team,
            role,
        }));

        return res.status(200).json({ teams });
    } catch (error) {
        next(error);
    }
}

export async function getTeam(req, res, next) {
    try {
        return res.status(200).json({
            team: {
                ...req.team,
                role: req.teamMembership.role,
            },
        });
    } catch (error) {
        next(error);
    }
}

export async function getTeamMembers(req, res, next) {
    try {
        const members = await prisma.teamMember.findMany({
            where: {
                teamId: req.team.id,
            },
            select: {
                id: true,
                role: true,
                joinedAt: true,
                user: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true,
                        avatarColor: true,
                    },
                },
            },
            orderBy: {
                joinedAt: "asc",
            },
        });

        return res.status(200).json({ members });
    } catch (error) {
        next(error);
    }
}

export async function updateMemberRole(req, res, next) {
    try {
        const { memberId } = req.params;
        const { role } = req.body;
        const actorRole = req.teamMembership.role;

        if (!validTeamRoles.includes(role)) {
            return res.status(400).json({
                message: "Invalid team role.",
            });
        }

        // Project Managers cannot grant elevated management roles.
        if (
            actorRole === "PROJECT_MANAGER" &&
            ["ADMIN", "PROJECT_MANAGER"].includes(role)
        ) {
            return res.status(403).json({
                message: "Project Managers cannot assign Admin or Project Manager roles.",
            });
        }

        const result = await prisma.$transaction(async (tx) => {
            // Serialize membership changes for this team.
            await tx.$queryRaw`
                SELECT "id" FROM "Team"
                WHERE "id" = ${req.team.id}
                FOR UPDATE
            `;

            const target = await tx.teamMember.findFirst({
                where: {
                    id: memberId,
                    teamId: req.team.id,
                },
            });

            if (!target) {
                return {
                    error: "Team member not found.",
                    status: 404,
                };
            }

            if (
                actorRole === "PROJECT_MANAGER" &&
                ["ADMIN", "PROJECT_MANAGER"].includes(target.role)
            ) {
                return {
                    error: "Project Managers cannot change an Admin or another Project Manager.",
                    status: 403,
                };
            }

            // Never allow the team to lose its last Admin.
            if (target.role === "ADMIN" && role !== "ADMIN") {
                const adminCount = await tx.teamMember.count({
                    where: {
                        teamId: req.team.id,
                        role: "ADMIN",
                    },
                });

                if (adminCount <= 1) {
                    return {
                        error: "The team must have at least one Admin.",
                        status: 409,
                    };
                }
            }

            const member = await tx.teamMember.update({
                where: { id: target.id },
                data: { role },
                select: {
                    id: true,
                    role: true,
                    joinedAt: true,
                    user: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            email: true,
                            avatarColor: true,
                        },
                    },
                },
            });

            return { member };
        });

        if (result.error) {
            return res.status(result.status).json({
                message: result.error,
            });
        }

        return res.status(200).json({
            message: "Team member role updated successfully.",
            member: result.member,
        });
    } catch (error) {
        next(error);
    }
}

export async function removeTeamMember(req, res, next) {
    try {
        const { memberId } = req.params;
        const actorRole = req.teamMembership.role;

        const result = await prisma.$transaction(async (tx) => {
            await tx.$queryRaw`
                SELECT "id" FROM "Team"
                WHERE "id" = ${req.team.id}
                FOR UPDATE
            `;

            const target = await tx.teamMember.findFirst({
                where: {
                    id: memberId,
                    teamId: req.team.id,
                },
            });

            if (!target) {
                return {
                    error: "Team member not found.",
                    status: 404,
                };
            }

            if (target.userId === req.user.id) {
                return {
                    error: "Use the leave-team action to remove yourself.",
                    status: 409,
                };
            }

            if (
                actorRole === "PROJECT_MANAGER" &&
                ["ADMIN", "PROJECT_MANAGER"].includes(target.role)
            ) {
                return {
                    error: "Project Managers cannot remove an Admin or another Project Manager.",
                    status: 403,
                };
            }

            if (target.role === "ADMIN") {
                const adminCount = await tx.teamMember.count({
                    where: {
                        teamId: req.team.id,
                        role: "ADMIN",
                    },
                });

                if (adminCount <= 1) {
                    return {
                        error: "The last Admin cannot be removed.",
                        status: 409,
                    };
                }
            }

            const projects = await tx.project.findMany({
                where: { teamId: req.team.id },
                select: { id: true },
            });

            const projectIds = projects.map(project => project.id);

            // Remove assignments belonging to this team's projects.
            await tx.checklistItem.updateMany({
                where: {
                    projectId: { in: projectIds },
                    assignedTo: target.userId,
                },
                data: { assignedTo: null },
            });

            // Remove project lead references.
            await tx.project.updateMany({
                where: {
                    teamId: req.team.id,
                    projectLeadId: target.userId,
                },
                data: { projectLeadId: null },
            });

            await tx.teamMember.delete({
                where: { id: target.id },
            });

            return { userId: target.userId };
        });

        if (result.error) {
            return res.status(result.status).json({
                message: result.error,
            });
        }

        return res.status(200).json({
            message: "Team member removed successfully.",
            userId: result.userId,
        });
    } catch (error) {
        next(error);
    }
}

