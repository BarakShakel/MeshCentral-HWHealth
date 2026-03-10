"use strict";

module.exports.hwhealth = function (parent) {
    var obj = {};
    obj.parent = parent;
    obj.meshServer = parent.parent;

    obj.server_startup = function () {
        console.log("HW Health plugin loaded successfully.");
    };

    obj.hook_webSocketMessage = function (req, user, ws, msg) {
        if (msg.action === 'plugin' && msg.plugin === 'hwhealth') {
            if (msg.method === 'getHealth') {
                // בעתיד נחליף את זה בפקודה אמיתית ל-Agent
                var responseData = "CPU Temp: 45°C\nDisk C: 85% Healthy\nBattery: 92% (Charging)";
                
                try {
                    ws.send(JSON.stringify({ 
                        action: 'plugin', 
                        plugin: 'hwhealth', 
                        method: 'healthData', 
                        data: responseData 
                    }));
                } catch (ex) {
                    console.log("Error sending hwhealth data: " + ex);
                }
            }
        }
    };

    return obj;
};
