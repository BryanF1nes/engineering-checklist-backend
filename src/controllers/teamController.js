import { randomBytes } from "node:crypto";
import prisma from "../config/prisma.js";

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

