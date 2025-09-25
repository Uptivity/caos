/**
 * Product Model
 * Handles product catalog, pricing, and inventory management
 */

// Product status types
const PRODUCT_STATUS = {
    ACTIVE: 'active',
    DRAFT: 'draft',
    ARCHIVED: 'archived',
    OUT_OF_STOCK: 'out_of_stock',
    DISCONTINUED: 'discontinued'
};

// Product types
const PRODUCT_TYPE = {
    PHYSICAL: 'physical',
    DIGITAL: 'digital',
    SERVICE: 'service',
    SUBSCRIPTION: 'subscription',
    BUNDLE: 'bundle'
};

// Pricing models
const PRICING_MODEL = {
    FIXED: 'fixed',
    TIERED: 'tiered',
    VOLUME: 'volume',
    USAGE: 'usage',
    CUSTOM: 'custom'
};

// In-memory storage
const products = new Map();
const categories = new Map();
const productLeads = new Map();
const productMetrics = new Map();

// Product template structure
const createProductTemplate = () => ({
    id: null,
    sku: '',
    name: '',
    description: '',
    shortDescription: '',
    type: PRODUCT_TYPE.PHYSICAL,
    status: PRODUCT_STATUS.DRAFT,
    category: {
        id: null,
        name: '',
        path: []
    },
    pricing: {
        model: PRICING_MODEL.FIXED,
        currency: 'USD',
        basePrice: 0,
        salePrice: null,
        costPrice: 0,
        tiers: [],
        customRules: []
    },
    inventory: {
        trackInventory: true,
        quantity: 0,
        lowStockThreshold: 10,
        allowBackorder: false,
        reservedQuantity: 0
    },
    attributes: {
        weight: null,
        dimensions: {
            length: null,
            width: null,
            height: null,
            unit: 'cm'
        },
        color: null,
        size: null,
        material: null,
        customAttributes: {}
    },
    images: {
        primary: null,
        gallery: [],
        thumbnails: {}
    },
    seo: {
        title: '',
        description: '',
        keywords: [],
        slug: ''
    },
    features: [],
    specifications: {},
    relatedProducts: [],
    bundleItems: [],
    tags: [],
    metrics: {
        views: 0,
        addedToCart: 0,
        purchased: 0,
        revenue: 0,
        conversionRate: 0,
        averageRating: 0,
        reviewCount: 0
    },
    createdBy: null,
    createdAt: null,
    updatedAt: null,
    publishedAt: null
});

// Category template
const createCategoryTemplate = () => ({
    id: null,
    name: '',
    slug: '',
    description: '',
    parentId: null,
    path: [],
    image: null,
    productCount: 0,
    isActive: true,
    sortOrder: 0,
    createdAt: null,
    updatedAt: null
});

// Create new product
function createProduct(productData, userId) {
    const product = createProductTemplate();
    const productId = generateProductId();
    const sku = productData.sku || generateSKU();

    Object.assign(product, {
        id: productId,
        sku: sku,
        ...productData,
        createdBy: userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    });

    // Generate SEO slug if not provided
    if (!product.seo.slug) {
        product.seo.slug = generateSlug(product.name);
    }

    products.set(productId, product);
    productMetrics.set(productId, {
        dailyMetrics: [],
        monthlyMetrics: [],
        leadInteractions: []
    });

    return product;
}

// Get product by ID
function getProductById(productId) {
    return products.get(productId);
}

// Get product by SKU
function getProductBySKU(sku) {
    return Array.from(products.values()).find(p => p.sku === sku);
}

// Update product
function updateProduct(productId, updates) {
    const product = products.get(productId);
    if (!product) return null;

    // Calculate margin if prices are updated
    if (updates.pricing) {
        const basePrice = updates.pricing.basePrice || product.pricing.basePrice;
        const costPrice = updates.pricing.costPrice || product.pricing.costPrice;
        if (basePrice && costPrice) {
            updates.pricing.margin = ((basePrice - costPrice) / basePrice) * 100;
        }
    }

    Object.assign(product, updates, {
        updatedAt: new Date().toISOString()
    });

    products.set(productId, product);
    return product;
}

