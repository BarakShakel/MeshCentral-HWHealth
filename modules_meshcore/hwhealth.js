var exports = module.exports;

// This is just a placeholder for future real hardware collection.
// You can later add PowerShell / WMIC / platform-specific collection here.
exports.getHardwareHealth = function () {
    try {
        var os = require('os');

        var data = {
            hostname: os.hostname(),
            platform: os.platform(),
            arch: os.arch(),
            uptimeSeconds: os.uptime(),
            totalMemory: os.totalmem(),
            freeMemory: os.freemem(),
            cpus: os.cpus() ? os.cpus().length : 0,
            note: 'Basic agent-side data collected successfully.'
        };

        require('meshcore').send({
            action: 'plugin',
            plugin: 'hwhealth',
            pluginaction: 'healthData',
            data: data
        });
    } catch (ex) {
        require('meshcore').send({
            action: 'plugin',
            plugin: 'hwhealth',
            pluginaction: 'healthData',
            data: {
                error: ex.toString()
            }
        });
    }
};
