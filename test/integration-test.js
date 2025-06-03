/**
 * Integration Test for Request Body Decoding
 * Test the actual server implementation
 */

const http = require('http');
const msgpack = require('msgpack5')();

// Test data
const testData = {
    v: '1.5.0',
    mid: 12345,
    time: Math.floor(Date.now() / 1000),
    ip: '192.168.1.100',
    mac: '12:34:56:78:9A:BC',
    rssi: -45,
    devices: [
        Buffer.from([0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0xC0, 0x02, 0x01, 0x06]),
        Buffer.from([0x01, 0x66, 0x55, 0x44, 0x33, 0x22, 0x11, 0xB0, 0x02, 0x01, 0x1A])
    ]
};

function testMessagePackRequest() {
    return new Promise((resolve, reject) => {
        const packedData = msgpack.encode(testData);
        
        const options = {
            hostname: 'localhost',
            port: 8000,
            path: '/tokendata',
            method: 'POST',
            headers: {
                'Content-Type': 'application/msgpack',
                'Content-Length': packedData.length
            }
        };
        
        const req = http.request(options, (res) => {
            console.log(`MessagePack request status: ${res.statusCode}`);
            console.log('Response headers:', res.headers);
            
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 204) {
                    console.log('✅ MessagePack request successful');
                    resolve();
                } else {
                    console.log('❌ MessagePack request failed:', data);
                    reject(new Error(`Unexpected status: ${res.statusCode}`));
                }
            });
        });
        
        req.on('error', (err) => {
            console.log('❌ MessagePack request error:', err.message);
            reject(err);
        });
        
        req.write(packedData);
        req.end();
    });
}

function testJsonRequest() {
    return new Promise((resolve, reject) => {
        const jsonData = {
            v: '1.5.0',
            mid: 54321,
            ip: '192.168.1.200',
            mac: 'AA:BB:CC:DD:EE:FF',
            devices: [
                '0011223344556C002010603020F18050954657374',
                '016655443322114B02011A030312180000000000'
            ]
        };
        
        const jsonString = JSON.stringify(jsonData);
        
        const options = {
            hostname: 'localhost',
            port: 8000,
            path: '/tokendata',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(jsonString)
            }
        };
        
        const req = http.request(options, (res) => {
            console.log(`JSON request status: ${res.statusCode}`);
            console.log('Response headers:', res.headers);
            
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 204) {
                    console.log('✅ JSON request successful');
                    resolve();
                } else {
                    console.log('❌ JSON request failed:', data);
                    reject(new Error(`Unexpected status: ${res.statusCode}`));
                }
            });
        });
        
        req.on('error', (err) => {
            console.log('❌ JSON request error:', err.message);
            reject(err);
        });
        
        req.write(jsonString);
        req.end();
    });
}

async function runIntegrationTests() {
    console.log('Starting integration tests for request body decoding...\n');
    
    console.log('Testing MessagePack request...');
    try {
        await testMessagePackRequest();
    } catch (error) {
        console.error('MessagePack test failed:', error.message);
        return;
    }
    
    console.log('\nTesting JSON request...');
    try {
        await testJsonRequest();
    } catch (error) {
        console.error('JSON test failed:', error.message);
        return;
    }
    
    console.log('\n🎉 All integration tests passed!');
}

// Run tests after a short delay to allow server to start
setTimeout(runIntegrationTests, 1000);
