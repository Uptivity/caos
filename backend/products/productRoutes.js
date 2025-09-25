/**
 * Product Routes
 * RESTful API endpoints for product management
 */

const express = require('express');
const router = express.Router();
const { requireAuth, getAuthenticatedUserId } = require('../middleware/authMiddleware');
const { logger } = require('../utils/secureLogger');
const {
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
    getProductStats
} = require('./productModel');

// Validation middleware
const validateProductInput = (req, res, next) => {
    const { name, type, pricing } = req.body;

    const errors = [];

    if (!name || name.trim().length === 0) {
        errors.push('Product name is required');
    }

    if (!type || !Object.values(PRODUCT_TYPE).includes(type)) {
        errors.push('Valid product type is required');
    }

    if (!pricing || typeof pricing.basePrice !== 'number' || pricing.basePrice < 0) {
        errors.push('Valid base price is required');
    }

    if (errors.length > 0) {
        return res.status(400).json({
            success: false,
            errors
        });
    }

    next();
};

// Create new product
router.post('/', validateProductInput, (req, res) => {
    try {
        const userId = getAuthenticatedUserId(req);
        const product = createProduct(req.body, userId);

        res.status(201).json({
            success: true,
            message: 'Product created successfully',
            data: product
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to create product',
            error: error.message
        });
    }
});

// Get all products with filtering
router.get('/', (req, res) => {
    try {
        const filters = {
            status: req.query.status,
            type: req.query.type,
            category: req.query.category,
            search: req.query.search,
            minPrice: req.query.minPrice ? parseFloat(req.query.minPrice) : undefined,
            maxPrice: req.query.maxPrice ? parseFloat(req.query.maxPrice) : undefined,
            inStock: req.query.inStock === 'true' ? true : req.query.inStock === 'false' ? false : undefined,
            lowStock: req.query.lowStock === 'true',
            sortBy: req.query.sortBy,
            sortOrder: req.query.sortOrder,
            page: parseInt(req.query.page) || 1,
            limit: parseInt(req.query.limit) || 20
        };

        const result = getAllProducts(filters);

        res.json({
            success: true,
            data: result.products,
            pagination: {
                total: result.total,
                page: result.page,
                totalPages: result.totalPages,
                limit: filters.limit
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch products',
            error: error.message
        });
    }
});

// Get product statistics
router.get('/stats', (req, res) => {
    try {
        const stats = getProductStats();

        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch product statistics',
            error: error.message
        });
    }
});

// Search products
router.get('/search', (req, res) => {
    try {
        const { q, limit = 10 } = req.query;

        if (!q) {
            return res.status(400).json({
                success: false,
                message: 'Search query is required'
            });
        }

        const filters = {
            search: q,
            status: PRODUCT_STATUS.ACTIVE,
            limit: parseInt(limit)
        };

        const result = getAllProducts(filters);

        res.json({
            success: true,
            data: result.products,
            total: result.total
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to search products',
            error: error.message
        });
    }
});

// Get product by ID
router.get('/:id', (req, res) => {
    try {
        const product = getProductById(req.params.id);

        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        res.json({
            success: true,
            data: product
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch product',
            error: error.message
        });
    }
});

// Get product by SKU
router.get('/sku/:sku', (req, res) => {
    try {
        const product = getProductBySKU(req.params.sku);

        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        res.json({
            success: true,
            data: product
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch product',
            error: error.message
        });
    }
});

// Update product
router.put('/:id', (req, res) => {
    try {
        const product = updateProduct(req.params.id, req.body);

        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        res.json({
            success: true,
            message: 'Product updated successfully',
            data: product
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to update product',
            error: error.message
        });
    }
});

// Delete product
router.delete('/:id', (req, res) => {
    try {
        const result = deleteProduct(req.params.id);

        if (!result) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        res.json({
            success: true,
            message: 'Product archived successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to delete product',
            error: error.message
        });
    }
});

