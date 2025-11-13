import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Authentication service for handling JWT tokens and user authentication
 */
class AuthService {
    constructor() {
        this.jwtSecret = process.env.JWT_SECRET || 'fallback-jwt-secret-key-for-development';
        this.jwtRefreshSecret = process.env.JWT_REFRESH_SECRET || 'fallback-refresh-secret-key-for-development';
        this.jwtExpiresIn = process.env.JWT_EXPIRES_IN || '15m';
        this.jwtRefreshExpiresIn = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

        // Warn if using fallback secrets
        if (!process.env.JWT_SECRET) {
            console.warn('⚠️  JWT_SECRET not found in environment variables, using fallback');
        }
        if (!process.env.JWT_REFRESH_SECRET) {
            console.warn('⚠️  JWT_REFRESH_SECRET not found in environment variables, using fallback');
        }

        // Path to users data file
        this.usersFilePath = path.join(__dirname, '../../data/users.json');
        
        // In-memory users map (loaded from file)
        this.users = new Map();
        
        // Store for refresh tokens (in production, use Redis or database)
        this.refreshTokens = new Set();
        
        // Load users from file
        this.loadUsers();
    }

    /**
     * Load users from JSON file
     */
    async loadUsers() {
        try {
            const data = await fs.readFile(this.usersFilePath, 'utf8');
            const usersArray = JSON.parse(data);
            
            // Convert array to Map with username as key
            this.users = new Map(
                usersArray.map(user => [user.username, user])
            );
            
            console.log(`✅ Loaded ${this.users.size} users from file`);
        } catch (error) {
            console.error('Error loading users from file:', error.message);
            console.log('⚠️  Starting with empty user list');
            this.users = new Map();
        }
    }

    /**
     * Save users to JSON file
     */
    async saveUsers() {
        try {
            const usersArray = Array.from(this.users.values());
            await fs.writeFile(
                this.usersFilePath, 
                JSON.stringify(usersArray, null, 2), 
                'utf8'
            );
            console.log(`✅ Saved ${usersArray.length} users to file`);
        } catch (error) {
            console.error('Error saving users to file:', error);
        }
    }

    /**
     * Authenticate user with username/email and password
     * @param {string} identifier - Username or email
     * @param {string} password - Plain text password
     * @returns {Promise<Object|null>} User object without password or null
     */
    async authenticateUser(identifier, password) {
        try {
            // Find user by username or email
            const user = Array.from(this.users.values()).find(
                u => u.username === identifier || u.email === identifier
            );

            if (!user) {
                return null;
            }

            // Verify password
            const isValidPassword = await bcrypt.compare(password, user.password);
            if (!isValidPassword) {
                return null;
            }

            // Return user without password
            const { password: _, ...userWithoutPassword } = user;
            return userWithoutPassword;
        } catch (error) {
            console.error('Authentication error:', error);
            return null;
        }
    }

    /**
     * Generate JWT access token
     * @param {Object} user - User object
     * @returns {string} JWT token
     */
    generateAccessToken(user) {
        const payload = {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role
        };

        return jwt.sign(payload, this.jwtSecret, {
            expiresIn: this.jwtExpiresIn,
            issuer: 'document-uploader-api',
            subject: user.id.toString()
        });
    }

    /**
     * Generate JWT refresh token
     * @param {Object} user - User object
     * @returns {string} JWT refresh token
     */
    generateRefreshToken(user) {
        const payload = {
            id: user.id,
            username: user.username,
            type: 'refresh'
        };

        const token = jwt.sign(payload, this.jwtRefreshSecret, {
            expiresIn: this.jwtRefreshExpiresIn,
            issuer: 'document-uploader-api',
            subject: user.id.toString()
        });

        // Store refresh token
        this.refreshTokens.add(token);

        return token;
    }

    /**
     * Verify JWT access token
     * @param {string} token - JWT token
     * @returns {Object|null} Decoded token payload or null
     */
    verifyAccessToken(token) {
        try {
            return jwt.verify(token, this.jwtSecret);
        } catch (error) {
            console.error('Token verification error:', error.message);
            return null;
        }
    }

