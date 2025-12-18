# Project: crit

Bun/TypeScript project "crit". Contains 10 modules with ~3.7k lines of code. Key modules: bloat, overview, testing.

## Structure
```
src/ (1 files, 4.9k loc)
|-- commands/ (11 files, 450 loc)
    |-- clean.ts (clean)
    |-- context.ts (context)
    |-- deliverables.ts (deliverables)
    |-- history.ts (history)
    |-- hook.ts (hookPreTool, hookPostTool, hookInstall...)
    |-- init.ts (init)
    |-- rules.ts (rules)
    |-- run.ts (run)
    |-- status.ts (status)
    |-- suggest.ts (suggest)
    `-- test.ts (test)
|-- daemon/ (4 files, 379 loc)
    |-- index.ts (DaemonHandle, DaemonOptions, startDaemon...)
    |-- processor.ts (ProcessResult, queueChange, setProcessingCallback...)
    |-- reporter.ts (reportAction, reportActions, getLastAction)
    `-- watcher.ts (WatchEvent, WatcherHandle, createWatcher)
|-- hooks/ (5 files, 384 loc)
    |-- index.ts (handlePreTool, handlePostTool, installHooks...)
    |-- install.ts (hooksInstalled, installHooks, removeHooks)
    |-- post-tool.ts (handlePostTool)
    |-- pre-tool.ts (handlePreTool)
    `-- types.ts (PreToolInput, PreToolOutput, PostToolInput...)
|-- lib/ (2 files, 2.9k loc)
    |-- bloat/ (4 files, 652 loc)
    |   |-- analyzer.ts (analyzeProject, analyzeFile, checkProposedCode)
    |   |-- detector.ts (detectUnusedExports, detectOverAbstraction, detectDuplicates...)
    |   |-- index.ts (analyzeProject, analyzeFile, checkProposedCode)
    |   `-- types.ts (BloatType, Severity, BloatIssue...)
    |-- context/ (5 files, 450 loc)
    |   |-- analyzer.ts (analyzeProject, generateArchitectureDoc, generateImplementationDoc...)
    |   |-- index.ts (ContextFile, ProjectAnalysis, InjectionResult)
    |   |-- injector.ts (injectIntoClaudeMd, removeFromClaudeMd, updateClaudeMdSection...)
    |   |-- manager.ts (loadContext, getContextFile, saveContextFile...)
    |   `-- types.ts (ContextFile, ProjectAnalysis, InjectionResult)
    |-- deliverables/ (3 files, 259 loc)
    |   |-- index.ts
    |   |-- manager.ts (loadDeliverables, saveDeliverables, addDeliverable...)
    |   `-- types.ts (DeliverableStatus, Deliverable, DeliverableGroup...)
    |-- overview/ (4 files, 621 loc)
    |   |-- generator.ts (generateOverview, generateLLMContext, updateOverview...)
    |   |-- index.ts
    |   |-- scanner.ts (scanProject, scanModule, extractExports...)
    |   `-- types.ts (ModuleInfo, ProjectOverview, FeatureStatus...)
    |-- rules/ (4 files, 186 loc)
    |   |-- index.ts (Rule, RulesFile, parseRules...)
    |   |-- manager.ts (loadRules, saveRules, addRule...)
    |   |-- parser.ts (parseRules, serializeRules)
    |   `-- types.ts (Rule, RulesFile)
    |-- state/ (5 files, 226 loc)
    |   |-- history.ts (appendHistory, getHistory, getRecentHistory)
    |   |-- index.ts (SessionState, HistoryEntry, Initiative...)
    |   |-- initiatives.ts (loadInitiatives, saveInitiatives, addInitiative...)
    |   |-- session.ts (loadSession, saveSession, updateSession)
    |   `-- types.ts (SessionState, HistoryEntry, Initiative)
    |-- testing/ (4 files, 464 loc)
    |   |-- enforcer.ts (getTestRequirements, canMarkDone, verifyTests...)
    |   |-- index.ts
    |   |-- tracker.ts (isTestFile, isSourceFile, getExpectedTestPaths...)
    |   `-- types.ts (FunctionCoverage, TestCoverage, TestStatus...)
    |-- config.ts (CritConfig, loadConfig, saveConfig)
    `-- paths.ts (CRIT_DIR, getCritDir, getCritPath...)
|-- mcp/ (3 files, 722 loc)
    |-- handlers.ts (GetContextResult, handleGetContext, CheckRulesInput...)
    |-- server.ts
    `-- tools.ts (ToolDefinition, tools)
`-- cli.ts
```

## Key Modules

### bloat (src/lib/bloat)
Exports: analyzeProject, analyzeFile, checkProposedCode

**Exports:**
- `analyzeProject`
- `analyzeFile`
- `checkProposedCode`

**Dependencies:** `analyzer`, `detector`, `types`

**LOC:** 652

---

### overview (src/lib/overview)
overview module

**Dependencies:** `generator`, `other-module`, `paths`, `scanner`, `types`

**LOC:** 621

---

### testing (src/lib/testing)
testing module

**Dependencies:** `enforcer`, `tracker`, `types`

**LOC:** 464

---

### context (src/lib/context)
Exports: ContextFile, ProjectAnalysis, InjectionResult

**Exports:**
- `ContextFile`
- `ProjectAnalysis`
- `InjectionResult`

**Dependencies:** `analyzer`, `injector`, `manager`, `types`

**LOC:** 450

---

### hooks (src/hooks)
Exports: handlePreTool, handlePostTool, installHooks and 6 more

**Exports:**
- `handlePreTool`
- `handlePostTool`
- `installHooks`
- `removeHooks`
- `hooksInstalled`
- `PreToolInput`
- `PostToolInput`
- `PreToolOutput`
- `handleHook`

**Dependencies:** `history`, `initiatives`, `install`, `lib`, `manager`, `paths`, `post-tool`, `pre-tool`, `rules`, `session`, `state`, `types`

**LOC:** 384

---

### daemon (src/daemon)
Exports: DaemonHandle, DaemonOptions, startDaemon and 2 more

**Exports:**
- `DaemonHandle`
- `DaemonOptions`
- `startDaemon`
- `WatchEvent`
- `ProcessResult`

**Dependencies:** `history`, `lib`, `processor`, `reporter`, `state`, `watcher`

**LOC:** 379

---

### deliverables (src/lib/deliverables)
deliverables module

**Dependencies:** `manager`, `types`

**LOC:** 259

---

### state (src/lib/state)
Exports: SessionState, HistoryEntry, Initiative and 6 more

**Exports:**
- `SessionState`
- `HistoryEntry`
- `Initiative`
- `loadSession`
- `saveSession`
- `updateSession`
- `appendHistory`
- `getHistory`
- `getRecentHistory`

**Dependencies:** `history`, `initiatives`, `session`, `types`

**LOC:** 226

---

### rules (src/lib/rules)
Exports: Rule, RulesFile, parseRules and 1 more

**Exports:**
- `Rule`
- `RulesFile`
- `parseRules`
- `serializeRules`

**Dependencies:** `manager`, `parser`, `types`

**LOC:** 186

---

### cli (src/cli.ts)
cli module

**LOC:** 89

---


_Generated: 2025-12-18T21:05:35.963Z_