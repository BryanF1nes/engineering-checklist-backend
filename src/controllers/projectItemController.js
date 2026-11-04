import prisma from '../config/prisma.js';

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
                        username: true,
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
                        username: true,
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

        return res.status(201).json({
            message: 'Checklist item created successfully.',
            item,
        });
    } catch (error) {
        next(error);
    }
}
