<#
.SYNOPSIS
  Grava o nome do computador como identificador da estação na política da extensão VoiceVanguard.
.DESCRIPTION
  Roda como SYSTEM (script de plataforma do Intune) ou como administrador (GPO de inicialização).
  Escreve apenas o valor `stationId` na política gerenciada da extensão, em Chrome e/ou Edge.
  Não altera chave, token nem outros valores da política.
  Uso: .\Set-VoiceVanguardStation.ps1 -ChromeExtensionId <ID> [-EdgeExtensionId <ID>]
  Teste primeiro em uma estação piloto.
#>
param(
    [string]$ChromeExtensionId,
    [string]$EdgeExtensionId
)
$ErrorActionPreference = 'Stop'
$stationId = ($env:COMPUTERNAME -replace '[^A-Za-z0-9._-]', '-')
if ($stationId.Length -gt 48) { $stationId = $stationId.Substring(0, 48) }
if (-not $stationId) { throw 'Nome do computador vazio.' }

function Set-Station($browserKey, $extId) {
    if (-not $extId) { return }
    $path = "HKLM:\SOFTWARE\Policies\$browserKey\3rdparty\extensions\$extId\policy"
    New-Item -Path $path -Force | Out-Null
    New-ItemProperty -Path $path -Name 'stationId' -Value $stationId -PropertyType String -Force | Out-Null
    Write-Output "stationId=$stationId gravado em $path"
}
Set-Station 'Google\Chrome' $ChromeExtensionId
Set-Station 'Microsoft\Edge' $EdgeExtensionId
