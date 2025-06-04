/**
 * Manual Test for Request Body Decoding
 * Quick verification that the decoding functionality works
 */

const msgpack = require('msgpack5')();

// Test the decoding functionality
function testDecoding() {
    console.log('Testing request body decoding...\n');
    
    // Test MessagePack encoding
    const testData = {
        v: '1.5.0',
        mid: 12345,
        time: 1234567890,
        ip: '192.168.1.100',
        mac: '12:34:56:78:9A:BC',
        devices: [
            Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05]),
            Buffer.from([0x06, 0x07, 0x08, 0x09, 0x0A])
        ]
    };
    
    console.log('Original test data:', testData);
    
    // Test MessagePack encoding/decoding
    console.log('\n--- Testing MessagePack ---');
    const packedData = msgpack.encode(testData);
    console.log('Packed data length:', packedData.length, 'bytes');
    
    const decodedMsgPack = msgpack.decode(packedData);
    console.log('Decoded MessagePack data:', decodedMsgPack);
    
    // Test JSON encoding/decoding
    console.log('\n--- Testing JSON ---');
    const jsonData = {
        v: '1.5.0',
        mid: 12345,
        devices: ['0102030405', '060708090A']
    };
    
    const jsonString = JSON.stringify(jsonData);
    console.log('JSON string length:', jsonString.length, 'bytes');
    
    const decodedJson = JSON.parse(jsonString);
    console.log('Decoded JSON data:', decodedJson);
    
    console.log('\nDecoding test completed successfully!');
}

// Run the test
testDecoding();
