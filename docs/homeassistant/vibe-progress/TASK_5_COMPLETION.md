# Task 5 Completion: Implement Breaking Change for State Topic Publishing

## Description
Implemented the breaking change for state topic publishing as specified in the TSD Section 5.4. This changes the MQTT topic format for all devices and ensures messages are not retained.

## Implemented Changes

### 1. MQTT Topic Format Change (`mqtt-client.js`)
- Updated the `constructTopic` function to use the new state topic format:
  - Old format: `<MQTT_TOPIC_PREFIX>/device/<MAC_ADDRESS>`
  - New format: `<MQTT_TOPIC_PREFIX>/state/<MAC_ADDRESS>`
- Added clear documentation about this being a breaking change
- Maintained compatibility with existing MQTT topic prefix handling

### 2. Retain Flag Enforcement
- Modified the publishing logic to always set `retain: false` for state messages
- This overrides any value set in the `MQTT_RETAIN` environment variable
- Added comments explaining that this is required for Home Assistant compatibility

### 3. Updated Unit Tests
- Modified tests for the `constructTopic` function to verify the new format
- Updated tests for the `publishDeviceData` function to verify that messages are never retained
- Ensured all tests now pass with the new implementation

## Impact on Existing Users
- **Breaking Change**: Clients subscribing to the old topic format (`device/<MAC>`) will need to update to subscribe to the new format (`state/<MAC>`)
- All BLE devices will now use the new `/state/` topic format regardless of Home Assistant configuration
- This change ensures consistency and Home Assistant compatibility throughout the application

## Files Modified
- `/src/mqtt-client.js` - Updated topic construction and publishing logic
- `/test/mqtt-client.test.js` - Updated tests to verify new behavior

## Next Steps
- Write unit/integration tests for the complete Home Assistant integration (Task 6)
- Update documentation for Docker environment variables (Task 7)
- Perform end-to-end testing with Home Assistant (Task 8)

## Notes
- This change aligns with the specification in TSD Section 5.4
- The implementation ensures that state messages are never retained, which is a requirement for Home Assistant
- The topic format change applies to all devices, ensuring consistency across the application
