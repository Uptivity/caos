// Mock Database Service for Testing
const crypto = require('crypto');

class MockDatabaseService {
    constructor() {
        this.data = {};
        this.isInitialized = false;
    }

    async initialize() {
        this.isInitialized = true;
    }

    async create(table, data) {
        // Initialize table if it doesn't exist
        if (!this.data[table]) {
            this.data[table] = [];
        }

        // Generate UUID for id field if not provided
        if (!data.id) {
            data.id = crypto.randomUUID();
        }

        // Add timestamps if not provided
        const now = new Date().toISOString();
        if (!data.created_at) data.created_at = now;
        if (!data.updated_at) data.updated_at = now;

        // Store the record
        const record = { ...data };
        this.data[table].push(record);

        return record;
    }

    async findById(table, id) {
        if (!this.data[table]) {
            return null;
        }

        return this.data[table].find(record => record.id === id) || null;
    }

    async find(table, conditions = {}) {
        if (!this.data[table]) {
            return [];
        }

        if (Object.keys(conditions).length === 0) {
            return this.data[table];
        }

        return this.data[table].filter(record => {
            return Object.keys(conditions).every(key =>
                record[key] === conditions[key]
            );
        });
    }

    async update(table, id, updates) {
        if (!this.data[table]) {
            return null;
        }

        const index = this.data[table].findIndex(record => record.id === id);
        if (index === -1) {
            return null;
        }

        // Update the record
        const updatedRecord = {
            ...this.data[table][index],
            ...updates,
            updated_at: new Date().toISOString()
        };

        this.data[table][index] = updatedRecord;
        return updatedRecord;
    }

    async delete(table, id) {
        if (!this.data[table]) {
            return false;
        }

        const index = this.data[table].findIndex(record => record.id === id);
        if (index === -1) {
            return false;
        }

        this.data[table].splice(index, 1);
        return true;
    }

    async count(table) {
        if (!this.data[table]) {
            return 0;
        }
        return this.data[table].length;
    }

    async query(sql, params = []) {
        // Simple mock query implementation
        return { affectedRows: 1, insertId: crypto.randomUUID() };
    }

    async getHealth() {
        return {
            status: 'healthy',
            connection: 'mock',
            timestamp: new Date().toISOString()
        };
    }

    // Test helper methods
    clearTable(table) {
        if (this.data[table]) {
            this.data[table] = [];
        }
    }

    clearAllData() {
        this.data = {};
    }

    getTableData(table) {
        return this.data[table] || [];
    }

    addTestData(table, records) {
        if (!this.data[table]) {
            this.data[table] = [];
        }

        if (Array.isArray(records)) {
            this.data[table].push(...records);
        } else {
            this.data[table].push(records);
        }
    }
}

// Create singleton mock instance
const mockDatabaseService = new MockDatabaseService();

module.exports = mockDatabaseService;