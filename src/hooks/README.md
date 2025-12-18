# Claude Code Hooks Integration

Crit integrates with Claude Code via hooks for reactive monitoring.

## Hook Types

### PreToolUse Hook
Triggered before Claude Code uses any tool. Can:
- Check if proposed action violates rules
- Inject context about rules
- Block actions that violate constraints

### PostToolUse Hook
Triggered after tool execution. Can:
- Log actions to history
- Update context docs if files changed
- Queue initiatives based on patterns observed

### Notification Hook
Triggered on Claude's responses. Can:
- Analyze suggestions for rule violations
- Detect patterns to learn from
- Update session state

## Hook Configuration

In `.claude/settings.json`:
```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "*",
      "hooks": [{
        "type": "command",
        "command": "crit hook pre-tool $TOOL_NAME"
      }]
    }],
    "PostToolUse": [{
      "matcher": "*",
      "hooks": [{
        "type": "command",
        "command": "crit hook post-tool $TOOL_NAME"
      }]
    }]
  }
}
```

## Implementation

The `crit hook` command:
- `crit hook pre-tool <tool>` - PreToolUse handler
- `crit hook post-tool <tool>` - PostToolUse handler
- `crit hook notify` - Notification handler

Each reads stdin for the hook payload and outputs to stdout.
