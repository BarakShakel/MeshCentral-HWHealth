/**
 * @description MeshCentral HW Health Plugin - Agent Side
 * @note Runs in MeshCore (duktape) - ES5 compliant
 */

"use strict";

var mesh;
var obj = this;

/**
 * Main consoleaction handler - receives commands from server
 */
function consoleaction(args, rights, sessionid, parent) {
    mesh = parent;
    
    // Get function name from args
    var fnname = null;
    if (typeof args['_'] != 'undefined') {
        fnname = args['_'][1];
    } else if (args.pluginaction) {
        fnname = args.pluginaction;
    }

    if (fnname == null) {
        return;
    }

    var currentSessionid = args.sessionid || sessionid;

    switch (fnname) {
        case 'getHealth':
            doGetHealth(currentSessionid, args.nodeid);
            break;
        default:
            break;
    }
}

/**
 * Run a PowerShell command and return result (Duktape compatible)
 */
function runPowerShell(command, callback) {
    var Xerr = null;
    var Xstdout = null;
    var Xstderr = null;
    
    var child = require('child_process').execFile(
        process.env['windir'] + '\\system32\\WindowsPowerShell\\v1.0\\powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
        { cwd: process.env['TEMP'] },
        function(err, stdout, stderr) {
            Xerr = err;
            Xstdout = stdout;
            Xstderr = stderr;
        }
    );
    
    child.stdout.str = '';
    child.stdout.on('data', function (chunk) { this.str += chunk.toString(); });
    child.waitExit();

    Xstdout = child.stdout.str.trim();
    callback(Xerr, Xstdout, Xstderr);
}

/**
 * Send result back to server with sessionid for proper routing
 */
function sendResult(action, success, data, message, sessionid, nodeid) {
    mesh.SendCommand({
        action: 'plugin',
        plugin: 'hwhealth',
        pluginaction: action, // e.g., 'healthData' or 'healthError'
        success: success,
        data: data,
        message: message,
        sessionid: sessionid,
        nodeid: nodeid
    });
}

/**
 * Collect Hardware Data
 */
function doGetHealth(sessionid, nodeid) {
    if (process.platform !== 'win32') {
        sendResult('healthError', false, null, 'Platform not supported. Windows only.', sessionid, nodeid);
        return;
    }

    var psCommand = 
        "$ErrorActionPreference = 'SilentlyContinue'; " +
        "$cs = Get-CimInstance Win32_ComputerSystem; " +
        "$bios = Get-CimInstance Win32_BIOS; " +
        "$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1; " +
        "$ram = Get-CimInstance Win32_OperatingSystem; " +
        "$batt = Get-CimInstance Win32_Battery | Select-Object -First 1; " +
        "$cpuTempRaw = (Get-WmiObject MSAcpi_ThermalZoneTemperature -Namespace root/wmi | Select-Object -First 1).CurrentTemperature; " +
        "if ($cpuTempRaw) { $cpuTemp = \"$([math]::Round(($cpuTempRaw/10)-273.15, 1)) C\" } else { $cpuTemp = 'N/A' }; " +
        "if ($batt) { $battSummary = \"$($batt.EstimatedChargeRemaining)%\" } else { $battSummary = 'No Battery / Desktop' }; " +
        "$result = @{ " +
        "computerName = $cs.Name; " +
        "manufacturer = $cs.Manufacturer; " +
        "model = $cs.Model; " +
        "serialNumber = $bios.SerialNumber; " +
        "biosVersion = $bios.SMBIOSBIOSVersion; " +
        "cpuName = $cpu.Name; " +
        "cpuLoad = \"$($cpu.LoadPercentage)%\"; " +
        "cpuTemp = $cpuTemp; " +
        "memorySummary = \"$([math]::Round(($ram.TotalVisibleMemorySize-$ram.FreePhysicalMemory)/1MB, 2)) GB Used / $([math]::Round($ram.TotalVisibleMemorySize/1MB, 2)) GB Total\"; " +
        "batterySummary = $battSummary; " +
        "collectedAt = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss') " +
        "}; " +
        "$result | ConvertTo-Json -Compress";

    runPowerShell(psCommand, function(err, stdout, stderr) {
        if (err || (stdout === "" && stderr !== "")) {
            sendResult('healthError', false, null, 'PowerShell Error: ' + (stderr || err), sessionid, nodeid);
            return;
        }

        var data = null;
        try {
            data = JSON.parse(stdout);
            sendResult('healthData', true, data, null, sessionid, nodeid);
        } catch (e) {
            sendResult('healthError', false, null, 'Failed to parse JSON: ' + e.message + ' | Raw output: ' + stdout, sessionid, nodeid);
        }
    });
}

module.exports = { consoleaction: consoleaction };
