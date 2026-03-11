"use strict";

module.exports.hwhealth = function (parent) {
    var obj = {};
    obj.parent = parent;
    obj.meshServer = parent.parent;
    
    // Functions exposed to the frontend browser
    obj.exports = ['onDeviceRefreshEnd', 'loadHealthData', 'loadHealthError'];

    obj.server_startup = function () {
        console.log('HW Health plugin loaded on server.');
    };

    // ==========================================
    // Part 1: Client-Side Code (Injected into browser)
    // ==========================================
    
    obj.onDeviceRefreshEnd = function () {
        if (typeof currentNode === 'undefined' || currentNode == null) return;
        if (!currentNode.osdesc || currentNode.osdesc.toLowerCase().indexOf('windows') === -1) return;

        pluginHandler.registerPluginTab({ tabTitle: 'HW Health', tabId: 'pluginHwHealth' });

        var html = ''
            + '<div style="padding:12px;">'
            + '  <div style="font-size:18px;font-weight:bold;margin-bottom:10px;">Hardware Health</div>'
            + '  <div id="hwhealthStatus" style="margin-bottom:10px;color:#666;">Ready.</div>'
            + '  <div style="margin-bottom:10px;">'
            + '    <button id="hwhealthRefreshBtn" class="btn btn-primary">Refresh Hardware Data</button>'
            + '  </div>'
            + '  <div id="hwhealthSummary" style="margin-bottom:12px; font-size: 14px; line-height: 1.6;"></div>'
            + '  <pre id="hwhealthRaw" style="white-space:pre-wrap;background:#111;color:#33ff33;padding:10px;border-radius:6px;min-height:220px;"></pre>'
            + '</div>';

        QA('pluginHwHealth', html);

        var btn = document.getElementById('hwhealthRefreshBtn');
        if (btn) {
            btn.onclick = function () {
                if (typeof currentNode === 'undefined' || !currentNode || !currentNode._id) {
                    if (pluginHandler.hwhealth && pluginHandler.hwhealth.loadHealthError) {
                        // Pass null as the first parameter to align with the new function signature
                        pluginHandler.hwhealth.loadHealthError(null, { message: 'No device selected.' });
                    }
                    return;
                }

                QH('hwhealthSummary', '');
                QH('hwhealthRaw', '');
                QH('hwhealthStatus', 'Collecting hardware data from endpoint... (Please wait up to 15 seconds)');

                try {
                    if (typeof meshserver !== 'undefined' && meshserver != null) {
                        meshserver.send({ 
                            action: 'plugin', 
                            plugin: 'hwhealth', 
                            pluginaction: 'getHealth', 
                            nodeid: currentNode._id 
                        });
                    } else if (typeof server !== 'undefined' && server != null) {
                        server.send({ 
                            action: 'plugin', 
                            plugin: 'hwhealth', 
                            pluginaction: 'getHealth', 
                            nodeid: currentNode._id 
                        });
                    } else {
                        throw new Error("WebSocket object not found.");
                    }
                } catch (err) {
                    if (pluginHandler.hwhealth && pluginHandler.hwhealth.loadHealthError) {
                        pluginHandler.hwhealth.loadHealthError(null, { message: 'WebSocket Error: ' + err.message });
                    }
                }
            };
        }
    };

    // FIX: Added 'serverObj' as the first parameter since MeshCentral passes (websocket, message_payload)
    obj.loadHealthData = function (serverObj, msg) {
        function esc(s) {
            if (s == null) return '';
            return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        }

        var statusEl = document.getElementById('hwhealthStatus');
        var summaryEl = document.getElementById('hwhealthSummary');
        var rawEl = document.getElementById('hwhealthRaw');

        if (statusEl) statusEl.innerText = 'Hardware data loaded successfully.';

        // Validation against empty payloads
        if (!msg || !msg.data) {
            if (rawEl) rawEl.textContent = 'No data returned from Agent.\n\nRaw Msg:\n' + JSON.stringify(msg, null, 2);
            return;
        }

        var d = msg.data;

        var summaryHtml = '';
        summaryHtml += '<div><b>Computer Name:</b> ' + esc(d.computerName) + '</div>';
        summaryHtml += '<div><b>Manufacturer / Model:</b> ' + esc(d.manufacturer) + ' / ' + esc(d.model) + '</div>';
        summaryHtml += '<div><b>Serial Number:</b> ' + esc(d.serialNumber) + '</div>';
        summaryHtml += '<div><b>BIOS Version:</b> ' + esc(d.biosVersion) + '</div>';
        summaryHtml += '<div><b>CPU:</b> ' + esc(d.cpuName) + ' (Load: ' + esc(d.cpuLoad) + ', Temp: ' + esc(d.cpuTemp) + ')</div>';
        summaryHtml += '<div><b>RAM:</b> ' + esc(d.memorySummary) + '</div>';
        summaryHtml += '<div><b>Battery:</b> ' + esc(d.batterySummary) + '</div>';
        summaryHtml += '<div style="margin-top: 10px; color: #888; font-size: 12px;"><b>Collected At:</b> ' + esc(d.collectedAt) + '</div>';

        if (summaryEl) summaryEl.innerHTML = summaryHtml;
        if (rawEl) rawEl.textContent = JSON.stringify(d, null, 2);
    };

    // FIX: Added 'serverObj' as the first parameter
    obj.loadHealthError = function (serverObj, msg) {
        var statusEl = document.getElementById('hwhealthStatus');
        var rawEl = document.getElementById('hwhealthRaw');
        if (statusEl) statusEl.innerText = 'Failed to load hardware data.';
        
        if (rawEl) {
            var errorText = (msg && msg.message) ? msg.message : 'Unknown error occurred.';
            rawEl.textContent = "ERROR DUMP:\n" + errorText + "\n\nRaw Object:\n" + JSON.stringify(msg, null, 2);
        }
    };

    // ==========================================
    // Part 2: Server-Side Code (Message Routing)
    // ==========================================

    obj.serveraction = function(command, myparent, grandparent) {
        if (command.plugin !== 'hwhealth') return;

        var sessionid = null;
        try {
            sessionid = myparent.ws.sessionId;
        } catch (e) {}

        var currentSessionid = command.sessionid || sessionid;

        switch (command.pluginaction) {
            
            // Route request from Admin UI to Remote Agent
            case 'getHealth':
                var agent = obj.meshServer.webserver.wsagents[command.nodeid];
                if (agent != null) {
                    agent.send(JSON.stringify({
                        action: 'plugin',
                        plugin: 'hwhealth',
                        pluginaction: 'getHealth',
                        sessionid: currentSessionid,
                        nodeid: command.nodeid
                    }));
                } else {
                    if (currentSessionid && obj.meshServer.webserver.wssessions2 && obj.meshServer.webserver.wssessions2[currentSessionid]) {
                        obj.meshServer.webserver.wssessions2[currentSessionid].send(JSON.stringify({
                            action: 'plugin',
                            plugin: 'hwhealth',
                            method: 'loadHealthError',
                            message: 'Agent is offline or disconnected.',
                            nodeid: command.nodeid
                        }));
                    }
                }
                break;

            // Route response from Remote Agent back to Admin UI
            case 'healthData':
            case 'healthError':
                var targetSessionid = command.sessionid;
                var response = {
                    action: 'plugin',
                    plugin: 'hwhealth',
                    method: command.pluginaction === 'healthData' ? 'loadHealthData' : 'loadHealthError',
                    data: command.data,
                    message: command.message,
                    nodeid: command.nodeid
                };
                
                if (targetSessionid && obj.meshServer.webserver.wssessions2 && obj.meshServer.webserver.wssessions2[targetSessionid]) {
                    try {
                        obj.meshServer.webserver.wssessions2[targetSessionid].send(JSON.stringify(response));
                    } catch (e) {
                        console.log('HW Health routing error:', e);
                    }
                }
                break;
        }
    };

    return obj;
};
