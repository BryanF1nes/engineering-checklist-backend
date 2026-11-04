import prisma from "../config/prisma.js";

export async function getProjects(req, res, next) {
    try {
        const userId = req.user.id;

        const projects = await prisma.project.findMany({
            where: {
                OR: [
                    { ownerId: userId },
                    {
                        members: {
                            some: { userId, },
                        },
                    },
                ],
            },
            include: {
                owner: {
                    select: {
                        id: true,
                        username: true,
                    },
                },
                _count: {
                    select: {
                        items: true,
                        members: true,
                    },
                },
            },
            orderBy: {
                updatedAt: 'desc',
            },
        });

        return res.status(200).json({
            count: projects.length,
            projects,
        });
    } catch (error) {
        next(error)
    }
}

export async function getProject(req, res, next) {
}

export async function createProject(req, res, next) {
    try {
        const { name, description, stage } = req.body;
        const ownerId = req.user.id;
        const validStages = [
            'TEN',
            'THIRTY',
            'SIXTY',
            'NINETY',
            'BID',
            'CONSTRUCTION',
        ];

        if (!name || !name.trim()) {
            return res.status(400).json({
                message: 'Project name is required.',
            });
        }

        if (name.trim().length > 100) {
            return res.status(400).json({
                message: 'Project name cannot exceed 100 characters.',
            });
        }

        if (description && description.length > 1000) {
            return res.status(400).json({
                message: 'Description cannot exceed 1000 characters.',
            });
        }

        if (stage && !validStages.includes(stage)) {
            return res.status(400).json({
                message: 'Invalid project stage.',
            });
        }

        const project = await prisma.project.create({
            data: {
                name: name.trim(),
                description: description?.trim() || null,
                stage,
                ownerId
            }
        });

        return res.status(201).json({
            message: 'Projet created successfully.',
            project,
        });
    } catch (error) {
        next(error);
    }
}
