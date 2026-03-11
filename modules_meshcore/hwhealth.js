/**
 * @description MeshCentral HW Health Plugin - Agent Side
 * @note Runs in MeshCore (duktape) - ES5 compliant. All code and comments in English.
 */

"use strict";

var mesh;
var obj = this;

/**
 * Main consoleaction handler - receives commands routed from the server
 */
function consoleaction(args, rights, sessionid, parent) {
    mesh = parent;
    
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
 * Executes a PowerShell command synchronously using waitExit()
 */
function runPowerShell(command, callback) {
    var Xerr = null;
    var Xstdout = null;
    var Xstderr = null;
    
    try {
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
    } catch (e) {
        callback(e, null, null);
    }
}

/**
 * Packages and sends the final result back to the server for routing
 */
function sendResult(action, success, data, message, sessionid, nodeid) {
    mesh.SendCommand({
        action: 'plugin',
        plugin: 'hwhealth',
        pluginaction: action, 
        success: success,
        data: data,
        message: message,
        sessionid: sessionid,
        nodeid: nodeid
    });
}

/**
 * Collects hardware telemetry via PowerShell
 */
function doGetHealth(sessionid, nodeid) {
    if (process.platform !== 'win32') {
        sendResult('healthError', false, null, 'Platform not supported. Windows only.', sessionid, nodeid);
        return;
    }

    // PowerShell script strictly using single quotes to avoid command-line escape sequence issues
    var psCommand = 
        "$ErrorActionPreference = 'SilentlyContinue'; " +
        "$cs = Get-CimInstance Win32_ComputerSystem; " +
        "$bios = Get-CimInstance Win32_BIOS; " +
        "$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1; " +
        "$ram = Get-CimInstance Win32_OperatingSystem; " +
        "$batt = Get-CimInstance Win32_Battery | Select-Object -First 1; " +
        "$cpuTempRaw = (Get-WmiObject MSAcpi_ThermalZoneTemperature -Namespace root/wmi | Select-Object -First 1).CurrentTemperature; " +
        "if ($cpuTempRaw) { $cpuTemp = [math]::Round(($cpuTempRaw/10)-273.15, 1).ToString() + ' C' } else { $cpuTemp = 'N/A' }; " +
        "if ($batt) { $battSummary = $batt.EstimatedChargeRemaining.ToString() + '% (Status: ' + $batt.BatteryStatus.ToString() + ')' } else { $battSummary = 'No Battery / Desktop' }; " +
        "$memUsed = [math]::Round(($ram.TotalVisibleMemorySize-$ram.FreePhysicalMemory)/1MB, 2).ToString(); " +
        "$memTotal = [math]::Round($ram.TotalVisibleMemorySize/1MB, 2).ToString(); " +
        "$result = @{ " +
        "computerName = $cs.Name; " +
        "manufacturer = $cs.Manufacturer; " +
        "model = $cs.Model; " +
        "serialNumber = $bios.SerialNumber; " +
        "biosVersion = $bios.SMBIOSBIOSVersion; " +
        "cpuName = $cpu.Name; " +
        "cpuLoad = $cpu.LoadPercentage.ToString() + '%'; " +
        "cpuTemp = $cpuTemp; " +
        "memorySummary = $memUsed + ' GB Used / ' + $memTotal + ' GB Total'; " +
        "batterySummary = $battSummary; " +
        "collectedAt = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss') " +
        "}; " +
        "$result | ConvertTo-Json -Compress";

    runPowerShell(psCommand, function(err, stdout, stderr) {
        var data = null;
        var isSuccess = false;

        // Try parsing stdout even if err is not null (PowerShell often returns exit code 1 on non-terminating errors)
        if (stdout && stdout.length > 0) {
            try {
                data = JSON.parse(stdout);
                isSuccess = true;
            } catch (e) {
                // Parsing failed, will fallback to error handler below
            }
        }

        if (isSuccess) {
            sendResult('healthData', true, data, null, sessionid, nodeid);
        } else {
            // Provide a detailed error dump if execution or parsing completely failed
            var errorDetails = 'PowerShell Execution Failed. ';
            if (err) errorDetails += 'Exit Code: ' + err + ' | ';
            if (stderr) errorDetails += 'StdErr: ' + stderr + ' | ';
            if (stdout) errorDetails += 'StdOut: ' + stdout;
            
            sendResult('healthError', false, null, errorDetails, sessionid, nodeid);
        }
    });
}

// Expose functions to the MeshCore engine
module.exports = { consoleaction: consoleaction };
