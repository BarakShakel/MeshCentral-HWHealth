"use strict";

module.exports.hwhealth = function (parent) {
    var obj = {};
    obj.parent = parent;
    obj.meshServer = parent.parent;
    obj.exports = ['onDeviceRefreshEnd', 'loadHealthData', 'loadHealthError'];

    obj.server_startup = function () {
        console.log('HW Health plugin loaded successfully.');
    };

    obj.onDeviceRefreshEnd = function () {
        if (typeof currentNode === 'undefined' || currentNode == null) return;
        if (!currentNode.osdesc || currentNode.osdesc.toLowerCase().indexOf('windows') === -1) return;

        pluginHandler.registerPluginTab({ tabTitle: 'HW Health', tabId: 'pluginHwHealth' });

        var html = ''
            + '<div style="padding:12px;">'
            + '  <div style="font-size:18px;font-weight:bold;margin-bottom:10px;">Hardware Health</div>'
            + '  <div id="hwhealthStatus" style="margin-bottom:10px;color:#666;">Ready.</div>'
            + '  <div style="margin-bottom:10px;">'
            + '    <button id="hwhealthRefreshBtn" class="btn">Refresh</button>'
            + '  </div>'
            + '  <div id="hwhealthSummary" style="margin-bottom:12px;"></div>'
            + '  <pre id="hwhealthRaw" style="white-space:pre-wrap;background:#111;color:#ddd;padding:10px;border-radius:6px;min-height:220px;"></pre>'
            + '</div>';

        QA('pluginHwHealth', html);

        var btn = document.getElementById('hwhealthRefreshBtn');
        if (btn) {
            btn.onclick = function () {
                if (typeof currentNode === 'undefined' || !currentNode || !currentNode._id) {
                    obj.loadHealthError({ message: 'No device selected.' });
                    return;
                }

                QH('hwhealthSummary', '');
                QH('hwhealthRaw', '');
                QH('hwhealthStatus', 'Collecting hardware data from endpoint...');

                meshserver.send({
                    action: 'plugin',
                    plugin: 'hwhealth',
                    pluginaction: 'getHealth',
                    nodeid: currentNode._id
                });
            };
        }

        setTimeout(function () {
            if (btn) btn.click();
        }, 50);
    };

    obj.loadHealthData = function (msg) {
        var statusEl = document.getElementById('hwhealthStatus');
        var summaryEl = document.getElementById('hwhealthSummary');
        var rawEl = document.getElementById('hwhealthRaw');

        if (statusEl) statusEl.innerText = 'Hardware data loaded successfully.';

        if (!msg || !msg.data) {
            if (rawEl) rawEl.textContent = 'No data returned.';
            return;
        }

        var d = msg.data;

        var summaryHtml = '';
        summaryHtml += '<div><b>Computer:</b> ' + esc(d.computerName || '-') + '</div>';
        summaryHtml += '<div><b>Manufacturer / Model:</b> ' + esc((d.manufacturer || '-') + ' / ' + (d.model || '-')) + '</div>';
        summaryHtml += '<div><b>Serial:</b> ' + esc(d.serialNumber || '-') + '</div>';
        summaryHtml += '<div><b>BIOS:</b> ' + esc(d.biosVersion || '-') + '</div>';
        summaryHtml += '<div><b>CPU:</b> ' + esc(d.cpuName || '-') + '</div>';
        summaryHtml += '<div><b>RAM:</b> ' + esc(d.memorySummary || '-') + '</div>';
        summaryHtml += '<div><b>Battery:</b> ' + esc(d.batterySummary || 'No battery / unavailable') + '</div>';
        summaryHtml += '<div><b>Collected At:</b> ' + esc(d.collectedAt || '-') + '</div>';

        if (summaryEl) summaryEl.innerHTML = summaryHtml;
        if (rawEl) rawEl.textContent = JSON.stringify(d, null, 2);
    };

    obj.loadHealthError = function (msg) {
        var statusEl = document.getElementById('hwhealthStatus');
        var rawEl = document.getElementById('hwhealthRaw');
        if (statusEl) statusEl.innerText = 'Failed to load hardware data.';
        if (rawEl) rawEl.textContent = (msg && msg.message) ? msg.message : 'Unknown error.';
    };

    function esc(s) {
        if (s == null) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    obj.serveraction = function (command, myparent, grandparent) {
        if (!command || command.plugin !== 'hwhealth') return;

        var sessionid = null;
        try { sessionid = myparent.ws.sessionId; } catch (e) {}

        switch (command.pluginaction) {
            case 'getHealth':
                if (!command.nodeid) {
                    obj.sendToSession(sessionid, {
                        action: 'plugin',
                        plugin: 'hwhealth',
                        method: 'loadHealthError',
                        message: 'Missing nodeid.'
                    });
                    return;
                }

                if (!obj.meshServer.webserver.wsagents[command.nodeid]) {
                    obj.sendToSession(sessionid, {
                        action: 'plugin',
                        plugin: 'hwhealth',
                        method: 'loadHealthError',
                        message: 'Agent is not online.'
                    });
                    return;
                }

                obj.meshServer.webserver.wsagents[command.nodeid].send(JSON.stringify({
                    action: 'plugin',
                    plugin: 'hwhealth',
                    pluginaction: 'getHealth',
                    sessionid: sessionid,
                    nodeid: command.nodeid
                }));
                break;

            case 'healthData':
                obj.sendToSession(command.sessionid, {
                    action: 'plugin',
                    plugin: 'hwhealth',
                    method: 'loadHealthData',
                    data: command.data,
                    nodeid: command.nodeid
                });
                break;

            case 'healthError':
                obj.sendToSession(command.sessionid, {
                    action: 'plugin',
                    plugin: 'hwhealth',
                    method: 'loadHealthError',
                    message: command.message || 'Endpoint collection failed.',
                    nodeid: command.nodeid
                });
                break;
        }
    };

    obj.sendToSession = function (sessionid, payload) {
        try {
            if (!sessionid) return;
            if (!obj.meshServer.webserver.wssessions2) return;
            if (!obj.meshServer.webserver.wssessions2[sessionid]) return;
            obj.meshServer.webserver.wssessions2[sessionid].send(JSON.stringify(payload));
        } catch (e) {
            console.log('HW Health sendToSession error: ' + e);
        }
    };

    return obj;
};
