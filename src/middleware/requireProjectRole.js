import prisma from '../config/prisma.js';

export default function requireProjectRole(...allowedRoles) {
    return async function(req, res, next) {
        try {
            const userId = req.user.id;
            const project = req.project;

            // Project owners automatically have full permissions.
            if (project.ownerId === userId) {
                return next();
            }

            const membership = await prisma.projectMember.findUnique({
                where: {
                    projectId_userId: {
                        projectId: project.id,
                        userId,
                    },
                },
                select: {
                    role: true,
                },
            });

            req.projectRole = membership?.role;

            if (!membership || !allowedRoles.includes(membership.role)) {
                return res.status(403).json({
                    message: 'You do not have permission to perform this action.',
                });
            }

            next();
        } catch (error) {
            next(error);
        }
    };
}
