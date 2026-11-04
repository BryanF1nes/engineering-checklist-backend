import prisma from '../config/prisma.js';

export default async function requireProjectAccess(req, res, next) {
    try {
        const projectId = Number(req.params.projectId);

        if (!Number.isSafeInteger(projectId) || projectId <= 0) {
            return res.status(400).json({
                message: 'Invalid project ID.',
            });
        }

        const project = await prisma.project.findFirst({
            where: {
                id: projectId,
                OR: [
                    { ownerId: req.user.id },
                    {
                        members: {
                            some: {
                                userId: req.user.id,
                            },
                        },
                    },
                ],
            },
            select: {
                id: true,
                ownerId: true,
            },
        });

        if (!project) {
            return res.status(404).json({
                message: 'Project not found.',
            });
        }

        // Make the project available to subsequent middleware/controllers.
        req.project = project;

        next();
    } catch (error) {
        next(error);
    }
}