// Update product inventory
router.post('/:id/inventory', (req, res) => {
    try {
        const { quantity, operation = 'set' } = req.body;

        if (typeof quantity !== 'number') {
            return res.status(400).json({
                success: false,
                message: 'Valid quantity is required'
            });
        }

        const product = updateInventory(req.params.id, quantity, operation);

        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found or inventory tracking disabled'
            });
        }

        res.json({
            success: true,
            message: 'Inventory updated successfully',
            data: {
                productId: product.id,
                quantity: product.inventory.quantity,
                reserved: product.inventory.reservedQuantity,
                available: product.inventory.quantity - product.inventory.reservedQuantity
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to update inventory',
            error: error.message
        });
    }
});

// Bulk inventory update
router.post('/inventory/bulk', (req, res) => {
    try {
        const { updates } = req.body;

        if (!updates || !Array.isArray(updates)) {
            return res.status(400).json({
                success: false,
                message: 'Updates array is required'
            });
        }

        const results = bulkUpdateInventory(updates);

        res.json({
            success: true,
            message: 'Bulk inventory update completed',
            data: results
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to update inventory',
            error: error.message
        });
    }
});

// Associate product with lead
router.post('/:id/leads', (req, res) => {
    try {
        const { leadId, status = 'interested', quantity = 1, notes = '' } = req.body;

        if (!leadId) {
            return res.status(400).json({
                success: false,
                message: 'Lead ID is required'
            });
        }

        const result = addProductToLead(req.params.id, leadId, {
            status,
            quantity,
            notes
        });

        if (!result) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        res.json({
            success: true,
            message: 'Product associated with lead successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to associate product with lead',
            error: error.message
        });
    }
});

// Get products for a lead
router.get('/leads/:leadId', (req, res) => {
    try {
        const products = getLeadProducts(req.params.leadId);

        res.json({
            success: true,
            data: products
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch lead products',
            error: error.message
        });
    }
});

// Category endpoints
router.post('/categories', (req, res) => {
    try {
        const { name, description, parentId } = req.body;

        if (!name) {
            return res.status(400).json({
                success: false,
                message: 'Category name is required'
            });
        }

        const category = createCategory({
            name,
            description,
            parentId
        });

        res.status(201).json({
            success: true,
            message: 'Category created successfully',
            data: category
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to create category',
            error: error.message
        });
    }
});

// Get all categories
router.get('/categories', (req, res) => {
    try {
        const categories = getAllCategories();

        res.json({
            success: true,
            data: categories
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch categories',
            error: error.message
        });
    }
});

// Get category tree
router.get('/categories/tree', (req, res) => {
    try {
        const tree = getCategoryTree();

        res.json({
            success: true,
            data: tree
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch category tree',
            error: error.message
        });
    }
});

// Duplicate product
router.post('/:id/duplicate', (req, res) => {
    try {
        const original = getProductById(req.params.id);

        if (!original) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        const userId = getAuthenticatedUserId(req);
        const duplicated = createProduct({
            ...original,
            name: `${original.name} (Copy)`,
            sku: '', // Will generate new SKU
            status: PRODUCT_STATUS.DRAFT
        }, userId);

        res.status(201).json({
            success: true,
            message: 'Product duplicated successfully',
            data: duplicated
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to duplicate product',
            error: error.message
        });
    }
});

// Publish product
router.post('/:id/publish', (req, res) => {
    try {
        const product = updateProduct(req.params.id, {
            status: PRODUCT_STATUS.ACTIVE,
            publishedAt: new Date().toISOString()
        });

        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        res.json({
            success: true,
            message: 'Product published successfully',
            data: product
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to publish product',
            error: error.message
        });
    }
});

// Archive product
router.post('/:id/archive', (req, res) => {
    try {
        const product = updateProduct(req.params.id, {
            status: PRODUCT_STATUS.ARCHIVED
        });

        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        res.json({
            success: true,
            message: 'Product archived successfully',
            data: product
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to archive product',
            error: error.message
        });
    }
});

module.exports = router;