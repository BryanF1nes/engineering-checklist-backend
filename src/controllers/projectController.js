import prisma from "../config/prisma.js";
import { getIO } from "../socket.js";

const validStages = [
    'TEN',
    'THIRTY',
    'SIXTY',
    'NINETY',
    'BID',
    'CONSTRUCTION'
];

const validStatuses = [
    'ONGOING',
    'COMPLETED'
]

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
                        name: true,
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
    try {
        const projectId = Number(req.params.id);
        const userId = req.user.id;

        // Validate the project ID
        if (!Number.isSafeInteger(projectId) || projectId <= 0) {
            return res.status(400).json({
                message: 'Invalid project ID.',
            });
        }

        const project = await prisma.project.findFirst({
            where: {
                id: projectId,
                OR: [
                    { ownerId: userId },
                    {
                        members: {
                            some: {
                                userId,
                            },
                        },
                    },
                ],
            },
            include: {
                owner: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
                members: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                name: true,
                            },
                        },
                    },
                },
                items: {
                    include: {
                        assignee: {
                            select: {
                                id: true,
                                name: true,
                            },
                        },
                        completedBy: {
                            select: {
                                id: true,
                                name: true,
                            },
                        },
                    },
                    orderBy: {
                        createdAt: 'desc',
                    },
                },
            },
        });

        if (!project) {
            return res.status(404).json({
                message: 'Project not found.',
            });
        }

        return res.status(200).json({
            project,
        });
    } catch (error) {
        next(error);
    }
}

export async function createProject(req, res, next) {
    try {
        const { name, description, code, stage } = req.body;
        const ownerId = req.user.id;

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

        if (code.trim().length > 10) {
            return res.status(400).json({
                message: 'Project code cannot exceed 10 characters.',
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
                projectCode: code,
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

export async function updateProject(req, res, next) {
    try {
        const { name, description, code, stage, status } = req.body;

        if (
            name === undefined &&
            description === undefined &&
            code === undefined &&
            stage === undefined &&
            status === undefined
        ) {
            return res.status(400).json({
                message: 'At least one field must be provided.',
            });
        }

        const data = {};

        if (name !== undefined) {
            if (typeof name !== 'string' || !name.trim()) {
                return res.status(400).json({
                    message: 'Project name cannot be empty.',
                });
            }

            if (name.trim().length > 100) {
                return res.status(400).json({
                    message: 'Project name cannot exceed 100 characters.',
                });
            }

            data.name = name.trim();
        }

        if (description !== undefined) {
            if (
                description !== null &&
                typeof description !== 'string'
            ) {
                return res.status(400).json({
                    message: 'Description must be a string or null.',
                });
            }

            if (description && description.length > 1000) {
                return res.status(400).json({
                    message: 'Description cannot exceed 1000 characters.',
                });
            }

            data.description = description?.trim() || null;
        }

        if (code !== undefined) {
            if (
                code !== null &&
                typeof code !== 'string'
            ) {
                return res.status(400).json({
                    message: 'Project code must be a string or null.',
                });
            }

            if (code && code.length > 10) {
                return res.status(400).json({
                    message: 'Project code cannot exceed 10 characters.',
                });
            }

            data.projectCode = code?.trim() || null;
        }

        if (stage !== undefined) {
            if (!validStages.includes(stage)) {
                return res.status(400).json({
                    message: 'Invalid project stage.',
                });
            }

            data.stage = stage;
        }

        if (status !== undefined) {
            if (!validStatuses.includes(status)) {
                return res.status(400).json({
                    message: 'Invalid project status.',
                });
            }

            data.status = status;
        }

        const project = await prisma.project.update({
            where: {
                id: req.project.id,
            },
            data,
        });

        getIO().to(`project:${project.id}`).emit(`project:updated`, {
            projectId: project.id,
        });

        return res.status(200).json({
            message: 'Project updated successfully.',
            project,
        });
    } catch (error) {
        next(error);
    }
}

export async function deleteProject(req, res, next) {
    try {
        await prisma.project.delete({
            where: {
                id: req.project.id,
            },
        });

        getIO().to(`project:${project.id}`).emit(`project:deleted`, {
            projectId: project.id,
        });

        return res.status(200).json({
            message: 'Project deleted successfully.',
        });
    } catch (error) {
        next(error);
    }
}
