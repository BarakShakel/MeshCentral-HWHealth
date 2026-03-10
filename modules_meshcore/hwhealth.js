var exports = module.exports;
var child_process = require('child_process');

function execPowerShell(script, callback) {
    try {
        var args = [
            '-NoLogo',
            '-NoProfile',
            '-NonInteractive',
            '-Command',
            script
        ];

        child_process.execFile('powershell.exe', args, {
            windowsHide: true,
            timeout: 30000,
            maxBuffer: 1024 * 1024 * 4
        }, function (err, stdout, stderr) {
            if (err) {
                callback(new Error((stderr || err.message || '').toString().trim()));
                return;
            }
            callback(null, stdout);
        });
    } catch (ex) {
        callback(ex);
    }
}

exports.getHardwareHealth = function (sessionid, nodeid) {
    var ps = `
$ErrorActionPreference = 'SilentlyContinue'

function To-GB([UInt64]$v) {
    if ($null -eq $v) { return $null }
    return [Math]::Round($v / 1GB, 2)
}

$cs   = Get-CimInstance Win32_ComputerSystem
$bios = Get-CimInstance Win32_BIOS
$cpu  = Get-CimInstance Win32_Processor | Select-Object -First 1
$os   = Get-CimInstance Win32_OperatingSystem
$batt = Get-CimInstance Win32_Battery
$ld   = Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3"

$physicalDisks = @()
if (Get-Command Get-PhysicalDisk -ErrorAction SilentlyContinue) {
    $physicalDisks = Get-PhysicalDisk | Select-Object FriendlyName, MediaType, HealthStatus, OperationalStatus, Size, SerialNumber
}

$smart = @()
try {
    $smart = Get-CimInstance -Namespace root\\wmi -ClassName MSStorageDriver_FailurePredictStatus |
        Select-Object InstanceName, PredictFailure, Reason
} catch {}

$result = [ordered]@{
    collectedAt     = (Get-Date).ToString("s")
    computerName    = $env:COMPUTERNAME
    manufacturer    = $cs.Manufacturer
    model           = $cs.Model
    serialNumber    = $bios.SerialNumber
    biosVersion     = (($bios.SMBIOSBIOSVersion, $bios.Version | Where-Object { $_ }) -join " / ")
    cpuName         = $cpu.Name
    cpuCores        = $cpu.NumberOfCores
    cpuLogical      = $cpu.NumberOfLogicalProcessors
    totalMemoryGB   = To-GB $cs.TotalPhysicalMemory
    freeMemoryGB    = To-GB ($os.FreePhysicalMemory * 1KB)
    memorySummary   = ("{0} GB total / {1} GB free" -f (To-GB $cs.TotalPhysicalMemory), (To-GB ($os.FreePhysicalMemory * 1KB)))
    batterySummary  = if ($batt) {
        (($batt | ForEach-Object {
            $status = $_.BatteryStatus
            $charge = $_.EstimatedChargeRemaining
            "Status=$status Charge=$charge%"
        }) -join "; ")
    } else {
        "No battery"
    }
    logicalDisks    = @($ld | ForEach-Object {
        [ordered]@{
            DeviceID    = $_.DeviceID
            VolumeName  = $_.VolumeName
            FileSystem  = $_.FileSystem
            SizeGB      = To-GB $_.Size
            FreeGB      = To-GB $_.FreeSpace
        }
    })
    physicalDisks   = @($physicalDisks | ForEach-Object {
        [ordered]@{
            FriendlyName       = $_.FriendlyName
            MediaType          = $_.MediaType
            HealthStatus       = $_.HealthStatus
            OperationalStatus  = (($_.OperationalStatus | Out-String).Trim())
            SizeGB             = To-GB $_.Size
            SerialNumber       = $_.SerialNumber
        }
    })
    smartStatus     = @($smart | ForEach-Object {
        [ordered]@{
            InstanceName    = $_.InstanceName
            PredictFailure  = $_.PredictFailure
            Reason          = $_.Reason
        }
    })
}

$result | ConvertTo-Json -Depth 6 -Compress
`;

    execPowerShell(ps, function (err, stdout) {
        if (err) {
            require('meshcore').send({
                action: 'plugin',
                plugin: 'hwhealth',
                pluginaction: 'healthError',
                sessionid: sessionid,
                nodeid: nodeid,
                message: 'PowerShell collection failed: ' + err.message
            });
            return;
        }

        try {
            var data = JSON.parse(stdout);
            require('meshcore').send({
                action: 'plugin',
                plugin: 'hwhealth',
                pluginaction: 'healthData',
                sessionid: sessionid,
                nodeid: nodeid,
                data: data
            });
        } catch (ex) {
            require('meshcore').send({
                action: 'plugin',
                plugin: 'hwhealth',
                pluginaction: 'healthError',
                sessionid: sessionid,
                nodeid: nodeid,
                message: 'JSON parse failed: ' + ex.toString() + ' | Raw output: ' + stdout
            });
        }
    });
};

function handleCommand(cmd) {
    if (!cmd || cmd.action !== 'plugin' || cmd.plugin !== 'hwhealth') return;
    if (cmd.pluginaction === 'getHealth') {
        exports.getHardwareHealth(cmd.sessionid, cmd.nodeid);
    }
}

try {
    require('meshcore').on('message', handleCommand);
} catch (e) {
    // Fallback if event handler model differs
}
