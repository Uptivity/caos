/**
 * Email Model
 * Comprehensive email management system for CAOS CRM
 * Module 13: Email Integration
 */

// Email status types
const EMAIL_STATUS = {
    DRAFT: 'draft',
    SENT: 'sent',
    RECEIVED: 'received',
    REPLIED: 'replied',
    FORWARDED: 'forwarded',
    SCHEDULED: 'scheduled',
    FAILED: 'failed',
    BOUNCED: 'bounced'
};

// Email types
const EMAIL_TYPE = {
    INBOUND: 'inbound',
    OUTBOUND: 'outbound',
    FOLLOW_UP: 'follow_up',
    AUTOMATED: 'automated',
    TEMPLATE: 'template',
    REPLY: 'reply',
    FORWARD: 'forward'
};

// Email priority levels
const EMAIL_PRIORITY = {
    LOW: 'low',
    NORMAL: 'normal',
    HIGH: 'high',
    URGENT: 'urgent'
};

// Email providers
const EMAIL_PROVIDER = {
    GMAIL: 'gmail',
    OUTLOOK: 'outlook',
    IMAP: 'imap',
    SMTP: 'smtp',
    INTERNAL: 'internal'
};

// In-memory storage
const emails = new Map();
const emailThreads = new Map();
const emailTemplates = new Map();
const emailSettings = new Map();
const emailAccounts = new Map();
const emailAttachments = new Map();

// Email template structure
const createEmailTemplate = () => ({
    id: null,
    name: '',
    subject: '',
    body: '',
    type: EMAIL_TYPE.TEMPLATE,
    category: '',
    variables: [],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: null,
    tags: []
});

// Email structure
const createEmail = () => ({
    id: null,
    threadId: null,
    from: '',
    to: [],
    cc: [],
    bcc: [],
    replyTo: '',
    subject: '',
    body: '',
    htmlBody: '',
    textBody: '',
    status: EMAIL_STATUS.DRAFT,
    type: EMAIL_TYPE.OUTBOUND,
    priority: EMAIL_PRIORITY.NORMAL,
    provider: EMAIL_PROVIDER.INTERNAL,
    messageId: '',
    inReplyTo: '',
    references: [],
    attachments: [],
    headers: {},
    isRead: false,
    isStarred: false,
    isArchived: false,
    scheduledAt: null,
    sentAt: null,
    receivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    userId: null,
    leadId: null,
    contactId: null,
    campaignId: null,
    tags: [],
    customFields: {},
    deliveryStatus: {
        delivered: false,
        opened: false,
        clicked: false,
        bounced: false,
        unsubscribed: false,
        openedAt: null,
        clickedAt: null,
        bouncedAt: null,
        trackingPixel: null
    },
    automation: {
        isAutomated: false,
        triggerId: null,
        ruleId: null,
        sequenceId: null
    }
});

// Email thread structure
const createEmailThread = () => ({
    id: null,
    subject: '',
    participants: [],
    emailCount: 0,
    lastEmailAt: null,
    isRead: false,
    isStarred: false,
    isArchived: false,
    labels: [],
    leadId: null,
    contactId: null,
    createdAt: new Date(),
    updatedAt: new Date()
});

// Email account configuration
const createEmailAccount = () => ({
    id: null,
    name: '',
    email: '',
    provider: EMAIL_PROVIDER.IMAP,
    isDefault: false,
    isActive: true,
    settings: {
        imap: {
            host: '',
            port: 993,
            secure: true,
            username: '',
            password: '',
            folder: 'INBOX'
        },
        smtp: {
            host: '',
            port: 587,
            secure: false,
            username: '',
            password: ''
        },
        oauth: {
            clientId: '',
            clientSecret: '',
            refreshToken: '',
            accessToken: '',
            tokenType: 'Bearer'
        }
    },
    signature: '',
    autoReply: {
        enabled: false,
        subject: '',
        body: ''
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    userId: null
});

// Utility functions
const generateId = () => Date.now().toString() + Math.random().toString(36).substr(2, 9);

const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};

const generateMessageId = () => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 8);
    return `<${timestamp}.${random}@caos-crm.local>`;
};