// Delete product
function deleteProduct(productId) {
    const product = products.get(productId);
    if (!product) return false;

    // Soft delete by archiving
    product.status = PRODUCT_STATUS.ARCHIVED;
    product.updatedAt = new Date().toISOString();
    products.set(productId, product);

    return true;
}

// Get all products with filtering
function getAllProducts(filters = {}) {
    let productList = Array.from(products.values());

    // Apply filters
    if (filters.status) {
        productList = productList.filter(p => p.status === filters.status);
    }

    if (filters.type) {
        productList = productList.filter(p => p.type === filters.type);
    }

    if (filters.category) {
        productList = productList.filter(p =>
            p.category.id === filters.category ||
            p.category.path.includes(filters.category)
        );
    }

    if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        productList = productList.filter(p =>
            p.name.toLowerCase().includes(searchLower) ||
            p.sku.toLowerCase().includes(searchLower) ||
            p.description.toLowerCase().includes(searchLower) ||
            p.tags.some(tag => tag.toLowerCase().includes(searchLower))
        );
    }

    // Price range filter
    if (filters.minPrice !== undefined) {
        productList = productList.filter(p =>
            (p.pricing.salePrice || p.pricing.basePrice) >= filters.minPrice
        );
    }

    if (filters.maxPrice !== undefined) {
        productList = productList.filter(p =>
            (p.pricing.salePrice || p.pricing.basePrice) <= filters.maxPrice
        );
    }

    // Stock filter
    if (filters.inStock !== undefined) {
        productList = productList.filter(p =>
            !p.inventory.trackInventory ||
            (filters.inStock ? p.inventory.quantity > 0 : p.inventory.quantity === 0)
        );
    }

    if (filters.lowStock) {
        productList = productList.filter(p =>
            p.inventory.trackInventory &&
            p.inventory.quantity > 0 &&
            p.inventory.quantity <= p.inventory.lowStockThreshold
        );
    }

    // Sorting
    if (filters.sortBy) {
        productList.sort((a, b) => {
            let aVal, bVal;

            switch(filters.sortBy) {
                case 'name':
                    aVal = a.name;
                    bVal = b.name;
                    break;
                case 'price':
                    aVal = a.pricing.salePrice || a.pricing.basePrice;
                    bVal = b.pricing.salePrice || b.pricing.basePrice;
                    break;
                case 'stock':
                    aVal = a.inventory.quantity;
                    bVal = b.inventory.quantity;
                    break;
                case 'created':
                    aVal = new Date(a.createdAt);
                    bVal = new Date(b.createdAt);
                    break;
                case 'popularity':
                    aVal = a.metrics.purchased;
                    bVal = b.metrics.purchased;
                    break;
                default:
                    aVal = a.updatedAt;
                    bVal = b.updatedAt;
            }

            const direction = filters.sortOrder === 'desc' ? -1 : 1;

            if (aVal < bVal) return -1 * direction;
            if (aVal > bVal) return 1 * direction;
            return 0;
        });
    } else {
        // Default: sort by updated date desc
        productList.sort((a, b) =>
            new Date(b.updatedAt) - new Date(a.updatedAt)
        );
    }

    // Pagination
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;

    return {
        products: productList.slice(startIndex, endIndex),
        total: productList.length,
        page,
        totalPages: Math.ceil(productList.length / limit)
    };
}

// Category management
function createCategory(categoryData) {
    const category = createCategoryTemplate();
    const categoryId = generateCategoryId();

    Object.assign(category, {
        id: categoryId,
        ...categoryData,
        slug: categoryData.slug || generateSlug(categoryData.name),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    });

    // Build path if parent exists
    if (category.parentId) {
        const parent = categories.get(category.parentId);
        if (parent) {
            category.path = [...parent.path, parent.id];
        }
    }

    categories.set(categoryId, category);
    return category;
}

