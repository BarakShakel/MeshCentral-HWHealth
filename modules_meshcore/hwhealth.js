var exports = module.exports;

exports.getHardwareHealth = function() {

    var data = "Hello from the Remote Agent! Ready to scan hardware.";

    require('meshcore').send({ 
        action: 'plugin', 
        plugin: 'hwhealth', 
        method: 'healthData', 
        data: data 
    });
};
