import bcrypt from "bcrypt";
import prisma from "../config/prisma.js";

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
