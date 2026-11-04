import request from 'supertest';
import app from '../src/app.js';

describe('Authentication routes', () => {
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
    });
});
