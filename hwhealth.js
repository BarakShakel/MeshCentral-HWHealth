"use strict";

module.exports.hwhealth = function (parent) {
    var obj = {};
    obj.parent = parent;
    obj.meshServer = parent.parent;
    obj.exports = ['onDeviceRefreshEnd', 'loadHealthData', 'loadHealthError'];

    obj.server_startup = function () {
        console.log('HW Health plugin loaded successfully.');
    };

    // --- קוד שמוזרק לדפדפן של המנהל (לא שונה) ---
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


    // --- פונקציית הניתוב הראשית המדויקת לפי מודל RegEdit ---
    obj.serveraction = function(command, myparent, grandparent) {
        if (command.plugin !== 'hwhealth') return;

        // חילוץ ה-Session ID כדי לדעת לאיזה דפדפן להחזיר תשובה
        var sessionid = null;
        try {
            sessionid = myparent.ws.sessionId;
        } catch (e) {
            // שגיאה כאן היא טבעית אם ההודעה הגיעה מה-Agent ולא מה-UI, לכן נתעלם
        }

        var currentSessionid = command.sessionid || sessionid;

        switch (command.pluginaction) {
            // 1. קריאה שמגיעה מהדפדפן וצריכה להישלח למחשב המרוחק (Agent)
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
                    // אם המחשב מנותק, נחזיר שגיאה ישירות לדפדפן (שימוש ב-wssessions2!)
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

            // 2. תשובות שמגיעות מה-Agent וצריכות לחזור לדפדפן שביקש אותן
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
                
                // התיקון הקריטי: שולחים חזרה דרך wssessions2 (ממש כמו ב-RegEdit)
                if (targetSessionid && obj.meshServer.webserver.wssessions2 && obj.meshServer.webserver.wssessions2[targetSessionid]) {
                    try {
                        obj.meshServer.webserver.wssessions2[targetSessionid].send(JSON.stringify(response));
                    } catch (e) {
                        console.log('HW Health error sending to session:', e);
                    }
                }
                break;
        }
    };

    return obj;
};
