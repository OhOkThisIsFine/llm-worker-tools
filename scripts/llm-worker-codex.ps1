param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]] $WorkerArgs
)

$ErrorActionPreference = "Stop"

if (-not $env:LLM_MODEL_CACHE_PATH) {
  $env:LLM_MODEL_CACHE_PATH = "C:\tmp\llm-worker\models.json"
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$PluginRoot = Split-Path -Parent $ScriptDir
$WorkerPath = Join-Path $PluginRoot "llm-worker.mjs"

if (-not $env:LLM_WORKER_INPUT_PATH) {
  $env:LLM_WORKER_INPUT_PATH = Join-Path $PluginRoot ".llm-worker-input.txt"
}

node $WorkerPath @WorkerArgs
exit $LASTEXITCODE
