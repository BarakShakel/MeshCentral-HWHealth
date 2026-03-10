var child = require('child_process');
var meshcore = require('meshcore');

function runPS(cmd, cb) {
    child.execFile(
        'powershell.exe',
        ['-NoProfile','-NonInteractive','-Command',cmd],
        { windowsHide: true, timeout: 15000 },
        function(err, stdout) {
            if (err) { cb(err); return; }
            cb(null, stdout.trim());
        }
    );
}

function collect(sessionid,nodeid) {

    var ps = `
$cpuTemp = (Get-WmiObject MSAcpi_ThermalZoneTemperature -Namespace root/wmi |
Select-Object -First 1).CurrentTemperature

if($cpuTemp){
 $cpuTemp=[math]::Round(($cpuTemp/10)-273.15,1)
}

$cpuLoad = (Get-CimInstance Win32_Processor |
Measure-Object LoadPercentage -Average).Average

$ram = Get-CimInstance Win32_OperatingSystem

$result = @{
 cpuTemp=$cpuTemp
 cpuLoad=$cpuLoad
 ramUsed=[math]::Round(($ram.TotalVisibleMemorySize-$ram.FreePhysicalMemory)/1MB,2)
 ramTotal=[math]::Round($ram.TotalVisibleMemorySize/1MB,2)
}

$result | ConvertTo-Json -Compress
`;

    runPS(ps,function(err,out){

        if(err){
            meshcore.send({
                action:'plugin',
                plugin:'hwhealth',
                pluginaction:'healthError',
                sessionid:sessionid,
                nodeid:nodeid,
                message:err.toString()
            });
            return;
        }

        var data=null;
        try{
            data=JSON.parse(out);
        }catch(e){
            data={raw:out};
        }

        meshcore.send({
            action:'plugin',
            plugin:'hwhealth',
            pluginaction:'healthData',
            sessionid:sessionid,
            nodeid:nodeid,
            data:data
        });

    });
}

exports.processMessage=function(msg){

    if(!msg) return;
    if(msg.action!='plugin') return;
    if(msg.plugin!='hwhealth') return;

    if(msg.pluginaction=='getHealth'){
        collect(msg.sessionid,msg.nodeid);
    }

};