function getAllCategories() {
    return Array.from(categories.values())
        .filter(c => c.isActive)
        .sort((a, b) => a.sortOrder - b.sortOrder);
}

function getCategoryTree() {
    const cats = getAllCategories();
    const tree = [];
    const map = {};

    // Create map
    cats.forEach(cat => {
        map[cat.id] = { ...cat, children: [] };
    });

    // Build tree
    cats.forEach(cat => {
        if (cat.parentId && map[cat.parentId]) {
            map[cat.parentId].children.push(map[cat.id]);
        } else if (!cat.parentId) {
            tree.push(map[cat.id]);
        }
    });

    return tree;
}

// Inventory management
function updateInventory(productId, quantity, operation = 'set') {
    const product = products.get(productId);
    if (!product || !product.inventory.trackInventory) return null;

    switch(operation) {
        case 'add':
            product.inventory.quantity += quantity;
            break;
        case 'subtract':
            product.inventory.quantity = Math.max(0, product.inventory.quantity - quantity);
            break;
        case 'reserve':
            product.inventory.reservedQuantity += quantity;
            break;
        case 'release':
            product.inventory.reservedQuantity = Math.max(0, product.inventory.reservedQuantity - quantity);
            break;
        default: // set
            product.inventory.quantity = quantity;
    }

    // Update stock status
    if (product.inventory.quantity === 0 && !product.inventory.allowBackorder) {
        product.status = PRODUCT_STATUS.OUT_OF_STOCK;
    } else if (product.status === PRODUCT_STATUS.OUT_OF_STOCK && product.inventory.quantity > 0) {
        product.status = PRODUCT_STATUS.ACTIVE;
    }

    product.updatedAt = new Date().toISOString();
    products.set(productId, product);
    return product;
}

// Bulk inventory update
function bulkUpdateInventory(updates) {
    const results = [];

    updates.forEach(update => {
        const result = updateInventory(
            update.productId,
            update.quantity,
            update.operation
        );
        results.push({
            productId: update.productId,
            success: !!result,
            newQuantity: result ? result.inventory.quantity : null
        });
    });

    return results;
}

// Associate product with lead
function addProductToLead(productId, leadId, data = {}) {
    const product = products.get(productId);
    if (!product) return null;

    if (!productLeads.has(productId)) {
        productLeads.set(productId, []);
    }

    const leadProducts = productLeads.get(productId);
    const existing = leadProducts.find(lp => lp.leadId === leadId);

    if (existing) {
        Object.assign(existing, data, {
            updatedAt: new Date().toISOString()
        });
    } else {
        leadProducts.push({
            leadId,
            productId,
            status: 'interested',
            quantity: 1,
            notes: '',
            ...data,
            addedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });
    }

    // Update product metrics
    product.metrics.addedToCart++;
    products.set(productId, product);

    return leadProducts;
}

// Get products for a lead
function getLeadProducts(leadId) {
    const leadProductsList = [];

    productLeads.forEach((leads, productId) => {
        const leadProduct = leads.find(lp => lp.leadId === leadId);
        if (leadProduct) {
            const product = products.get(productId);
            if (product) {
                leadProductsList.push({
                    ...leadProduct,
                    product
                });
            }
        }
    });

    return leadProductsList;
}

