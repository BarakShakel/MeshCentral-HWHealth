"use strict";

module.exports.hwhealth = function (parent) {
    var obj = {};
    obj.parent = parent;
    obj.meshServer = parent.parent;

    // Expose these functions to the MeshCentral web UI
    obj.exports = ['onDeviceRefreshEnd', 'loadHealthData', 'loadHealthError'];

    obj.server_startup = function () {
        console.log('HW Health plugin loaded successfully.');
    };

    // -------------------------
    // Frontend / Web UI methods
    // -------------------------
    obj.onDeviceRefreshEnd = function (nodeid, panel, refresh, event) {
        if (typeof currentNode === 'undefined' || currentNode == null) return;

        // Create / register tab
        pluginHandler.registerPluginTab({
            tabTitle: 'HW Health',
            tabId: 'pluginHwHealth'
        });

        var html = ''
            + '<div style="padding:12px;">'
            + '  <div style="font-size:18px;font-weight:bold;margin-bottom:10px;">Hardware Health</div>'
            + '  <div id="hwhealthStatus" style="margin-bottom:10px;color:#666;">Loading...</div>'
            + '  <div style="margin-bottom:10px;">'
            + '    <button id="hwhealthRefreshBtn" class="btn">Refresh</button>'
            + '  </div>'
            + '  <pre id="hwhealthData" style="white-space:pre-wrap;background:#111;color:#ddd;padding:10px;border-radius:6px;min-height:180px;"></pre>'
            + '</div>';

        QA('pluginHwHealth', html);

        var btn = document.getElementById('hwhealthRefreshBtn');
        if (btn) {
            btn.onclick = function () {
                if (typeof currentNode === 'undefined' || !currentNode || !currentNode._id) {
                    obj.loadHealthError({ message: 'No device is currently selected.' });
                    return;
                }

                var statusEl = document.getElementById('hwhealthStatus');
                var dataEl = document.getElementById('hwhealthData');
                if (statusEl) statusEl.innerText = 'Requesting health data...';
                if (dataEl) dataEl.textContent = '';

                meshserver.send({
                    action: 'plugin',
                    plugin: 'hwhealth',
                    pluginaction: 'getHealth',
                    nodeid: currentNode._id
                });
            };
        }

        // Auto refresh once when tab opens
        setTimeout(function () {
            if (btn) btn.click();
        }, 50);
    };

    obj.loadHealthData = function (msg) {
        var statusEl = document.getElementById('hwhealthStatus');
        var dataEl = document.getElementById('hwhealthData');

        if (statusEl) statusEl.innerText = 'Health data loaded successfully.';
        if (dataEl) {
            dataEl.textContent = JSON.stringify(msg.data, null, 2);
        }
    };

    obj.loadHealthError = function (msg) {
        var statusEl = document.getElementById('hwhealthStatus');
        var dataEl = document.getElementById('hwhealthData');

        if (statusEl) statusEl.innerText = 'Failed to load health data.';
        if (dataEl) {
            dataEl.textContent = (msg && msg.message) ? msg.message : 'Unknown error.';
        }
    };

    // -------------------------
    // Backend / Server methods
    // -------------------------
    obj.serveraction = function (command, myparent, grandparent) {
        if (!command || command.plugin !== 'hwhealth') return;

        var sessionid = null;
        try {
            sessionid = myparent.ws.sessionId;
        } catch (e) { }

        switch (command.pluginaction) {
            case 'getHealth':
                try {
                    var nodeid = command.nodeid;
                    var agentConnected = false;

                    if (obj.meshServer &&
                        obj.meshServer.webserver &&
                        obj.meshServer.webserver.wsagents &&
                        obj.meshServer.webserver.wsagents[nodeid]) {
                        agentConnected = true;
                    }

                    // Working skeleton:
                    // this proves the tab/UI/server path is working.
                    // Later you can replace this block with real agent-side collection.
                    var response = {
                        nodeid: nodeid,
                        collectedAt: new Date().toISOString(),
                        online: agentConnected,
                        source: 'server skeleton',
                        summary: {
                            message: 'Plugin UI path is working.',
                            nextStep: 'Replace this object with real hardware collection from the agent.'
                        },
                        sample: {
                            cpuTemperature: 'N/A yet',
                            diskHealth: 'N/A yet',
                            battery: 'N/A yet'
                        }
                    };

                    obj.sendToSession(sessionid, {
                        action: 'plugin',
                        plugin: 'hwhealth',
                        method: 'loadHealthData',
                        nodeid: nodeid,
                        data: response
                    });
                } catch (ex) {
                    obj.sendToSession(sessionid, {
                        action: 'plugin',
                        plugin: 'hwhealth',
                        method: 'loadHealthError',
                        message: ex.toString()
                    });
                }
                break;
        }
    };

    obj.sendToSession = function (sessionid, payload) {
        try {
            if (!sessionid) return;
            if (!obj.meshServer ||
                !obj.meshServer.webserver ||
                !obj.meshServer.webserver.wssessions2 ||
                !obj.meshServer.webserver.wssessions2[sessionid]) return;

            obj.meshServer.webserver.wssessions2[sessionid].send(JSON.stringify(payload));
        } catch (e) {
            console.log('HW Health sendToSession error: ' + e);
        }
    };

    return obj;
};
