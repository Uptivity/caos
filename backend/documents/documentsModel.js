const crypto = require('crypto');
const path = require('path');

// In-memory storage for documents
const documents = new Map();
const folders = new Map();
const documentVersions = new Map();
const documentShares = new Map();
const documentComments = new Map();
const documentTags = new Map();
const recentDocuments = new Map(); // userId -> array of document IDs

// Helper function to generate IDs
function generateId(prefix = 'doc') {
    return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

// Document types
const DOCUMENT_TYPES = {
    TEXT: 'text',
    SPREADSHEET: 'spreadsheet',
    PRESENTATION: 'presentation',
    PDF: 'pdf',
    IMAGE: 'image',
    VIDEO: 'video',
    AUDIO: 'audio',
    CODE: 'code',
    ARCHIVE: 'archive',
    OTHER: 'other'
};

// Permission levels
const PERMISSION_LEVELS = {
    OWNER: 'owner',
    EDIT: 'edit',
    COMMENT: 'comment',
    VIEW: 'view',
    NONE: 'none'
};

// Share types
const SHARE_TYPES = {
    PRIVATE: 'private',
    TEAM: 'team',
    PUBLIC: 'public',
    LINK: 'link'
};

// Get file type from extension
function getFileType(filename) {
    const ext = path.extname(filename).toLowerCase();
    const typeMap = {
        '.txt': DOCUMENT_TYPES.TEXT,
        '.doc': DOCUMENT_TYPES.TEXT,
        '.docx': DOCUMENT_TYPES.TEXT,
        '.rtf': DOCUMENT_TYPES.TEXT,
        '.xls': DOCUMENT_TYPES.SPREADSHEET,
        '.xlsx': DOCUMENT_TYPES.SPREADSHEET,
        '.csv': DOCUMENT_TYPES.SPREADSHEET,
        '.ppt': DOCUMENT_TYPES.PRESENTATION,
        '.pptx': DOCUMENT_TYPES.PRESENTATION,
        '.pdf': DOCUMENT_TYPES.PDF,
        '.jpg': DOCUMENT_TYPES.IMAGE,
        '.jpeg': DOCUMENT_TYPES.IMAGE,
        '.png': DOCUMENT_TYPES.IMAGE,
        '.gif': DOCUMENT_TYPES.IMAGE,
        '.svg': DOCUMENT_TYPES.IMAGE,
        '.mp4': DOCUMENT_TYPES.VIDEO,
        '.avi': DOCUMENT_TYPES.VIDEO,
        '.mov': DOCUMENT_TYPES.VIDEO,
        '.mp3': DOCUMENT_TYPES.AUDIO,
        '.wav': DOCUMENT_TYPES.AUDIO,
        '.js': DOCUMENT_TYPES.CODE,
        '.py': DOCUMENT_TYPES.CODE,
        '.java': DOCUMENT_TYPES.CODE,
        '.cpp': DOCUMENT_TYPES.CODE,
        '.html': DOCUMENT_TYPES.CODE,
        '.css': DOCUMENT_TYPES.CODE,
        '.zip': DOCUMENT_TYPES.ARCHIVE,
        '.rar': DOCUMENT_TYPES.ARCHIVE,
        '.tar': DOCUMENT_TYPES.ARCHIVE,
        '.gz': DOCUMENT_TYPES.ARCHIVE
    };
    return typeMap[ext] || DOCUMENT_TYPES.OTHER;
}

// Format file size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Document model
class DocumentsModel {
    // Create a new document
    static async create(documentData, uploadedBy) {
        const document = {
            id: generateId('doc'),
            name: documentData.name,
            description: documentData.description || '',
            type: documentData.type || getFileType(documentData.name),
            size: documentData.size || 0,
            sizeFormatted: formatFileSize(documentData.size || 0),
            mimeType: documentData.mimeType || 'application/octet-stream',
            folderId: documentData.folderId || null,
            teamId: documentData.teamId || null,

            // File information
            content: documentData.content || '',
            url: documentData.url || null,
            thumbnailUrl: documentData.thumbnailUrl || null,

            // Metadata
            metadata: {
                createdAt: new Date().toISOString(),
                createdBy: uploadedBy,
                modifiedAt: new Date().toISOString(),
                modifiedBy: uploadedBy,
                lastAccessedAt: new Date().toISOString(),
                accessCount: 0,
                downloadCount: 0,
                version: 1,
                isDeleted: false,
                deletedAt: null,
                deletedBy: null
            },

            // Permissions
            permissions: {
                owner: uploadedBy,
                public: false,
                shareType: SHARE_TYPES.PRIVATE,
                allowDownload: true,
                allowPrint: true,
                allowCopy: true,
                expiresAt: null,
                password: null
            },

            // Organization
            tags: documentData.tags || [],
            categories: documentData.categories || [],
            relatedTo: documentData.relatedTo || null, // leadId, taskId, etc.
            relatedType: documentData.relatedType || null, // 'lead', 'task', 'campaign', etc.

            // Search
            searchKeywords: documentData.searchKeywords || [],
            isStarred: false,
            isPinned: false
        };

        documents.set(document.id, document);

        // Initialize version history
        const version = {
            id: generateId('ver'),
            documentId: document.id,
            version: 1,
            name: document.name,
            size: document.size,
            content: document.content,
            createdAt: new Date().toISOString(),
            createdBy: uploadedBy,
            comment: 'Initial version',
            changes: []
        };

        if (!documentVersions.has(document.id)) {
            documentVersions.set(document.id, []);
        }
        documentVersions.get(document.id).push(version);

        // Add to recent documents
        this.addToRecent(uploadedBy, document.id);

        return document;
    }

    // Get document by ID
    static async getById(documentId, userId) {
        const document = documents.get(documentId);
        if (!document || document.metadata.isDeleted) {
            return null;
        }

        // Check permissions
        const permission = await this.checkPermission(documentId, userId);
        if (permission === PERMISSION_LEVELS.NONE) {
            return null;
        }

        // Update access metadata
        document.metadata.lastAccessedAt = new Date().toISOString();
        document.metadata.accessCount++;
        documents.set(documentId, document);

        // Add to recent documents
        this.addToRecent(userId, documentId);

        return {
            ...document,
            userPermission: permission,
            versions: documentVersions.get(documentId) || [],
            shares: documentShares.get(documentId) || [],
            comments: documentComments.get(documentId) || []
        };
    }

    // Get all documents for a user
    static async getUserDocuments(userId, options = {}) {
        const userDocs = [];

        for (const [docId, doc] of documents.entries()) {
            if (doc.metadata.isDeleted) continue;

            const permission = await this.checkPermission(docId, userId);
            if (permission !== PERMISSION_LEVELS.NONE) {
                userDocs.push({
                    ...doc,
                    userPermission: permission
                });
            }
        }

        // Apply filters
        let filteredDocs = [...userDocs];

        if (options.type) {
            filteredDocs = filteredDocs.filter(d => d.type === options.type);
        }

        if (options.folderId !== undefined) {
            filteredDocs = filteredDocs.filter(d => d.folderId === options.folderId);
        }

        if (options.teamId) {
            filteredDocs = filteredDocs.filter(d => d.teamId === options.teamId);
        }

        if (options.starred) {
            filteredDocs = filteredDocs.filter(d => d.isStarred);
        }

        if (options.search) {
            const searchLower = options.search.toLowerCase();
            filteredDocs = filteredDocs.filter(d =>
                d.name.toLowerCase().includes(searchLower) ||
                d.description.toLowerCase().includes(searchLower) ||
                d.tags.some(t => t.toLowerCase().includes(searchLower)) ||
                d.searchKeywords.some(k => k.toLowerCase().includes(searchLower))
            );
        }

        // Sort
        const sortBy = options.sortBy || 'modifiedAt';
        const sortOrder = options.sortOrder || 'desc';

        filteredDocs.sort((a, b) => {
            let aVal, bVal;

            if (sortBy === 'name') {
                aVal = a.name.toLowerCase();
                bVal = b.name.toLowerCase();
            } else if (sortBy === 'size') {
                aVal = a.size;
                bVal = b.size;
            } else if (sortBy === 'type') {
                aVal = a.type;
                bVal = b.type;
            } else {
                aVal = new Date(a.metadata[sortBy]);
                bVal = new Date(b.metadata[sortBy]);
            }

            if (sortOrder === 'asc') {
                return aVal > bVal ? 1 : -1;
            } else {
                return aVal < bVal ? 1 : -1;
            }
        });

        // Pagination
        const page = options.page || 1;
        const limit = options.limit || 20;
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;

        return {
            documents: filteredDocs.slice(startIndex, endIndex),
            total: filteredDocs.length,
            page,
            totalPages: Math.ceil(filteredDocs.length / limit)
        };
    }

    // Update document
    static async update(documentId, updates, userId) {
        const document = documents.get(documentId);
        if (!document || document.metadata.isDeleted) {
            throw new Error('Document not found');
        }

        // Check permission
        const permission = await this.checkPermission(documentId, userId);
        if (permission !== PERMISSION_LEVELS.OWNER && permission !== PERMISSION_LEVELS.EDIT) {
            throw new Error('Insufficient permissions to edit document');
        }

        // Create new version if content changed
        if (updates.content && updates.content !== document.content) {
            const versions = documentVersions.get(documentId) || [];
            const newVersion = {
                id: generateId('ver'),
                documentId,
                version: versions.length + 1,
                name: updates.name || document.name,
                size: updates.size || document.size,
                content: updates.content,
                createdAt: new Date().toISOString(),
                createdBy: userId,
                comment: updates.versionComment || 'Updated content',
                changes: updates.changes || []
            };
            versions.push(newVersion);
            documentVersions.set(documentId, versions);
            document.metadata.version = newVersion.version;
        }

        // Update allowed fields
        const allowedFields = ['name', 'description', 'content', 'size', 'folderId', 'tags', 'categories'];
        allowedFields.forEach(field => {
            if (updates[field] !== undefined) {
                document[field] = updates[field];
            }
        });

        if (updates.size) {
            document.sizeFormatted = formatFileSize(updates.size);
        }

        // Update metadata
        document.metadata.modifiedAt = new Date().toISOString();
        document.metadata.modifiedBy = userId;

        documents.set(documentId, document);
        return document;
    }

    // Delete document
    static async delete(documentId, userId) {
        const document = documents.get(documentId);
        if (!document) {
            throw new Error('Document not found');
        }

        // Check permission
        const permission = await this.checkPermission(documentId, userId);
        if (permission !== PERMISSION_LEVELS.OWNER) {
            throw new Error('Only the owner can delete this document');
        }

        // Soft delete
        document.metadata.isDeleted = true;
        document.metadata.deletedAt = new Date().toISOString();
        document.metadata.deletedBy = userId;
        documents.set(documentId, document);

        return { message: 'Document deleted successfully' };
    }

    // Create folder
    static async createFolder(folderData, userId) {
        const folder = {
            id: generateId('folder'),
            name: folderData.name,
            description: folderData.description || '',
            parentId: folderData.parentId || null,
            teamId: folderData.teamId || null,
            color: folderData.color || '#4F46E5',
            icon: folderData.icon || '📁',
            metadata: {
                createdAt: new Date().toISOString(),
                createdBy: userId,
                modifiedAt: new Date().toISOString(),
                modifiedBy: userId,
                documentCount: 0,
                totalSize: 0,
                isDeleted: false
            },
            permissions: {
                owner: userId,
                public: false,
                shareType: SHARE_TYPES.PRIVATE
            }
        };

        folders.set(folder.id, folder);
        return folder;
    }

    // Get folder structure
    static async getFolders(userId, parentId = null) {
        const userFolders = [];

        for (const [folderId, folder] of folders.entries()) {
            if (folder.metadata.isDeleted) continue;
            if (folder.parentId !== parentId) continue;

            // Check if user has access
            if (folder.permissions.owner === userId ||
                folder.permissions.public ||
                folder.permissions.shareType === SHARE_TYPES.TEAM) {

                // Calculate document count and size
                let documentCount = 0;
                let totalSize = 0;

                for (const [docId, doc] of documents.entries()) {
                    if (!doc.metadata.isDeleted && doc.folderId === folderId) {
                        documentCount++;
                        totalSize += doc.size;
                    }
                }

                folder.metadata.documentCount = documentCount;
                folder.metadata.totalSize = totalSize;
                folder.metadata.totalSizeFormatted = formatFileSize(totalSize);
                folders.set(folderId, folder);

                userFolders.push(folder);
            }
        }

        return userFolders.sort((a, b) => a.name.localeCompare(b.name));
    }

    // Move document to folder
    static async moveToFolder(documentId, folderId, userId) {
        const document = documents.get(documentId);
        if (!document || document.metadata.isDeleted) {
            throw new Error('Document not found');
        }

        // Check permission
        const permission = await this.checkPermission(documentId, userId);
        if (permission !== PERMISSION_LEVELS.OWNER && permission !== PERMISSION_LEVELS.EDIT) {
            throw new Error('Insufficient permissions to move document');
        }

        // Verify folder exists if provided
        if (folderId && !folders.has(folderId)) {
            throw new Error('Folder not found');
        }

        document.folderId = folderId;
        document.metadata.modifiedAt = new Date().toISOString();
        document.metadata.modifiedBy = userId;
        documents.set(documentId, document);

        return document;
    }

    // Share document
    static async share(documentId, shareData, sharedBy) {
        const document = documents.get(documentId);
        if (!document || document.metadata.isDeleted) {
            throw new Error('Document not found');
        }

        // Check permission
        const permission = await this.checkPermission(documentId, sharedBy);
        if (permission !== PERMISSION_LEVELS.OWNER) {
            throw new Error('Only the owner can share this document');
        }

        const share = {
            id: generateId('share'),
            documentId,
            sharedWith: shareData.userId || shareData.email || shareData.teamId,
            shareType: shareData.type || SHARE_TYPES.LINK,
            permission: shareData.permission || PERMISSION_LEVELS.VIEW,
            message: shareData.message || '',
            expiresAt: shareData.expiresAt || null,
            password: shareData.password || null,
            allowDownload: shareData.allowDownload !== false,
            allowPrint: shareData.allowPrint !== false,
            allowCopy: shareData.allowCopy !== false,
            shareLink: shareData.type === SHARE_TYPES.LINK ?
                `https://crm.example.com/shared/${document.id}/${generateId('token')}` : null,
            createdAt: new Date().toISOString(),
            createdBy: sharedBy,
            accessCount: 0,
            lastAccessedAt: null
        };

        if (!documentShares.has(documentId)) {
            documentShares.set(documentId, []);
        }
        documentShares.get(documentId).push(share);

        // Update document share settings
        if (shareData.type === SHARE_TYPES.PUBLIC) {
            document.permissions.public = true;
            document.permissions.shareType = SHARE_TYPES.PUBLIC;
        } else if (shareData.type === SHARE_TYPES.TEAM && !document.permissions.public) {
            document.permissions.shareType = SHARE_TYPES.TEAM;
        }
        documents.set(documentId, document);

        return share;
    }

    // Get document shares
    static async getShares(documentId, userId) {
        const document = documents.get(documentId);
        if (!document || document.metadata.isDeleted) {
            throw new Error('Document not found');
        }

        // Check permission
        const permission = await this.checkPermission(documentId, userId);
        if (permission !== PERMISSION_LEVELS.OWNER) {
            throw new Error('Only the owner can view shares');
        }

        return documentShares.get(documentId) || [];
    }

    // Revoke share
    static async revokeShare(documentId, shareId, userId) {
        const document = documents.get(documentId);
        if (!document || document.metadata.isDeleted) {
            throw new Error('Document not found');
        }

        // Check permission
        const permission = await this.checkPermission(documentId, userId);
        if (permission !== PERMISSION_LEVELS.OWNER) {
            throw new Error('Only the owner can revoke shares');
        }

        const shares = documentShares.get(documentId) || [];
        const updatedShares = shares.filter(s => s.id !== shareId);
        documentShares.set(documentId, updatedShares);

        // Update document permissions if needed
        if (updatedShares.length === 0) {
            document.permissions.public = false;
            document.permissions.shareType = SHARE_TYPES.PRIVATE;
            documents.set(documentId, document);
        }

        return { message: 'Share revoked successfully' };
    }

    // Add comment
    static async addComment(documentId, commentData, userId) {
        const document = documents.get(documentId);
        if (!document || document.metadata.isDeleted) {
            throw new Error('Document not found');
        }

        // Check permission
        const permission = await this.checkPermission(documentId, userId);
        if (permission === PERMISSION_LEVELS.NONE) {
            throw new Error('No permission to comment on this document');
        }

        const comment = {
            id: generateId('comment'),
            documentId,
            userId,
            text: commentData.text,
            parentId: commentData.parentId || null, // For replies
            mentions: commentData.mentions || [],
            attachments: commentData.attachments || [],
            createdAt: new Date().toISOString(),
            modifiedAt: new Date().toISOString(),
            isEdited: false,
            isDeleted: false,
            reactions: []
        };

        if (!documentComments.has(documentId)) {
            documentComments.set(documentId, []);
        }
        documentComments.get(documentId).push(comment);

        return comment;
    }

    // Get comments
    static async getComments(documentId, userId) {
        const document = documents.get(documentId);
        if (!document || document.metadata.isDeleted) {
            throw new Error('Document not found');
        }

        // Check permission
        const permission = await this.checkPermission(documentId, userId);
        if (permission === PERMISSION_LEVELS.NONE) {
            throw new Error('No permission to view comments');
        }

        const comments = documentComments.get(documentId) || [];

        // Build comment tree (for nested replies)
        const commentMap = new Map();
        const rootComments = [];

        comments.forEach(comment => {
            if (!comment.isDeleted) {
                commentMap.set(comment.id, { ...comment, replies: [] });
            }
        });

        commentMap.forEach(comment => {
            if (comment.parentId && commentMap.has(comment.parentId)) {
                commentMap.get(comment.parentId).replies.push(comment);
            } else if (!comment.parentId) {
                rootComments.push(comment);
            }
        });

        return rootComments;
    }

    // Get document versions
    static async getVersions(documentId, userId) {
        const document = documents.get(documentId);
        if (!document || document.metadata.isDeleted) {
            throw new Error('Document not found');
        }

        // Check permission
        const permission = await this.checkPermission(documentId, userId);
        if (permission === PERMISSION_LEVELS.NONE) {
            throw new Error('No permission to view versions');
        }

        return documentVersions.get(documentId) || [];
    }

    // Restore version
    static async restoreVersion(documentId, versionId, userId) {
        const document = documents.get(documentId);
        if (!document || document.metadata.isDeleted) {
            throw new Error('Document not found');
        }

        // Check permission
        const permission = await this.checkPermission(documentId, userId);
        if (permission !== PERMISSION_LEVELS.OWNER && permission !== PERMISSION_LEVELS.EDIT) {
            throw new Error('Insufficient permissions to restore version');
        }

        const versions = documentVersions.get(documentId) || [];
        const version = versions.find(v => v.id === versionId);

        if (!version) {
            throw new Error('Version not found');
        }

        // Create new version from restored one
        const restoredVersion = {
            ...version,
            id: generateId('ver'),
            version: versions.length + 1,
            createdAt: new Date().toISOString(),
            createdBy: userId,
            comment: `Restored from version ${version.version}`
        };

        versions.push(restoredVersion);
        documentVersions.set(documentId, versions);

        // Update document
        document.name = version.name;
        document.content = version.content;
        document.size = version.size;
        document.sizeFormatted = formatFileSize(version.size);
        document.metadata.version = restoredVersion.version;
        document.metadata.modifiedAt = new Date().toISOString();
        document.metadata.modifiedBy = userId;

        documents.set(documentId, document);
        return document;
    }

    // Star/unstar document
    static async toggleStar(documentId, userId) {
        const document = documents.get(documentId);
        if (!document || document.metadata.isDeleted) {
            throw new Error('Document not found');
        }

        // Check permission
        const permission = await this.checkPermission(documentId, userId);
        if (permission === PERMISSION_LEVELS.NONE) {
            throw new Error('No permission to star document');
        }

        document.isStarred = !document.isStarred;
        documents.set(documentId, document);

        return {
            starred: document.isStarred,
            message: document.isStarred ? 'Document starred' : 'Document unstarred'
        };
    }

    // Search documents
    static async search(query, userId, options = {}) {
        const searchResults = [];
        const searchLower = query.toLowerCase();

        for (const [docId, doc] of documents.entries()) {
            if (doc.metadata.isDeleted) continue;

            const permission = await this.checkPermission(docId, userId);
            if (permission === PERMISSION_LEVELS.NONE) continue;

            // Search in multiple fields
            const searchFields = [
                doc.name,
                doc.description,
                ...doc.tags,
                ...doc.searchKeywords,
                ...doc.categories
            ];

            const matches = searchFields.some(field =>
                field && field.toLowerCase().includes(searchLower)
            );

            if (matches) {
                searchResults.push({
                    ...doc,
                    userPermission: permission,
                    relevance: this.calculateRelevance(doc, searchLower)
                });
            }
        }

        // Sort by relevance
        searchResults.sort((a, b) => b.relevance - a.relevance);

        // Apply filters
        let filteredResults = [...searchResults];

        if (options.type) {
            filteredResults = filteredResults.filter(d => d.type === options.type);
        }

        if (options.dateFrom) {
            filteredResults = filteredResults.filter(d =>
                new Date(d.metadata.modifiedAt) >= new Date(options.dateFrom)
            );
        }

        if (options.dateTo) {
            filteredResults = filteredResults.filter(d =>
                new Date(d.metadata.modifiedAt) <= new Date(options.dateTo)
            );
        }

        // Pagination
        const page = options.page || 1;
        const limit = options.limit || 20;
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;

        return {
            results: filteredResults.slice(startIndex, endIndex),
            total: filteredResults.length,
            page,
            totalPages: Math.ceil(filteredResults.length / limit)
        };
    }

    // Calculate search relevance
    static calculateRelevance(document, searchTerm) {
        let score = 0;

        // Name match (highest weight)
        if (document.name.toLowerCase().includes(searchTerm)) {
            score += 10;
            if (document.name.toLowerCase().startsWith(searchTerm)) {
                score += 5;
            }
        }

        // Description match
        if (document.description.toLowerCase().includes(searchTerm)) {
            score += 5;
        }

        // Tag match
        document.tags.forEach(tag => {
            if (tag.toLowerCase().includes(searchTerm)) {
                score += 3;
            }
        });

        // Recent access bonus
        const daysSinceAccess = (Date.now() - new Date(document.metadata.lastAccessedAt)) / (1000 * 60 * 60 * 24);
        if (daysSinceAccess < 1) score += 3;
        else if (daysSinceAccess < 7) score += 2;
        else if (daysSinceAccess < 30) score += 1;

        // Starred bonus
        if (document.isStarred) score += 2;

        return score;
    }

    // Get recent documents
    static async getRecent(userId, limit = 10) {
        const recentIds = recentDocuments.get(userId) || [];
        const recent = [];

        for (const docId of recentIds.slice(0, limit)) {
            const doc = documents.get(docId);
            if (doc && !doc.metadata.isDeleted) {
                const permission = await this.checkPermission(docId, userId);
                if (permission !== PERMISSION_LEVELS.NONE) {
                    recent.push({
                        ...doc,
                        userPermission: permission
                    });
                }
            }
        }

        return recent;
    }

    // Add to recent documents
    static addToRecent(userId, documentId) {
        if (!recentDocuments.has(userId)) {
            recentDocuments.set(userId, []);
        }

        const recent = recentDocuments.get(userId);

        // Remove if already exists
        const existingIndex = recent.indexOf(documentId);
        if (existingIndex > -1) {
            recent.splice(existingIndex, 1);
        }

        // Add to beginning
        recent.unshift(documentId);

        // Keep only last 50
        if (recent.length > 50) {
            recent.pop();
        }

        recentDocuments.set(userId, recent);
    }

    // Check user permission for document
    static async checkPermission(documentId, userId) {
        const document = documents.get(documentId);
        if (!document) {
            return PERMISSION_LEVELS.NONE;
        }

        // Owner has full access
        if (document.permissions.owner === userId) {
            return PERMISSION_LEVELS.OWNER;
        }

        // Check shares
        const shares = documentShares.get(documentId) || [];
        for (const share of shares) {
            if (share.sharedWith === userId) {
                return share.permission;
            }
        }

        // Check public access
        if (document.permissions.public) {
            return PERMISSION_LEVELS.VIEW;
        }

        // Check team access (simplified - would need team membership check)
        if (document.permissions.shareType === SHARE_TYPES.TEAM && document.teamId) {
            // In production, check if user is member of document.teamId
            return PERMISSION_LEVELS.VIEW;
        }

        return PERMISSION_LEVELS.NONE;
    }

    // Get statistics
    static async getStatistics(userId = null) {
        const stats = {
            totalDocuments: 0,
            totalSize: 0,
            documentsByType: {},
            recentActivity: [],
            topTags: {},
            storageUsed: 0,
            storageLimit: 10 * 1024 * 1024 * 1024 // 10GB default
        };

        for (const [docId, doc] of documents.entries()) {
            if (doc.metadata.isDeleted) continue;

            if (userId) {
                const permission = await this.checkPermission(docId, userId);
                if (permission === PERMISSION_LEVELS.NONE) continue;
            }

            stats.totalDocuments++;
            stats.totalSize += doc.size;

            // Count by type
            if (!stats.documentsByType[doc.type]) {
                stats.documentsByType[doc.type] = 0;
            }
            stats.documentsByType[doc.type]++;

            // Count tags
            doc.tags.forEach(tag => {
                if (!stats.topTags[tag]) {
                    stats.topTags[tag] = 0;
                }
                stats.topTags[tag]++;
            });

            // Recent activity
            if (stats.recentActivity.length < 10) {
                stats.recentActivity.push({
                    documentId: doc.id,
                    name: doc.name,
                    action: 'modified',
                    timestamp: doc.metadata.modifiedAt,
                    user: doc.metadata.modifiedBy
                });
            }
        }

        stats.totalSizeFormatted = formatFileSize(stats.totalSize);
        stats.storageUsed = stats.totalSize;
        stats.storageUsedFormatted = formatFileSize(stats.storageUsed);
        stats.storageLimitFormatted = formatFileSize(stats.storageLimit);
        stats.storageUsagePercent = Math.round((stats.storageUsed / stats.storageLimit) * 100);

        // Sort top tags
        stats.topTags = Object.entries(stats.topTags)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .reduce((obj, [tag, count]) => {
                obj[tag] = count;
                return obj;
            }, {});

        // Sort recent activity
        stats.recentActivity.sort((a, b) =>
            new Date(b.timestamp) - new Date(a.timestamp)
        );

        return stats;
    }
}

module.exports = DocumentsModel;