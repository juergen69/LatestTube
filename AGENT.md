# AGENT.md - AI Agent Information for LatestTube

## Project Overview

**LatestTube** is a browser-only YouTube channel tracker that runs entirely in the browser using vanilla JavaScript and IndexedDB. No server, build steps, or npm dependencies required.

### Key Technical Details

| Aspect | Details |
|--------|---------|
| **Architecture** | Single HTML file with modular JavaScript |
| **Storage** | IndexedDB (browser local storage) |
| **Language** | Vanilla JavaScript (ES6+) |
| **Styling** | Plain CSS |
| **Build** | None - runs directly from `file://` protocol |

### Project Structure

```
/home/juergen/LatestTube/
├── index.html           # Main HTML file
├── README.md            # Project documentation
├── sonar-project.properties  # SonarQube configuration
├── js/
│   └── modules/
│       ├── app-init.js       # App initialization
│       ├── db.js             # IndexedDB layer
│       ├── fetch-service.js  # API fetching
│       ├── filters.js        # Video filtering
│       ├── tags.js           # Tag management
│       ├── ui.js             # UI components
│       ├── utils.js          # Utilities
│       ├── video-feed.js     # Video rendering
│       └── youtube-api.js    # YouTube API integration
└── styles/
    └── main.css         # All styles
```

---

## Important Guidelines for AI Agents

### 1. Code Quality Standards

- Write clean, readable JavaScript without linter errors
- Use consistent formatting and naming conventions
- Add JSDoc comments for complex functions
- Keep functions small and focused

### 2. No External Dependencies

- **DO NOT** add npm packages, CDN links, or external libraries
- All functionality must be implemented with vanilla JavaScript
- If you need a utility, implement it locally in `js/modules/utils.js`

### 3. IndexedDB Operations

- Use the existing db.js module for all IndexedDB operations
- Follow the established patterns for async database operations
- Handle errors gracefully with try-catch blocks

### 4. File Organization

- JavaScript modules go in `js/modules/`
- CSS goes in `styles/main.css`
- No additional subdirectories unless necessary

---

## SonarQube MCP Integration

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

## Required Workflow: Check and Fix SonarQube Issues

**Before completing any code change, you MUST follow this workflow:** See [.kilocode/workflows/sonar-quality-assurance.md](.kilocode/workflows/sonar-quality-assurance.md) for the complete workflow.

---

## Quick Reference: Common Tasks

### Adding a New Feature
1. Implement the feature in the appropriate module under `js/modules/`
2. Add any new styles to `styles/main.css`
3. Run the [SonarQube Quality Assurance Workflow](.kilocode/workflows/sonar-quality-assurance.md)
4. Fix any issues found
5. Verify Quality Gate passes

### Fixing a Bug
1. Locate the relevant module
2. Fix the bug following existing patterns
3. Run the [SonarQube Quality Assurance Workflow](.kilocode/workflows/sonar-quality-assurance.md)
4. Ensure no new issues are introduced
5. Verify Quality Gate still passes

### Adding Tests
- This project uses manual testing (no automated test framework)
- If adding tests, place them alongside the modules they test

---

## SonarQube Issue Severity Guide

| Severity | Action Required |
|----------|-----------------|
| **BLOCKER** | Must fix before completing - blocks deployment |
| **HIGH** | Must fix before completing - significant code quality impact |
| **MEDIUM** | Should fix - moderate impact on maintainability |
| **LOW** | Consider fixing - minor improvements |
| **INFO** | No action needed - informational only |

---

## Contact & Context

- This is a personal project for tracking YouTube channels
- No CI/CD pipeline currently configured
- All development is local
- Questions? Refer to README.md for usage details
