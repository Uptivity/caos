/**
 * CAOS CRM - Health Check Script
 * Used by Docker healthcheck and monitoring systems
 */

const http = require('http');
const process = require('process');

const options = {
    host: 'localhost',
    port: process.env.PORT || 3001,
    path: '/api/health',
    method: 'GET',
    timeout: 10000
};

const healthCheck = http.request(options, (res) => {
    console.log(`Health Check Status: ${res.statusCode}`);

    if (res.statusCode === 200) {
        let data = '';
        res.on('data', (chunk) => {
            data += chunk;
        });

        res.on('end', () => {
            try {
                const response = JSON.parse(data);
                if (response.status === 'healthy') {
                    console.log('✅ Service is healthy');
                    process.exit(0);
                } else {
                    console.log('❌ Service reports unhealthy status');
                    process.exit(1);
                }
            } catch (err) {
                console.log('❌ Invalid health check response');
                process.exit(1);
            }
        });
    } else {
        console.log(`❌ Health check failed with status: ${res.statusCode}`);
        process.exit(1);
    }
});

healthCheck.on('error', (err) => {
    console.log(`❌ Health check error: ${err.message}`);
    process.exit(1);
});

healthCheck.on('timeout', () => {
    console.log('❌ Health check timeout');
    process.exit(1);
});

healthCheck.end();