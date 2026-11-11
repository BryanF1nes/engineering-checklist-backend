export default function requireTeamRole(...allowedRoles) {
    return function(req, res, next) {
        if (!req.teamMembership) {
            return res.status(500).json({
                message: "Team membership must be verified first.",
            });
        }

        if (!allowedRoles.includes(req.teamMembership.role)) {
            return res.status(403).json({
                message: "You do not have permission to perform this action.",
            });
        }

        next();
    };
}