// Calculate product statistics
function getProductStats() {
    const allProducts = Array.from(products.values());
    const activeProducts = allProducts.filter(p => p.status === PRODUCT_STATUS.ACTIVE);

    const totalRevenue = allProducts.reduce((sum, p) => sum + p.metrics.revenue, 0);
    const totalStock = activeProducts.reduce((sum, p) =>
        p.inventory.trackInventory ? sum + p.inventory.quantity : sum, 0
    );
    const lowStockProducts = activeProducts.filter(p =>
        p.inventory.trackInventory &&
        p.inventory.quantity > 0 &&
        p.inventory.quantity <= p.inventory.lowStockThreshold
    );

    return {
        total: allProducts.length,
        byStatus: {
            active: activeProducts.length,
            draft: allProducts.filter(p => p.status === PRODUCT_STATUS.DRAFT).length,
            archived: allProducts.filter(p => p.status === PRODUCT_STATUS.ARCHIVED).length,
            outOfStock: allProducts.filter(p => p.status === PRODUCT_STATUS.OUT_OF_STOCK).length
        },
        byType: {
            physical: allProducts.filter(p => p.type === PRODUCT_TYPE.PHYSICAL).length,
            digital: allProducts.filter(p => p.type === PRODUCT_TYPE.DIGITAL).length,
            service: allProducts.filter(p => p.type === PRODUCT_TYPE.SERVICE).length,
            subscription: allProducts.filter(p => p.type === PRODUCT_TYPE.SUBSCRIPTION).length,
            bundle: allProducts.filter(p => p.type === PRODUCT_TYPE.BUNDLE).length
        },
        inventory: {
            totalStock,
            lowStockCount: lowStockProducts.length,
            outOfStock: allProducts.filter(p =>
                p.inventory.trackInventory && p.inventory.quantity === 0
            ).length,
            averageStock: totalStock / (activeProducts.filter(p => p.inventory.trackInventory).length || 1)
        },
        performance: {
            totalRevenue,
            bestSellers: allProducts
                .sort((a, b) => b.metrics.purchased - a.metrics.purchased)
                .slice(0, 5)
                .map(p => ({
                    id: p.id,
                    name: p.name,
                    sold: p.metrics.purchased,
                    revenue: p.metrics.revenue
                })),
            averagePrice: activeProducts.reduce((sum, p) =>
                sum + (p.pricing.salePrice || p.pricing.basePrice), 0
            ) / (activeProducts.length || 1),
            averageMargin: activeProducts.reduce((sum, p) => {
                const price = p.pricing.salePrice || p.pricing.basePrice;
                const cost = p.pricing.costPrice;
                return sum + (cost ? ((price - cost) / price) * 100 : 0);
            }, 0) / (activeProducts.length || 1)
        }
    };
}

// Helper functions
function generateProductId() {
    return 'PRD' + Date.now() + Math.random().toString(36).substr(2, 9).toUpperCase();
}

function generateCategoryId() {
    return 'CAT' + Date.now() + Math.random().toString(36).substr(2, 9).toUpperCase();
}

function generateSKU() {
    return 'SKU' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substr(2, 4).toUpperCase();
}

