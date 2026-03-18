/**
 * ConsoleKit Demo Application
 * ───────────────────────────
 * 1. Ensure the ConsoleKit extension is installed and active.
 * 2. Look for "ConsoleKit: Waiting..." in your Status Bar.
 * 3. Run this file with Node.js: `node demo.js`
 */

// Step 1: Inject the runtime (Use the absolute path to ensure it works from anywhere)
require('./runtime/consolekit-runtime');

console.log('--- ConsoleKit Demo Start ---');

// Standard logs
console.log('Hello from ConsoleKit! This should show up inline.');
console.log('Current time is:', new Date().toLocaleTimeString());

// Level-based logs
console.warn('This is a warning log.');
console.error('This is an error log.');
console.info('This is an info log.');
console.debug('This is a debug log.');

// Objects (will be expandable in the sidebar)
const user = {
    id: 1,
    name: 'Sourabh',
    roles: ['developer', 'architect'],
    metadata: {
        lastLogin: new Date().toISOString(),
        theme: 'dark-catppuccin'
    }
};
console.log('Object test:', user);

// Loops
for (let i = 1; i <= 3; i++) {
    console.log(`Loop iteration ${i}`);
}

console.log('--- Demo Complete (The process will stay alive briefly to send logs) ---');

// Keep the process alive for a moment to ensure logs are sent over WebSocket
setTimeout(() => {
    process.exit(0);
}, 2000);