const parseEmailAddresses = (addresses) => {
    if (typeof addresses === 'string') {
        return addresses.split(',').map(addr => addr.trim()).filter(addr => validateEmail(addr));
    }
    if (Array.isArray(addresses)) {
        return addresses.filter(addr => validateEmail(addr));
    }
    return [];
};

// Email operations
const createEmailRecord = (emailData) => {
    const email = { ...createEmail(), ...emailData };
    email.id = generateId();
    email.messageId = generateMessageId();
    email.createdAt = new Date();
    email.updatedAt = new Date();

    // Parse email addresses
    email.to = parseEmailAddresses(email.to);
    email.cc = parseEmailAddresses(email.cc);
    email.bcc = parseEmailAddresses(email.bcc);

    // Validate required fields
    if (!email.subject && !email.body) {
        throw new Error('Email must have either subject or body');
    }

    // Handle threading
    if (email.inReplyTo || email.references.length > 0) {
        email.threadId = findOrCreateThread(email);
    } else {
        email.threadId = createThread(email);
    }

    emails.set(email.id, email);
    updateThreadInfo(email.threadId);

    return email;
};

const getEmailById = (id) => {
    return emails.get(id) || null;
};

const updateEmail = (id, updates) => {
    const email = emails.get(id);
    if (!email) {
        throw new Error('Email not found');
    }

    const updatedEmail = { ...email, ...updates };
    updatedEmail.updatedAt = new Date();

    emails.set(id, updatedEmail);
    updateThreadInfo(updatedEmail.threadId);

    return updatedEmail;
};

const deleteEmail = (id) => {
    const email = emails.get(id);
    if (!email) {
        throw new Error('Email not found');
    }

    emails.delete(id);
    updateThreadInfo(email.threadId);

    return true;
};

const getAllEmails = (filters = {}) => {
    let emailList = Array.from(emails.values());

    // Apply filters
    if (filters.status) {
        emailList = emailList.filter(email => email.status === filters.status);
    }

    if (filters.type) {
        emailList = emailList.filter(email => email.type === filters.type);
    }

    if (filters.userId) {
        emailList = emailList.filter(email => email.userId === filters.userId);
    }

    if (filters.leadId) {
        emailList = emailList.filter(email => email.leadId === filters.leadId);
    }

    if (filters.isRead !== undefined) {
        emailList = emailList.filter(email => email.isRead === filters.isRead);
    }

    if (filters.dateFrom) {
        const fromDate = new Date(filters.dateFrom);
        emailList = emailList.filter(email => new Date(email.createdAt) >= fromDate);
    }

    if (filters.dateTo) {
        const toDate = new Date(filters.dateTo);
        emailList = emailList.filter(email => new Date(email.createdAt) <= toDate);
    }

    if (filters.search) {
        const searchTerm = filters.search.toLowerCase();
        emailList = emailList.filter(email =>
            email.subject.toLowerCase().includes(searchTerm) ||
            email.body.toLowerCase().includes(searchTerm) ||
            email.from.toLowerCase().includes(searchTerm) ||
            email.to.some(addr => addr.toLowerCase().includes(searchTerm))
        );
    }

    // Sort by date (newest first)
    emailList.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Pagination
    if (filters.limit) {
        const offset = filters.offset || 0;
        emailList = emailList.slice(offset, offset + parseInt(filters.limit));
    }

    return emailList;
};

// Thread operations
const createThread = (email) => {
    const thread = createEmailThread();
    thread.id = generateId();
    thread.subject = email.subject;
    thread.participants = [email.from, ...email.to, ...email.cc];
    thread.emailCount = 1;
    thread.lastEmailAt = email.createdAt;
    thread.leadId = email.leadId;
    thread.contactId = email.contactId;

    emailThreads.set(thread.id, thread);
    return thread.id;
};

const findOrCreateThread = (email) => {
    // Look for existing thread based on references or subject
    for (let [threadId, thread] of emailThreads) {
        if (email.references.length > 0 &&
            thread.participants.some(p => email.references.includes(p))) {
            return threadId;
        }

        // Subject-based threading (simplified)
        const cleanSubject = email.subject.replace(/^(Re:|Fwd?:)\s*/i, '').trim();
        const threadSubject = thread.subject.replace(/^(Re:|Fwd?:)\s*/i, '').trim();

        if (cleanSubject === threadSubject &&
            thread.participants.some(p => p === email.from || email.to.includes(p))) {
            return threadId;
        }
    }

    // Create new thread if none found
    return createThread(email);
};

