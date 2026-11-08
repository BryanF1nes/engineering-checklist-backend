import { verifyAccessToken } from '../utils/tokens.js';

export default function requireAuth(req, res, next) {
    const [scheme, token] = (req.headers.authorization || '').split(' ');

    if (scheme !== 'Bearer' || !token) {
        return res.status(401).json({
            message: 'You must be logged in to access this resource.',
        });
    }

    try {
        const decoded = verifyAccessToken(token);

        req.user = {
            id: decoded.id,
            firstName: decoded.firstName,
            lastName: decoded.lastName,
            email: decoded.email,
            avatarColor: decoded.avatarColor ?? null,
        };

        next();
    } catch (error) {
        return res.status(401).json({
            message: 'Invalid or expired access token.',
        });
    }
}
