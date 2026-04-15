$ErrorActionPreference = 'Stop'

Set-Location $PSScriptRoot

$env:CONTACT_OWNER_EMAIL = 'belecstudio@gmail.com'
$env:CONTACT_SMTP_USER = 'belecstudio@gmail.com'

$securePassword = Read-Host 'Mot de passe d''application Gmail pour belecstudio@gmail.com' -AsSecureString
$plainPassword = [System.Net.NetworkCredential]::new('', $securePassword).Password
$env:CONTACT_SMTP_PASS = $plainPassword

npm start
