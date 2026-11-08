import jwt from 'jsonwebtoken';
import crypto from 'crypto';

export function generateAccessToken(user) {
    return jwt.sign(
        {
            id: user.id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            avatarColor: user.avatarColor ?? null,
        },
        process.env.JWT_ACCESS_SECRET,
        { expiresIn: '15m' }
    );
}

export function generateRefreshToken() {
    return crypto.randomBytes(64).toString('hex');
}

export function hashRefreshToken(token) {
    return crypto
        .createHash('sha256')
        .update(token)
        .digest('hex');
}

export function verifyAccessToken(token) {
    return jwt.verify(token, process.env.JWT_ACCESS_SECRET);
}
