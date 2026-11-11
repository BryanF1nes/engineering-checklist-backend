import prisma from "../config/prisma.js";

export default async function requireTeamMember(req, res, next) {
    try {
        const { teamId } = req.params;

        if (!teamId) {
            return res.status(400).json({
                message: "Team ID is required.",
            });
        }

        const membership = await prisma.teamMember.findUnique({
            where: {
                teamId_userId: {
                    teamId,
                    userId: req.user.id,
                },
            },
            include: {
                team: true,
            },
        });

        if (!membership) {
            return res.status(403).json({
                message: "You do not have access to this team.",
            });
        }

        req.team = membership.team;
        req.teamMembership = membership;

        next();
    } catch (error) {
        next(error);
    }
}

