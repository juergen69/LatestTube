# SonarQube Quality Assurance Workflow

This workflow must be followed after implementing any new feature or making code changes to ensure code quality standards are maintained.

## Overview

**You MUST use the SonarQube MCP for code quality analysis.**

### Available SonarQube MCP Tools

| Tool | Purpose |
|------|---------|
| `mcp--sonarqube--search_sonar_issues_in_projects` | Search for issues (bugs, vulnerabilities, code smells) |
| `mcp--sonarqube--get_project_quality_gate_status` | Get Quality Gate status |
| `mcp--sonarqube--analyze_code_snippet` | Analyze code for quality/security issues |
| `mcp--sonarqube--change_sonar_issue_status` | Change issue status (accept, falsepositive, reopen) |
| `mcp--sonarqube--change_security_hotspot_status` | Review security hotspots |
| `mcp--sonarqube--get_component_measures` | Get project metrics |

### SonarQube Project Key

```
latesttube
```

---

## Workflow Steps

### Step 1: Check for Issues

After making code changes, search for issues in the project:

```
Use: mcp--sonarqube--search_sonar_issues_in_projects
Parameters:
  - projects: ["latesttube"]
  - issueStatuses: ["OPEN"]
  - severities: ["HIGH", "BLOCKER", "MEDIUM"]
```

### Step 2: Analyze Specific Code

If you modify a specific file, analyze it directly:

```
Use: mcp--sonarqube--analyze_code_snippet
Parameters:
  - projectKey: "latesttube"
  - fileContent: <full file content>
  - language: ["js"]
```

### Step 3: Review Security Hotspots

Check for security concerns:

```
Use: mcp--sonarqube--search_security_hotspots
Parameters:
  - projectKey: "latesttube"
  - status: ["TO_REVIEW"]
```

### Step 4: Fix Issues

For code smells and bugs:
1. Review the issue details
2. Fix the code to address the issue
3. Re-analyze to confirm the fix

For false positives:
```
Use: mcp--sonarqube--change_sonar_issue_status
Parameters:
  - key: "<issue-key>"
  - status: ["falsepositive"]
```

For acknowledged risks:
```
Use: mcp--sonarqube--change_security_hotspot_status
Parameters:
  - hotspotKey: "<hotspot-key>"
  - status: ["REVIEWED"]
  - resolution: ["ACKNOWLEDGED"]
```

### Step 5: Verify Quality Gate

Before marking work as complete:

```
Use: mcp--sonarqube--get_project_quality_gate_status
Parameters:
  - projectKey: "latesttube"
```

Ensure the Quality Gate passes (status: "OK").

---

## Issue Severity Guide

| Severity | Action Required |
|----------|-----------------|
| **BLOCKER** | Must fix before completing - blocks deployment |
| **HIGH** | Should fix - significant code quality impact |
| **MEDIUM** | Should fix - moderate impact on maintainability |
| **LOW** | Consider fixing - minor improvements |
| **INFO** | No action needed - informational only |