const updateThreadInfo = (threadId) => {
    const thread = emailThreads.get(threadId);
    if (!thread) return;

    const threadEmails = Array.from(emails.values()).filter(e => e.threadId === threadId);
    thread.emailCount = threadEmails.length;
    thread.lastEmailAt = Math.max(...threadEmails.map(e => new Date(e.createdAt)));
    thread.isRead = threadEmails.every(e => e.isRead);
    thread.updatedAt = new Date();

    emailThreads.set(threadId, thread);
};

const getThreadById = (id) => {
    return emailThreads.get(id) || null;
};

const getThreadEmails = (threadId) => {
    return Array.from(emails.values())
        .filter(email => email.threadId === threadId)
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
};

// Template operations
const createTemplate = (templateData) => {
    const template = { ...createEmailTemplate(), ...templateData };
    template.id = generateId();
    template.createdAt = new Date();
    template.updatedAt = new Date();

    if (!template.name || !template.subject || !template.body) {
        throw new Error('Template must have name, subject, and body');
    }

    emailTemplates.set(template.id, template);
    return template;
};

const getTemplateById = (id) => {
    return emailTemplates.get(id) || null;
};

const updateTemplate = (id, updates) => {
    const template = emailTemplates.get(id);
    if (!template) {
        throw new Error('Template not found');
    }

    const updatedTemplate = { ...template, ...updates };
    updatedTemplate.updatedAt = new Date();

    emailTemplates.set(id, updatedTemplate);
    return updatedTemplate;
};

const getAllTemplates = (filters = {}) => {
    let templateList = Array.from(emailTemplates.values());

    if (filters.category) {
        templateList = templateList.filter(t => t.category === filters.category);
    }

    if (filters.isActive !== undefined) {
        templateList = templateList.filter(t => t.isActive === filters.isActive);
    }

    return templateList.sort((a, b) => a.name.localeCompare(b.name));
};

// Email account operations
const addEmailAccount = (accountData) => {
    const account = { ...createEmailAccount(), ...accountData };
    account.id = generateId();

    if (!validateEmail(account.email)) {
        throw new Error('Invalid email address');
    }

    emailAccounts.set(account.id, account);
    return account;
};

const getEmailAccountById = (id) => {
    return emailAccounts.get(id) || null;
};

const getAllEmailAccounts = () => {
    return Array.from(emailAccounts.values())
        .filter(account => account.isActive)
        .sort((a, b) => a.name.localeCompare(b.name));
};

// Email sending simulation
const sendEmail = async (emailId) => {
    const email = emails.get(emailId);
    if (!email) {
        throw new Error('Email not found');
    }

    if (email.status !== EMAIL_STATUS.DRAFT && email.status !== EMAIL_STATUS.SCHEDULED) {
        throw new Error('Email cannot be sent');
    }

    // Simulate sending delay
    await new Promise(resolve => setTimeout(resolve, 100));

    // Update email status
    email.status = EMAIL_STATUS.SENT;
    email.sentAt = new Date();
    email.updatedAt = new Date();

    // Generate tracking pixel
    email.deliveryStatus.trackingPixel = generateId();

    emails.set(emailId, email);
    updateThreadInfo(email.threadId);

    return email;
};

// Email statistics
const getEmailStats = (filters = {}) => {
    const emailList = getAllEmails(filters);

    return {
        total: emailList.length,
        sent: emailList.filter(e => e.status === EMAIL_STATUS.SENT).length,
        received: emailList.filter(e => e.status === EMAIL_STATUS.RECEIVED).length,
        draft: emailList.filter(e => e.status === EMAIL_STATUS.DRAFT).length,
        failed: emailList.filter(e => e.status === EMAIL_STATUS.FAILED).length,
        opened: emailList.filter(e => e.deliveryStatus.opened).length,
        clicked: emailList.filter(e => e.deliveryStatus.clicked).length,
        bounced: emailList.filter(e => e.deliveryStatus.bounced).length,
        unread: emailList.filter(e => !e.isRead).length,
        starred: emailList.filter(e => e.isStarred).length,
        threads: new Set(emailList.map(e => e.threadId)).size,
        openRate: emailList.filter(e => e.status === EMAIL_STATUS.SENT).length > 0
            ? (emailList.filter(e => e.deliveryStatus.opened).length / emailList.filter(e => e.status === EMAIL_STATUS.SENT).length * 100).toFixed(2)
            : 0,
        clickRate: emailList.filter(e => e.deliveryStatus.opened).length > 0
            ? (emailList.filter(e => e.deliveryStatus.clicked).length / emailList.filter(e => e.deliveryStatus.opened).length * 100).toFixed(2)
            : 0
    };
};

