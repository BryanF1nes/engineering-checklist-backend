import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import bcrypt from 'bcrypt';

import prisma from './prisma.js';

passport.use(
    new LocalStrategy(
        {
            usernameField: 'email',
        },
        async (email, password, done) => {
            try {
                const user = await prisma.user.findUnique({
                    where: { email },
                });

                if (!user) {
                    return done(null, false);
                }

                const validPassword = await bcrypt.compare(
                    password,
                    user.password
                );

                if (!validPassword) {
                    return done(null, false);
                }

                return done(null, {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                });
            } catch (error) {
                return done(error);
            }
        }
    )
);

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id },
            select: {
                id: true,
                name: true,
                email: true,
            },
        });

        done(null, user || false);
    } catch (error) {
        done(error);
    }
});

export default passport;
