"use strict";

module.exports.hwhealth = function (parent) {
    var obj = {};
    obj.parent = parent;
    obj.meshServer = parent.parent;
    obj.exports = ['onDeviceRefreshEnd', 'loadHealthData', 'loadHealthError'];

    obj.server_startup = function () {
        console.log('HW Health plugin loaded successfully.');
    };

    // --- קוד שמוזרק לדפדפן של המנהל ---
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
                    obj.loadHealthError({ message: 'No device selected.' });
                    return;
                }

                QH('hwhealthSummary', '');
                QH('hwhealthRaw', '');
                QH('hwhealthStatus', 'Collecting hardware data from endpoint... (Please wait)');

                // התיקון הקריטי של ChatGPT: אות S גדולה ב-meshServer
                meshServer.send({
                    action: 'plugin',
                    plugin: 'hwhealth',
                    pluginaction: 'getHealth',
                    nodeid: currentNode._id
                });
            };
        }
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
        summaryHtml += '<div><b>Computer Name:</b> ' + esc(d.computerName || '-') + '</div>';
        summaryHtml += '<div><b>Manufacturer / Model:</b> ' + esc((d.manufacturer || '-') + ' / ' + (d.model || '-')) + '</div>';
        summaryHtml += '<div><b>Serial Number:</b> ' + esc(d.serialNumber || '-') + '</div>';
        summaryHtml += '<div><b>BIOS Version:</b> ' + esc(d.biosVersion || '-') + '</div>';
        summaryHtml += '<div><b>CPU:</b> ' + esc(d.cpuName || '-') + ' (Load: ' + esc(d.cpuLoad || '-') + ', Temp: ' + esc(d.cpuTemp || '-') + ')</div>';
        summaryHtml += '<div><b>RAM:</b> ' + esc(d.memorySummary || '-') + '</div>';
        summaryHtml += '<div><b>Battery:</b> ' + esc(d.batterySummary || 'No battery / unavailable') + '</div>';
        summaryHtml += '<div style="margin-top: 10px; color: #888; font-size: 12px;"><b>Collected At:</b> ' + esc(d.collectedAt || '-') + '</div>';

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
    // --- סוף קוד מוזרק לדפדפן ---

    // הוק מס' 1: קבלת בקשות מהדפדפן והעברה ל-Agent
    obj.hook_webSocketMessage = function (req, user, ws, msg) {
        if (msg.action === 'plugin' && msg.plugin === 'hwhealth') {
            if (msg.pluginaction === 'getHealth') {
                var agent = obj.meshServer.webserver.wsagents[msg.nodeid];
                if (agent != null) {
                    agent.send(JSON.stringify({
                        action: 'plugin',
                        plugin: 'hwhealth',
                        pluginaction: 'getHealth',
                        sessionid: ws.sessionId // שומרים את ה-ID של הדפדפן כדי לדעת למי להחזיר
                    }));
                } else {
                    ws.send(JSON.stringify({
                        action: 'plugin',
                        plugin: 'hwhealth',
                        method: 'loadHealthError',
                        message: 'Agent is offline or disconnected.'
                    }));
                }
            }
        }
    };

    // הוק מס' 2: קבלת נתונים מה-Agent והחזרה לדפדפן שביקש
    obj.hook_processAgentData = function (agent, msg) {
        if (typeof msg === 'object' && msg.action === 'plugin' && msg.plugin === 'hwhealth') {
            if (msg.pluginaction === 'healthData' || msg.pluginaction === 'healthError') {
                if (msg.sessionid) {
                    var userWs = obj.meshServer.webserver.wsclients[msg.sessionid];
                    if (userWs) {
                        userWs.send(JSON.stringify({
                            action: 'plugin',
                            plugin: 'hwhealth',
                            method: msg.pluginaction === 'healthData' ? 'loadHealthData' : 'loadHealthError',
                            data: msg.data,
                            message: msg.message
                        }));
                    }
                }
            }
            return true; // עוצר את המשך העיבוד בשרת כי אנחנו טיפלנו בזה
        }
        return false;
    };

    return obj;
};