function generateSlug(name) {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

// Seed data for development
function seedProducts(userId = 'user123') {
    // Create categories
    const electronicsCategory = createCategory({
        name: 'Electronics',
        description: 'Electronic devices and accessories'
    });

    const softwareCategory = createCategory({
        name: 'Software',
        description: 'Software products and licenses'
    });

    const servicesCategory = createCategory({
        name: 'Services',
        description: 'Professional services and support'
    });

    // Product 1: CRM Pro License
    const product1 = createProduct({
        name: 'CRM Pro License',
        description: 'Professional CRM software license with advanced features',
        shortDescription: 'Advanced CRM for growing businesses',
        type: PRODUCT_TYPE.SUBSCRIPTION,
        status: PRODUCT_STATUS.ACTIVE,
        category: {
            id: softwareCategory.id,
            name: softwareCategory.name
        },
        pricing: {
            model: PRICING_MODEL.TIERED,
            currency: 'USD',
            basePrice: 99,
            tiers: [
                { minQty: 1, maxQty: 5, price: 99 },
                { minQty: 6, maxQty: 20, price: 89 },
                { minQty: 21, maxQty: null, price: 79 }
            ]
        },
        inventory: {
            trackInventory: false
        },
        features: [
            'Unlimited contacts',
            'Advanced automation',
            'Custom dashboards',
            'API access',
            '24/7 support'
        ],
        tags: ['software', 'crm', 'subscription', 'saas']
    }, userId);

    product1.metrics = {
        views: 1250,
        addedToCart: 145,
        purchased: 89,
        revenue: 8811,
        conversionRate: 7.12,
        averageRating: 4.6,
        reviewCount: 42
    };
    product1.publishedAt = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    products.set(product1.id, product1);

    // Product 2: Implementation Package
    const product2 = createProduct({
        name: 'Implementation Package',
        description: 'Complete CRM implementation service including setup, training, and support',
        shortDescription: 'Full implementation and training',
        type: PRODUCT_TYPE.SERVICE,
        status: PRODUCT_STATUS.ACTIVE,
        category: {
            id: servicesCategory.id,
            name: servicesCategory.name
        },
        pricing: {
            model: PRICING_MODEL.FIXED,
            currency: 'USD',
            basePrice: 2500,
            costPrice: 1500
        },
        inventory: {
            trackInventory: false
        },
        features: [
            'System setup and configuration',
            'Data migration',
            'Custom workflow design',
            '10 hours of training',
            '30-day support'
        ],
        tags: ['service', 'implementation', 'training', 'consulting']
    }, userId);

    product2.metrics = {
        views: 450,
        addedToCart: 32,
        purchased: 18,
        revenue: 45000,
        conversionRate: 4,
        averageRating: 4.8,
        reviewCount: 15
    };
    products.set(product2.id, product2);

    // Product 3: Data Migration Tool
    const product3 = createProduct({
        name: 'Data Migration Tool',
        description: 'Automated tool for migrating data from other CRM systems',
        shortDescription: 'Seamless data migration',
        type: PRODUCT_TYPE.DIGITAL,
        status: PRODUCT_STATUS.ACTIVE,
        category: {
            id: softwareCategory.id,
            name: softwareCategory.name
        },
        pricing: {
            model: PRICING_MODEL.FIXED,
            currency: 'USD',
            basePrice: 299,
            salePrice: 199,
            costPrice: 50
        },
        inventory: {
            trackInventory: false
        },
        features: [
            'Supports 10+ CRM platforms',
            'Automatic field mapping',
            'Data validation',
            'Batch processing',
            'Error reporting'
        ],
        tags: ['software', 'migration', 'tool', 'utility']
    }, userId);

    products.set(product3.id, product3);

    // Product 4: Premium Support
    const product4 = createProduct({
        name: 'Premium Support Plan',
        description: 'Priority support with dedicated account manager',
        shortDescription: '24/7 premium support',
        type: PRODUCT_TYPE.SUBSCRIPTION,
        status: PRODUCT_STATUS.ACTIVE,
        category: {
            id: servicesCategory.id,
            name: servicesCategory.name
        },
        pricing: {
            model: PRICING_MODEL.FIXED,
            currency: 'USD',
            basePrice: 199,
            costPrice: 80
        },
        inventory: {
            trackInventory: true,
            quantity: 50,
            lowStockThreshold: 10
        },
        features: [
            'Dedicated account manager',
            '1-hour response time',
            'Monthly strategy calls',
            'Custom training sessions',
            'Priority feature requests'
        ],
        tags: ['support', 'premium', 'service', 'subscription']
    }, userId);

    products.set(product4.id, product4);
}

module.exports = {
    PRODUCT_STATUS,
    PRODUCT_TYPE,
    PRICING_MODEL,
    createProduct,
    getProductById,
    getProductBySKU,
    updateProduct,
    deleteProduct,
    getAllProducts,
    createCategory,
    getAllCategories,
    getCategoryTree,
    updateInventory,
    bulkUpdateInventory,
    addProductToLead,
    getLeadProducts,
    getProductStats,
    seedProducts
};