    /**
     * Verify JWT refresh token
     * @param {string} token - JWT refresh token
     * @returns {Object|null} Decoded token payload or null
     */
    verifyRefreshToken(token) {
        try {
            // Check if refresh token exists in our store
            if (!this.refreshTokens.has(token)) {
                return null;
            }

            return jwt.verify(token, this.jwtRefreshSecret);
        } catch (error) {
            console.error('Refresh token verification error:', error.message);
            return null;
        }
    }

    /**
     * Refresh access token using refresh token
     * @param {string} refreshToken - Valid refresh token
     * @returns {Object|null} New tokens or null
     */
    async refreshAccessToken(refreshToken) {
        try {
            const decoded = this.verifyRefreshToken(refreshToken);
            if (!decoded) {
                return null;
            }

            // Get user data
            const user = Array.from(this.users.values()).find(u => u.id === decoded.id);
            if (!user) {
                return null;
            }

            // Generate new access token
            const { password: _, ...userWithoutPassword } = user;
            const newAccessToken = this.generateAccessToken(userWithoutPassword);

            return {
                accessToken: newAccessToken,
                refreshToken: refreshToken, // Keep the same refresh token
                user: userWithoutPassword
            };
        } catch (error) {
            console.error('Token refresh error:', error);
            return null;
        }
    }

    /**
     * Revoke refresh token (logout)
     * @param {string} refreshToken - Refresh token to revoke
     * @returns {boolean} Success status
     */
    revokeRefreshToken(refreshToken) {
        return this.refreshTokens.delete(refreshToken);
    }

    /**
     * Get user by ID
     * @param {number} userId - User ID
     * @returns {Object|null} User object without password or null
     */
    getUserById(userId) {
        const user = Array.from(this.users.values()).find(u => u.id === userId);
        if (!user) {
            return null;
        }

        const { password: _, ...userWithoutPassword } = user;
        return userWithoutPassword;
    }

    /**
     * Hash password
     * @param {string} password - Plain text password
     * @returns {Promise<string>} Hashed password
     */
    async hashPassword(password) {
        return bcrypt.hash(password, 10);
    }

    /**
     * Register a new user
     * @param {Object} userData - User registration data
     * @param {string} userData.username - Username
     * @param {string} userData.email - Email address
     * @param {string} userData.password - Plain text password
     * @returns {Promise<Object|null>} Created user without password or null if failed
     */
    async registerUser(userData) {
        console.log('Registering user with data:', userData);
        try {
            const { username, email, password } = userData;

            // Validation
            if (!username || !email || !password) {
                throw new Error('Username, email, and password are required');
            }

            if (password.length < 6) {
                throw new Error('Password must be at least 6 characters long');
            }

            // Check if username already exists
            if (this.users.has(username)) {
                throw new Error('Username already exists');
            }

            // Check if email already exists
            const existingUser = Array.from(this.users.values()).find(u => u.email === email);
            if (existingUser) {
                throw new Error('Email already exists');
            }

            // Hash password
            const hashedPassword = await this.hashPassword(password);

            // Generate new user ID
            const newUserId = Math.max(...Array.from(this.users.values()).map(u => u.id)) + 1;

            // Create new user
            const newUser = {
                id: newUserId,
                username,
                email,
                password: hashedPassword,
                role: 'user', // Default role
                createdAt: new Date().toISOString()
            };

            // Store user
            this.users.set(username, newUser);
            console.log('New user registered:', this.users);
            
            // Save to file
            await this.saveUsers();
            
            // Return user without password
            const { password: _, ...userWithoutPassword } = newUser;
            return userWithoutPassword;
        } catch (error) {
            console.error('User registration error:', error);
            throw error;
        }
    }

    /**
     * Check if username is available
     * @param {string} username - Username to check
     * @returns {boolean} True if available, false if taken
     */
    isUsernameAvailable(username) {
        return !this.users.has(username);
    }

    /**
     * Check if email is available
     * @param {string} email - Email to check
     * @returns {boolean} True if available, false if taken
     */
    isEmailAvailable(email) {
        const existingUser = Array.from(this.users.values()).find(u => u.email === email);
        return !existingUser;
    }

    /**
     * Get all users (admin only, for testing)
     * @returns {Array} Array of users without passwords
     */
    getAllUsers() {
        return Array.from(this.users.values()).map(user => {
            const { password: _, ...userWithoutPassword } = user;
            return userWithoutPassword;
        });
    }
}

export default new AuthService();