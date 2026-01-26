This software is designed to connect a TimeFlip device to the TimeTagger time tracking system. It listens for facet changes on the TimeFlip and creates time entries in TimeTagger accordingly.

## Important: TimeFlip BLE Behavior

TimeFlip is a Bluetooth Low Energy (BLE) device. This means:

1. **The device is normally asleep and disconnected** - This is by design to preserve battery life
2. **It only wakes up briefly when the caret is physically flipped** - During this brief window (a few seconds), the connector can read the new facet and update TimeTagger
3. **After updating, the device goes back to sleep** - This is expected behavior, NOT an error

### Implications for the connector:

- **Connection timeouts are normal** - The app continuously tries to connect, but timeouts are expected when the device is asleep
- **No error logging for disconnections** - Being disconnected is the default state
- **Timers continue running** - When the TimeFlip goes to sleep, any active TimeTagger timer keeps running until the next facet change
- **PM2 should not restart the app** - The app runs indefinitely, handling BLE reconnections internally

The web interface shows:
- Active timer in TimeTagger (if any)
- Last facet change time
- Current facet name

It does NOT show connection status, since the device is almost always disconnected by design.

To reload the connector ALWAYS use 

```bash
sudo service timeflip-connector restart
```
Do not use pm2 directly, because despite you could be able to restart the process, systemd would not be aware of it and it will stay running in the background.