// Search and filtering
const searchEmails = (query) => {
    const searchTerms = query.toLowerCase().split(' ');

    return Array.from(emails.values()).filter(email => {
        const searchableText = `${email.subject} ${email.body} ${email.from} ${email.to.join(' ')} ${email.cc.join(' ')}`.toLowerCase();

        return searchTerms.every(term => searchableText.includes(term));
    }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
};

// Bulk operations
const markAsRead = (emailIds) => {
    const results = [];

    emailIds.forEach(id => {
        const email = emails.get(id);
        if (email) {
            email.isRead = true;
            email.updatedAt = new Date();
            emails.set(id, email);
            updateThreadInfo(email.threadId);
            results.push(email);
        }
    });

    return results;
};

const markAsUnread = (emailIds) => {
    const results = [];

    emailIds.forEach(id => {
        const email = emails.get(id);
        if (email) {
            email.isRead = false;
            email.updatedAt = new Date();
            emails.set(id, email);
            updateThreadInfo(email.threadId);
            results.push(email);
        }
    });

    return results;
};

const toggleStar = (emailId) => {
    const email = emails.get(emailId);
    if (!email) {
        throw new Error('Email not found');
    }

    email.isStarred = !email.isStarred;
    email.updatedAt = new Date();
    emails.set(emailId, email);

    return email;
};

const archiveEmails = (emailIds) => {
    const results = [];

    emailIds.forEach(id => {
        const email = emails.get(id);
        if (email) {
            email.isArchived = true;
            email.updatedAt = new Date();
            emails.set(id, email);
            updateThreadInfo(email.threadId);
            results.push(email);
        }
    });

    return results;
};

// Initialize with sample data
const initializeSampleData = () => {
    // Sample templates
    const templates = [
        {
            name: 'Welcome Email',
            subject: 'Welcome to our service',
            body: 'Dear {{firstName}},\n\nWelcome to our service! We\'re excited to have you on board.',
            category: 'welcome',
            variables: ['firstName']
        },
        {
            name: 'Follow-up Email',
            subject: 'Following up on our conversation',
            body: 'Hi {{firstName}},\n\nI wanted to follow up on our recent conversation about {{topic}}.',
            category: 'follow-up',
            variables: ['firstName', 'topic']
        },
        {
            name: 'Meeting Request',
            subject: 'Meeting Request - {{subject}}',
            body: 'Dear {{firstName}},\n\nI would like to schedule a meeting to discuss {{subject}}. Please let me know your availability.',
            category: 'meeting',
            variables: ['firstName', 'subject']
        }
    ];

    templates.forEach(template => {
        createTemplate(template);
    });

    // Sample email account
    addEmailAccount({
        name: 'Default Account',
        email: 'noreply@caos-crm.local',
        provider: EMAIL_PROVIDER.INTERNAL,
        isDefault: true,
        signature: '\n\nBest regards,\nCAOS CRM System'
    });
};

// Initialize sample data
initializeSampleData();

module.exports = {
    EMAIL_STATUS,
    EMAIL_TYPE,
    EMAIL_PRIORITY,
    EMAIL_PROVIDER,
    createEmailRecord,
    getEmailById,
    updateEmail,
    deleteEmail,
    getAllEmails,
    createTemplate,
    getTemplateById,
    updateTemplate,
    getAllTemplates,
    addEmailAccount,
    getEmailAccountById,
    getAllEmailAccounts,
    sendEmail,
    getEmailStats,
    searchEmails,
    markAsRead,
    markAsUnread,
    toggleStar,
    archiveEmails,
    getThreadById,
    getThreadEmails,
    validateEmail
};