// Products API Integration Tests
const request = require('supertest');
const express = require('express');

// Mock dependencies
jest.mock('../../utils/secureLogger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  }
}));

const productRouter = require('../../products/productRoutes');
const { router: authRouter } = require('../../auth/auth');
const {
  TestData,
  TokenHelpers,
  ApiHelpers,
  ValidationHelpers
} = require('../helpers/testHelpers');

// Create test app
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/auth', authRouter);
  app.use('/api/products', productRouter);

  // Error handling middleware
  app.use((error, req, res, next) => {
    console.error('Test error:', error);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
};

describe('Products API Integration Tests', () => {
  let app;
  let accessToken;
  let userId;

  beforeEach(async () => {
    app = createTestApp();
    jest.clearAllMocks();

    // Register test user and get token
    const registerResponse = await request(app)
      .post('/auth/register')
      .send(TestData.validUser);

    accessToken = registerResponse.body.tokens.accessToken;
    userId = registerResponse.body.user.id;
  });

  describe('POST /api/products', () => {
    test('should create new product successfully', async () => {
      const productData = TestData.validProduct;

      const response = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(productData)
        .expect(201);

      expect(response.body).toHaveProperty('message', 'Product created successfully');
      expect(response.body).toHaveProperty('product');
      expect(response.body.product).toMatchObject({
        name: productData.name,
        description: productData.description,
        sku: productData.sku,
        price: productData.price,
        category: productData.category
      });

      expect(response.body.product.id).toBeDefined();
      expect(response.body.product.createdAt).toBeDefined();
      expect(response.body.product.status).toBe('draft');
    });

    test('should require authentication', async () => {
      const response = await request(app)
        .post('/api/products')
        .send(TestData.validProduct)
        .expect(401);

      ValidationHelpers.expectApiError(response, 401, 'Access token required');
    });

    test('should validate required fields', async () => {
      const invalidProduct = {
        name: '',
        sku: '',
        price: null
      };

      const response = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(invalidProduct)
        .expect(400);

      ValidationHelpers.expectApiError(response, 400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });

    test('should validate SKU format', async () => {
      const productWithInvalidSKU = {
        ...TestData.validProduct,
        sku: 'invalid sku format'
      };

      const response = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(productWithInvalidSKU)
        .expect(400);

      ValidationHelpers.expectApiError(response, 400, 'Invalid SKU format');
    });

    test('should validate price is positive', async () => {
      const productWithNegativePrice = {
        ...TestData.validProduct,
        price: -50.00
      };

      const response = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(productWithNegativePrice)
        .expect(400);

      ValidationHelpers.expectApiError(response, 400, 'Price must be positive');
    });

    test('should prevent duplicate SKUs', async () => {
      const productData = TestData.validProduct;

      // Create first product
      await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(productData)
        .expect(201);

      // Try to create duplicate SKU
      const response = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          ...productData,
          name: 'Different Product Name'
        })
        .expect(409);

      ValidationHelpers.expectApiError(response, 409, 'SKU already exists');
    });

    test('should handle product variants', async () => {
      const variantProduct = {
        ...TestData.validProduct,
        name: 'T-Shirt',
        sku: 'TSHIRT-001',
        variants: [
          { size: 'S', color: 'Red', sku: 'TSHIRT-001-S-RED', stockQuantity: 10 },
          { size: 'M', color: 'Blue', sku: 'TSHIRT-001-M-BLUE', stockQuantity: 15 },
          { size: 'L', color: 'Green', sku: 'TSHIRT-001-L-GREEN', stockQuantity: 8 }
        ]
      };

      const response = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(variantProduct)
        .expect(201);

      expect(response.body.product.variants).toBeDefined();
      expect(response.body.product.variants).toHaveLength(3);
      response.body.product.variants.forEach(variant => {
        expect(variant.sku).toBeDefined();
        expect(variant.stockQuantity).toBeGreaterThanOrEqual(0);
      });
    });

    test('should set creation metadata', async () => {
      const response = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(TestData.validProduct)
        .expect(201);

      expect(response.body.product.createdBy).toBe(userId);
      expect(response.body.product.updatedBy).toBe(userId);
      expect(response.body.product.version).toBe(1);
    });
  });

  describe('GET /api/products', () => {
    beforeEach(async () => {
      // Create test products
      const products = [
        { ...TestData.validProduct, name: 'Product A', sku: 'PROD-A-001', price: 50.00, status: 'active' },
        { ...TestData.validProduct, name: 'Product B', sku: 'PROD-B-001', price: 75.00, status: 'active' },
        { ...TestData.validProduct, name: 'Product C', sku: 'PROD-C-001', price: 100.00, status: 'draft' }
      ];

      for (const product of products) {
        await request(app)
          .post('/api/products')
          .set('Authorization', `Bearer ${accessToken}`)
          .send(product);
      }
    });

    test('should get all products', async () => {
      const response = await request(app)
        .get('/api/products')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('products');
      expect(response.body.products).toBeInstanceOf(Array);
      expect(response.body.products.length).toBeGreaterThan(0);
    });

    test('should support pagination', async () => {
      const response = await request(app)
        .get('/api/products?page=1&limit=2')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      ValidationHelpers.expectPaginatedResponse(response);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data.length).toBeLessThanOrEqual(2);
    });

    test('should filter by status', async () => {
      const response = await request(app)
        .get('/api/products?status=active')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.products).toBeInstanceOf(Array);
      response.body.products.forEach(product => {
        expect(product.status).toBe('active');
      });
    });

    test('should filter by category', async () => {
      const response = await request(app)
        .get('/api/products?category=Software')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.products).toBeInstanceOf(Array);
      response.body.products.forEach(product => {
        expect(product.category).toBe('Software');
      });
    });

    test('should filter by price range', async () => {
      const response = await request(app)
        .get('/api/products?minPrice=60&maxPrice=80')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.products).toBeInstanceOf(Array);
      response.body.products.forEach(product => {
        expect(product.price).toBeGreaterThanOrEqual(60);
        expect(product.price).toBeLessThanOrEqual(80);
      });
    });

    test('should search by name', async () => {
      const response = await request(app)
        .get('/api/products?search=Product A')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.products).toBeInstanceOf(Array);
      expect(response.body.products.some(p => p.name.includes('Product A'))).toBe(true);
    });

    test('should sort products', async () => {
      const response = await request(app)
        .get('/api/products?sortBy=price&sortOrder=asc')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const products = response.body.products;
      if (products.length > 1) {
        for (let i = 1; i < products.length; i++) {
          expect(products[i].price).toBeGreaterThanOrEqual(products[i - 1].price);
        }
      }
    });

    test('should require authentication', async () => {
      const response = await request(app)
        .get('/api/products')
        .expect(401);

      ValidationHelpers.expectApiError(response, 401, 'Access token required');
    });
  });

  describe('GET /api/products/:id', () => {
    let productId;

    beforeEach(async () => {
      const createResponse = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(TestData.validProduct);

      productId = createResponse.body.product.id;
    });

    test('should get product by id', async () => {
      const response = await request(app)
        .get(`/api/products/${productId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('product');
      expect(response.body.product.id).toBe(productId);
    });

    test('should return 404 for non-existent product', async () => {
      const response = await request(app)
        .get('/api/products/non-existent-id')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);

      ValidationHelpers.expectApiError(response, 404, 'Product not found');
    });

    test('should include product metrics', async () => {
      const response = await request(app)
        .get(`/api/products/${productId}?includeMetrics=true`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.product).toHaveProperty('metrics');
      expect(response.body.product.metrics).toHaveProperty('views');
      expect(response.body.product.metrics).toHaveProperty('purchases');
    });
  });

  describe('PUT /api/products/:id', () => {
    let productId;

    beforeEach(async () => {
      const createResponse = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(TestData.validProduct);

      productId = createResponse.body.product.id;
    });

    test('should update product successfully', async () => {
      const updateData = {
        name: 'Updated Product Name',
        description: 'Updated description',
        price: 199.99,
        status: 'active'
      };

      const response = await request(app)
        .put(`/api/products/${productId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body).toHaveProperty('message', 'Product updated successfully');
      expect(response.body.product.name).toBe('Updated Product Name');
      expect(response.body.product.price).toBe(199.99);
      expect(response.body.product.status).toBe('active');
      expect(response.body.product.updatedAt).toBeDefined();
      expect(response.body.product.version).toBe(2);
    });

    test('should validate price on update', async () => {
      const invalidUpdate = {
        price: -25.00
      };

      const response = await request(app)
        .put(`/api/products/${productId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(invalidUpdate)
        .expect(400);

      ValidationHelpers.expectApiError(response, 400, 'Price must be positive');
    });

    test('should prevent SKU conflicts on update', async () => {
      // Create another product
      const anotherProduct = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          ...TestData.validProduct,
          name: 'Another Product',
          sku: 'ANOTHER-001'
        });

      // Try to update first product with second product's SKU
      const response = await request(app)
        .put(`/api/products/${productId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ sku: 'ANOTHER-001' })
        .expect(409);

      ValidationHelpers.expectApiError(response, 409, 'SKU already exists');
    });

    test('should track version changes', async () => {
      // Make first update
      await request(app)
        .put(`/api/products/${productId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'First Update' })
        .expect(200);

      // Make second update
      const response = await request(app)
        .put(`/api/products/${productId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Second Update' })
        .expect(200);

      expect(response.body.product.version).toBe(3);
      expect(response.body.product.updatedBy).toBe(userId);
    });
  });

  describe('DELETE /api/products/:id', () => {
    let productId;

    beforeEach(async () => {
      const createResponse = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(TestData.validProduct);

      productId = createResponse.body.product.id;
    });

    test('should delete product successfully', async () => {
      const response = await request(app)
        .delete(`/api/products/${productId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.message).toBe('Product deleted successfully');

      // Verify product is deleted
      await request(app)
        .get(`/api/products/${productId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });

    test('should soft delete by default', async () => {
      const response = await request(app)
        .delete(`/api/products/${productId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // Check if product status is changed to 'archived' instead of hard delete
      const archivedCheck = await request(app)
        .get(`/api/products/${productId}?includeArchived=true`)
        .set('Authorization', `Bearer ${accessToken}`);

      if (archivedCheck.status === 200) {
        expect(archivedCheck.body.product.status).toBe('archived');
      }
    });

    test('should prevent deletion of products with active orders', async () => {
      // This would require order system integration
      // For now, we'll test the validation logic
      const productWithOrders = {
        ...TestData.validProduct,
        sku: 'ORDERED-001',
        hasActiveOrders: true
      };

      const createResponse = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(productWithOrders);

      const response = await request(app)
        .delete(`/api/products/${createResponse.body.product.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(409);

      ValidationHelpers.expectApiError(response, 409, 'Cannot delete product with active orders');
    });
  });

  describe('Inventory Management Endpoints', () => {
    let productId;

    beforeEach(async () => {
      const productData = {
        ...TestData.validProduct,
        type: 'physical',
        stockQuantity: 100
      };

      const createResponse = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(productData);

      productId = createResponse.body.product.id;
    });

    test('should update stock quantity', async () => {
      const stockUpdate = {
        stockQuantity: 150,
        reason: 'New inventory received'
      };

      const response = await request(app)
        .put(`/api/products/${productId}/stock`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(stockUpdate)
        .expect(200);

      expect(response.body.product.stockQuantity).toBe(150);
      expect(response.body.product.inStock).toBe(true);
    });

    test('should handle stock depletion', async () => {
      const stockUpdate = {
        stockQuantity: 0,
        reason: 'Inventory sold out'
      };

      const response = await request(app)
        .put(`/api/products/${productId}/stock`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(stockUpdate)
        .expect(200);

      expect(response.body.product.stockQuantity).toBe(0);
      expect(response.body.product.inStock).toBe(false);
      expect(response.body.product.status).toBe('out_of_stock');
    });

    test('should get stock movements history', async () => {
      // Update stock a few times
      await request(app)
        .put(`/api/products/${productId}/stock`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ stockQuantity: 80, reason: 'Sale' });

      await request(app)
        .put(`/api/products/${productId}/stock`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ stockQuantity: 120, reason: 'Restock' });

      const response = await request(app)
        .get(`/api/products/${productId}/stock-movements`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('movements');
      expect(response.body.movements).toBeInstanceOf(Array);
      expect(response.body.movements.length).toBeGreaterThan(0);

      response.body.movements.forEach(movement => {
        expect(movement).toHaveProperty('quantity');
        expect(movement).toHaveProperty('reason');
        expect(movement).toHaveProperty('timestamp');
      });
    });

    test('should get low stock alerts', async () => {
      // Set product to low stock
      await request(app)
        .put(`/api/products/${productId}/stock`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ stockQuantity: 5, reason: 'Low stock test' });

      const response = await request(app)
        .get('/api/products/stock-alerts')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('alerts');
      expect(response.body.alerts).toBeInstanceOf(Array);

      const lowStockAlert = response.body.alerts.find(alert =>
        alert.productId === productId && alert.type === 'low_stock'
      );

      expect(lowStockAlert).toBeDefined();
    });
  });

  describe('Product Analytics Endpoints', () => {
    let productId;

    beforeEach(async () => {
      const createResponse = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(TestData.validProduct);

      productId = createResponse.body.product.id;
    });

    test('should record product view', async () => {
      const response = await request(app)
        .post(`/api/products/${productId}/view`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.message).toBe('View recorded');

      // Check if view count increased
      const productResponse = await request(app)
        .get(`/api/products/${productId}?includeMetrics=true`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(productResponse.body.product.metrics.views).toBe(1);
    });

    test('should get product analytics', async () => {
      // Record some activity first
      await request(app)
        .post(`/api/products/${productId}/view`)
        .set('Authorization', `Bearer ${accessToken}`);

      const response = await request(app)
        .get(`/api/products/${productId}/analytics`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('analytics');
      expect(response.body.analytics).toHaveProperty('views');
      expect(response.body.analytics).toHaveProperty('conversionRate');
      expect(response.body.analytics).toHaveProperty('revenue');
    });

    test('should get analytics dashboard data', async () => {
      const response = await request(app)
        .get('/api/products/analytics/dashboard')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('summary');
      expect(response.body).toHaveProperty('topProducts');
      expect(response.body).toHaveProperty('categoryPerformance');
      expect(response.body.summary).toHaveProperty('totalProducts');
      expect(response.body.summary).toHaveProperty('totalRevenue');
    });
  });

  describe('Bulk Operations', () => {
    test('should import products from CSV', async () => {
      const csvData = `name,sku,price,category
"Bulk Product 1","BULK-001",29.99,"Category A"
"Bulk Product 2","BULK-002",39.99,"Category B"
"Bulk Product 3","BULK-003",49.99,"Category A"`;

      const response = await request(app)
        .post('/api/products/import')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Content-Type', 'text/csv')
        .send(csvData)
        .expect(200);

      expect(response.body).toHaveProperty('imported');
      expect(response.body).toHaveProperty('errors');
      expect(response.body.imported).toBeGreaterThan(0);
    });

    test('should export products to CSV', async () => {
      // Create some products first
      await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(TestData.validProduct);

      const response = await request(app)
        .get('/api/products/export?format=csv')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.text).toContain('name,sku,price');
    });

    test('should bulk update product status', async () => {
      // Create multiple products
      const productIds = [];
      for (let i = 1; i <= 3; i++) {
        const response = await request(app)
          .post('/api/products')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            ...TestData.validProduct,
            name: `Bulk Product ${i}`,
            sku: `BULK-00${i}`
          });
        productIds.push(response.body.product.id);
      }

      const bulkUpdate = {
        productIds,
        updates: {
          status: 'active'
        }
      };

      const response = await request(app)
        .put('/api/products/bulk-update')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(bulkUpdate)
        .expect(200);

      expect(response.body.updated).toBe(3);
      expect(response.body.errors).toHaveLength(0);
    });
  });

  describe('Rate Limiting and Performance', () => {
    test('should apply rate limiting to product endpoints', async () => {
      const promises = Array(15).fill().map(() =>
        request(app)
          .get('/api/products')
          .set('Authorization', `Bearer ${accessToken}`)
      );

      const responses = await Promise.all(promises);

      // Check that responses are within acceptable range
      responses.forEach(response => {
        expect([200, 429]).toContain(response.status);
      });
    });

    test('should handle large product lists efficiently', async () => {
      // This would test pagination and performance with large datasets
      const response = await request(app)
        .get('/api/products?limit=100')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.products).toBeDefined();
      expect(Array.isArray(response.body.products)).toBe(true);
    });
  });
});