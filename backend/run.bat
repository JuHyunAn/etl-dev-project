@echo off
set JAVA_HOME=%USERPROFILE%\.vscode\extensions\redhat.java-1.53.0-win32-x64\jre\21.0.10-win32-x86_64
echo JAVA_HOME=%JAVA_HOME%
call "%USERPROFILE%\Desktop\etl-dev-project\backend\gradlew.bat" bootRun --no-daemon
