import crypto from "crypto";
import bcrypt from "bcrypt";
import prisma from "../config/prisma.js";

import {
    generateAccessToken,
    generateRefreshToken,
    hashRefreshToken,
} from "../utils/tokens.js";

const REFRESH_TOKEN_DURATION = 7 * 24 * 60 * 60 * 1000;

export async function login(req, res, next) {
    try {
        const { email, password } = req.body;

        if (
            typeof email !== 'string' ||
            typeof password !== 'string' ||
            !email.trim() ||
            !password
        ) {
            return res.status(400).json({
                message: 'Email and password are required.',
            });
        }

        const normalizedEmail = email.trim().toLowerCase();

        const user = await prisma.user.findUnique({
            where: { email: normalizedEmail },
        });

        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({
                message: 'Invalid email or password.',
            });
        }

        const refreshToken = generateRefreshToken();
        const familyId = crypto.randomUUID();

        await prisma.refreshToken.create({
            data: {
                tokenHash: hashRefreshToken(refreshToken),
                familyId,
                userId: user.id,
                expiresAt: new Date(Date.now() + REFRESH_TOKEN_DURATION),
            },
        });

        const safeUser = {
            id: user.id,
            name: user.name,
            email: user.email,
        };

        return res.status(200).json({
            message: 'Login successful.',
            user: safeUser,
            accessToken: generateAccessToken(safeUser),
            refreshToken,
        });
    } catch (error) {
        next(error);
    }
}

export async function refresh(req, res, next) {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(400).json({
                message: 'Refresh token is required.',
            });
        }

        const tokenHash = hashRefreshToken(refreshToken);

        const storedToken = await prisma.refreshToken.findUnique({
            where: { tokenHash },
            include: { user: true },
        });

        if (!storedToken) {
            return res.status(401).json({
                message: 'Invalid refresh token.',
            });
        }

        // A previously revoked token was reused.
        // Revoke every token belonging to that login session.
        if (storedToken.revokedAt) {
            await prisma.refreshToken.updateMany({
                where: {
                    familyId: storedToken.familyId,
                    revokedAt: null,
                },
                data: { revokedAt: new Date() },
            });

            return res.status(401).json({
                message: 'Refresh token reuse detected. Please log in again.',
            });
        }

        if (storedToken.expiresAt <= new Date()) {
            await prisma.refreshToken.updateMany({
                where: {
                    id: storedToken.id,
                    revokedAt: null,
                },
                data: { revokedAt: new Date() },
            });

            return res.status(401).json({
                message: 'Refresh token has expired. Please log in again.',
            });
        }

        const newRefreshToken = generateRefreshToken();

        // Atomically revoke the old token and create its replacement.
        const rotation = await prisma.$transaction(async (tx) => {
            const revoked = await tx.refreshToken.updateMany({
                where: {
                    id: storedToken.id,
                    revokedAt: null,
                },
                data: { revokedAt: new Date() },
            });

            if (revoked.count !== 1) {
                return false;
            }

            await tx.refreshToken.create({
                data: {
                    tokenHash: hashRefreshToken(newRefreshToken),
                    familyId: storedToken.familyId,
                    userId: storedToken.userId,
                    expiresAt: new Date(Date.now() + REFRESH_TOKEN_DURATION),
                },
            });

            return true;
        });

        if (!rotation) {
            return res.status(401).json({
                message: 'Refresh token is no longer valid. Please log in again.',
            });
        }

        const safeUser = {
            id: storedToken.user.id,
            name: storedToken.user.name,
            email: storedToken.user.email,
        };

        return res.status(200).json({
            accessToken: generateAccessToken(safeUser),
            refreshToken: newRefreshToken,
            user: safeUser,
        });
    } catch (error) {
        next(error);
    }
}

export async function logout(req, res, next) {
    try {
        const { refreshToken } = req.body;

        if (refreshToken) {
            await prisma.refreshToken.updateMany({
                where: {
                    tokenHash: hashRefreshToken(refreshToken),
                    revokedAt: null,
                },
                data: { revokedAt: new Date() },
            });
        }

        return res.status(200).json({
            message: 'Logout successful.',
        });
    } catch (error) {
        next(error);
    }
}

export async function register(req, res, next) {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({
                message: 'All fields are required.'
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                message: 'Password must be at least 8 characters.',
            });
        }

        const normalizedEmail = email.trim().toLowerCase();
        const existingUser = await prisma.user.findUnique({
            where: { email: normalizedEmail },
        });

        if (existingUser) {
            return res.status(409).json({
                message: 'An account with this email already exists.',
            })
        };

        const passwordHash = await bcrypt.hash(password, 12);

        const user = await prisma.user.create({
            data: {
                name: name.trim(),
                email: normalizedEmail,
                password: passwordHash
            },
            select: {
                id: true,
                name: true,
                email: true,
                createdAt: true,
            },
        });

        return res.status(201).json({
            message: 'Account created successfully.', user
        });
    } catch (error) {
        next(error);
    }
}
