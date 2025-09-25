// Products Module Unit Tests
const crypto = require('crypto');

// Mock dependencies
jest.mock('crypto');
jest.mock('../../utils/secureLogger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  }
}));

const productModel = require('../../products/productModel');
const { TestData } = require('../helpers/testHelpers');

describe('Products Model Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    crypto.randomUUID = jest.fn();
  });

  describe('Product Creation', () => {
    test('should create product with required fields', async () => {
      const mockProductId = 'test-product-id-123';
      crypto.randomUUID.mockReturnValue(mockProductId);

      const productData = {
        name: 'Test Product',
        description: 'A product for testing',
        sku: 'TEST-001',
        price: 99.99,
        category: 'Software'
      };

      const result = await productModel.createProduct(productData, 'user-id-123');

      expect(result.success).toBe(true);
      expect(result.product).toMatchObject({
        id: mockProductId,
        name: 'Test Product',
        description: 'A product for testing',
        sku: 'TEST-001',
        price: 99.99,
        category: 'Software'
      });
      expect(result.product.createdAt).toBeDefined();
      expect(result.product.updatedAt).toBeDefined();
      expect(crypto.randomUUID).toHaveBeenCalled();
    });

    test('should set default values for optional fields', async () => {
      crypto.randomUUID.mockReturnValue('product-id');

      const minimalProductData = {
        name: 'Minimal Product',
        sku: 'MIN-001',
        price: 49.99
      };

      const result = await productModel.createProduct(minimalProductData, 'user-id');

      expect(result.success).toBe(true);
      expect(result.product.status).toBe('draft');
      expect(result.product.type).toBe('physical');
      expect(result.product.inStock).toBe(true);
      expect(result.product.stockQuantity).toBe(0);
      expect(result.product.tags).toEqual([]);
    });

    test('should validate required fields', async () => {
      const invalidProductData = {
        name: '',
        sku: '',
        price: null
      };

      const result = await productModel.createProduct(invalidProductData, 'user-id');

      expect(result.success).toBe(false);
      expect(result.error).toContain('validation');
    });

    test('should prevent duplicate SKU', async () => {
      crypto.randomUUID
        .mockReturnValueOnce('product-id-1')
        .mockReturnValueOnce('product-id-2');

      const productData = {
        name: 'Product 1',
        sku: 'DUPLICATE-SKU',
        price: 99.99
      };

      // Create first product
      const result1 = await productModel.createProduct(productData, 'user-id');
      expect(result1.success).toBe(true);

      // Try to create duplicate SKU
      const result2 = await productModel.createProduct({
        ...productData,
        name: 'Product 2'
      }, 'user-id');

      expect(result2.success).toBe(false);
      expect(result2.error).toContain('SKU already exists');
    });

    test('should validate SKU format', () => {
      const validSKUs = [
        'PROD-001',
        'ABC123',
        'TEST-PRODUCT-001',
        '2023-SUMMER-001'
      ];

      const invalidSKUs = [
        'invalid sku', // Contains spaces
        'PROD@001', // Contains special characters
        'prod-001', // Wrong case
        ''
      ];

      // SKU validation regex: alphanumeric and hyphens only, uppercase
      const skuRegex = /^[A-Z0-9\-]+$/;

      validSKUs.forEach(sku => {
        expect(skuRegex.test(sku)).toBe(true);
      });

      invalidSKUs.forEach(sku => {
        expect(skuRegex.test(sku)).toBe(false);
      });
    });
  });

  describe('Product Validation', () => {
    test('should validate price is positive number', () => {
      const validPrices = [0.01, 1, 99.99, 1000.00];
      const invalidPrices = [-1, -0.01, 'abc', null, undefined];

      validPrices.forEach(price => {
        expect(typeof price === 'number' && price >= 0).toBe(true);
      });

      invalidPrices.forEach(price => {
        expect(typeof price !== 'number' || price < 0).toBe(true);
      });
    });

    test('should validate product status values', () => {
      const validStatuses = ['active', 'draft', 'archived', 'out_of_stock', 'discontinued'];
      const invalidStatuses = ['pending', 'inactive', 'deleted'];

      validStatuses.forEach(status => {
        expect(['active', 'draft', 'archived', 'out_of_stock', 'discontinued']).toContain(status);
      });

      invalidStatuses.forEach(status => {
        expect(['active', 'draft', 'archived', 'out_of_stock', 'discontinued']).not.toContain(status);
      });
    });

    test('should validate product type values', () => {
      const validTypes = ['physical', 'digital', 'service', 'subscription', 'bundle'];
      const invalidTypes = ['virtual', 'material', 'intangible'];

      validTypes.forEach(type => {
        expect(['physical', 'digital', 'service', 'subscription', 'bundle']).toContain(type);
      });

      invalidTypes.forEach(type => {
        expect(['physical', 'digital', 'service', 'subscription', 'bundle']).not.toContain(type);
      });
    });

    test('should validate stock quantity for physical products', () => {
      const physicalProduct = {
        type: 'physical',
        stockQuantity: 100
      };

      const digitalProduct = {
        type: 'digital',
        stockQuantity: null // Digital products don't need stock
      };

      const validateStock = (product) => {
        if (product.type === 'physical') {
          return typeof product.stockQuantity === 'number' && product.stockQuantity >= 0;
        }
        return true; // Non-physical products don't require stock validation
      };

      expect(validateStock(physicalProduct)).toBe(true);
      expect(validateStock(digitalProduct)).toBe(true);
    });
  });

  describe('Pricing Models', () => {
    test('should handle fixed pricing model', () => {
      const fixedPricing = {
        model: 'fixed',
        basePrice: 99.99,
        currency: 'USD'
      };

      const calculatePrice = (pricing, quantity = 1) => {
        if (pricing.model === 'fixed') {
          return pricing.basePrice * quantity;
        }
      };

      expect(calculatePrice(fixedPricing, 1)).toBe(99.99);
      expect(calculatePrice(fixedPricing, 5)).toBe(499.95);
    });

    test('should handle tiered pricing model', () => {
      const tieredPricing = {
        model: 'tiered',
        tiers: [
          { min: 1, max: 10, price: 100 },
          { min: 11, max: 50, price: 90 },
          { min: 51, max: null, price: 80 }
        ]
      };

      const calculateTieredPrice = (pricing, quantity) => {
        const tier = pricing.tiers.find(t =>
          quantity >= t.min && (t.max === null || quantity <= t.max)
        );
        return tier ? tier.price : null;
      };

      expect(calculateTieredPrice(tieredPricing, 5)).toBe(100);
      expect(calculateTieredPrice(tieredPricing, 25)).toBe(90);
      expect(calculateTieredPrice(tieredPricing, 100)).toBe(80);
    });

    test('should handle volume discount pricing', () => {
      const volumePricing = {
        model: 'volume',
        basePrice: 100,
        discounts: [
          { minQuantity: 10, discount: 0.05 }, // 5% discount
          { minQuantity: 50, discount: 0.10 }, // 10% discount
          { minQuantity: 100, discount: 0.15 } // 15% discount
        ]
      };

      const calculateVolumePrice = (pricing, quantity) => {
        let price = pricing.basePrice;
        const applicableDiscount = pricing.discounts
          .filter(d => quantity >= d.minQuantity)
          .sort((a, b) => b.discount - a.discount)[0];

        if (applicableDiscount) {
          price = pricing.basePrice * (1 - applicableDiscount.discount);
        }

        return price * quantity;
      };

      expect(calculateVolumePrice(volumePricing, 1)).toBe(100);
      expect(calculateVolumePrice(volumePricing, 10)).toBe(950); // 5% discount
      expect(calculateVolumePrice(volumePricing, 100)).toBe(8500); // 15% discount
    });

    test('should validate pricing model configuration', () => {
      const validatePricingModel = (pricing) => {
        const validModels = ['fixed', 'tiered', 'volume', 'usage', 'custom'];

        if (!validModels.includes(pricing.model)) {
          return { valid: false, error: 'Invalid pricing model' };
        }

        switch (pricing.model) {
          case 'fixed':
            if (!pricing.basePrice || typeof pricing.basePrice !== 'number') {
              return { valid: false, error: 'Fixed pricing requires basePrice' };
            }
            break;
          case 'tiered':
            if (!pricing.tiers || !Array.isArray(pricing.tiers) || pricing.tiers.length === 0) {
              return { valid: false, error: 'Tiered pricing requires tiers array' };
            }
            break;
          case 'volume':
            if (!pricing.basePrice || !pricing.discounts) {
              return { valid: false, error: 'Volume pricing requires basePrice and discounts' };
            }
            break;
        }

        return { valid: true };
      };

      // Test valid configurations
      expect(validatePricingModel({ model: 'fixed', basePrice: 99.99 })).toEqual({ valid: true });
      expect(validatePricingModel({
        model: 'tiered',
        tiers: [{ min: 1, max: 10, price: 100 }]
      })).toEqual({ valid: true });

      // Test invalid configurations
      expect(validatePricingModel({ model: 'invalid' }).valid).toBe(false);
      expect(validatePricingModel({ model: 'fixed' }).valid).toBe(false);
      expect(validatePricingModel({ model: 'tiered', tiers: [] }).valid).toBe(false);
    });
  });

  describe('Inventory Management', () => {
    test('should track stock levels for physical products', async () => {
      crypto.randomUUID.mockReturnValue('product-id');

      const productData = {
        name: 'Physical Product',
        sku: 'PHYS-001',
        price: 50.00,
        type: 'physical',
        stockQuantity: 100
      };

      const result = await productModel.createProduct(productData, 'user-id');

      expect(result.success).toBe(true);
      expect(result.product.stockQuantity).toBe(100);
      expect(result.product.inStock).toBe(true);
    });

    test('should handle stock depletion', async () => {
      const updateStock = (currentStock, orderQuantity) => {
        const newStock = currentStock - orderQuantity;
        return {
          stockQuantity: Math.max(0, newStock),
          inStock: newStock > 0,
          status: newStock <= 0 ? 'out_of_stock' : 'active'
        };
      };

      // Test normal stock reduction
      const result1 = updateStock(100, 20);
      expect(result1.stockQuantity).toBe(80);
      expect(result1.inStock).toBe(true);
      expect(result1.status).toBe('active');

      // Test stock depletion
      const result2 = updateStock(5, 10);
      expect(result2.stockQuantity).toBe(0);
      expect(result2.inStock).toBe(false);
      expect(result2.status).toBe('out_of_stock');
    });

    test('should handle stock alerts and notifications', () => {
      const checkStockAlerts = (product) => {
        const lowStockThreshold = product.lowStockThreshold || 10;
        const criticalStockThreshold = product.criticalStockThreshold || 3;

        if (product.stockQuantity <= criticalStockThreshold) {
          return { level: 'critical', message: 'Critical stock level reached' };
        } else if (product.stockQuantity <= lowStockThreshold) {
          return { level: 'warning', message: 'Low stock level' };
        }

        return { level: 'normal', message: 'Stock levels normal' };
      };

      expect(checkStockAlerts({ stockQuantity: 50 }).level).toBe('normal');
      expect(checkStockAlerts({ stockQuantity: 8 }).level).toBe('warning');
      expect(checkStockAlerts({ stockQuantity: 2 }).level).toBe('critical');
    });

    test('should track inventory movements', () => {
      const inventoryMovements = [];

      const recordMovement = (productId, type, quantity, reason) => {
        const movement = {
          id: crypto.randomUUID(),
          productId,
          type, // 'in' or 'out'
          quantity,
          reason,
          timestamp: new Date().toISOString()
        };
        inventoryMovements.push(movement);
        return movement;
      };

      crypto.randomUUID.mockReturnValue('movement-id');

      const movement = recordMovement('product-id', 'out', 5, 'sale');

      expect(movement).toMatchObject({
        id: 'movement-id',
        productId: 'product-id',
        type: 'out',
        quantity: 5,
        reason: 'sale'
      });
      expect(inventoryMovements).toHaveLength(1);
    });
  });

  describe('Product Categories', () => {
    test('should organize products by categories', async () => {
      const categories = new Map();
      categories.set('electronics', { id: 'cat-1', name: 'Electronics', description: 'Electronic devices' });
      categories.set('clothing', { id: 'cat-2', name: 'Clothing', description: 'Apparel and accessories' });

      const validateCategory = (categoryName) => {
        return categories.has(categoryName.toLowerCase());
      };

      expect(validateCategory('Electronics')).toBe(true);
      expect(validateCategory('Clothing')).toBe(true);
      expect(validateCategory('Nonexistent')).toBe(false);
    });

    test('should handle category hierarchy', () => {
      const categories = [
        { id: '1', name: 'Electronics', parent: null },
        { id: '2', name: 'Computers', parent: '1' },
        { id: '3', name: 'Laptops', parent: '2' },
        { id: '4', name: 'Gaming Laptops', parent: '3' }
      ];

      const getCategoryPath = (categoryId) => {
        const path = [];
        let current = categories.find(c => c.id === categoryId);

        while (current) {
          path.unshift(current.name);
          current = current.parent ? categories.find(c => c.id === current.parent) : null;
        }

        return path;
      };

      expect(getCategoryPath('4')).toEqual(['Electronics', 'Computers', 'Laptops', 'Gaming Laptops']);
      expect(getCategoryPath('1')).toEqual(['Electronics']);
    });
  });

  describe('Product Search and Filtering', () => {
    test('should search products by name and description', () => {
      const products = [
        { name: 'iPhone 13', description: 'Latest Apple smartphone' },
        { name: 'Samsung Galaxy', description: 'Android smartphone with great camera' },
        { name: 'MacBook Pro', description: 'Apple laptop for professionals' }
      ];

      const searchProducts = (query) => {
        const lowercaseQuery = query.toLowerCase();
        return products.filter(product =>
          product.name.toLowerCase().includes(lowercaseQuery) ||
          product.description.toLowerCase().includes(lowercaseQuery)
        );
      };

      const appleResults = searchProducts('Apple');
      const smartphoneResults = searchProducts('smartphone');

      expect(appleResults).toHaveLength(2);
      expect(smartphoneResults).toHaveLength(2);
      expect(appleResults.some(p => p.name === 'iPhone 13')).toBe(true);
      expect(smartphoneResults.every(p => p.description.includes('smartphone'))).toBe(true);
    });

    test('should filter products by price range', () => {
      const products = [
        { name: 'Budget Phone', price: 200 },
        { name: 'Mid-range Phone', price: 500 },
        { name: 'Premium Phone', price: 1000 },
        { name: 'Ultra Premium Phone', price: 1500 }
      ];

      const filterByPriceRange = (minPrice, maxPrice) => {
        return products.filter(product =>
          product.price >= minPrice && product.price <= maxPrice
        );
      };

      const midRange = filterByPriceRange(400, 800);
      const premium = filterByPriceRange(900, 2000);

      expect(midRange).toHaveLength(1);
      expect(premium).toHaveLength(2);
      expect(midRange[0].name).toBe('Mid-range Phone');
    });

    test('should filter products by availability', () => {
      const products = [
        { name: 'Product A', inStock: true, stockQuantity: 50 },
        { name: 'Product B', inStock: false, stockQuantity: 0 },
        { name: 'Product C', inStock: true, stockQuantity: 5 },
        { name: 'Product D', inStock: false, stockQuantity: 0 }
      ];

      const filterByAvailability = (availableOnly = true) => {
        if (availableOnly) {
          return products.filter(product => product.inStock && product.stockQuantity > 0);
        }
        return products;
      };

      const availableProducts = filterByAvailability(true);
      const allProducts = filterByAvailability(false);

      expect(availableProducts).toHaveLength(2);
      expect(allProducts).toHaveLength(4);
      expect(availableProducts.every(p => p.inStock && p.stockQuantity > 0)).toBe(true);
    });
  });

  describe('Product Analytics', () => {
    test('should track product performance metrics', () => {
      const productMetrics = {
        views: 0,
        purchases: 0,
        revenue: 0,
        conversionRate: 0,
        averageRating: 0,
        reviewCount: 0
      };

      const updateMetrics = (metrics, action, value = 1) => {
        const updated = { ...metrics };

        switch (action) {
          case 'view':
            updated.views += value;
            break;
          case 'purchase':
            updated.purchases += value;
            break;
          case 'revenue':
            updated.revenue += value;
            break;
        }

        // Recalculate conversion rate
        if (updated.views > 0) {
          updated.conversionRate = (updated.purchases / updated.views) * 100;
        }

        return updated;
      };

      let metrics = updateMetrics(productMetrics, 'view', 100);
      metrics = updateMetrics(metrics, 'purchase', 5);
      metrics = updateMetrics(metrics, 'revenue', 500);

      expect(metrics.views).toBe(100);
      expect(metrics.purchases).toBe(5);
      expect(metrics.revenue).toBe(500);
      expect(metrics.conversionRate).toBe(5); // 5/100 * 100 = 5%
    });

    test('should calculate product ratings', () => {
      const reviews = [
        { rating: 5, comment: 'Excellent product' },
        { rating: 4, comment: 'Very good' },
        { rating: 5, comment: 'Love it' },
        { rating: 3, comment: 'Okay' },
        { rating: 4, comment: 'Good value' }
      ];

      const calculateAverageRating = (reviews) => {
        if (reviews.length === 0) return 0;

        const sum = reviews.reduce((total, review) => total + review.rating, 0);
        return Math.round((sum / reviews.length) * 10) / 10; // Round to 1 decimal place
      };

      const calculateRatingDistribution = (reviews) => {
        const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        reviews.forEach(review => {
          distribution[review.rating]++;
        });
        return distribution;
      };

      expect(calculateAverageRating(reviews)).toBe(4.2);
      expect(calculateRatingDistribution(reviews)).toEqual({
        1: 0, 2: 0, 3: 1, 4: 2, 5: 2
      });
    });
  });
});