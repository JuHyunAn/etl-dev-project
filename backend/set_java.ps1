$javaHome = "$env:USERPROFILE\.vscode\extensions\redhat.java-1.53.0-win32-x64\jre\21.0.10-win32-x86_64"
$content = "org.gradle.java.home=" + $javaHome.Replace("\", "\\")
[System.IO.File]::WriteAllText("$PSScriptRoot\gradle.properties", $content, [System.Text.Encoding]::UTF8)
Write-Host "Written: $content"
