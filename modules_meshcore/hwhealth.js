var child = require('child_process');
var meshcore = require('meshcore');

function runPS(cmd, cb) {
    child.execFile(
        'powershell.exe',
        ['-NoProfile','-NonInteractive','-Command',cmd],
        { windowsHide: true, timeout: 20000 },
        function(err, stdout) {
            if (err) { cb(err); return; }
            cb(null, stdout.trim());
        }
    );
}

function collect(sessionid, nodeid) {

    // סקריפט מורחב שמתאים בדיוק לשדות שה-UI מצפה לקבל
    var ps = `
$ErrorActionPreference = "SilentlyContinue"

$cs = Get-CimInstance Win32_ComputerSystem
$bios = Get-CimInstance Win32_BIOS
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
$ram = Get-CimInstance Win32_OperatingSystem
$batt = Get-CimInstance Win32_Battery | Select-Object -First 1

$cpuTempRaw = (Get-WmiObject MSAcpi_ThermalZoneTemperature -Namespace root/wmi | Select-Object -First 1).CurrentTemperature
if ($cpuTempRaw) {
    $cpuTemp = "$([math]::Round(($cpuTempRaw/10)-273.15, 1)) C"
} else {
    $cpuTemp = "N/A"
}

$battSummary = "No Battery / Desktop"
if ($batt) {
    $battSummary = "$($batt.EstimatedChargeRemaining)% (Status Code: $($batt.BatteryStatus))"
}

$result = @{
    computerName = $cs.Name
    manufacturer = $cs.Manufacturer
    model = $cs.Model
    serialNumber = $bios.SerialNumber
    biosVersion = $bios.SMBIOSBIOSVersion
    cpuName = $cpu.Name
    cpuLoad = "$($cpu.LoadPercentage)%"
    cpuTemp = $cpuTemp
    memorySummary = "$([math]::Round(($ram.TotalVisibleMemorySize-$ram.FreePhysicalMemory)/1MB, 2)) GB Used / $([math]::Round($ram.TotalVisibleMemorySize/1MB, 2)) GB Total"
    batterySummary = $battSummary
    collectedAt = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
}

$result | ConvertTo-Json -Compress
`;

    runPS(ps, function(err, out) {
        if(err) {
            meshcore.send({
                action: 'plugin',
                plugin: 'hwhealth',
                pluginaction: 'healthError',
                sessionid: sessionid,
                nodeid: nodeid,
                message: err.toString()
            });
            return;
        }

        var data = null;
        try {
            data = JSON.parse(out);
        } catch(e) {
            data = { raw: out };
        }

        meshcore.send({
            action: 'plugin',
            plugin: 'hwhealth',
            pluginaction: 'healthData',
            sessionid: sessionid,
            nodeid: nodeid,
            data: data
        });
    });
}

// התיקון הקריטי: ב-Agent הפונקציה שמאזינה לשרת חייבת להיקרא serveraction
exports.serveraction = function(msg) {
    if(!msg) return;
    if(msg.action != 'plugin') return;
    if(msg.plugin != 'hwhealth') return;

    if(msg.pluginaction == 'getHealth'){
        collect(msg.sessionid, msg.nodeid);
    }
};
