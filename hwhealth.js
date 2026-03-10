"use strict";

module.exports.hwhealth = function (parent) {
    const obj = {};
    obj.parent = parent;
    obj.meshServer = parent.parent;

    // Export UI hooks to MeshCentral Web UI
    obj.exports = ['registerPluginTab', 'onDeviceRefreshEnd'];

    obj.server_startup = function () {
        console.log("HW Health plugin loaded successfully.");
    };

    // This tells MeshCentral to create a device tab
    obj.registerPluginTab = function () {
        return { tabId: 'hwhealth', tabTitle: 'HW Health' };
    };

    // Called when a device page is refreshed/selected
    obj.onDeviceRefreshEnd = function () {
        try {
            const tab = document.getElementById('hwhealth');
            if (!tab) return;

            tab.innerHTML = `
                <div style="padding:12px;">
                    <div style="font-size:16px;font-weight:bold;margin-bottom:10px;">Hardware Health</div>
                    <div id="hwhealth_status">Loading hardware information...</div>
                    <pre id="hwhealth_data" style="margin-top:10px;white-space:pre-wrap;"></pre>
                </div>
            `;

            // Try to locate current node/device id from page globals
            const nodeId =
                (typeof currentNode !== 'undefined' && currentNode && currentNode._id) ? currentNode._id :
                (typeof nodeid !== 'undefined') ? nodeid :
                null;

            if (!nodeId) {
                document.getElementById('hwhealth_status').innerText =
                    'Tab loaded, but no device context was found.';
                return;
            }

            // Ask server side of the plugin for data
            if (typeof meshserver !== 'undefined' && meshserver && typeof meshserver.send === 'function') {
                meshserver.send({
                    action: 'plugin',
                    plugin: 'hwhealth',
                    method: 'getHealth',
                    nodeid: nodeId
                });

                document.getElementById('hwhealth_status').innerText =
                    'Request sent to server. Waiting for hardware data...';
            } else {
                document.getElementById('hwhealth_status').innerText =
                    'Tab created, but meshserver.send is unavailable in this UI context.';
            }
        } catch (ex) {
            console.log('HW Health UI error:', ex);
        }
    };

    // Handle incoming websocket plugin messages
    obj.hook_webSocketMessage = function (req, user, ws, msg) {
        if (!msg || msg.action !== 'plugin' || msg.plugin !== 'hwhealth') return;

        if (msg.method === 'getHealth') {
            // TODO: Replace with real agent/server hardware collection logic
            const responseData = [
                "CPU Temp: 45°C",
                "Disk C: 85% Healthy",
                "Battery: 92% (Charging)"
            ].join('\n');

            try {
                ws.send(JSON.stringify({
                    action: 'plugin',
                    plugin: 'hwhealth',
                    method: 'healthData',
                    nodeid: msg.nodeid || null,
                    data: responseData
                }));
            } catch (ex) {
                console.log("Error sending hwhealth data: " + ex);
            }
        }
    };

    return obj;
};
