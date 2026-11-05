import prisma from '../config/prisma.js';
import { getIO } from '../socket.js';

const validStatuses = [
    'ONGOING',
    'COMPLETED'
];

export async function getProjectItems(req, res, next) {
    try {
        const items = await prisma.checklistItem.findMany({
            where: {
                projectId: req.project.id,
            },
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
        });

        return res.status(200).json({
            count: items.length,
            items,
        });
    } catch (error) {
        next(error);
    }
}


export async function getProjectItem(req, res, next) {
    try {
        const itemId = Number(req.params.id);

        if (!Number.isSafeInteger(itemId) || itemId <= 0) {
            return res.status(400).json({
                message: 'Invalid checklist item ID.',
            });
        }

        const item = await prisma.checklistItem.findFirst({
            where: {
                id: itemId,
                projectId: req.project.id,
            },
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
                project: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            },
        });

        if (!item) {
            return res.status(404).json({
                message: 'Checklist item not found.',
            });
        }

        return res.status(200).json({ item });
    } catch (error) {
        next(error);
    }
}


export async function createProjectItem(req, res, next) {
    try {
        const { title, dueDate } = req.body;

        if (typeof title !== 'string' || !title.trim()) {
            return res.status(400).json({
                message: 'Checklist item title is required.',
            });
        }

        if (title.trim().length > 200) {
            return res.status(400).json({
                message: 'Checklist item title cannot exceed 200 characters.',
            });
        }

        if (dueDate !== undefined && dueDate !== null) {
            if (
                typeof dueDate !== 'string' ||
                Number.isNaN(Date.parse(dueDate))
            ) {
                return res.status(400).json({
                    message: 'Invalid due date.',
                });
            }
        }

        const item = await prisma.checklistItem.create({
            data: {
                title: title.trim(),
                dueDate: dueDate ? new Date(dueDate) : null,
                projectId: req.project.id,
            },
        });

        getIO().to(`project:${req.project.id}`).emit('item:created', {
            projectId: req.project.id,
            itemId: item.id,
        });

        return res.status(201).json({
            message: 'Checklist item created successfully.',
            item,
        });
    } catch (error) {
        next(error);
    }
}


export async function updateProjectItem(req, res, next) {
    try {
        const itemId = Number(req.params.id);

        if (!Number.isSafeInteger(itemId) || itemId <= 0) {
            return res.status(400).json({
                message: 'Invalid checklist item ID.',
            });
        }

        const { title, status, dueDate, assignedTo } = req.body;

        if (
            req.projectRole === 'VIEWER' &&
            Object.keys(req.body).some(field => field !== 'status')
        ) {
            return res.status(403).json({
                message: 'Viewers can only update checklist item status.',
            });
        }

        if (
            title === undefined &&
            status === undefined &&
            dueDate === undefined &&
            assignedTo === undefined
        ) {
            return res.status(400).json({
                message: 'At least one field must be provided.',
            });
        }

        const existingItem = await prisma.checklistItem.findFirst({
            where: {
                id: itemId,
                projectId: req.project.id,
            },
        });

        if (!existingItem) {
            return res.status(404).json({
                message: 'Checklist item not found.',
            });
        }

        const data = {};

        if (title !== undefined) {
            if (typeof title !== 'string' || !title.trim()) {
                return res.status(400).json({
                    message: 'Checklist item title cannot be empty.',
                });
            }

            if (title.trim().length > 200) {
                return res.status(400).json({
                    message: 'Checklist item title cannot exceed 200 characters.',
                });
            }

            data.title = title.trim();
        }

        if (status !== undefined) {
            if (!validStatuses.includes(status)) {
                return res.status(400).json({
                    message: 'Invalid checklist item status.',
                });
            }

            data.status = status;

            if (
                status === 'COMPLETED' &&
                existingItem.status !== 'COMPLETED'
            ) {
                data.completedAt = new Date();
                data.completedById = req.user.id;
            } else if (status === 'ONGOING') {
                data.completedAt = null;
                data.completedById = null;
            }
        }

        if (dueDate !== undefined) {
            if (dueDate !== null) {
                if (
                    typeof dueDate !== 'string' ||
                    Number.isNaN(Date.parse(dueDate))
                ) {
                    return res.status(400).json({
                        message: 'Invalid due date.',
                    });
                }

                data.dueDate = new Date(dueDate);
            } else {
                data.dueDate = null;
            }
        }

        if (assignedTo !== undefined) {
            if (assignedTo === null) {
                data.assignedTo = null;
            } else {
                if (!Number.isSafeInteger(assignedTo) || assignedTo <= 0) {
                    return res.status(400).json({
                        message: 'Invalid assignee ID.',
                    });
                }

                const assignee = await prisma.user.findFirst({
                    where: {
                        id: assignedTo,
                        OR: [
                            {
                                ownedProjects: {
                                    some: {
                                        id: req.project.id,
                                    },
                                },
                            },
                            {
                                memberships: {
                                    some: {
                                        projectId: req.project.id,
                                    },
                                },
                            },
                        ],
                    },
                    select: {
                        id: true,
                    },
                });

                if (!assignee) {
                    return res.status(400).json({
                        message: 'Assignee must have access to this project.',
                    });
                }

                data.assignedTo = assignee.id;
            }
        }

        const item = await prisma.checklistItem.update({
            where: {
                id: itemId,
            },
            data,
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
        });

        getIO().to(`project:${req.project.id}`).emit('item:updated', {
            projectId: req.project.id,
            itemId: item.id,
        });

        return res.status(200).json({
            message: 'Checklist item updated successfully.',
            item,
        });
    } catch (error) {
        next(error);
    }
}


export async function deleteProjectItem(req, res, next) {
    try {
        const itemId = Number(req.params.id);

        if (!Number.isSafeInteger(itemId) || itemId <= 0) {
            return res.status(400).json({
                message: 'Invalid checklist item ID.',
            });
        }

        const existingItem = await prisma.checklistItem.findFirst({
            where: {
                id: itemId,
                projectId: req.project.id,
            },
        });

        if (!existingItem) {
            return res.status(404).json({
                message: 'Checklist item not found.',
            });
        }

        await prisma.checklistItem.delete({
            where: {
                id: itemId,
            },
        });

        getIO().to(`project:${req.project.id}`).emit('item:deleted', {
            projectId: req.project.id,
            itemId,
        });

        return res.status(200).json({
            message: 'Checklist item deleted successfully.',
        });
    } catch (error) {
        next(error);
    }
}

