
import request from 'supertest';
import app from '../src/app.js';
import prisma from '../src/config/prisma.js';

describe('Authentication routes', () => {
    const testId = Date.now();

    const password = 'TestPassword123!';

    const testUser = {
        username: 'auth_test_user',
        email: `auth_${testId}@example.com`,
        password,
    };

    // Keep track of accounts created during these tests.
    const createdEmails = [];

    let authenticatedAgent;

    // Helper: register a user.
    async function registerUser(user) {
        const response = await request(app)
            .post('/auth/register')
            .send(user);

        if (response.statusCode === 201) {
            createdEmails.push(user.email.toLowerCase());
        }

        return response;
    }

    // Helper: log in and retain the session cookie.
    async function loginUser(email, password) {
        const agent = request.agent(app);

        const response = await agent
            .post('/auth/login')
            .send({
                email,
                password,
            });

        return { agent, response };
    }

    beforeAll(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw new Error(
                'Tests must run with NODE_ENV=test.'
            );
        }

        // Create a user that can be reused by authentication tests.
        const registerResponse = await registerUser(testUser);

        expect(registerResponse.statusCode).toBe(201);

        // Establish an authenticated session.
        const login = await loginUser(
            testUser.email,
            testUser.password
        );

        expect(login.response.statusCode).toBe(200);

        authenticatedAgent = login.agent;
    });

    afterAll(async () => {
        try {
            await prisma.user.deleteMany({
                where: {
                    email: {
                        in: createdEmails,
                    },
                },
            });
        } finally {
            await prisma.$disconnect();
        }
    });

    describe('POST /auth/register', () => {
        it('should successfully register a new user', async () => {
            const response = await registerUser({
                username: 'new_test_user',
                email: `new_${testId}@example.com`,
                password,
            });

            expect(response.statusCode).toBe(201);
        });

        it('should reject registration when required fields are missing', async () => {
            const response = await request(app)
                .post('/auth/register')
                .send({
                    username: 'missing_email_user',
                    password,
                });

            expect(response.statusCode).toBe(400);
        });

        it('should reject passwords shorter than 8 characters', async () => {
            const response = await request(app)
                .post('/auth/register')
                .send({
                    username: 'short_password_user',
                    email: `short_${testId}@example.com`,
                    password: 'short',
                });

            expect(response.statusCode).toBe(400);
        });

        it('should reject an email address that is already registered', async () => {
            const response = await request(app)
                .post('/auth/register')
                .send(testUser);

            expect(response.statusCode).toBe(409);
        });
    });

    describe('POST /auth/login', () => {
        it('should successfully log in with valid credentials', async () => {
            const { response } = await loginUser(
                testUser.email,
                testUser.password
            );

            expect(response.statusCode).toBe(200);
            expect(response.body).toHaveProperty('user');
            expect(response.body.user).toHaveProperty('id');
            expect(response.body.user.email).toBe(testUser.email);
        });

        it('should reject an incorrect password', async () => {
            const { response } = await loginUser(
                testUser.email,
                'IncorrectPassword123!'
            );

            expect(response.statusCode).toBe(401);
        });

        it('should reject an email address that does not exist', async () => {
            const { response } = await loginUser(
                `unknown_${testId}@example.com`,
                password
            );

            expect(response.statusCode).toBe(401);
        });

        it('should reject missing credentials', async () => {
            const response = await request(app)
                .post('/auth/login')
                .send({
                    email: testUser.email,
                });

            expect(response.statusCode).toBe(400);
        });
    });

    describe('GET /auth/me', () => {
        it('should reject unauthenticated users', async () => {
            const response = await request(app)
                .get('/auth/me');

            expect(response.statusCode).toBe(401);

            expect(response.body).toHaveProperty(
                'message',
                'You must be logged in to access this resource.'
            );
        });

        it('should return the authenticated user', async () => {
            const response = await authenticatedAgent
                .get('/auth/me');

            expect(response.statusCode).toBe(200);

            // Supports either { user: {...} } or a directly returned user.
            const user = response.body.user ?? response.body;

            expect(user).toMatchObject({
                username: testUser.username,
                email: testUser.email,
            });

            expect(user).toHaveProperty('id');
            expect(user).not.toHaveProperty('passwordHash');
        });
    });

    describe('POST /auth/logout', () => {
        it('should successfully log out an authenticated user', async () => {
            // Use a separate session so we don't affect other tests.
            const { agent, response: loginResponse } = await loginUser(
                testUser.email,
                testUser.password
            );

            expect(loginResponse.statusCode).toBe(200);

            const logoutResponse = await agent
                .post('/auth/logout');

            expect(logoutResponse.statusCode).toBe(200);

            // The session should no longer be authenticated.
            const meResponse = await agent
                .get('/auth/me');

            expect(meResponse.statusCode).toBe(401);
        });

        it('should reject unauthenticated users attempting to log out', async () => {
            const response = await request(app)
                .post('/auth/logout');

            expect(response.statusCode).toBe(401);
        });
    });
});

