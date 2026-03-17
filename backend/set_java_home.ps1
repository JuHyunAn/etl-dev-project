$javaHome = "$env:USERPROFILE\.vscode\extensions\redhat.java-1.53.0-win32-x64\jre\21.0.10-win32-x86_64"
[System.Environment]::SetEnvironmentVariable('JAVA_HOME', $javaHome, 'User')
Write-Host "JAVA_HOME set to: $javaHome"
Write-Host "Verify: $([System.Environment]::GetEnvironmentVariable('JAVA_HOME','User'))"
